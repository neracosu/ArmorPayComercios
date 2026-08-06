import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth, apiError, clientIpOf } from "@/lib/api-auth";
import { rateLimitPorKey, registrarApiEvent } from "@/lib/api-rate-limit";
import { intentPublico, montoVES, sanearConcepto } from "@/lib/checkout";
import { tasaBcv, usdAVes, TasaNoDisponible } from "@/lib/bcv";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/intents — crea una intención de cobro.
 *
 * El monto lo fija el comercio ACÁ, server-to-server, y de acá en adelante es
 * la única verdad: la validación compara contra esto, nunca contra lo que
 * declare el cliente final en su navegador.
 *
 * `Idempotency-Key` es obligatorio: el carrito reintenta ante un timeout y el
 * unique compuesto [organizationId, idempotencyKey] garantiza que el reintento
 * devuelve el MISMO intent en vez de crear otro cobro.
 */

const VIGENCIA_MIN = 30;

const bodySchema = z.object({
  externalRef: z.string().trim().min(1).max(120),
  // Uno de los dos, nunca ambos: en VES el monto es literal; en USD se
  // congela a VES con la tasa BCV del momento (Fase 6).
  amountVES: z.union([z.string(), z.number()]).optional(),
  amountUSD: z.union([z.string(), z.number()]).optional(),
  concepto: z.string().trim().min(1).max(120).optional(),
});

export async function POST(req: NextRequest) {
  return withApiAuth(req, async (auth) => {
    const freno = await rateLimitPorKey(auth.apiKeyId);
    if (freno.limited) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: "Demasiadas peticiones. Espera y reintenta." },
        { status: 429, headers: { "Retry-After": String(freno.retryAfterS) } }
      );
    }

    const idempotencyKey = req.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 120) {
      return apiError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Manda el header Idempotency-Key (único por pedido, ≤120 chars)."
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(400, "VALIDATION", "Body inválido.", { issues: parsed.error.issues });
    }
    const tieneVES = parsed.data.amountVES !== undefined;
    const tieneUSD = parsed.data.amountUSD !== undefined;
    if (tieneVES === tieneUSD) {
      return apiError(400, "INVALID_AMOUNT", "Manda amountVES O amountUSD — exactamente uno.");
    }

    let monto = null;
    let montoUSD = null;
    let tasa = null;
    if (tieneVES) {
      monto = montoVES(parsed.data.amountVES);
      if (!monto) {
        return apiError(
          400,
          "INVALID_AMOUNT",
          "amountVES debe ser un monto positivo con máximo 2 decimales (ej. \"1250.50\")."
        );
      }
    } else {
      montoUSD = montoVES(parsed.data.amountUSD);
      if (!montoUSD) {
        return apiError(
          400,
          "INVALID_AMOUNT",
          "amountUSD debe ser un monto positivo con máximo 2 decimales (ej. \"25.00\")."
        );
      }
      try {
        tasa = await tasaBcv();
      } catch (e) {
        if (!(e instanceof TasaNoDisponible)) throw e;
        // Sin tasa utilizable NO se inventa una: el cobro en USD se niega
        // explícito y el carrito puede reintentar o cobrar en VES.
        return apiError(503, "RATE_UNAVAILABLE", "La tasa BCV no está disponible ahora. Reintenta en unos minutos o manda amountVES.");
      }
      monto = usdAVes(montoUSD, tasa.rate);
    }

    const concepto =
      sanearConcepto(parsed.data.concepto ?? `Pedido ${parsed.data.externalRef}`) || "Pago";

    const data = {
      organizationId: auth.organizationId,
      apiKeyId: auth.apiKeyId,
      externalRef: parsed.data.externalRef,
      amountVES: monto,
      amountUSD: montoUSD,
      exchangeRateUsed: tasa?.rate ?? null,
      exchangeRateId: tasa?.id ?? null,
      concepto,
      idempotencyKey,
      expiresAt: new Date(Date.now() + VIGENCIA_MIN * 60_000),
    };

    try {
      const intent = await prisma.checkoutIntent.create({ data });
      await registrarApiEvent({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        intentId: intent.id,
        action: "intent_created",
        detail: `externalRef=${intent.externalRef} monto=${monto.toFixed(2)}`,
        clientIp: clientIpOf(req),
      });
      return NextResponse.json({ intent: intentPublico(intent) }, { status: 201 });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      // Reintento del carrito: devolver el intent original, no crear otro.
      const existente = await prisma.checkoutIntent.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: auth.organizationId,
            idempotencyKey,
          },
        },
      });
      if (!existente) throw e; // carrera rarísima: que suba como 500
      return NextResponse.json({ intent: intentPublico(existente) }, { status: 200 });
    }
  });
}
