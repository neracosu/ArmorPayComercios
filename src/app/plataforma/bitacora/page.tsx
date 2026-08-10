import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { getVerifiedSession } from "@/lib/session-guard";

export const dynamic = "force-dynamic";

// Sin extensión de tenant: bitácora DE LA PLATAFORMA, el aislamiento lo da el rol.
const db = new PrismaClient();

/**
 * La bitácora de acciones administrativas (`PlatformEvent`): quién activó,
 * quién borró, quién aprobó qué y cuándo. Append-only — antes de existir,
 * borrar un comercio no dejaba absolutamente ninguna huella.
 */

const ACCION_TEXTO: Record<string, string> = {
  comercio_creado: "Comercio creado",
  comercio_eliminado: "Comercio ELIMINADO",
  comercio_suspendido: "Comercio suspendido",
  comercio_reactivado: "Comercio reactivado",
  comercio_rechazado: "Comercio rechazado",
  ciclo_avanzado: "Ciclo avanzado",
  recaudo_aprobado: "Recaudo aprobado",
  recaudo_rechazado: "Recaudo rechazado",
  cuenta_agregada: "Cuenta agregada",
  cuenta_aprobada: "Cuenta aprobada",
  c2p_configurado: "C2P configurado",
  plan_cambiado: "Plan cambiado",
  admin_creado: "Admin de comercio creado",
  interno_creado: "Usuario interno creado",
  interno_desactivado: "Interno desactivado",
  interno_reactivado: "Interno reactivado",
  clave_reseteada: "Contraseña reseteada",
};

const ACCION_CLASE: Record<string, string> = {
  comercio_eliminado: "bg-error-suave text-error",
  comercio_suspendido: "bg-error-suave text-error",
  comercio_rechazado: "bg-error-suave text-error",
  recaudo_rechazado: "bg-alerta-suave text-alerta",
  clave_reseteada: "bg-alerta-suave text-alerta",
  ciclo_avanzado: "bg-ok-suave text-ok",
  comercio_creado: "bg-ok-suave text-ok",
};

export default async function BitacoraPlataformaPage({
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
    db.platformEvent.findMany({ distinct: ["action"], select: { action: true } }),
  ]);

  const org = orgs.find((o) => o.id === searchParams.org)?.id;
  const accion = acciones.find((a) => a.action === searchParams.accion)?.action;

  const eventos = await db.platformEvent.findMany({
    where: {
      ...(org ? { targetOrgId: org } : {}),
      ...(accion ? { action: accion } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const nombreOrg = new Map(orgs.map((o) => [o.id, o.razonSocial]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
        Bitácora de la plataforma
      </h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        Cada acción administrativa con su autor, append-only. Las credenciales
        bancarias tienen su propia bitácora en la ficha de cada comercio.
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
            Acción
          </label>
          <select
            id="accion"
            name="accion"
            defaultValue={accion ?? ""}
            className="rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          >
            <option value="">Todas</option>
            {acciones.map((a) => (
              <option key={a.action} value={a.action}>
                {ACCION_TEXTO[a.action] ?? a.action}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-900"
        >
          Filtrar
        </button>
      </form>

      {eventos.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
          <ScrollText className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
          <p className="mt-3 font-medium text-tinta">Sin eventos con ese filtro</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  ACCION_CLASE[e.action] ?? "bg-tinta-fondo text-tinta-suave"
                }`}
              >
                {ACCION_TEXTO[e.action] ?? e.action}
              </span>
              <span className="min-w-0 flex-1 text-tinta-suave">
                {e.targetOrgId && (
                  <span className="font-medium text-tinta">
                    {nombreOrg.get(e.targetOrgId) ?? "(comercio eliminado)"}
                  </span>
                )}
                {e.detail && <span className="text-tinta-tenue"> {e.detail}</span>}
              </span>
              <span className="shrink-0 text-xs text-tinta-tenue">
                {e.actor} · {new Date(e.createdAt).toLocaleString("es-VE")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-tinta-tenue">Se muestran los últimos 100 eventos del filtro.</p>
    </main>
  );
}
