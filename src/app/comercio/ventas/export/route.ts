import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { aCsv, fechaCsv, montoCsv, respuestaCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const ESTADOS = new Set(["PENDING", "CONFIRMED", "FAILED", "EXPIRED"]);

/**
 * CSV de las ventas del checkout (intents). `?estado=` opcional (mismo filtro
 * de la pantalla), rango `?desde=&hasta=` default últimos 30 días.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") {
    return new Response("No autorizado", { status: 401 });
  }

  const url = new URL(req.url);
  const estado = url.searchParams.get("estado") ?? "";
  const desdeParam = url.searchParams.get("desde");
  const hastaParam = url.searchParams.get("hasta");
  const desde = desdeParam
    ? new Date(`${desdeParam}T00:00:00-04:00`)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const hasta = hastaParam ? new Date(`${hastaParam}T23:59:59.999-04:00`) : new Date();
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return new Response("Rango de fechas inválido", { status: 400 });
  }

  const intents = await withSessionTenant(session, () =>
    prisma.checkoutIntent.findMany({
      where: {
        createdAt: { gte: desde, lte: hasta },
        ...(ESTADOS.has(estado) ? { status: estado as "CONFIRMED" } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        createdAt: true,
        confirmedAt: true,
        status: true,
        method: true,
        concepto: true,
        externalRef: true,
        amountVES: true,
        amountUSD: true,
        overpaidVES: true,
        c2pReferencia: true,
        c2pCelular: true,
        c2pCedula: true,
        c2pBancoPagador: true,
        bankTransaction: {
          select: {
            referencia: true,
            banco: true,
            desdeBanco: true,
            desdeCuenta: true,
            desdeDni: true,
          },
        },
      },
    })
  );

  const csv = aCsv(
    ["Creada", "Confirmada", "Estado", "Método", "Concepto", "Ref. externa", "Monto Bs", "Monto USD", "Sobrepago Bs", "Referencia bancaria", "Banco receptor", "Banco pagador", "Teléfono/cuenta pagador", "Cédula pagador"],
    intents.map((i) => [
      fechaCsv(i.createdAt),
      fechaCsv(i.confirmedAt),
      i.status,
      i.method ?? "",
      i.concepto,
      i.externalRef ?? "",
      montoCsv(i.amountVES),
      i.amountUSD ? montoCsv(i.amountUSD) : "",
      i.overpaidVES ? montoCsv(i.overpaidVES) : "",
      i.c2pReferencia ?? i.bankTransaction?.referencia ?? "",
      i.bankTransaction?.banco ?? (i.c2pReferencia ? "BT" : ""),
      i.bankTransaction?.desdeBanco ?? i.c2pBancoPagador ?? "",
      i.bankTransaction?.desdeCuenta ?? i.c2pCelular ?? "",
      i.bankTransaction?.desdeDni ?? i.c2pCedula ?? "",
    ])
  );

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  return respuestaCsv(`ventas-${hoy}.csv`, csv);
}
