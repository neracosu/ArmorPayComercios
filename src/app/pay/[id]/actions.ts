"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runAsPlatform, runWithTenant } from "@/lib/tenant-context";
import { rateLimitRefPorIp } from "@/lib/api-rate-limit";
import { intentPublico } from "@/lib/checkout";
import {
  confirmarPorReferencia,
  cobrarPorC2p,
  intentNoOperable,
} from "@/lib/checkout-flows";

/**
 * Acciones de la página pública de pago. SIN sesión y SIN API key: el que las
 * dispara es el cliente final. Por eso:
 * - el freno por IP es el mismo de la API (una referencia se adivina);
 * - el intent se resuelve con `runAsPlatform` y TODO lo demás corre en
 *   `runWithTenant` del comercio dueño;
 * - la lógica es la MISMA de la API (`checkout-flows.ts`) — acá solo se
 *   traduce el resultado a algo que la página pueda pintar.
 */

export type ResultadoPago =
  | { ok: true; intent: ReturnType<typeof intentPublico>; sobrepago: string | null }
  | { ok: false; code: string; message: string; hint?: string; faltanteVES?: string; retriable?: boolean };

function ipDelCliente(): string {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

async function cargarIntent(intentId: string) {
  return runAsPlatform("pay: resolver intent para operar", () =>
    prisma.checkoutIntent.findUnique({ where: { id: intentId } })
  );
}

const refSchema = z.object({
  intentId: z.string().min(1),
  referencia: z.string().trim().regex(/^\d{6,20}$/, "Escribe al menos los últimos 6 dígitos"),
});

export async function validarReferenciaPublica(
  _previo: ResultadoPago | null,
  datos: FormData
): Promise<ResultadoPago> {
  const parsed = refSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0].message };
  }
  const clientIp = ipDelCliente();

  const freno = await rateLimitRefPorIp(clientIp);
  if (freno.limited) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
    };
  }

  const intent = await cargarIntent(parsed.data.intentId);
  if (!intent) return { ok: false, code: "INTENT_NOT_FOUND", message: "Este link de pago no existe." };
  const estado = intentNoOperable(intent);
  if (estado === "ya_confirmado") {
    return { ok: true, intent: intentPublico(intent), sobrepago: null };
  }
  if (estado) return { ok: false, code: estado.code, message: "Este link de pago venció. Vuelve a la tienda y genera uno nuevo." };

  return runWithTenant(intent.organizationId, async () => {
    const r = await confirmarPorReferencia(intent, parsed.data.referencia, { clientIp });
    if (!r.ok) {
      return {
        ok: false as const,
        code: r.code,
        message: r.message,
        faltanteVES: (r.extra?.faltanteVES as string) ?? undefined,
      };
    }
    return { ok: true as const, intent: intentPublico(r.intent), sobrepago: r.pago.overpaidVES };
  });
}

const c2pSchema = z.object({
  intentId: z.string().min(1),
  // Sin lista blanca de prefijos: los bancos digitales emiten números
  // virtuales (0422, …) que son válidos en Pago Móvil.
  celular: z.string().trim().regex(/^04\d{9}$/, "Escribe tu celular completo (04XX…)"),
  banco: z.string().trim().regex(/^\d{4}$/, "Elige el banco de tu cuenta"),
  cedula: z.string().trim().regex(/^[VEPvep]?\d{6,9}$/, "Escribe tu cédula (solo números, o V/E adelante)"),
  otp: z.string().trim().regex(/^\d{4,12}$/, "Escribe la clave numérica que te dio tu banco"),
});

export async function cobrarC2pPublico(
  _previo: ResultadoPago | null,
  datos: FormData
): Promise<ResultadoPago> {
  const parsed = c2pSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0].message };
  }
  const clientIp = ipDelCliente();

  const freno = await rateLimitRefPorIp(clientIp);
  if (freno.limited) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
    };
  }

  const intent = await cargarIntent(parsed.data.intentId);
  if (!intent) return { ok: false, code: "INTENT_NOT_FOUND", message: "Este link de pago no existe." };
  const estado = intentNoOperable(intent);
  if (estado === "ya_confirmado") {
    return { ok: true, intent: intentPublico(intent), sobrepago: null };
  }
  if (estado) return { ok: false, code: estado.code, message: "Este link de pago venció. Vuelve a la tienda y genera uno nuevo." };

  return runWithTenant(intent.organizationId, async () => {
    const r = await cobrarPorC2p(
      intent,
      {
        celular: parsed.data.celular,
        bancoPagador: parsed.data.banco,
        cedula: parsed.data.cedula,
        otp: parsed.data.otp,
      },
      { clientIp }
    );
    if (!r.ok) {
      return {
        ok: false as const,
        code: r.code,
        message: r.message,
        hint: (r.extra?.hint as string) ?? undefined,
        retriable: Boolean(r.extra?.retriable),
      };
    }
    return { ok: true as const, intent: intentPublico(r.intent), sobrepago: null };
  });
}
