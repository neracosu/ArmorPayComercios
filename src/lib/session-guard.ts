import { getServerSession } from "next-auth";
import { PrismaClient } from "@prisma/client";
import { authOptions } from "./auth";
import { runWithTenant, runAsPlatform } from "./tenant-context";

/**
 * Sesión verificada + apertura del contexto de tenant.
 *
 * Dos cosas que el JWT solo no puede garantizar:
 *  1. **Revocación inmediata.** El token es autocontenido y vive 30 días; si se
 *     despide a un cajero o se le roba la sesión, hay que poder matarla YA. Se
 *     compara `tokenVersion` contra la base: al incrementarlo, todas las
 *     sesiones de ese usuario mueren en su siguiente navegación.
 *  2. **Sesión corta para roles administrativos.** La sesión larga es para las
 *     cajas, que son PCs fijas. Un `ORG_ADMIN` o un `PLATFORM_ADMIN` con 30
 *     días de sesión es otra cosa: se cortan a las 8 h vía `loginAt`.
 */
const guardDb = new PrismaClient();

const ADMIN_MAX_SESSION_S = 60 * 60 * 8;
const ADMIN_ROLES = new Set(["PLATFORM_ADMIN", "ORG_ADMIN"]);

export async function getVerifiedSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  if (ADMIN_ROLES.has(session.user.role) && session.loginAt) {
    if (Math.floor(Date.now() / 1000) - session.loginAt > ADMIN_MAX_SESSION_S) return null;
  }

  const user = await guardDb.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, tokenVersion: true, organizationId: true },
  });
  if (!user || !user.isActive) return null;
  if (user.tokenVersion !== session.tokenVersion) return null;

  // La organización manda sobre lo que diga el token: si a un usuario lo
  // movieron de comercio, el token viejo no puede seguir apuntando al anterior.
  session.user.organizationId = user.organizationId;
  return session;
}

/**
 * Corre `fn` con el contexto de tenant que corresponde a la sesión.
 *
 * Es la puerta por la que debe pasar TODA página y acción del panel. Un
 * `PLATFORM_ADMIN` no tiene comercio propio: opera en modo plataforma, y eso
 * queda registrado en el motivo.
 */
export async function withSessionTenant<T>(
  session: { user: { role: string; organizationId: string | null; username: string } },
  fn: () => T | Promise<T>
): Promise<T> {
  if (session.user.role === "PLATFORM_ADMIN") {
    return runAsPlatform(`panel de plataforma (${session.user.username})`, fn);
  }
  if (!session.user.organizationId) {
    throw new Error(`El usuario ${session.user.username} no pertenece a ningún comercio.`);
  }
  return runWithTenant(session.user.organizationId, fn);
}
