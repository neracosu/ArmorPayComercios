"use server";

import bcrypt from "bcryptjs";
import { getVerifiedSession } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { runAsPlatform } from "@/lib/tenant-context";

export type ResultadoCuenta = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * Cambio de contraseña PROPIO, para cualquier rol. Exige la clave actual
 * (una sesión abierta en una PC ajena no alcanza para robar la cuenta) y
 * sube `tokenVersion`: TODAS las sesiones —esta incluida— se cierran, y se
 * vuelve a entrar con la clave nueva. Es la mitad self-service del hueco
 * "no existía recuperación de contraseña"; la otra mitad es el reset del
 * PLATFORM_ADMIN en la ficha.
 *
 * `runAsPlatform` y no el tenant de la sesión: el modelo User está protegido
 * por la extensión y los usuarios internos no tienen organización. El acceso
 * queda acotado igual — el id viene SIEMPRE de la sesión, jamás del form.
 */
export async function cambiarMiContrasena(
  _previo: ResultadoCuenta | null,
  datos: FormData
): Promise<ResultadoCuenta> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entra de nuevo." };

  const actual = String(datos.get("actual") ?? "");
  const nueva = String(datos.get("nueva") ?? "");
  const repetida = String(datos.get("repetida") ?? "");

  if (nueva.length < 10) {
    return { ok: false, error: "La contraseña nueva necesita al menos 10 caracteres." };
  }
  if (nueva !== repetida) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }
  if (nueva === actual) {
    return { ok: false, error: "La contraseña nueva es igual a la actual." };
  }

  return runAsPlatform("cuenta: cambio de contraseña propio (id de la sesión)", async () => {
    const yo = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!yo) return { ok: false as const, error: "Tu usuario ya no existe." };
    if (!(await bcrypt.compare(actual, yo.passwordHash))) {
      return { ok: false as const, error: "La contraseña actual no es correcta." };
    }

    await prisma.user.update({
      where: { id: yo.id },
      data: {
        passwordHash: await bcrypt.hash(nueva, 12),
        tokenVersion: { increment: 1 },
      },
    });

    return {
      ok: true as const,
      mensaje: "Contraseña cambiada. Todas tus sesiones se cerraron: entra de nuevo con la nueva.",
    };
  });
}
