import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { turnoAbierto } from "@/lib/operacion";
import Cabecera from "@/components/Cabecera";
import { AbrirTurno, CerrarTurno } from "./TurnoAcciones";

export const dynamic = "force-dynamic";

function bolivares(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TurnoPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/turno");
  if (session.user.role === "PLATFORM_ADMIN") redirect("/plataforma/solicitudes");

  const { turno, comercio, total, ultimos } = await withSessionTenant(session, async () => {
    const turno = await turnoAbierto(session.user.id);
    const [comercio, total, ultimos] = await Promise.all([
      session.user.organizationId
        ? prisma.organization.findUnique({
            where: { id: session.user.organizationId },
            select: { razonSocial: true },
          })
        : null,
      turno
        ? prisma.paymentClaim.aggregate({
            where: { shiftId: turno.id },
            _count: true,
            _sum: { amount: true },
          })
        : null,
      prisma.shift.findMany({
        where: { userId: session.user.id, status: "CLOSED" },
        orderBy: { closedAt: "desc" },
        take: 5,
        select: { id: true, openedAt: true, closedAt: true, totalCount: true, totalAmount: true },
      }),
    ]);
    return { turno, comercio, total, ultimos };
  });

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        usuario={session.user.name}
        turnoAbierto={Boolean(turno)}
        esAdminComercio={session.user.role === "ORG_ADMIN"}
      />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Tu turno</h1>

        {turno ? (
          <>
            <div className="mt-6 rounded-card border border-tinta-borde bg-white p-6">
              <p className="text-sm text-tinta-tenue">
                Abierto el {new Date(turno.openedAt).toLocaleString("es-VE")}
                {turno.attendant ? ` · ${turno.attendant}` : ""}
              </p>
              <p className="monto mt-3">Bs {bolivares(Number(total?._sum.amount ?? 0))}</p>
              <p className="mt-1 text-sm text-tinta-tenue">
                {total?._count ?? 0} cobro(s) en este turno
              </p>
            </div>

            <div className="mt-8 border-t border-tinta-borde pt-8">
              <h2 className="font-display font-bold tracking-tight text-tinta">Cerrar el turno</h2>
              <p className="mb-4 mt-1 text-sm text-tinta-tenue">
                Al cerrar, el total queda congelado como comprobante. No hace falta
                contar nada: son pagos digitales y el sistema ya los sumó.
              </p>
              <CerrarTurno />
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-card border border-tinta-borde bg-white p-6">
            <h2 className="font-display font-bold tracking-tight text-tinta">
              No tenés turno abierto
            </h2>
            <p className="mb-5 mt-1 text-sm text-tinta-tenue">
              Abrí tu turno para poder registrar cobros.
            </p>
            <AbrirTurno />
          </div>
        )}

        {ultimos.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display font-bold tracking-tight text-tinta">Turnos anteriores</h2>
            <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
              {ultimos.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-tinta-tenue">
                    {new Date(t.openedAt).toLocaleDateString("es-VE")} ·{" "}
                    {t.closedAt ? new Date(t.closedAt).toLocaleTimeString("es-VE") : ""}
                  </span>
                  <span className="text-tinta">
                    <strong>Bs {bolivares(Number(t.totalAmount ?? 0))}</strong>{" "}
                    <span className="text-tinta-tenue">({t.totalCount ?? 0})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
