import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia } from "@/lib/operacion";
import Cabecera from "@/components/Cabecera";

export const dynamic = "force-dynamic";

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function CierresPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/cierres");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { comercio, hoy, turnos, duplicados } = await withSessionTenant(session, async () => {
    const desde = inicioDelDia();
    const [comercio, hoy, turnos, duplicados] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { razonSocial: true },
      }),
      prisma.paymentClaim.aggregate({
        where: { claimedAt: { gte: desde } },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.shift.findMany({
        orderBy: [{ status: "asc" }, { openedAt: "desc" }],
        take: 30,
        select: {
          id: true,
          status: true,
          openedAt: true,
          closedAt: true,
          attendant: true,
          totalCount: true,
          totalAmount: true,
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
    ]);
    return { comercio, hoy, turnos, duplicados };
  });

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Cierres</h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Lo que cobró cada caja, turno por turno.
        </p>

        <div className="mt-6 rounded-card border border-tinta-borde bg-white p-6">
          <p className="text-sm text-tinta-tenue">Cobrado hoy en todo el negocio</p>
          <p className="monto mt-1">Bs {bs(Number(hoy._sum.amount ?? 0))}</p>
          <p className="mt-1 text-sm text-tinta-tenue">{hoy._count} cobro(s)</p>
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
                    {d.user.name} · {new Date(d.claimedAt).toLocaleString("es-VE")}
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
          <h2 className="font-display font-bold tracking-tight text-tinta">Turnos</h2>
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
                      </p>
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
