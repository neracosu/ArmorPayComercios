import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia } from "@/lib/operacion";
import { consumoDelMes } from "@/lib/limites";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";

export const dynamic = "force-dynamic";

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function CierresPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string };
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/cierres");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  // Filtro por rango de fechas (día completo, hora Venezuela). Sin filtro se
  // listan los últimos 30 turnos, como siempre.
  const rangoDesde = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.desde ?? "")
    ? new Date(`${searchParams.desde}T00:00:00-04:00`)
    : null;
  const rangoHasta = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.hasta ?? "")
    ? new Date(`${searchParams.hasta}T23:59:59.999-04:00`)
    : null;
  const hayRango = Boolean(rangoDesde || rangoHasta);

  const { comercio, hoy, turnos, duplicados, abiertos, checkoutHoy, consumo } =
    await withSessionTenant(session, async () => {
      const desde = inicioDelDia();
      const [comercio, hoy, turnos, duplicados, abiertos, checkoutHoy, consumo] =
        await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { id: true, razonSocial: true, logoMime: true, logoUpdatedAt: true },
      }),
      prisma.paymentClaim.aggregate({
        where: { claimedAt: { gte: desde } },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.shift.findMany({
        where: hayRango
          ? {
              openedAt: {
                ...(rangoDesde ? { gte: rangoDesde } : {}),
                ...(rangoHasta ? { lte: rangoHasta } : {}),
              },
            }
          : undefined,
        orderBy: [{ status: "asc" }, { openedAt: "desc" }],
        take: hayRango ? 200 : 30,
        select: {
          id: true,
          status: true,
          openedAt: true,
          closedAt: true,
          attendant: true,
          totalCount: true,
          totalAmount: true,
          closingNote: true,
          user: { select: { name: true } },
          branch: { select: { name: true } },
          _count: { select: { claims: true } },
        },
      }),
      // Los cobros marcados como duplicados son exactamente lo que el dueño
      // tiene que revisar: alguien cobró dos veces el mismo pago y lo justificó.
      prisma.paymentClaim.findMany({
        where: { isDuplicate: true },
        orderBy: { claimedAt: "desc" },
        take: 20,
        select: {
          id: true,
          reference: true,
          amount: true,
          ackReason: true,
          claimedAt: true,
          user: { select: { name: true } },
        },
      }),
      prisma.shift.count({ where: { status: "OPEN" } }),
      prisma.checkoutIntent.count({
        where: { status: "CONFIRMED", confirmedAt: { gte: desde } },
      }),
      consumoDelMes(session.user.organizationId!),
    ]);
      return { comercio, hoy, turnos, duplicados, abiertos, checkoutHoy, consumo };
    });

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        logoUrl={logoUrlDe(comercio)}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Cierres</h1>
            <p className="mt-1 text-sm text-tinta-tenue">
              Lo que cobró cada caja, turno por turno.
            </p>
          </div>
          <a
            href="/comercio/cierres/export"
            className="rounded-control border border-tinta-borde bg-white px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
          >
            Descargar CSV (30 días)
          </a>
        </div>

        {/* El día, de un vistazo: a esto viene el dueño. */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-card border border-tinta-borde bg-white p-5 sm:col-span-1">
            <p className="text-sm text-tinta-tenue">Cobrado hoy</p>
            <p className="monto mt-1">Bs {bs(Number(hoy._sum.amount ?? 0))}</p>
            <p className="mt-1 text-sm text-tinta-tenue">{hoy._count} cobro(s)</p>
          </div>
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Cajas trabajando ahora</p>
            <p className="monto mt-1">{abiertos}</p>
            <p className="mt-1 text-sm text-tinta-tenue">turno(s) abierto(s)</p>
          </div>
          <Link
            href="/comercio/ventas"
            className="rounded-card border border-tinta-borde bg-white p-5 transition-colors hover:border-marca-600"
          >
            <p className="text-sm text-tinta-tenue">Ventas en línea hoy</p>
            <p className="monto mt-1">{checkoutHoy}</p>
            <p className="mt-1 text-sm text-tinta-tenue">cobro(s) por checkout</p>
          </Link>
        </div>

        {/* El medidor del plan: avisar ANTES de pasarse, nunca frenar un cobro. */}
        <div className="mt-4 rounded-card border border-tinta-borde bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-tinta-tenue">
              Consumo del mes · plan{" "}
              <strong className="font-medium text-tinta">{consumo.plan.nombre}</strong>
            </p>
            <p className="text-sm tabular-nums text-tinta-suave">
              <strong className="text-tinta">{consumo.cobros.toLocaleString("es-VE")}</strong>{" "}
              de {consumo.incluidos.toLocaleString("es-VE")} cobros incluidos
            </p>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-tinta-fondo"
            role="progressbar"
            aria-valuenow={Math.min(consumo.porcentaje, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Consumo del plan"
          >
            <div
              className={`h-full rounded-full transition-all ${
                consumo.excedidos > 0
                  ? "bg-error"
                  : consumo.porcentaje >= 80
                    ? "bg-alerta"
                    : "bg-marca-700"
              }`}
              style={{ width: `${Math.min(consumo.porcentaje, 100)}%` }}
            />
          </div>
          {consumo.excedidos > 0 ? (
            <p className="mt-2.5 text-sm text-error">
              Superaste el piso de tu plan: {consumo.excedidos.toLocaleString("es-VE")} cobro(s)
              de excedente (${consumo.cargoExcedente.toFixed(2)} adicionales este mes). Tus
              cajas siguen cobrando con normalidad — considera subir de plan.
            </p>
          ) : consumo.porcentaje >= 80 ? (
            <p className="mt-2.5 text-sm text-alerta">
              Vas por el {consumo.porcentaje}% de tu piso mensual. Si te pasas, el excedente se
              factura aparte — nada se frena.
            </p>
          ) : (
            <p className="mt-2.5 text-sm text-tinta-tenue">
              {consumo.porcentaje}% del piso mensual. Pasarte nunca frena un cobro: el
              excedente se factura aparte.
            </p>
          )}
        </div>

        {duplicados.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-alerta">
              <TriangleAlert className="h-4 w-4" aria-hidden />
              Cobros duplicados para revisar ({duplicados.length})
            </h2>
            <ul className="mt-3 divide-y divide-alerta/20 overflow-hidden rounded-card border border-alerta/30 bg-alerta-suave/40">
              {duplicados.map((d) => (
                <li key={d.id} className="px-5 py-3 text-sm">
                  <p className="font-medium text-tinta">
                    Bs {bs(Number(d.amount))} · Ref. {d.reference}
                  </p>
                  <p className="text-tinta-suave">
                    {d.user?.name ?? "Checkout web"} · {new Date(d.claimedAt).toLocaleString("es-VE")}
                  </p>
                  {d.ackReason && (
                    <p className="mt-1 text-tinta-tenue">Motivo: {d.ackReason}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display font-bold tracking-tight text-tinta">Turnos</h2>
            <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
              <label className="text-tinta-tenue">
                Desde{" "}
                <input
                  type="date"
                  name="desde"
                  defaultValue={searchParams.desde ?? ""}
                  className="rounded-control border border-tinta-borde bg-white px-2 py-1 text-tinta focus:border-marca-600 focus:outline-none"
                />
              </label>
              <label className="text-tinta-tenue">
                Hasta{" "}
                <input
                  type="date"
                  name="hasta"
                  defaultValue={searchParams.hasta ?? ""}
                  className="rounded-control border border-tinta-borde bg-white px-2 py-1 text-tinta focus:border-marca-600 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="rounded-control border border-tinta-borde bg-white px-3 py-1.5 font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                Filtrar
              </button>
              {hayRango && (
                <Link href="/comercio/cierres" className="px-2 py-1.5 text-tinta-tenue hover:text-tinta">
                  Quitar
                </Link>
              )}
            </form>
          </div>
          {turnos.length === 0 ? (
            <p className="mt-2 text-sm text-tinta-tenue">Todavía no hay turnos.</p>
          ) : (
            <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
              {turnos.map((t) => {
                const abierto = t.status === "OPEN";
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-tinta">
                        {t.user.name}
                        <span className="font-normal text-tinta-tenue"> · {t.branch.name}</span>
                        {abierto && (
                          <span className="ml-2 rounded-control bg-ok-suave px-2 py-0.5 text-xs font-medium text-ok">
                            abierto
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-tinta-tenue">
                        {new Date(t.openedAt).toLocaleString("es-VE")}
                        {t.closedAt ? ` → ${new Date(t.closedAt).toLocaleTimeString("es-VE")}` : ""}
                        {t.attendant ? ` · ${t.attendant}` : ""}
                        {!abierto && (
                          <>
                            {" · "}
                            <Link
                              href={`/turno/cierre/${t.id}`}
                              className="font-medium text-marca-700 hover:underline"
                            >
                              comprobante
                            </Link>
                          </>
                        )}
                      </p>
                      {t.closingNote && (
                        <p className="mt-0.5 text-xs italic text-tinta-tenue">“{t.closingNote}”</p>
                      )}
                    </div>
                    <p className="shrink-0 text-right text-sm">
                      <strong className="text-tinta">
                        Bs {bs(Number(t.totalAmount ?? 0))}
                      </strong>
                      <br />
                      <span className="text-tinta-tenue">
                        {abierto ? `${t._count.claims} en curso` : `${t.totalCount ?? 0} cobro(s)`}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
