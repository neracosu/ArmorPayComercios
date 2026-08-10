import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import BotonImprimir from "./BotonImprimir";

export const dynamic = "force-dynamic";

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Comprobante de cierre de turno, imprimible. El cierre "congela el total como
 * comprobante" desde siempre — pero no había NADA que entregar en papel.
 * Lo ve el dueño (cualquier turno) y la caja (solo los suyos).
 */
export default async function ComprobanteCierrePage({ params }: { params: { id: string } }) {
  const session = await getVerifiedSession();
  if (!session) redirect(`/login?callbackUrl=/turno/cierre/${params.id}`);

  const turno = await withSessionTenant(session, () =>
    prisma.shift.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        attendant: true,
        totalCount: true,
        totalAmount: true,
        closingNote: true,
        userId: true,
        user: { select: { name: true, username: true } },
        branch: { select: { name: true, code: true } },
        organization: { select: { razonSocial: true, rif: true } },
      },
    })
  );

  if (!turno || turno.status !== "CLOSED") notFound();
  // La caja solo imprime SUS cierres; el dueño, todos.
  if (session.user.role !== "ORG_ADMIN" && turno.userId !== session.user.id) notFound();

  const volver = session.user.role === "ORG_ADMIN" ? "/comercio/cierres" : "/turno";

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={volver}
          className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue hover:text-tinta"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver
        </Link>
        <BotonImprimir />
      </div>

      <div className="mt-6 rounded-card border border-tinta-borde bg-white p-6 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <p className="font-display text-lg font-bold tracking-tight text-tinta">
          {turno.organization.razonSocial}
        </p>
        <p className="text-sm text-tinta-tenue">RIF {turno.organization.rif}</p>

        <h1 className="mt-5 font-display text-xl font-bold tracking-tight text-tinta">
          Comprobante de cierre de turno
        </h1>

        <dl className="mt-4 space-y-2 text-sm">
          {[
            ["Caja", `${turno.user.name} (${turno.user.username})`],
            ["Sucursal", `${turno.branch.name} (${turno.branch.code})`],
            ...(turno.attendant ? [["Responsable", turno.attendant] as [string, string]] : []),
            ["Apertura", new Date(turno.openedAt).toLocaleString("es-VE")],
            ["Cierre", turno.closedAt ? new Date(turno.closedAt).toLocaleString("es-VE") : "—"],
            ["Cobros del turno", String(turno.totalCount ?? 0)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-tinta-tenue">{k}</dt>
              <dd className="text-right font-medium text-tinta">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 border-t border-tinta-borde pt-4">
          <p className="text-sm text-tinta-tenue">Total cobrado</p>
          <p className="monto mt-1 text-3xl">Bs {bs(Number(turno.totalAmount ?? 0))}</p>
        </div>

        {turno.closingNote && (
          <div className="mt-4 border-t border-tinta-borde pt-4">
            <p className="text-sm text-tinta-tenue">Nota de cierre</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-tinta">{turno.closingNote}</p>
          </div>
        )}

        <p className="mt-6 text-xs text-tinta-tenue">
          Comprobante #{turno.id.slice(-8)} · Emitido por ArmorPay ·{" "}
          {new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" })}
        </p>
      </div>
    </main>
  );
}
