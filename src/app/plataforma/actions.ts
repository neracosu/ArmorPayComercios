"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { PrismaClient, type LeadEstado } from "@prisma/client";
import { getVerifiedSession } from "@/lib/session-guard";
import { normalizeUsername, usernameSchema } from "@/lib/username";

/**
 * Acciones del panel de plataforma. Solo `PLATFORM_ADMIN`.
 *
 * Se usa un cliente Prisma sin la extensión de tenant: estas operaciones son
 * intencionalmente multi-comercio (ver la cola de solicitudes de todos, crear
 * un comercio que todavía no existe). El aislamiento acá lo da el rol, no el
 * contexto — y por eso cada acción lo verifica primero, sin excepción.
 */
const db = new PrismaClient();

async function exigirPlataforma() {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "PLATFORM_ADMIN") {
    throw new Error("No autorizado");
  }
  return session;
}

export type Resultado =
  | { ok: true; mensaje: string; credenciales?: { usuario: string; password: string } }
  | { ok: false; error: string };

const normalizarRif = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Contraseña inicial legible pero no adivinable. Se muestra UNA sola vez. */
function generarPassword(): string {
  return randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x");
}

export async function cambiarEstadoLead(
  leadId: string,
  estado: LeadEstado
): Promise<Resultado> {
  await exigirPlataforma();
  await db.lead.update({ where: { id: leadId }, data: { estado } });
  revalidatePath("/plataforma/solicitudes");
  return { ok: true, mensaje: `Solicitud marcada como ${estado.toLowerCase()}.` };
}

const usuarioComercioSchema = z.object({
  organizationId: z.string().min(1),
  usuario: usernameSchema,
  nombre: z.string().trim().min(2, "Falta el nombre").max(120),
});

/**
 * Crea el usuario administrador de un comercio.
 *
 * Es la única vía para que exista un `ORG_ADMIN`: el dueño del negocio no se
 * autocrea. Desde ahí, él arma sus propias cajas sin que nosotros
 * intervengamos.
 */
export async function crearAdminComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  await exigirPlataforma();

  const parsed = usuarioComercioSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const usuario = normalizeUsername(parsed.data.usuario);
  if (await db.user.findUnique({ where: { username: usuario } })) {
    return { ok: false, error: `El usuario "${usuario}" ya existe.` };
  }

  const branch = await db.branch.findFirst({
    where: { organizationId: parsed.data.organizationId },
  });
  const password = generarPassword();

  await db.user.create({
    data: {
      username: usuario,
      name: parsed.data.nombre,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ORG_ADMIN",
      organizationId: parsed.data.organizationId,
      branchId: branch?.id ?? null,
    },
  });

  revalidatePath(`/plataforma/comercios/${parsed.data.organizationId}`);
  return {
    ok: true,
    mensaje: "Administrador creado.",
    credenciales: { usuario, password },
  };
}

/** Suspende o reactiva un comercio. Suspendido, ninguno de sus usuarios entra. */
export async function cambiarEstadoComercio(
  organizationId: string,
  suspender: boolean
): Promise<Resultado> {
  await exigirPlataforma();
  await db.organization.update({
    where: { id: organizationId },
    data: { status: suspender ? "SUSPENDIDA" : "ACTIVA" },
  });
  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return {
    ok: true,
    mensaje: suspender ? "Comercio suspendido." : "Comercio reactivado.",
  };
}

const convertirSchema = z.object({
  leadId: z.string().min(1),
  razonSocial: z.string().trim().min(2, "Falta la razón social").max(160),
  rif: z.string().trim().min(6, "Falta el RIF").max(20),
  slug: usernameSchema,
  usuario: usernameSchema,
  nombreUsuario: z.string().trim().min(2, "Falta el nombre del responsable").max(120),
});

/**
 * Convierte una solicitud en comercio operativo.
 *
 * Crea la `Organization`, su sucursal por defecto —sin ella una caja no puede
 * abrir turno— y el usuario administrador del comercio, con una contraseña
 * temporal que se muestra una sola vez.
 *
 * NO carga la Llave de Trabajo del banco: eso pasa después, cuando el banco
 * afilia la cuenta. El comercio nace en estado REGISTRADA justamente para que
 * quede claro que todavía no puede validar.
 */
export async function convertirLead(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const parsed = convertirSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const d = parsed.data;
  const rif = normalizarRif(d.rif);
  const usuario = normalizeUsername(d.usuario);
  const slug = normalizeUsername(d.slug);

  if (await db.organization.findUnique({ where: { rif } })) {
    return { ok: false, error: `Ya existe un comercio con el RIF ${rif}.` };
  }
  if (await db.organization.findUnique({ where: { slug } })) {
    return { ok: false, error: `El identificador "${slug}" ya está usado.` };
  }
  if (await db.user.findUnique({ where: { username: usuario } })) {
    return { ok: false, error: `El usuario "${usuario}" ya existe.` };
  }

  const password = generarPassword();

  const org = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { rif, razonSocial: d.razonSocial, slug },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Principal", code: "PRIN" },
    });
    await tx.user.create({
      data: {
        username: usuario,
        name: d.nombreUsuario,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ORG_ADMIN",
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    await tx.lead.update({
      where: { id: d.leadId },
      data: {
        estado: "CONVERTIDO",
        organizationId: org.id,
        convertidoPor: session.user.username,
        convertidoAt: new Date(),
      },
    });
    return org;
  });

  revalidatePath("/plataforma/solicitudes");
  return {
    ok: true,
    mensaje: `${org.razonSocial} quedó creado. Falta afiliar su cuenta ante el banco y cargarle la Llave de Trabajo.`,
    credenciales: { usuario, password },
  };
}
