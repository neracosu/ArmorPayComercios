"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { normalizeUsername, usernameSchema } from "@/lib/username";

/**
 * Acciones del administrador del comercio.
 *
 * A diferencia del panel de plataforma, acá TODO pasa por el contexto de
 * tenant: un `ORG_ADMIN` solo puede tocar lo suyo, y no porque el código se
 * acuerde de filtrar, sino porque la extensión de Prisma no lo deja salir.
 */

export type ResultadoComercio =
  | { ok: true; mensaje: string; credenciales?: { usuario: string; password: string } }
  | { ok: false; error: string };

async function exigirAdminComercio() {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") throw new Error("No autorizado");
  return session;
}

function generarPassword(): string {
  return randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x");
}

const cajaSchema = z.object({
  usuario: usernameSchema,
  nombre: z.string().trim().min(2, "Poné un nombre para la caja").max(120),
  branchId: z.string().min(1, "Elegí la sucursal"),
});

/** Crea una caja. La contraseña se muestra una sola vez. */
export async function crearCaja(
  _previo: ResultadoComercio | null,
  datos: FormData
): Promise<ResultadoComercio> {
  const session = await exigirAdminComercio();

  const parsed = cajaSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const usuario = normalizeUsername(parsed.data.usuario);
  const password = generarPassword();

  return withSessionTenant(session, async () => {
    // La sucursal se busca DENTRO del contexto: si el id fuera de otro
    // comercio, simplemente no aparece.
    const sucursal = await prisma.branch.findFirst({ where: { id: parsed.data.branchId } });
    if (!sucursal) return { ok: false, error: "Esa sucursal no es de tu comercio." };

    try {
      await prisma.user.create({
        data: {
          organizationId: session.user.organizationId!,
          username: usuario,
          name: parsed.data.nombre,
          passwordHash: await bcrypt.hash(password, 12),
          role: "OPERATOR",
          branchId: sucursal.id,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return { ok: false, error: `El usuario "${usuario}" ya está tomado.` };
      }
      throw e;
    }

    revalidatePath("/comercio/cajas");
    return {
      ok: true,
      mensaje: `Caja ${parsed.data.nombre} creada.`,
      credenciales: { usuario, password },
    };
  });
}

/**
 * Desactiva o reactiva una caja.
 *
 * Desactivar cierra sus sesiones al instante: se sube `tokenVersion` y el
 * guardián corta el token en la siguiente navegación. Es lo que hace falta
 * cuando alguien deja de trabajar y su PC queda abierta.
 */
export async function alternarCaja(userId: string): Promise<ResultadoComercio> {
  const session = await exigirAdminComercio();

  return withSessionTenant(session, async () => {
    const caja = await prisma.user.findFirst({ where: { id: userId, role: "OPERATOR" } });
    if (!caja) return { ok: false, error: "Esa caja no es de tu comercio." };

    await prisma.user.update({
      where: { id: caja.id },
      data: { isActive: !caja.isActive, tokenVersion: { increment: 1 } },
    });

    revalidatePath("/comercio/cajas");
    return {
      ok: true,
      mensaje: caja.isActive ? "Caja desactivada y sesiones cerradas." : "Caja reactivada.",
    };
  });
}

/** Resetea la contraseña de una caja y cierra sus sesiones. */
export async function resetearClave(userId: string): Promise<ResultadoComercio> {
  const session = await exigirAdminComercio();
  const password = generarPassword();

  return withSessionTenant(session, async () => {
    const caja = await prisma.user.findFirst({ where: { id: userId, role: "OPERATOR" } });
    if (!caja) return { ok: false, error: "Esa caja no es de tu comercio." };

    await prisma.user.update({
      where: { id: caja.id },
      data: { passwordHash: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } },
    });

    revalidatePath("/comercio/cajas");
    return {
      ok: true,
      mensaje: "Contraseña cambiada. La caja tiene que entrar de nuevo.",
      credenciales: { usuario: caja.username, password },
    };
  });
}
