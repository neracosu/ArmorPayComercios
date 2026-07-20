"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { turnoAbierto } from "@/lib/operacion";

export type ResultadoTurno = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * Abre el turno de la caja.
 *
 * `openKey` es único y vale el id de la caja mientras el turno está abierto:
 * así la base garantiza **un solo turno abierto por caja**, aunque le den dos
 * veces al botón o haya dos pestañas.
 */
export async function abrirTurno(
  _previo: ResultadoTurno | null,
  datos: FormData
): Promise<ResultadoTurno> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entrá de nuevo." };

  const responsable = String(datos.get("responsable") ?? "").trim().slice(0, 120) || null;

  return withSessionTenant(session, async () => {
    const caja = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { branchId: true, organizationId: true },
    });
    if (!caja?.branchId || !caja.organizationId) {
      return { ok: false, error: "Tu usuario no tiene sucursal asignada. Avisale al administrador." };
    }

    try {
      await prisma.shift.create({
        data: {
          organizationId: caja.organizationId,
          userId: session.user.id,
          branchId: caja.branchId,
          attendant: responsable,
          openKey: session.user.id,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return { ok: false, error: "Esta caja ya tiene un turno abierto." };
      }
      throw e;
    }

    revalidatePath("/turno");
    revalidatePath("/validar");
    return { ok: true, mensaje: "Turno abierto. Ya podés cobrar." };
  });
}

/**
 * Cierra el turno y congela su total.
 *
 * El total se guarda como fotografía en el turno: si más adelante se anula un
 * cobro, el comprobante que se imprimió al cerrar sigue siendo el que fue. Sin
 * conteo a ciegas — son pagos digitales, el sistema ya sabe cuánto entró.
 */
export async function cerrarTurno(
  _previo: ResultadoTurno | null,
  datos: FormData
): Promise<ResultadoTurno> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entrá de nuevo." };

  const nota = String(datos.get("nota") ?? "").trim().slice(0, 500) || null;

  return withSessionTenant(session, async () => {
    const turno = await turnoAbierto(session.user.id);
    if (!turno) return { ok: false, error: "No tenés ningún turno abierto." };

    const total = await prisma.paymentClaim.aggregate({
      where: { shiftId: turno.id },
      _count: true,
      _sum: { amount: true },
    });

    await prisma.shift.update({
      where: { id: turno.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closingNote: nota,
        totalCount: total._count,
        totalAmount: total._sum.amount ?? new Prisma.Decimal(0),
        openKey: null, // libera la restricción para el próximo turno
      },
    });

    revalidatePath("/turno");
    revalidatePath("/validar");
    return {
      ok: true,
      mensaje: `Turno cerrado con ${total._count} cobro(s).`,
    };
  });
}
