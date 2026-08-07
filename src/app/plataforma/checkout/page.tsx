import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session-guard";
import BotonReencolar from "./BotonReencolar";

export const dynamic = "force-dynamic";

// Sin extensión de tenant: monitoreo multi-comercio por definición.
// El aislamiento acá lo da el rol, verificado abajo.
const db = new PrismaClient();

/**
 * Monitoreo del checkout — la sala de máquinas que las Fases 3-6 no tenían.
 *
 * Tres preguntas que antes solo respondían los logs de PM2:
 * 1. ¿La maquinaria está viva? (ejecutor bancario, worker de entregas, tasa BCV)
 * 2. ¿Qué está pasando con los cobros en línea, en todos los comercios?
 * 3. ¿Algún webhook no le está llegando a un comercio?
 */

const EXEC_URL = process.env.GATEWAY_EXEC_URL ?? "http://127.0.0.1:3102";
/** Entregas listas hace más de esto sin que el worker las tome = worker caído. */
const ATRASO_WORKER_MS = 5 * 60_000;

type Estado = "CONFIRMED" | "PENDING" | "FAILED" | "EXPIRED";

const CHIP_INTENT: Record<Estado, { texto: string; clase: string }> = {
  CONFIRMED: { texto: "confirmada", clase: "bg-ok-suave text-ok" },
  PENDING: { texto: "pendiente", clase: "bg-tinta-fondo text-tinta-suave" },
  FAILED: { texto: "fallida", clase: "bg-error-suave text-error" },
  EXPIRED: { texto: "vencida", clase: "bg-tinta-fondo text-tinta-tenue" },
};

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hace(fecha: Date): string {
  const min = Math.round((Date.now() - fecha.getTime()) / 60_000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

async function saludEjecutor(): Promise<{ ok: boolean; uptimeS?: number }> {
  try {
    const res = await fetch(`${EXEC_URL}/exec/health`, {
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; uptimeS?: number };
    return { ok: data.ok === true, uptimeS: data.uptimeS };
  } catch {
    return { ok: false };
  }
}

export default async function CheckoutMonitorPage() {
  // Sección administrativa: la revisora no entra ni tecleando la URL.
  const session = await getVerifiedSession();
  if (session?.user.role !== "PLATFORM_ADMIN") redirect("/plataforma/comercios");

  const semana = new Date(Date.now() - 7 * 24 * 3600_000);
  const dia = new Date(Date.now() - 24 * 3600_000);

  const [
    ejecutor,
    tasa,
    atrasadas,
    intentsPorEstado,
    ultimosIntents,
    entregasPorEstado,
    entregasProblema,
    usoApi,
    orgs,
  ] = await Promise.all([
    saludEjecutor(),
    db.exchangeRate.findFirst({ orderBy: { fetchedAt: "desc" } }),
    db.webhookDelivery.count({
      where: {
        status: { in: ["PENDING", "FAILED_RETRYING"] },
        nextRetryAt: { lt: new Date(Date.now() - ATRASO_WORKER_MS) },
      },
    }),
    db.checkoutIntent.groupBy({
      by: ["status"],
      where: { createdAt: { gte: semana } },
      _count: true,
    }),
    db.checkoutIntent.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        externalRef: true,
        amountVES: true,
        method: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        organization: { select: { razonSocial: true } },
      },
    }),
    db.webhookDelivery.groupBy({
      by: ["status"],
      where: { createdAt: { gte: semana } },
      _count: true,
    }),
    db.webhookDelivery.findMany({
      where: { status: { in: ["DEAD", "FAILED_RETRYING"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.apiEvent.groupBy({
      by: ["organizationId"],
      where: { createdAt: { gte: dia } },
      _count: true,
    }),
    db.organization.findMany({ select: { id: true, razonSocial: true } }),
  ]);

  const nombreOrg = new Map(orgs.map((o) => [o.id, o.razonSocial]));
  const urlsProblema = await db.webhookEndpoint.findMany({
    where: { id: { in: entregasProblema.map((e) => e.endpointId) } },
    select: { id: true, url: true },
  });
  const urlPorEndpoint = new Map(urlsProblema.map((e) => [e.id, e.url]));

  const cuentaIntents = (e: Estado) =>
    intentsPorEstado.find((p) => p.status === e)?._count ?? 0;
  const cuentaEntregas = (e: string) =>
    entregasPorEstado.find((p) => p.status === e)?._count ?? 0;

  const tasaVieja = !tasa || Date.now() - tasa.fetchedAt.getTime() > 24 * 3600_000;
  const usoOrdenado = [...usoApi].sort((a, b) => b._count - a._count).slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Checkout</h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        La maquinaria de los cobros en línea: qué está vivo, qué está pasando y
        qué no está llegando.
      </p>

      {/* Salud: lo primero que se mira cuando algo huele mal. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div
          className={`rounded-card border bg-white p-5 ${
            ejecutor.ok ? "border-tinta-borde" : "border-error/40"
          }`}
        >
          <p className="text-sm text-tinta-tenue">Ejecutor bancario</p>
          {ejecutor.ok ? (
            <>
              <p className="mt-1 font-display text-xl font-bold tracking-tight text-ok">
                En línea
              </p>
              <p className="mt-1 text-sm text-tinta-tenue">
                arriba desde hace {Math.round((ejecutor.uptimeS ?? 0) / 3600)} h
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-xl font-bold tracking-tight text-error">
                Sin respuesta
              </p>
              <p className="mt-1 text-sm text-tinta-tenue">pm2 logs armorpay-gateway</p>
            </>
          )}
        </div>
        <div
          className={`rounded-card border bg-white p-5 ${
            atrasadas === 0 ? "border-tinta-borde" : "border-error/40"
          }`}
        >
          <p className="text-sm text-tinta-tenue">Worker de entregas</p>
          {atrasadas === 0 ? (
            <>
              <p className="mt-1 font-display text-xl font-bold tracking-tight text-ok">
                Al día
              </p>
              <p className="mt-1 text-sm text-tinta-tenue">nada atrasado en la cola</p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-xl font-bold tracking-tight text-error">
                {atrasadas} atrasada(s)
              </p>
              <p className="mt-1 text-sm text-tinta-tenue">
                listas hace &gt;5 min sin procesar — pm2 logs armorpay-worker
              </p>
            </>
          )}
        </div>
        <div
          className={`rounded-card border bg-white p-5 ${
            tasaVieja ? "border-alerta/50" : "border-tinta-borde"
          }`}
        >
          <p className="text-sm text-tinta-tenue">Tasa BCV</p>
          {tasa ? (
            <>
              <p className="mt-1 font-display text-xl font-bold tracking-tight text-tinta">
                Bs {Number(tasa.rate).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
              </p>
              <p className={`mt-1 text-sm ${tasaVieja ? "text-alerta" : "text-tinta-tenue"}`}>
                {tasa.source} · {hace(tasa.fetchedAt)}
                {tasaVieja && " — vieja, los cobros en USD fallan explícito"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-xl font-bold tracking-tight text-alerta">
                Sin tasa
              </p>
              <p className="mt-1 text-sm text-tinta-tenue">
                ninguna fuente respondió todavía
              </p>
            </>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display font-bold tracking-tight text-tinta">
          Cobros en línea · últimos 7 días
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          {(Object.keys(CHIP_INTENT) as Estado[]).map((e) => (
            <div key={e} className="rounded-card border border-tinta-borde bg-white p-4">
              <p className="font-display text-2xl font-bold tracking-tight text-tinta">
                {cuentaIntents(e)}
              </p>
              <p className="mt-0.5 text-sm text-tinta-tenue">{CHIP_INTENT[e].texto}s</p>
            </div>
          ))}
        </div>

        {ultimosIntents.length === 0 ? (
          <p className="mt-4 text-sm text-tinta-tenue">
            Todavía ningún comercio creó cobros en línea.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {ultimosIntents.map((i) => {
              const estado: Estado =
                i.status === "PENDING" && i.expiresAt.getTime() < Date.now()
                  ? "EXPIRED"
                  : (i.status as Estado);
              const chip = CHIP_INTENT[estado];
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-tinta">
                      {i.organization.razonSocial}
                      <span className="font-normal text-tinta-tenue"> · {i.externalRef}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-tinta-tenue">
                      {new Date(i.createdAt).toLocaleString("es-VE")}
                      {i.method && ` · ${i.method === "C2P" ? "C2P" : "Referencia"}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums text-tinta">
                      Bs {bs(Number(i.amountVES))}
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
      </section>

      <section className="mt-8">
        <h2 className="font-display font-bold tracking-tight text-tinta">
          Webhooks a los comercios · últimos 7 días
        </h2>
        <p className="mt-1 text-sm text-tinta-tenue">
          {cuentaEntregas("DELIVERED")} entregada(s) · {cuentaEntregas("PENDING")} en cola ·{" "}
          {cuentaEntregas("FAILED_RETRYING")} reintentando · {cuentaEntregas("DEAD")} agotada(s)
        </p>

        {entregasProblema.length === 0 ? (
          <p className="mt-3 text-sm text-tinta-tenue">
            Ninguna entrega con problemas. Los avisos están llegando.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {entregasProblema.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-tinta">
                    {nombreOrg.get(d.organizationId) ?? d.organizationId}
                    <span
                      className={`ml-2 rounded-control px-2 py-0.5 text-xs font-medium ${
                        d.status === "DEAD"
                          ? "bg-error-suave text-error"
                          : "bg-alerta-suave text-alerta"
                      }`}
                    >
                      {d.status === "DEAD" ? "agotada" : `reintento ${d.attempts}`}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-tinta-tenue">
                    {hace(d.createdAt)} · {urlPorEndpoint.get(d.endpointId) ?? "(endpoint eliminado)"}
                  </p>
                  {d.lastError && (
                    <p className="mt-0.5 truncate text-sm text-error">{d.lastError}</p>
                  )}
                </div>
                <BotonReencolar deliveryId={d.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display font-bold tracking-tight text-tinta">
            Uso de la API · últimas 24 horas
          </h2>
          <Link
            href="/plataforma/checkout/bitacora"
            className="text-sm font-medium text-marca-700 hover:text-marca-900"
          >
            Bitácora fila a fila →
          </Link>
        </div>
        {usoOrdenado.length === 0 ? (
          <p className="mt-3 text-sm text-tinta-tenue">Sin actividad de API.</p>
        ) : (
          <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {usoOrdenado.map((u) => (
              <li key={u.organizationId} className="flex items-center justify-between px-5 py-3">
                <Link
                  href={`/plataforma/comercios/${u.organizationId}`}
                  className="text-sm font-medium text-tinta hover:underline"
                >
                  {nombreOrg.get(u.organizationId) ?? u.organizationId}
                </Link>
                <span className="text-sm tabular-nums text-tinta-suave">
                  {u._count.toLocaleString("es-VE")} evento(s)
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-tinta-tenue">
          Eventos de la bitácora de la API (intents, validaciones, rechazos).
          Esto es el pulso; el detalle está en la bitácora.
        </p>
      </section>
    </main>
  );
}
