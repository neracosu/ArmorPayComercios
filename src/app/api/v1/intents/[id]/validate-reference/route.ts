import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth, apiError, clientIpOf } from "@/lib/api-auth";
import { rateLimitPorKey, rateLimitRefPorIp } from "@/lib/api-rate-limit";
import { intentPublico } from "@/lib/checkout";
import { confirmarPorReferencia, intentNoOperable } from "@/lib/checkout-flows";
import { bancoLabel } from "@/lib/bancos-ve";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/intents/{id}/validate-reference — cobro por referencia.
 * La lógica vive en `checkout-flows.ts`, COMPARTIDA con la página pública
 * `/pay`: un solo camino antifraude, dos puertas.
 */

const bodySchema = z.object({
  referencia: z.string().trim().regex(/^\d{6,20}$/, "referencia de 6 a 20 dígitos"),
  bancoPagador: z.string().trim().regex(/^\d{4}$/).optional(),
  telefonoPagador: z.string().trim().max(15).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiAuth(req, async (auth) => {
    const clientIp = clientIpOf(req);

    const porKey = await rateLimitPorKey(auth.apiKeyId);
    const freno = porKey.limited ? porKey : await rateLimitRefPorIp(clientIp);
    if (freno.limited) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: "Demasiados intentos. Espera y reintenta." },
        { status: 429, headers: { "Retry-After": String(freno.retryAfterS) } }
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(400, "VALIDATION", "Body inválido.", { issues: parsed.error.issues });
    }

    const intent = await prisma.checkoutIntent.findUnique({ where: { id: params.id } });
    if (!intent) return apiError(404, "INTENT_NOT_FOUND", "Ese intent no existe.");
    const estado = intentNoOperable(intent);
    if (estado === "ya_confirmado") return NextResponse.json({ intent: intentPublico(intent) });
    if (estado) return apiError(estado.status, estado.code, estado.message);

    const r = await confirmarPorReferencia(intent, parsed.data.referencia, {
      apiKeyId: auth.apiKeyId,
      clientIp,
    });
    if (!r.ok) return apiError(r.status, r.code, r.message, r.extra ?? {});

    return NextResponse.json({
      intent: intentPublico(r.intent),
      pago: { ...r.pago, bancoPagador: bancoLabel(r.pago.bancoPagador) },
    });
  });
}
