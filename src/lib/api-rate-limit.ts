import { prisma } from "./prisma";
import { runAsPlatform } from "./tenant-context";

/**
 * Rate limit PERSISTIDO de la API v1, contando sobre `ApiEvent` (patrón
 * `Lead`: la misma tabla que audita sirve de contador — multi-instancia-safe
 * sin Redis, y el freno sobrevive reinicios).
 *
 * Dos frenos distintos porque frenan cosas distintas:
 * - Por API key: abuso/bug del integrador (60/min por defecto).
 * - Por IP en la validación de referencia: una referencia son 6+ dígitos —
 *   se adivina por fuerza bruta si se deja probar sin límite (15 / 5 min).
 *   Se cuenta CROSS-tenant a propósito: rotar de comercio no resetea el freno.
 *
 * El freno por IP mira SOLO el tráfico sin credencial (la página pública
 * `/pay`), y por eso `apiKeyId: null` en el conteo. Lo aprendido el
 * 2026-08-17: las tiendas de los comercios viven en este mismo servidor, así
 * que TODAS llegan con la misma IP de salida — una venta legítima de VIP Play
 * gastó 13 de los 15 intentos y el siguiente comprador de CUALQUIER comercio
 * se habría comido un 429. Al tráfico con credencial lo frena su propia key,
 * que es la que identifica al culpable de verdad.
 */

const KEY_LIMIT = 60;
const KEY_WINDOW_S = 60;
const REF_IP_LIMIT = 15;
const REF_IP_WINDOW_S = 300;

/** Acciones que cuentan para el freno por IP de validación de referencia. */
const REF_ACTIONS = ["ref_validated", "ref_rejected"];

export interface RateVerdict {
  limited: boolean;
  retryAfterS: number;
}

/** Freno por API key: cuenta TODO evento de esa key en la ventana. */
export async function rateLimitPorKey(apiKeyId: string): Promise<RateVerdict> {
  const desde = new Date(Date.now() - KEY_WINDOW_S * 1000);
  // Tenant-scoped: la key pertenece al comercio del contexto ya abierto.
  const usados = await prisma.apiEvent.count({
    where: { apiKeyId, createdAt: { gte: desde } },
  });
  return usados >= KEY_LIMIT
    ? { limited: true, retryAfterS: KEY_WINDOW_S }
    : { limited: false, retryAfterS: 0 };
}

/** Freno por IP para intentos de validación de referencia (anti fuerza bruta). */
export async function rateLimitRefPorIp(clientIp: string): Promise<RateVerdict> {
  if (clientIp === "local") return { limited: false, retryAfterS: 0 };
  const desde = new Date(Date.now() - REF_IP_WINDOW_S * 1000);
  const usados = await runAsPlatform("rate limit: contar intentos por IP", () =>
    prisma.apiEvent.count({
      where: { clientIp, apiKeyId: null, action: { in: REF_ACTIONS }, createdAt: { gte: desde } },
    })
  );
  return usados >= REF_IP_LIMIT
    ? { limited: true, retryAfterS: REF_IP_WINDOW_S }
    : { limited: false, retryAfterS: 0 };
}

/**
 * Bitácora append-only de la API. `detail` llega YA enmascarado — esta función
 * no sabe qué es sensible, el que llama sí.
 */
export function registrarApiEvent(data: {
  organizationId: string;
  apiKeyId?: string | null;
  intentId?: string | null;
  action: string;
  detail?: string;
  clientIp?: string;
}): Promise<unknown> {
  return prisma.apiEvent.create({
    data: {
      organizationId: data.organizationId,
      apiKeyId: data.apiKeyId ?? null,
      intentId: data.intentId ?? null,
      action: data.action,
      detail: data.detail ?? null,
      clientIp: data.clientIp ?? null,
    },
  });
}
