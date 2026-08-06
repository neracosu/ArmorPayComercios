"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { cifrar, pistaDeLlave } from "@/lib/crypto";
import { RECAUDO_MAX_BYTES, RECAUDOS_REQUERIDOS, tipoDeDocumento } from "@/lib/recaudos";

/**
 * Autogestión de la activación: el comercio arma su propio expediente.
 * Nada de esto lo vuelve operativo — las cuentas nacen POR APROBAR, la llave
 * queda CARGADA (no verificada) y el estado del ciclo lo avanzamos nosotros
 * desde la ficha de plataforma. Autogestión sí; autoactivación jamás.
 */

export type ResultadoActivacion = { ok: true; mensaje: string } | { ok: false; error: string };

async function exigirAdminComercio() {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") throw new Error("No autorizado");
  return session;
}

const TIPOS_VALIDOS = new Set(RECAUDOS_REQUERIDOS.map((r) => r.tipo));

export async function subirRecaudo(
  _previo: ResultadoActivacion | null,
  datos: FormData
): Promise<ResultadoActivacion> {
  const session = await exigirAdminComercio();

  const tipo = String(datos.get("tipo") ?? "");
  if (!TIPOS_VALIDOS.has(tipo)) return { ok: false, error: "Tipo de documento desconocido." };

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige el archivo primero." };
  }
  if (archivo.size > RECAUDO_MAX_BYTES) {
    return { ok: false, error: "El archivo pesa más de 2 MB. Comprímelo y vuelve a intentar." };
  }
  const buf = Buffer.from(await archivo.arrayBuffer());
  const mime = tipoDeDocumento(buf);
  if (!mime) return { ok: false, error: "Solo aceptamos PDF, PNG, JPG o WebP." };

  await withSessionTenant(session, () =>
    prisma.recaudo.upsert({
      // Volver a subir REEMPLAZA y vuelve a PENDIENTE: un documento corregido
      // se revisa de nuevo, no hereda el veredicto del anterior.
      where: {
        organizationId_tipo: { organizationId: session.user.organizationId!, tipo },
      },
      create: {
        organizationId: session.user.organizationId!,
        tipo,
        nombre: archivo.name.slice(0, 120),
        archivo: buf,
        mime,
      },
      update: {
        nombre: archivo.name.slice(0, 120),
        archivo: buf,
        mime,
        status: "PENDIENTE",
        nota: null,
      },
    })
  );

  revalidatePath("/comercio/activacion");
  return { ok: true, mensaje: "Documento subido. Lo revisamos y te avisamos acá mismo." };
}

const cuentaSchema = z.object({
  numero: z.string().trim().regex(/^\d{20}$/, "La cuenta son 20 dígitos, sin espacios"),
  banco: z.enum(["BDT", "BT"]),
  alias: z.string().trim().min(2, "Ponle un alias para reconocerla").max(60),
});

export async function registrarCuenta(
  _previo: ResultadoActivacion | null,
  datos: FormData
): Promise<ResultadoActivacion> {
  const session = await exigirAdminComercio();

  const parsed = cuentaSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  return withSessionTenant(session, async () => {
    try {
      await prisma.bankAccount.create({
        data: {
          organizationId: session.user.organizationId!,
          accountNumber: parsed.data.numero,
          banco: parsed.data.banco,
          alias: parsed.data.alias,
          // POR APROBAR: hasta que nosotros la activemos, la ingesta no le
          // atribuye pagos. La cuenta es dinero — la aprobación es nuestra.
          isActive: false,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return {
          ok: false,
          error: "Esa cuenta ya está registrada en la plataforma. Si es tuya, escríbenos.",
        };
      }
      throw e;
    }

    revalidatePath("/comercio/activacion");
    return { ok: true, mensaje: "Cuenta registrada. Queda por aprobar de nuestro lado." };
  });
}

const llaveSchema = z.string().trim().min(16, "La llave se ve muy corta").max(200);

/**
 * El comercio pega su propia Llave de Trabajo (es SU credencial, emitida por
 * el banco a su RIF). Queda CARGADA: verificarla contra el banco es el paso
 * de certificación y lo hacemos nosotros.
 */
export async function cargarLlave(
  _previo: ResultadoActivacion | null,
  datos: FormData
): Promise<ResultadoActivacion> {
  const session = await exigirAdminComercio();

  const parsed = llaveSchema.safeParse(datos.get("authKey"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await withSessionTenant(session, async () => {
    await prisma.organization.update({
      // La extensión no filtra Organization (raíz del tenant): el id de la
      // sesión es el que acota, y es el único que se usa acá.
      where: { id: session.user.organizationId! },
      data: {
        authKeyEnc: cifrar(parsed.data),
        authKeyHint: pistaDeLlave(parsed.data),
        authKeyStatus: "CARGADA",
        lastVerifiedAt: null,
      },
    });
    await prisma.authKeyEvent.create({
      data: {
        organizationId: session.user.organizationId!,
        action: "cargada",
        actorUserId: session.user.id,
        detail: `Cargada por el comercio (${session.user.username})`,
      },
    });
  });

  revalidatePath("/comercio/activacion");
  return {
    ok: true,
    mensaje: "Llave guardada. La verificamos contra el banco como parte de tu certificación.",
  };
}

const escenarioSchema = z.enum(["TRAE_AFILIACION", "GESTIONAMOS"]);

/**
 * El comercio declara su escenario bancario: trae su afiliación, o nos pide
 * gestionarla nosotros (full service). Cambia lo que su panel le pide y lo
 * que nuestro equipo hace en el paso «enviada al banco».
 */
export async function elegirGestionBanco(
  _previo: ResultadoActivacion | null,
  datos: FormData
): Promise<ResultadoActivacion> {
  const session = await exigirAdminComercio();

  const parsed = escenarioSchema.safeParse(datos.get("escenario"));
  if (!parsed.success) return { ok: false, error: "Elige una de las dos opciones." };

  await withSessionTenant(session, () =>
    prisma.organization.update({
      where: { id: session.user.organizationId! },
      data: { gestionBanco: parsed.data },
    })
  );

  revalidatePath("/comercio/activacion");
  return {
    ok: true,
    mensaje:
      parsed.data === "GESTIONAMOS"
        ? "Listo: nosotros gestionamos tu afiliación con el banco. Te avisamos por acá cada avance."
        : "Perfecto: pega tu Llave de Trabajo cuando quieras.",
  };
}
