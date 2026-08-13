import { Prisma, type CheckoutIntent } from "@prisma/client";
import { prisma } from "./prisma";
import { registrarApiEvent } from "./api-rate-limit";
import { encolarWebhooks, maskRef, toleranciaVES } from "./checkout";
import { execC2pPago, ExecError } from "./exec-client";
import { tasaBcv, usdAVes } from "./bcv";
import { describeC2p, esReboteDeAfiliacion } from "../../gateway/bt-c2p-codes";

/**
 * Los DOS flujos de cobro del checkout — referencia y C2P — como funciones
 * puras de negocio, compartidas por la API v1 (Bearer) y la página pública
 * `/pay` (sin credencial). Un solo camino antifraude, dos puertas de entrada:
 * si estos flujos vivieran duplicados en cada superficie, tarde o temprano
 * divergirían justo en la regla que importa.
 *
 * Se asume contexto de tenant YA abierto por quien llama.
 */

export interface ActorApi {
  apiKeyId?: string | null;
  clientIp?: string;
}

export interface FlujoError {
  ok: false;
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
}

/** Chequeos de estado comunes a ambos flujos. null = se puede operar. */
export function intentNoOperable(intent: CheckoutIntent): FlujoError | "ya_confirmado" | null {
  if (intent.status === "CONFIRMED") return "ya_confirmado";
  if (intent.status === "EXPIRED" || intent.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 410, code: "INTENT_EXPIRED", message: "El intent venció. Crea uno nuevo." };
  }
  return null;
}

export interface PagoConfirmado {
  referencia: string;
  banco: string;
  bancoPagador: string;
  montoVES: string;
  overpaidVES: string | null;
  fecha: string;
  hora: string;
}

/**
 * Cobro por referencia: el pago EXISTE, ALCANZA y NO SE USÓ.
 * Reglas duras (deudas pagadas por las pasarelas del grupo):
 * - nunca `results[0]`: si hay varios candidatos se desambigua por monto y
 *   ante la duda se FALLA;
 * - tolerancia asimétrica: subpago se rechaza con faltante, sobrepago se
 *   acepta y se registra;
 * - el cobro lo arbitra `PaymentClaim.primaryKey = tx.id` — la misma clave
 *   que la caja.
 */
