"use server";

import { revalidatePath } from "next/cache";
import { PrismaClient } from "@prisma/client";
import { getVerifiedSession } from "@/lib/session-guard";

/**
 * Acciones del monitoreo del checkout. Solo `PLATFORM_ADMIN` — mismo patrón
 * que el resto del panel: cliente sin extensión (la vista es multi-comercio
 * por definición) y el aislamiento lo da el rol, verificado en cada acción.
 */
const db = new PrismaClient();

export type ResultadoMonitoreo = { ok: true; mensaje: string } | { ok: false; error: string };

export async function reencolarEntrega(
  _previo: ResultadoMonitoreo | null,
  datos: FormData
): Promise<ResultadoMonitoreo> {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "PLATFORM_ADMIN") throw new Error("No autorizado");

  const id = String(datos.get("id") ?? "");
  if (!id) return { ok: false, error: "Falta la entrega." };

  const entrega = await db.webhookDelivery.findUnique({
    where: { id },
    select: { endpointId: true, status: true },
  });
  if (!entrega) return { ok: false, error: "Esa entrega no existe." };
  if (entrega.status === "DELIVERED") {
    return { ok: false, error: "Ya llegó — reenviarla duplicaría el aviso al comercio." };
  }
  if (entrega.status === "PENDING") return { ok: false, error: "Ya está en cola." };

  const endpoint = await db.webhookEndpoint.findFirst({
    where: { id: entrega.endpointId, isActive: true },
    select: { id: true },
  });
  if (!endpoint) {
    return {
      ok: false,
      error: "El endpoint está inactivo: el comercio tiene que dar de alta uno nuevo.",
    };
  }

  await db.webhookDelivery.update({
    where: { id },
    data: { status: "PENDING", attempts: 0, nextRetryAt: new Date() },
  });

  revalidatePath("/plataforma/checkout");
  return { ok: true, mensaje: "Reencolada." };
}
