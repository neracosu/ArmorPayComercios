import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth, apiError, clientIpOf } from "@/lib/api-auth";
import { rateLimitPorKey, rateLimitRefPorIp } from "@/lib/api-rate-limit";
import { intentPublico } from "@/lib/checkout";
import { cobrarPorC2p, intentNoOperable } from "@/lib/checkout-flows";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/intents/{id}/c2p — cobro activo con el «Botón de Pago» del
 * Tesoro. La lógica vive en `checkout-flows.ts`, COMPARTIDA con `/pay`.
 * Los formatos venezolanos se validan ACÁ, antes de tocar al banco.
 */

const bodySchema = z.object({
  // Solo forma general: los prefijos válidos los decide el banco, no nosotros.
  // Una lista blanca 0412/14/16/24/26 rechazaba los números virtuales de los
  // bancos digitales (ej. 0422 del Banco Digital de los Trabajadores).
  celular: z.string().trim().regex(/^04\d{9}$/, "celular venezolano (04 + 9 dígitos)"),
  bancoPagador: z.string().trim().regex(/^\d{4}$/, "código de banco del catálogo C2P"),
  cedula: z.string().trim().regex(/^[VEPvep]?\d{6,9}$/, "cédula V/E/P + 6-9 dígitos"),
  otp: z.string().trim().regex(/^\d{4,12}$/, "clave dinámica numérica"),
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

    const r = await cobrarPorC2p(intent, parsed.data, { apiKeyId: auth.apiKeyId, clientIp });
    if (!r.ok) {
      return apiError(r.status, r.code, r.message, {
        ...(r.extra ?? {}),
        ...(r.intentActualizado ? { intent: intentPublico(r.intentActualizado) } : {}),
      });
    }

    return NextResponse.json({ intent: intentPublico(r.intent), cobro: r.cobro });
  });
}