export async function confirmarPorReferencia(
  intent: CheckoutIntent,
  referencia: string,
  actor: ActorApi
): Promise<{ ok: true; intent: CheckoutIntent; pago: PagoConfirmado } | FlujoError> {
  const rechazo = async (detalle: string) => {
    await registrarApiEvent({
      organizationId: intent.organizationId,
      apiKeyId: actor.apiKeyId,
      intentId: intent.id,
      action: "ref_rejected",
      detail: `ref=${maskRef(referencia)} ${detalle}`,
      clientIp: actor.clientIp,
    });
  };

  const cuentas = await prisma.bankAccount.findMany({
    where: { isActive: true },
    select: { accountNumber: true },
  });
  if (cuentas.length === 0) {
    await rechazo("sin cuentas activas");
    return { ok: false, status: 422, code: "MERCHANT_NOT_READY", message: "El comercio no tiene cuentas activas." };
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
    return {
      ok: false,
      status: 404,
      code: "PAYMENT_NOT_FOUND",
      message: "No encontramos ese pago. Si acabas de pagar, espera 1-2 minutos y reintenta.",
    };
  }

  // MONTOS ACEPTABLES (candidatos, diseño de la Fase 6): siempre el VES
  // congelado al crear; si el intent está preciado en USD, también
  // USD × tasa VIGENTE — el pagador pudo calcular con la tasa de hoy. Si la
  // tasa vigente no responde, se valida solo contra el congelado: la caída
  // de una fuente de tasa jamás frena una validación.
  const candidatos: Prisma.Decimal[] = [intent.amountVES];
  if (intent.amountUSD) {
    try {
      const vigente = await tasaBcv();
      const conVigente = usdAVes(intent.amountUSD, vigente.rate);
      if (!conVigente.equals(intent.amountVES)) candidatos.push(conVigente);
    } catch {
      // candidato único
    }
  }
  const minimoGlobal = candidatos
    .map((c) => c.sub(toleranciaVES(c)))
    .reduce((a, b) => (a.lessThan(b) ? a : b));

  const suficientes = pagos.filter((p) => {
    try {
      return new Prisma.Decimal(p.montoTransaccion).greaterThanOrEqualTo(minimoGlobal);
    } catch {
      return false;
    }
  });

  if (suficientes.length === 0) {
    const mayor = pagos
      .map((p) => new Prisma.Decimal(p.montoTransaccion))
      .reduce((a, b) => (a.greaterThan(b) ? a : b));
    const menorCandidato = candidatos.reduce((a, b) => (a.lessThan(b) ? a : b));
    const faltante = menorCandidato.sub(mayor);
    await rechazo(`subpago faltan=${faltante.toFixed(2)}`);
    return {
      ok: false,
      status: 422,
      code: "INSUFFICIENT_AMOUNT",
      message: "El pago no cubre el monto del pedido.",
      extra: { faltanteVES: faltante.toFixed(2) },
    };
  }

  let pago = suficientes[0];
  if (suficientes.length > 1) {
    const exactos = suficientes.filter((p) => {
      const m = new Prisma.Decimal(p.montoTransaccion);
      return candidatos.some((c) => m.equals(c));
    });
    if (exactos.length !== 1) {
      await rechazo(`ambigua candidatos=${suficientes.length}`);
      return {
        ok: false,
        status: 409,
        code: "AMBIGUOUS_REFERENCE",
        message: "Hay varios pagos que coinciden. Escribe más dígitos de la referencia.",
      };
    }
    pago = exactos[0];
  }

  const pagado = new Prisma.Decimal(pago.montoTransaccion);
  // El sobrepago se mide contra el candidato MÁS ALTO que el pago cubre:
  // pagar con la tasa de hoy no es «pagar de más». La lista nunca queda
  // vacía: pasar el mínimo global implica cubrir al menos un candidato.
  const cubiertos = candidatos.filter((c) =>
    pagado.greaterThanOrEqualTo(c.sub(toleranciaVES(c)))
  );
  const cubierto = cubiertos.reduce((a, b) => (a.greaterThan(b) ? a : b));
  const sobrepago = pagado.greaterThan(cubierto) ? pagado.sub(cubierto) : null;

  try {
    await prisma.paymentClaim.create({
      data: {
        organizationId: intent.organizationId,
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
      select: { claimedAt: true, user: { select: { name: true } }, branch: { select: { name: true } } },
    });
    await rechazo("ya cobrado");
    return {
      ok: false,
      status: 409,
      code: "REFERENCE_ALREADY_USED",
      message: "Ese pago ya fue usado para otro cobro.",
      extra: {
        cobradoPor: ganador
          ? {
              donde: ganador.user
                ? `caja ${ganador.user.name}${ganador.branch ? ` (${ganador.branch.name})` : ""}`
                : "checkout web",
              cuando: ganador.claimedAt.toISOString(),
            }
          : undefined,
      },
    };
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
    organizationId: intent.organizationId,
    apiKeyId: actor.apiKeyId,
    intentId: intent.id,
    action: "ref_validated",
    detail:
      `ref=${maskRef(pago.referencia)} banco=${pago.banco} monto=${pagado.toFixed(2)}` +
      (sobrepago ? ` sobrepago=${sobrepago.toFixed(2)}` : ""),
    clientIp: actor.clientIp,
  });
  await encolarWebhooks(confirmado, "intent.confirmed");

  return {
    ok: true,
    intent: confirmado,
    pago: {
      referencia: pago.referencia,
      banco: pago.banco,
      bancoPagador: pago.desdeBanco,
      montoVES: pagado.toFixed(2),
      overpaidVES: sobrepago ? sobrepago.toFixed(2) : null,
      fecha: pago.fechaTransaccion,
      hora: pago.horaTransaccion,
    },
  };
}

export interface DatosC2p {
  celular: string;
  bancoPagador: string;
  cedula: string;
  otp: string;
}

export interface CobroC2p {
  referencia: string;
  montoVES: string;
  montoComision: string | null;
  numeroLote: string | null;
  fecha: string | null;
  hora: string | null;
}

/**
 * Cobro C2P: el monto y el concepto salen del INTENT, jamás del cliente.
 * Éxito ⇔ `codres === "C2P0000"`. NETERR = desconocido (el intent no cambia);
 * rechazo = FAILED parcial, reintentabl con OTP nuevo mientras no venza.
 */
export async function cobrarPorC2p(
  intent: CheckoutIntent,
  datos: DatosC2p,
  actor: ActorApi
): Promise<
  | { ok: true; intent: CheckoutIntent; cobro: CobroC2p }
  | (FlujoError & { intentActualizado?: CheckoutIntent })
