import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { getVerifiedSession } from "@/lib/session-guard";

export const dynamic = "force-dynamic";

// Sin extensión de tenant: bitácora multi-comercio, el aislamiento lo da el rol.
const db = new PrismaClient();

/**
 * La bitácora forense de la API (`ApiEvent`), fila a fila. Es append-only y
 * SIEMPRE enmascarada — acá se consulta, jamás se edita. Para el detalle que
 * no cabe en pantalla, la fila entera sigue en la base.
 */

const ACCION_CLASE: Record<string, string> = {
  ref_validated: "bg-ok-suave text-ok",
  c2p_ok: "bg-ok-suave text-ok",
  ref_rejected: "bg-alerta-suave text-alerta",
  c2p_fail: "bg-error-suave text-error",
  rate_limited: "bg-error-suave text-error",
};

export default async function BitacoraPage({
  searchParams,
}: {
  searchParams: { org?: string; accion?: string };
}) {
  // Sección administrativa: la revisora no entra ni tecleando la URL.
  const session = await getVerifiedSession();
  if (session?.user.role !== "PLATFORM_ADMIN") redirect("/plataforma/comercios");

  const [orgs, acciones] = await Promise.all([
    db.organization.findMany({
      orderBy: { razonSocial: "asc" },
      select: { id: true, razonSocial: true },
    }),
    db.apiEvent.findMany({ distinct: ["action"], select: { action: true } }),
  ]);

  const org = orgs.find((o) => o.id === searchParams.org)?.id;
  const accion = acciones.find((a) => a.action === searchParams.accion)?.action;

  const eventos = await db.apiEvent.findMany({
    where: {
      ...(org ? { organizationId: org } : {}),
      ...(accion ? { action: accion } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const llaves = await db.apiKey.findMany({
    where: { id: { in: eventos.flatMap((e) => (e.apiKeyId ? [e.apiKeyId] : [])) } },
    select: { id: true, prefix: true },
  });
  const prefijoPorLlave = new Map(llaves.map((k) => [k.id, k.prefix]));
  const nombreOrg = new Map(orgs.map((o) => [o.id, o.razonSocial]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
        Bitácora de la API
      </h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        Cada evento de la API, enmascarado y append-only — la evidencia
        forense del checkout.{" "}
        <Link href="/plataforma/checkout" className="font-medium text-marca-700 hover:underline">
          Volver al monitoreo
        </Link>
        .
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="org" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Comercio
          </label>
          <select
            id="org"
            name="org"
            defaultValue={org ?? ""}
            className="rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          >
            <option value="">Todos</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.razonSocial}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="accion" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Evento
          </label>
          <select
            id="accion"
            name="accion"
            defaultValue={accion ?? ""}
            className="rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          >
            <option value="">Todos</option>
            {acciones.map((a) => (
              <option key={a.action} value={a.action}>
                {a.action}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900"
        >
          Filtrar
        </button>
        {(org || accion) && (
          <Link
            href="/plataforma/checkout/bitacora"
            className="rounded-control px-3 py-2 text-sm font-medium text-tinta-tenue hover:bg-tinta-fondo"
          >
            Limpiar
          </Link>
        )}
      </form>

      {eventos.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
          <ScrollText className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
          <p className="mt-3 text-sm text-tinta-tenue">
            {org || accion ? "Nada con esos filtros." : "La bitácora está vacía."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {eventos.map((e) => (
            <li key={e.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-control px-2 py-0.5 text-xs font-medium ${
                    ACCION_CLASE[e.action] ?? "bg-tinta-fondo text-tinta-suave"
                  }`}
                >
                  {e.action}
                </span>
                <span className="text-sm font-medium text-tinta">
                  {nombreOrg.get(e.organizationId) ?? e.organizationId}
                </span>
                <span className="text-sm text-tinta-tenue">
                  {new Date(e.createdAt).toLocaleString("es-VE")}
                </span>
                {e.apiKeyId && (
                  <span className="font-mono text-xs text-tinta-tenue">
                    {prefijoPorLlave.get(e.apiKeyId) ?? "(llave borrada)"}
                  </span>
                )}
                {e.clientIp && (
                  <span className="font-mono text-xs text-tinta-tenue">{e.clientIp}</span>
                )}
              </div>
              {e.detail && (
                <p className="mt-1 truncate font-mono text-xs text-tinta-suave">{e.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {eventos.length === 100 && (
        <p className="mt-3 text-sm text-tinta-tenue">
          Se muestran los últimos 100. Acota con los filtros para llegar más atrás.
        </p>
      )}
    </main>
  );
}
