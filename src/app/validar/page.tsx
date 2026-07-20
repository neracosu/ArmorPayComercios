import { redirect } from "next/navigation";
import { ArrowDownLeft, Building2 } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** `hhmmss` del banco → `hh:mm`. */
function hora(hhmmss: string): string {
  return hhmmss.length >= 4 ? `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}` : hhmmss;
}

/** Monto del banco → formato venezolano, con separador de miles. */
function bolivares(monto: string): string {
  const n = Number(monto);
  if (!Number.isFinite(n)) return monto;
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ValidarPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/validar");

  // TODO(siguiente): la búsqueda por referencia y el registro de cobro. Esto es
  // el listado de lo que el banco ya notificó, acotado al comercio de la sesión.
  const { pagos, comercio } = await withSessionTenant(session, async () => {
    const [pagos, comercio] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { tipo: "CREDITO" },
        orderBy: { receivedAt: "desc" },
        take: 25,
        select: {
          id: true,
          montoTransaccion: true,
          referencia: true,
          desdeBanco: true,
          fechaTransaccion: true,
          horaTransaccion: true,
        },
      }),
      session.user.organizationId
        ? prisma.organization.findUnique({
            where: { id: session.user.organizationId },
            select: { razonSocial: true },
          })
        : null,
    ]);
    return { pagos, comercio };
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-tinta-tenue">
            <Building2 className="h-4 w-4" aria-hidden />
            {comercio?.razonSocial ?? "Plataforma"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pagos recibidos</h1>
        </div>
        <p className="text-right text-sm text-tinta-tenue">
          {session.user.name}
          <br />
          <span className="text-xs">{session.user.username}</span>
        </p>
      </header>

      {pagos.length === 0 ? (
        <div className="rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
          <p className="font-medium text-tinta">Todavía no hay pagos recibidos</p>
          <p className="mt-1 text-sm text-tinta-tenue">
            Cuando un cliente pague a tu cuenta, va a aparecer acá en segundos.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {pagos.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-suave text-ok">
                <ArrowDownLeft className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-tinta">
                  Bs {bolivares(p.montoTransaccion)}
                </p>
                <p className="truncate text-sm text-tinta-tenue">
                  Ref. {p.referencia} · Banco {p.desdeBanco}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm text-tinta-tenue">
                {p.fechaTransaccion}
                <br />
                <span className="text-xs">{hora(p.horaTransaccion)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