> {
  const org = await prisma.organization.findUnique({
    where: { id: intent.organizationId },
    select: {
      btC2pEnabled: true,
      btCodAfiliado: true,
      btC2pVerifiedAt: true,
      btC2pUltimoRebote: true,
    },
  });
  if (!org?.btC2pEnabled || !org.btCodAfiliado) {
    return { ok: false, status: 422, code: "C2P_NOT_ENABLED", message: "Este comercio no tiene C2P habilitado." };
  }

  let r;
  try {
    r = await execC2pPago({
      organizationId: intent.organizationId,
      celular: datos.celular,
      bancoPagador: datos.bancoPagador,
      cedula: datos.cedula,
      monto: intent.amountVES.toFixed(2),
      otp: datos.otp,
      concepto: intent.concepto,
      intentId: intent.id,
    });
  } catch (e) {
    const detalle = e instanceof ExecError ? e.message : (e as Error).message;
    await registrarApiEvent({
      organizationId: intent.organizationId,
      apiKeyId: actor.apiKeyId,
      intentId: intent.id,
      action: "c2p_fail",
      detail: `NETERR ${detalle.slice(0, 200)}`,
      clientIp: actor.clientIp,
    });
    return {
      ok: false,
      status: 502,
      code: "BANK_UNAVAILABLE",
      message: "El banco no respondió. Verifica con tu banco antes de reintentar.",
      extra: { retriable: true },
    };
  }

  if (!r.aprobado) {
    const traducido = describeC2p(r.codres, r.message);
    const fallido = await prisma.checkoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "FAILED",
        method: "C2P",
        c2pCodres: r.codres,
        c2pCelular: datos.celular,
        c2pCedula: datos.cedula,
        c2pBancoPagador: datos.bancoPagador,
        gatewayResponse: r.raw,
      },
    });
    await registrarApiEvent({
      organizationId: intent.organizationId,
      apiKeyId: actor.apiKeyId,
      intentId: intent.id,
      action: "c2p_fail",
      detail: `codres=${r.codres}`,
      clientIp: actor.clientIp,
    });
    // Un rebote de la familia afiliación queda anotado en la Organization:
    // es lo que la ficha de plataforma pinta como alerta, porque lo resuelve
    // la plataforma con el banco — no el pagador reintentando.
    if (esReboteDeAfiliacion(r.codres) && org.btC2pUltimoRebote !== r.codres) {
      await prisma.organization.update({
        where: { id: intent.organizationId },
        data: { btC2pUltimoRebote: r.codres },
      });
    }
    return {
      ok: false,
      status: 422,
      code: "C2P_REJECTED",
      message: traducido.headline,
      extra: { codres: r.codres, hint: traducido.hint, retriable: true },
      intentActualizado: fallido,
    };
  }

  const referencia = r.referencia ?? "";
  try {
    await prisma.paymentClaim.create({
      data: {
        organizationId: intent.organizationId,
        source: "CHECKOUT",
        checkoutIntentId: intent.id,
        reference: referencia,
        amount: intent.amountVES,
        numeroCuenta: "c2p", // no hay cuenta del webhook en este camino
        payerBank: datos.bancoPagador,
        primaryKey: `c2p:${intent.organizationId}:${referencia}`,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    await registrarApiEvent({
      organizationId: intent.organizationId,
      apiKeyId: actor.apiKeyId,
      intentId: intent.id,
      action: "c2p_dup",
      detail: `ref=${maskRef(referencia)} aprobado con referencia ya cobrada`,
      clientIp: actor.clientIp,
    });
    return {
      ok: false,
      status: 409,
      code: "REFERENCE_ALREADY_USED",
      message: "El banco aprobó pero la referencia ya estaba cobrada. Contacta a la plataforma.",
    };
  }

  const confirmado = await prisma.checkoutIntent.update({
    where: { id: intent.id },
    data: {
      status: "CONFIRMED",
      method: "C2P",
      c2pReferencia: referencia,
      c2pCodres: r.codres,
      c2pCelular: datos.celular,
      c2pCedula: datos.cedula,
      c2pBancoPagador: datos.bancoPagador,
      gatewayResponse: r.raw,
      confirmedAt: new Date(),
    },
  });

  // El primer C2P0000 real ES la verificación del afiliado — el banco no
  // ofrece cómo probarlo sin cobrar. Un éxito también limpia cualquier rebote
  // de afiliación pendiente. Solo se escribe cuando algo cambia.
  if (!org.btC2pVerifiedAt || org.btC2pUltimoRebote) {
    await prisma.organization.update({
      where: { id: intent.organizationId },
      data: {
        btC2pUltimoRebote: null,
        ...(org.btC2pVerifiedAt ? {} : { btC2pVerifiedAt: new Date() }),
      },
    });
  }

  await registrarApiEvent({
    organizationId: intent.organizationId,
    apiKeyId: actor.apiKeyId,
    intentId: intent.id,
    action: "c2p_ok",
    detail: `ref=${maskRef(referencia)} comision=${r.montoComision ?? "-"} lote=${r.numeroLote ?? "-"}`,
    clientIp: actor.clientIp,
  });
  await encolarWebhooks(confirmado, "intent.confirmed");

  return {
    ok: true,
    intent: confirmado,
    cobro: {
      referencia,
      montoVES: intent.amountVES.toFixed(2),
      montoComision: r.montoComision,
      numeroLote: r.numeroLote,
      fecha: r.fecha,
      hora: r.hora,
    },
  };
}
