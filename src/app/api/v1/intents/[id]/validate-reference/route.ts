import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth, apiError, clientIpOf } from "@/lib/api-auth";
import { rateLimitPorKey, rateLimitRefPorIp, registrarApiEvent } from "@/lib/api-rate-limit";
import { intentPublico, encolarWebhooks, maskRef, toleranciaVES } from "@/lib/checkout";
import { bancoLabel } from "@/lib/bancos-ve";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/intents/{id}/validate-reference — el cobro por referencia.
 *
 * El cliente final ya pagó por pago móvil a la cuenta del comercio; acá se
 * confirma que ese pago EXISTE, ALCANZA y NO SE USÓ. Reglas duras:
 *
 * - Match por sufijo, y si hay varios candidatos se desambigua por monto;
 *   si ninguno queda inequívoco se FALLA (nunca `results[0]` — deuda #3 de
 *   VIP Play: el primero de la lista puede ser el pago de otro).
 * - Tolerancia asimétrica: subpago se rechaza con el faltante; sobrepago se
 *   acepta y se REGISTRA (`overpaidVES`).
 * - El cobro lo arbitra la base: `PaymentClaim.primaryKey = tx.id` — la misma
 *   clave que usa la caja. P2002 = ya cobrado, se responde 409 con quién.
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
    const { referencia } = parsed.data;

    const intent = await prisma.checkoutIntent.findUnique({ where: { id: params.id } });
    if (!intent) return apiError(404, "INTENT_NOT_FOUND", "Ese intent no existe.");
    if (intent.status === "CONFIRMED") {
      // Reintento después de un timeout: ya está cobrado, se devuelve tal cual.
      return NextResponse.json({ intent: intentPublico(intent) });
    }
    if (intent.status === "EXPIRED" || intent.expiresAt.getTime() < Date.now()) {
      return apiError(410, "INTENT_EXPIRED", "El intent venció. Crea uno nuevo.");
    }

    const rechazo = async (detalle: string) => {
      await registrarApiEvent({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        intentId: intent.id,
        action: "ref_rejected",
        detail: `ref=${maskRef(referencia)} ${detalle}`,
        clientIp,
      });
    };

    // Solo pagos a cuentas ACTIVAS del comercio (de ambos bancos). El filtro
    // de tenant lo pone la extensión; este es el filtro de negocio.
    const cuentas = await prisma.bankAccount.findMany({
      where: { isActive: true },
      select: { accountNumber: true },
    });
    if (cuentas.length === 0) {
      await rechazo("sin cuentas activas");
      return apiError(422, "MERCHANT_NOT_READY", "El comercio no tiene cuentas activas.");
    }

    const pagos = await prisma.bankTransaction.findMany({
      where: {
        tipo: "CREDITO",
        referencia: { endsWith: referencia },
        numeroCuenta: { in: cuentas.map((c) => c.accountNumber) },
      },
      orderBy: { receivedAt: "desc" },
      take: 20,
    });
    if (pagos.length === 0) {
      await rechazo("sin coincidencias");
      return apiError(
        404,
        "PAYMENT_NOT_FOUND",
        "No encontramos ese pago. Si acabas de pagar, espera 1-2 minutos y reintenta."
      );
    }

    // Desambiguación por monto — nunca el primero de la lista.
    const monto = intent.amountVES;
    const tolerancia = toleranciaVES(monto);
    const minimo = monto.sub(tolerancia);
    const suficientes = pagos.filter((p) => {
      try {
        return new Prisma.Decimal(p.montoTransaccion).greaterThanOrEqualTo(minimo);
      } catch {
        return false;
      }
    });

    if (suficientes.length === 0) {
      const mayor = pagos
        .map((p) => new Prisma.Decimal(p.montoTransaccion))
        .reduce((a, b) => (a.greaterThan(b) ? a : b));
      const faltante = monto.sub(mayor);
      await rechazo(`subpago faltan=${faltante.toFixed(2)}`);
      return apiError(422, "INSUFFICIENT_AMOUNT", "El pago no cubre el monto del pedido.", {
        faltanteVES: faltante.toFixed(2),
      });
    }

    let pago = suficientes[0];
    if (suficientes.length > 1) {
      const exactos = suficientes.filter((p) =>
        new Prisma.Decimal(p.montoTransaccion).equals(monto)
      );
      if (exactos.length !== 1) {
        await rechazo(`ambigua candidatos=${suficientes.length}`);
        return apiError(
          409,
          "AMBIGUOUS_REFERENCE",
          "Hay varios pagos que coinciden. Escribe más dígitos de la referencia."
        );
      }
      pago = exactos[0];
    }

    const pagado = new Prisma.Decimal(pago.montoTransaccion);
    const sobrepago = pagado.greaterThan(monto) ? pagado.sub(monto) : null;

    // El COBRO: la base arbitra con la misma clave que usa la caja.
    try {
      await prisma.paymentClaim.create({
        data: {
          organizationId: auth.organizationId,
          source: "CHECKOUT",
          bankTransactionId: pago.id,
          checkoutIntentId: intent.id,
          reference: pago.referencia,
          amount: pagado,
          numeroCuenta: pago.numeroCuenta,
          payerBank: pago.desdeBanco,
          fechaTransaccion: pago.fechaTransaccion,
          horaTransaccion: pago.horaTransaccion,
          primaryKey: pago.id,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      const ganador = await prisma.paymentClaim.findUnique({
        where: { primaryKey: pago.id },
        select: {
          claimedAt: true,
          user: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });
      await rechazo("ya cobrado");
      return apiError(409, "REFERENCE_ALREADY_USED", "Ese pago ya fue usado para otro cobro.", {
        cobradoPor: ganador
          ? {
              donde: ganador.user
                ? `caja ${ganador.user.name}${ganador.branch ? ` (${ganador.branch.name})` : ""}`
                : "checkout web",
              cuando: ganador.claimedAt.toISOString(),
            }
          : undefined,
      });
    }

    const confirmado = await prisma.checkoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "CONFIRMED",
        method: "REFERENCIA",
        bankTransactionId: pago.id,
        overpaidVES: sobrepago,
        confirmedAt: new Date(),
      },
    });

    await registrarApiEvent({
      organizationId: auth.organizationId,
      apiKeyId: auth.apiKeyId,
      intentId: intent.id,
      action: "ref_validated",
      detail:
        `ref=${maskRef(pago.referencia)} banco=${pago.banco} monto=${pagado.toFixed(2)}` +
        (sobrepago ? ` sobrepago=${sobrepago.toFixed(2)}` : ""),
      clientIp,
    });
    await encolarWebhooks(confirmado, "intent.confirmed");

    return NextResponse.json({
      intent: intentPublico(confirmado),
      pago: {
        referencia: pago.referencia,
        banco: pago.banco,
        bancoPagador: bancoLabel(pago.desdeBanco),
        montoVES: pagado.toFixed(2),
        overpaidVES: sobrepago ? sobrepago.toFixed(2) : null,
        fecha: pago.fechaTransaccion,
        hora: pago.horaTransaccion,
      },
    });
  });
}
