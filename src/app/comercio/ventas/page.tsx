import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia } from "@/lib/operacion";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";

export const dynamic = "force-dynamic";

/**
 * Las ventas en línea del comercio: cada cobro que su tienda creó por la API
 * o por /pay, con su estado real. Es la respuesta a la primera pregunta que
 * hace un comercio integrado: «el cliente dice que pagó — ¿dónde lo veo?».
 */

const ESTADOS = ["CONFIRMED", "PENDING", "FAILED", "EXPIRED"] as const;
type Estado = (typeof ESTADOS)[number];

const ESTADO_TEXTO: Record<Estado, string> = {
  CONFIRMED: "Confirmadas",
  PENDING: "Pendientes",
  FAILED: "Fallidas",
  EXPIRED: "Vencidas",
};

const CHIP: Record<Estado, { texto: string; clase: string }> = {
  CONFIRMED: { texto: "confirmada", clase: "bg-ok-suave text-ok" },
  PENDING: { texto: "pendiente", clase: "bg-tinta-fondo text-tinta-suave" },
  FAILED: { texto: "fallida", clase: "bg-error-suave text-error" },
  EXPIRED: { texto: "vencida", clase: "bg-tinta-fondo text-tinta-tenue" },
};

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: { estado?: string };
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/ventas");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const filtro = ESTADOS.find((e) => e === searchParams.estado);

  const { comercio, hoy, porEstado, intents, tieneLlaves } = await withSessionTenant(
    session,
    async () => {
      const desde = inicioDelDia();
      const mes = new Date(Date.now() - 30 * 24 * 3600_000);
      const [comercio, hoy, porEstado, intents, tieneLlaves] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: session.user.organizationId! },
          select: { id: true, razonSocial: true, logoMime: true, logoUpdatedAt: true },
        }),
        prisma.checkoutIntent.aggregate({
          where: { status: "CONFIRMED", confirmedAt: { gte: desde } },
          _count: true,
          _sum: { amountVES: true },
        }),
        prisma.checkoutIntent.groupBy({
          by: ["status"],
          where: { createdAt: { gte: mes } },
          _count: true,
        }),
        prisma.checkoutIntent.findMany({
          where: filtro ? { status: filtro } : undefined,
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            externalRef: true,
            concepto: true,
            amountVES: true,
            amountUSD: true,
            method: true,
            status: true,
            c2pReferencia: true,
            c2pCodres: true,
            overpaidVES: true,
            expiresAt: true,
            confirmedAt: true,
            createdAt: true,
            bankTransaction: { select: { referencia: true, banco: true } },
          },
        }),
        prisma.apiKey.count(),
      ]);
      return { comercio, hoy, porEstado, intents, tieneLlaves: tieneLlaves > 0 };
    }
  );

  const cuenta = (e: Estado) => porEstado.find((p) => p.status === e)?._count ?? 0;
  const total30 = porEstado.reduce((s, p) => s + p._count, 0);
  const conversion = total30 > 0 ? Math.round((cuenta("CONFIRMED") / total30) * 100) : null;
  const pendientesVivas = intents.filter(
    (i) => i.status === "PENDING" && i.expiresAt.getTime() > Date.now()
  ).length;

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
            <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
              Ventas en línea
            </h1>
            <p className="mt-1 text-sm text-tinta-tenue">
              Cada cobro que tu tienda creó por la API o por la página de pago, con
              su estado real.
            </p>
          </div>
          <a
            href={`/comercio/ventas/export${filtro ? `?estado=${filtro}` : ""}`}
            className="rounded-control border border-tinta-borde bg-white px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
          >
            Descargar CSV (30 días)
          </a>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Cobrado en línea hoy</p>
            <p className="monto mt-1">Bs {bs(Number(hoy._sum.amountVES ?? 0))}</p>
            <p className="mt-1 text-sm text-tinta-tenue">{hoy._count} venta(s) confirmada(s)</p>
          </div>
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Conversión (30 días)</p>
            <p className="monto mt-1">{conversion === null ? "—" : `${conversion}%`}</p>
            <p className="mt-1 text-sm text-tinta-tenue">
              {conversion === null
                ? "sin cobros todavía"
                : `${cuenta("CONFIRMED")} confirmada(s) de ${total30}`}
            </p>
          </div>
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Esperando pago ahora</p>
            <p className="monto mt-1">{pendientesVivas}</p>
            <p className="mt-1 text-sm text-tinta-tenue">cobro(s) sin vencer</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link
            href="/comercio/ventas"
            className={`rounded-control px-3 py-1.5 text-sm font-medium ${
              !filtro ? "bg-tinta text-white" : "text-tinta-suave hover:bg-tinta-fondo"
            }`}
          >
            Todas
          </Link>
          {ESTADOS.map((e) => (
            <Link
              key={e}
              href={`/comercio/ventas?estado=${e}`}
              className={`rounded-control px-3 py-1.5 text-sm font-medium ${
                filtro === e ? "bg-tinta text-white" : "text-tinta-suave hover:bg-tinta-fondo"
              }`}
            >
              {ESTADO_TEXTO[e]} ({cuenta(e)})
            </Link>
          ))}
        </div>

        {intents.length === 0 ? (
          <div className="mt-4 rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
            <ShoppingBag className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
            {filtro ? (
              <p className="mt-3 text-sm text-tinta-tenue">
                No hay ventas {ESTADO_TEXTO[filtro].toLowerCase()}.
              </p>
            ) : tieneLlaves ? (
              <>
                <p className="mt-3 font-medium text-tinta">Aún no hay ventas en línea</p>
                <p className="mt-1 text-sm text-tinta-tenue">
                  Cuando tu tienda cree su primer cobro, aparece acá al instante.
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 font-medium text-tinta">Tu tienda todavía no está conectada</p>
                <p className="mt-1 text-sm text-tinta-tenue">
                  Crea tu primera llave en{" "}
                  <Link href="/comercio/api" className="font-medium text-marca-700 hover:underline">
                    la sección API
                  </Link>{" "}
                  y sigue la guía de{" "}
                  <a href="/docs/api" target="_blank" className="font-medium text-marca-700 hover:underline">
                    armorpay.net/docs/api
                  </a>
                  .
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {intents.map((i) => {
              // El worker marca EXPIRED con calma; acá el estado mostrado ya es
              // el real — mismo criterio que `intentPublico` en la API.
              const estado: Estado =
                i.status === "PENDING" && i.expiresAt.getTime() < Date.now()
                  ? "EXPIRED"
                  : (i.status as Estado);
              const chip = CHIP[estado];
              const refBancaria =
                i.method === "C2P" ? i.c2pReferencia : i.bankTransaction?.referencia;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-tinta">
                      {i.externalRef}
                      <span className="font-normal text-tinta-tenue"> · {i.concepto}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-tinta-tenue">
                      {new Date(i.createdAt).toLocaleString("es-VE")}
                      {i.method && ` · ${i.method === "C2P" ? "C2P" : "Referencia"}`}
                      {i.bankTransaction?.banco && ` · ${i.bankTransaction.banco}`}
                      {estado === "CONFIRMED" && refBancaria && ` · Ref. ${refBancaria}`}
                      {estado === "FAILED" && i.c2pCodres && ` · ${i.c2pCodres}`}
                    </p>
                    {i.overpaidVES && Number(i.overpaidVES) > 0 && (
                      <p className="mt-0.5 text-sm text-ok">
                        Sobrepago de Bs {bs(Number(i.overpaidVES))} registrado
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums text-tinta">
                      Bs {bs(Number(i.amountVES))}
                      {i.amountUSD && (
                        <span className="font-normal text-tinta-tenue">
                          {" "}
                          (${Number(i.amountUSD).toFixed(2)})
                        </span>
                      )}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-control px-2 py-0.5 text-xs font-medium ${chip.clase}`}
                    >
                      {chip.texto}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!filtro && intents.length === 50 && (
          <p className="mt-3 text-sm text-tinta-tenue">
            Se muestran las últimas 50. Usa los filtros para acotar.
          </p>
        )}
      </main>
    </>
  );
}
