import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, TriangleAlert, Webhook } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia } from "@/lib/operacion";
import { consumoDelMes } from "@/lib/limites";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";

export const dynamic = "force-dynamic";

/**
 * El inicio del comercio (P3.1 del plan UI/UX): el dueño entra a VER cómo va
 * el negocio, no a una pantalla de trabajo. Un vistazo de hoy, los avisos que
 * piden acción, el pulso del plan y los últimos cobros — el detalle vive en
 * las secciones, esta pantalla solo dirige la mirada.
 */

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const LLAVE_TEXTO: Record<string, string> = {
  SIN_LLAVE: "Tu Llave de Trabajo no está cargada",
  CARGADA: "Tu Llave de Trabajo está cargada pero sin verificar",
  INVALIDA: "El banco rechazó tu Llave de Trabajo",
};

export default async function ComercioInicioPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const datos = await withSessionTenant(session, async () => {
    const desde = inicioDelDia();
    const [comercio, hoy, abiertos, checkoutHoy, duplicados, muertas, ultimos, consumo] =
      await Promise.all([
        prisma.organization.findUnique({
          where: { id: session.user.organizationId! },
          select: {
            id: true,
            razonSocial: true,
            status: true,
            authKeyStatus: true,
            logoMime: true,
            logoUpdatedAt: true,
          },
        }),
        prisma.paymentClaim.aggregate({
          where: { claimedAt: { gte: desde } },
          _count: true,
          _sum: { amount: true },
        }),
        prisma.shift.count({ where: { status: "OPEN" } }),
        prisma.paymentClaim.aggregate({
          where: { source: "CHECKOUT", claimedAt: { gte: desde } },
          _count: true,
          _sum: { amount: true },
        }),
        prisma.paymentClaim.count({ where: { isDuplicate: true } }),
        prisma.webhookDelivery.count({ where: { status: "DEAD" } }),
        prisma.paymentClaim.findMany({
          orderBy: { claimedAt: "desc" },
          take: 10,
          select: {
            id: true,
            amount: true,
            reference: true,
            isDuplicate: true,
            claimedAt: true,
            user: { select: { name: true } },
          },
        }),
        consumoDelMes(session.user.organizationId!),
      ]);
    return { comercio, hoy, abiertos, checkoutHoy, duplicados, muertas, ultimos, consumo };
  });

  const { comercio, hoy, abiertos, checkoutHoy, duplicados, muertas, ultimos, consumo } = datos;

  // Mismo criterio que /validar: el comercio sin activar va a su paso a paso.
  if (comercio?.status !== "ACTIVA") redirect("/comercio/activacion");

  const avisoLlave =
    comercio.authKeyStatus !== "VERIFICADA" ? LLAVE_TEXTO[comercio.authKeyStatus] : null;

  const tarjetas = [
    {
      href: "/comercio/cierres",
      titulo: "Cobrado hoy",
      valor: `Bs ${bs(Number(hoy._sum.amount ?? 0))}`,
      detalle: `${hoy._count} cobro(s)`,
    },
    {
      href: "/comercio/cierres",
      titulo: "Cajas trabajando ahora",
      valor: String(abiertos),
      detalle: "turno(s) abierto(s)",
    },
    {
      href: "/comercio/ventas",
      titulo: "Ventas en línea hoy",
      valor: `Bs ${bs(Number(checkoutHoy._sum.amount ?? 0))}`,
      detalle: `${checkoutHoy._count} cobro(s) por checkout`,
    },
  ];

  return (
    <>
      <Cabecera
        comercio={comercio.razonSocial}
        logoUrl={logoUrlDe(comercio)}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Inicio</h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Cómo va {comercio.razonSocial}, de un vistazo.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {tarjetas.map((t) => (
            <Link
              key={t.titulo}
              href={t.href}
              className="rounded-card border border-tinta-borde bg-white p-5 transition-colors hover:border-marca-600"
            >
              <p className="text-sm text-tinta-tenue">{t.titulo}</p>
              <p className="monto mt-1">{t.valor}</p>
              <p className="mt-1 text-sm text-tinta-tenue">{t.detalle}</p>
            </Link>
          ))}
        </div>

        {/* Avisos: solo lo que pide una acción del dueño. Sin novedades, no hay ruido. */}
        {(avisoLlave || duplicados > 0 || muertas > 0) && (
          <div className="mt-4 space-y-2">
            {avisoLlave && (
              <p className="flex items-start gap-2 rounded-card border border-error/30 bg-error-suave px-4 py-3 text-sm text-error">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {avisoLlave} — las cajas no pueden cobrar hasta resolverlo.
                Escríbenos si el banco te la cambió.
              </p>
            )}
            {duplicados > 0 && (
              <Link
                href="/comercio/cierres"
                className="flex items-start gap-2 rounded-card border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta transition-colors hover:border-alerta"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {duplicados} cobro(s) duplicado(s) esperan tu revisión en Cierres.
              </Link>
            )}
            {muertas > 0 && (
              <Link
                href="/comercio/api"
                className="flex items-start gap-2 rounded-card border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta transition-colors hover:border-alerta"
              >
                <Webhook className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {muertas} aviso(s) a tu tienda se agotaron sin llegar — revísalos
                y reenvíalos desde API.
              </Link>
            )}
          </div>
        )}

        {/* El plan, en una línea: el detalle con excedentes vive en Cierres. */}
        <div className="mt-4 rounded-card border border-tinta-borde bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-tinta-tenue">
              Plan <strong className="font-medium text-tinta">{consumo.plan.nombre}</strong>
            </p>
            <p className="text-sm tabular-nums text-tinta-suave">
              <strong className="text-tinta">{consumo.cobros.toLocaleString("es-VE")}</strong> de{" "}
              {consumo.incluidos.toLocaleString("es-VE")} cobros este mes
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
        </div>

        <section className="mt-8">
          <h2 className="font-display font-bold tracking-tight text-tinta">Últimos cobros</h2>
          {ultimos.length === 0 ? (
            <p className="mt-2 text-sm text-tinta-tenue">
              Todavía no hay cobros. Cuando una caja o tu tienda en línea cobre
              el primero, aparece acá.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
              {ultimos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-tinta">
                      Bs {bs(Number(c.amount))}
                      <span className="font-normal text-tinta-tenue"> · Ref. {c.reference}</span>
                      {c.isDuplicate && (
                        <span className="ml-2 rounded-control bg-alerta-suave px-2 py-0.5 text-xs font-medium text-alerta">
                          duplicado
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-tinta-tenue">
                      {c.user?.name ?? "Checkout web"} ·{" "}
                      {new Date(c.claimedAt).toLocaleString("es-VE")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
