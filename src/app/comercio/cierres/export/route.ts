import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { aCsv, fechaCsv, montoCsv, respuestaCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * CSV de cierres de turno — para el contador del comercio. Rango por
 * `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (default: últimos 30 días).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") {
    return new Response("No autorizado", { status: 401 });
  }

  const url = new URL(req.url);
  const desdeParam = url.searchParams.get("desde");
  const hastaParam = url.searchParams.get("hasta");
  // Los límites del día en Venezuela (UTC-4 fijo).
  const desde = desdeParam
    ? new Date(`${desdeParam}T00:00:00-04:00`)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const hasta = hastaParam ? new Date(`${hastaParam}T23:59:59.999-04:00`) : new Date();
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return new Response("Rango de fechas inválido", { status: 400 });
  }

  const turnos = await withSessionTenant(session, () =>
    prisma.shift.findMany({
      where: { status: "CLOSED", closedAt: { gte: desde, lte: hasta } },
      orderBy: { closedAt: "desc" },
      take: 2000,
      select: {
        openedAt: true,
        closedAt: true,
        attendant: true,
        totalCount: true,
        totalAmount: true,
        closingNote: true,
        user: { select: { name: true, username: true } },
        branch: { select: { name: true } },
      },
    })
  );

  const csv = aCsv(
    ["Abierto", "Cerrado", "Caja", "Usuario", "Sucursal", "Responsable", "Cobros", "Total Bs", "Nota de cierre"],
    turnos.map((t) => [
      fechaCsv(t.openedAt),
      fechaCsv(t.closedAt),
      t.user.name,
      t.user.username,
      t.branch.name,
      t.attendant ?? "",
      t.totalCount ?? 0,
      montoCsv(t.totalAmount),
      t.closingNote ?? "",
    ])
  );

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  return respuestaCsv(`cierres-${hoy}.csv`, csv);
}
