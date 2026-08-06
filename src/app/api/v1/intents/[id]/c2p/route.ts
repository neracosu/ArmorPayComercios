import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth, apiError, clientIpOf } from "@/lib/api-auth";
import { rateLimitPorKey, rateLimitRefPorIp, registrarApiEvent } from "@/lib/api-rate-limit";
import { intentPublico, encolarWebhooks, maskRef } from "@/lib/checkout";
import { execC2pPago, ExecError } from "@/lib/exec-client";
import { describeC2p } from "../../../../../../../gateway/bt-c2p-codes";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/intents/{id}/c2p — cobro activo con el «Botón de Pago» del
 * Tesoro. El pagador genera una clave dinámica (OTP) desde su banco y el
 * débito ocurre en la respuesta síncrona.
 *
 * Reglas duras:
 * - Formatos venezolanos se validan ANTES de llamar al banco: cada llamada
 *   C2P es una transacción contra la red interbancaria, no un ping.
 * - El monto y el concepto salen del INTENT (servidor), jamás del body.
 * - Éxito ⇔ `codres === "C2P0000"`. Un rechazo deja el intent en FAILED
 *   parcial: admite reintento con OTP nuevo mientras no venza.
 * - NETERR (el banco no respondió) es DESCONOCIDO, no rechazo: el intent
 *   queda intacto y el integrador reintenta con OTP nuevo.
 * - Requiere `Organization.btC2pEnabled` (el ejecutor lo re-verifica).
 */

const bodySchema = z.object({
  celular: z.string().trim().regex(/^04(12|14|16|24|26)\d{7}$/, "celular móvil venezolano"),
  bancoPagador: z.string().trim().regex(/^\d{4}$/, "código de banco del catálogo C2P"),
  cedula: z.string().trim().regex(/^[VEPvep]?\d{6,9}$/, "cédula V/E/P + 6-9 dígitos"),
  otp: z.string().trim().regex(/^\d{4,12}$/, "clave dinámica numérica"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiAuth(req, async (auth) => {
    const clientIp = clientIpOf(req);

    const porKey = await rateLimitPorKey(auth.apiKeyId);
    const porIp = porKey.limited ? porKey : await rateLimitRefPorIp(clientIp);
    if (porIp.limited) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: "Demasiados intentos. Espera y reintenta." },
        { status: 429, headers: { "Retry-After": String(porIp.retryAfterS) } }
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(400, "VALIDATION", "Body inválido.", { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const intent = await prisma.checkoutIntent.findUnique({ where: { id: params.id } });
    if (!intent) return apiError(404, "INTENT_NOT_FOUND", "Ese intent no existe.");
    if (intent.status === "CONFIRMED") {
      return NextResponse.json({ intent: intentPublico(intent) });
    }
    if (intent.status === "EXPIRED" || intent.expiresAt.getTime() < Date.now()) {
      return apiError(410, "INTENT_EXPIRED", "El intent venció. Crea uno nuevo.");
    }

    // Organization es la raíz del tenant (sin columna organizationId): se lee
    // por el id del contexto, que es el dueño de la key.
    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { btC2pEnabled: true, btCodAfiliado: true },
    });
    if (!org?.btC2pEnabled || !org.btCodAfiliado) {
      return apiError(422, "C2P_NOT_ENABLED", "Este comercio no tiene C2P habilitado.");
    }

    let r;
    try {
      r = await execC2pPago({
        organizationId: auth.organizationId,
        celular: input.celular,
        bancoPagador: input.bancoPagador,
        cedula: input.cedula,
        monto: intent.amountVES.toFixed(2), // el monto lo decide el servidor
        otp: input.otp,
        concepto: intent.concepto,
        intentId: intent.id,
      });
    } catch (e) {
      const detalle = e instanceof ExecError ? e.message : (e as Error).message;
      await registrarApiEvent({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        intentId: intent.id,
        action: "c2p_fail",
        detail: `NETERR ${detalle.slice(0, 200)}`,
        clientIp,
      });
      // Desconocido ≠ rechazado: el débito PUDO ocurrir. El intent no cambia.
      return apiError(
        502,
        "BANK_UNAVAILABLE",
        "El banco no respondió. Verifica con el pagador antes de reintentar.",
        { retriable: true }
      );
    }

    if (!r.aprobado) {
      const traducido = describeC2p(r.codres, r.message);
      const fallido = await prisma.checkoutIntent.update({
        where: { id: intent.id },
        data: {
          status: "FAILED", // parcial: puede reintentar con OTP nuevo
          method: "C2P",
          c2pCodres: r.codres,
          gatewayResponse: r.raw,
        },
      });
      await registrarApiEvent({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        intentId: intent.id,
        action: "c2p_fail",
        detail: `codres=${r.codres}`,
        clientIp,
      });
      return apiError(422, "C2P_REJECTED", traducido.headline, {
        codres: r.codres,
        hint: traducido.hint,
        retriable: true,
        intent: intentPublico(fallido),
      });
    }

    // Aprobado: cobro sintético en el MISMO árbitro que la caja. No hay
    // BankTransaction (el C2P no pasa por el webhook) — la clave es la
    // referencia que emitió el banco, prefijada para no chocar con tx.id.
    const referencia = r.referencia ?? "";
    try {
      await prisma.paymentClaim.create({
        data: {
          organizationId: auth.organizationId,
          source: "CHECKOUT",
          checkoutIntentId: intent.id,
          reference: referencia,
          amount: intent.amountVES,
          numeroCuenta: "c2p", // no hay cuenta origen del webhook en este camino
          payerBank: input.bancoPagador,
          primaryKey: `c2p:${auth.organizationId}:${referencia}`,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      // El banco aprobó pero esa referencia ya está cobrada: caso anómalo que
      // NO debe perderse — queda en la bitácora con el crudo del banco.
      await registrarApiEvent({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        intentId: intent.id,
        action: "c2p_dup",
        detail: `ref=${maskRef(referencia)} aprobado con referencia ya cobrada`,
        clientIp,
      });
      return apiError(
        409,
        "REFERENCE_ALREADY_USED",
        "El banco aprobó pero la referencia ya estaba cobrada. Contacta a la plataforma."
      );
    }

    const confirmado = await prisma.checkoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "CONFIRMED",
        method: "C2P",
        c2pReferencia: referencia,
        c2pCodres: r.codres,
        gatewayResponse: r.raw,
        confirmedAt: new Date(),
      },
    });

    await registrarApiEvent({
      organizationId: auth.organizationId,
      apiKeyId: auth.apiKeyId,
      intentId: intent.id,
      action: "c2p_ok",
      detail: `ref=${maskRef(referencia)} comision=${r.montoComision ?? "-"} lote=${r.numeroLote ?? "-"}`,
      clientIp,
    });
    await encolarWebhooks(confirmado, "intent.confirmed");

    return NextResponse.json({
      intent: intentPublico(confirmado),
      cobro: {
        referencia,
        montoVES: intent.amountVES.toFixed(2),
        montoComision: r.montoComision,
        numeroLote: r.numeroLote,
        fecha: r.fecha,
        hora: r.hora,
      },
    });
  });
}
