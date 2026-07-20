"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { buscarPorReferencia, turnoAbierto, type PagoEncontrado } from "@/lib/operacion";

export type ResultadoBusqueda =
  | { ok: true; sufijo: string; pagos: PagoEncontrado[] }
  | { ok: false; error: string };

const sufijoSchema = z
  .string()
  .trim()
  .regex(/^\d{4,9}$/, "Escribí entre 4 y 9 dígitos de la referencia");

export async function buscar(
  _previo: ResultadoBusqueda | null,
  datos: FormData
): Promise<ResultadoBusqueda> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entrá de nuevo." };

  const parsed = sufijoSchema.safeParse(datos.get("referencia"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const pagos = await withSessionTenant(session, () => buscarPorReferencia(parsed.data));
  return { ok: true, sufijo: parsed.data, pagos };
}

export type ResultadoCobro =
  | { ok: true; duplicado: boolean }
  | { ok: false; error: string; yaCobrado?: { caja: string; sucursal: string; cuando: string } };

/**
 * Registra el cobro de un pago.
 *
 * El antifraude lo arbitra la base, no el código: `primaryKey` es único, así
 * que dos cajas que confirmen el mismo pago en el mismo instante no pueden
 * ganar las dos. La que pierde recibe el aviso, no un cobro silencioso.
 *
 * Decisión de producto heredada de la operación real: el doble cobro se
 * **alerta y se permite** con confirmación explícita — a veces es legítimo, y
 * bloquearlo dejaría a la caja trabada con un cliente esperando. El segundo
 * cobro queda marcado como duplicado para que el administrador lo revise.
 */
export async function cobrar(
  _previo: ResultadoCobro | null,
  datos: FormData
): Promise<ResultadoCobro> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entrá de nuevo." };

  const pagoId = String(datos.get("pagoId") ?? "");
  const aceptaDuplicado = datos.get("aceptaDuplicado") === "1";
  const motivo = String(datos.get("motivo") ?? "").slice(0, 500) || null;
  if (!pagoId) return { ok: false, error: "Falta el pago a cobrar." };

  return withSessionTenant(session, async () => {
    const turno = await turnoAbierto(session.user.id);
    if (!turno) {
      return { ok: false, error: "No tenés un turno abierto. Abrí turno antes de cobrar." };
    }

    const pago = await prisma.bankTransaction.findUnique({ where: { id: pagoId } });
    if (!pago || pago.tipo !== "CREDITO") {
      return { ok: false, error: "No encontramos ese pago." };
    }

    let monto: Prisma.Decimal;
    try {
      monto = new Prisma.Decimal(pago.montoTransaccion);
    } catch {
      return { ok: false, error: "El monto del pago no es válido." };
    }

    const base = {
      organizationId: turno.organizationId,
      shiftId: turno.id,
      userId: session.user.id,
      branchId: turno.branchId,
      source: "LOOKUP" as const,
      bankTransactionId: pago.id,
      reference: pago.referencia,
      amount: monto,
      numeroCuenta: pago.numeroCuenta,
      payerBank: pago.desdeBanco,
      fechaTransaccion: pago.fechaTransaccion,
      horaTransaccion: pago.horaTransaccion,
    };

    const existente = await prisma.paymentClaim.findUnique({
      where: { primaryKey: pago.id },
      select: {
        id: true,
        claimedAt: true,
        user: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });

    if (existente && !aceptaDuplicado) {
      return {
        ok: false,
        error: "Este pago ya fue cobrado.",
        yaCobrado: {
          caja: existente.user.name,
          sucursal: existente.branch.name,
          cuando: existente.claimedAt.toISOString(),
        },
      };
    }

    if (existente) {
      await prisma.paymentClaim.create({
        data: { ...base, isDuplicate: true, primaryKey: null, duplicateOfId: existente.id, ackReason: motivo },
      });
      revalidatePath("/validar");
      return { ok: true, duplicado: true };
    }

    try {
      await prisma.paymentClaim.create({ data: { ...base, isDuplicate: false, primaryKey: pago.id } });
      revalidatePath("/validar");
      return { ok: true, duplicado: false };
    } catch (e) {
      // P2002 = otra caja lo cobró microsegundos antes. La base arbitró.
      if ((e as { code?: string }).code !== "P2002") throw e;
      const ganador = await prisma.paymentClaim.findUnique({
        where: { primaryKey: pago.id },
        select: {
          claimedAt: true,
          user: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });
      return {
        ok: false,
        error: "Otra caja cobró este pago en este mismo momento.",
        yaCobrado: ganador
          ? {
              caja: ganador.user.name,
              sucursal: ganador.branch.name,
              cuando: ganador.claimedAt.toISOString(),
            }
          : undefined,
      };
    }
  });
}
