import { prisma } from "./prisma";

/**
 * Reglas de la operación de caja.
 *
 * Se asume contexto de tenant ya abierto (`withSessionTenant`): estas funciones
 * nunca filtran por comercio a mano — de eso se encarga la extensión de Prisma.
 */

/** Inicio del día en hora de Venezuela (UTC-4 fijo, sin horario de verano). */
export function inicioDelDia(ahora: Date = new Date()): Date {
  const desfase = 4 * 60 * 60 * 1000;
  const corrido = new Date(ahora.getTime() - desfase);
  corrido.setUTCHours(0, 0, 0, 0);
  return new Date(corrido.getTime() + desfase);
}

/** Turno abierto de una caja, o null. */
export function turnoAbierto(userId: string) {
  return prisma.shift.findFirst({
    where: { userId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
}

export interface PagoEncontrado {
  id: string;
  monto: string;
  referencia: string;
  fecha: string;
  hora: string;
  bancoOrigen: string;
  desdeCuenta: string;
  desdeDni: string;
  /** Si ya fue cobrado, quién y cuándo. Es la alarma de doble cobro. */
  cobrado: { caja: string; sucursal: string; cuando: string; monto: string } | null;
}

/**
 * Busca pagos recibidos por los últimos dígitos de la referencia.
 *
 * El cliente ve la referencia corta en su comprobante y el banco guarda la
 * completa, por eso el match es por sufijo. Solo créditos: lo que interesa es
 * el dinero que entró.
 *
 * Cada resultado viene anotado con su cobro primario si ya lo tiene, para que
 * la caja vea la alarma ANTES de confirmar, no después.
 */
export async function buscarPorReferencia(sufijo: string): Promise<PagoEncontrado[]> {
  const pagos = await prisma.bankTransaction.findMany({
    where: { tipo: "CREDITO", referencia: { endsWith: sufijo } },
    orderBy: { receivedAt: "desc" },
    take: 20,
    select: {
      id: true,
      montoTransaccion: true,
      referencia: true,
      fechaTransaccion: true,
      horaTransaccion: true,
      desdeBanco: true,
      desdeCuenta: true,
      desdeDni: true,
    },
  });
  if (pagos.length === 0) return [];

  const cobros = await prisma.paymentClaim.findMany({
    where: { bankTransactionId: { in: pagos.map((p) => p.id) }, isDuplicate: false },
    select: {
      bankTransactionId: true,
      claimedAt: true,
      amount: true,
      user: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  const porPago = new Map(cobros.map((c) => [c.bankTransactionId, c]));

  return pagos.map((p) => {
    const c = porPago.get(p.id);
    return {
      id: p.id,
      monto: p.montoTransaccion,
      referencia: p.referencia,
      fecha: p.fechaTransaccion,
      hora: p.horaTransaccion,
      bancoOrigen: p.desdeBanco,
      desdeCuenta: p.desdeCuenta,
      desdeDni: p.desdeDni,
      cobrado: c
        ? {
            caja: c.user.name,
            sucursal: c.branch.name,
            cuando: c.claimedAt.toISOString(),
            monto: c.amount.toString(),
          }
        : null,
    };
  });
}
