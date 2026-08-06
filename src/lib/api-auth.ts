import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { runAsPlatform, runWithTenant } from "./tenant-context";

/**
 * Autenticación de la API pública v1: `Authorization: Bearer ak_live_...`.
 *
 * Es la TERCERA entrada sin sesión de usuario (junto a la ingesta del gateway
 * y, en Fase 5, la página pública de pago): acá no hay usuario del cual
 * deducir el tenant, así que el contexto se abre explícito — `runAsPlatform`
 * SOLO para resolver a qué comercio pertenece la key, y `runWithTenant` para
 * todo lo demás del handler.
 *
 * El key completo no se guarda nunca: en la base viven el `prefix` (lookup) y
 * el sha256. La comparación es en tiempo constante; el lookup por prefijo no
 * filtra nada porque el prefijo es la parte pública del key.
 */

export const KEY_PREFIX = "ak_live_";
/** Chars visibles después del prefijo — juntos forman el `prefix` de lookup. */
const PREFIX_VISIBLE = 8;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Genera un key nuevo. El `key` completo se muestra UNA vez y no se persiste. */
export function generateApiKey(): { key: string; prefix: string; hashedKey: string } {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`; // 8 + 48 chars
  return {
    key,
    prefix: key.slice(0, KEY_PREFIX.length + PREFIX_VISIBLE),
    hashedKey: sha256(key),
  };
}

export interface ApiAuth {
  organizationId: string;
  apiKeyId: string;
}

/** Resuelve y verifica el Bearer. Devuelve null ante CUALQUIER problema. */
export async function authenticateApiKey(req: Request): Promise<ApiAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token.startsWith(KEY_PREFIX) || token.length < KEY_PREFIX.length + PREFIX_VISIBLE + 8) {
    return null;
  }
  const prefix = token.slice(0, KEY_PREFIX.length + PREFIX_VISIBLE);

  return runAsPlatform("api: resolver key por prefijo", async () => {
    const row = await prisma.apiKey.findUnique({
      where: { prefix },
      select: {
        id: true,
        hashedKey: true,
        isActive: true,
        organizationId: true,
        organization: { select: { status: true } },
      },
    });
    if (!row || !row.isActive || row.organization.status !== "ACTIVA") return null;

    const dado = Buffer.from(sha256(token));
    const esperado = Buffer.from(row.hashedKey);
    if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return null;

    // Best-effort: si esta escritura falla, la petición sigue igual.
    prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return { organizationId: row.organizationId, apiKeyId: row.id };
  });
}

/** Error tipificado de la API pública: `code` accionable + HTTP status. */
export function apiError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json({ code, message, ...extra }, { status });
}

/**
 * Envuelve un handler de la API v1: autentica y abre el contexto de tenant.
 * TODO lo que el handler consulte queda acotado al comercio dueño de la key.
 */
export async function withApiAuth(
  req: Request,
  fn: (auth: ApiAuth) => Promise<NextResponse>
): Promise<NextResponse> {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return apiError(401, "UNAUTHORIZED", "API key inválida, inactiva o de un comercio no activo.");
  }
  return runWithTenant(auth.organizationId, () => fn(auth));
}

/** IP del cliente detrás del proxy local. */
export function clientIpOf(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}
