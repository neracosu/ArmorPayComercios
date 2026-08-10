import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { ArrowRight, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

const db = new PrismaClient();

const ESTADO: Record<string, { texto: string; clase: string }> = {
  REGISTRADA: { texto: "Registrada", clase: "bg-tinta-fondo text-tinta-tenue" },
  RECAUDOS_COMPLETOS: { texto: "Recaudos completos", clase: "bg-tinta-fondo text-tinta-tenue" },
  ENVIADA_AL_BANCO: { texto: "Enviada al banco", clase: "bg-alerta-suave text-alerta" },
  CERTIFICACION: { texto: "En certificación", clase: "bg-alerta-suave text-alerta" },
  ACTIVA: { texto: "Activa", clase: "bg-ok-suave text-ok" },
  RECHAZADA: { texto: "Rechazada", clase: "bg-error-suave text-error" },
  SUSPENDIDA: { texto: "Suspendida", clase: "bg-error-suave text-error" },
};

const LLAVE: Record<string, { texto: string; clase: string }> = {
  SIN_LLAVE: { texto: "Sin llave", clase: "text-tinta-tenue" },
  CARGADA: { texto: "Cargada, sin probar", clase: "text-alerta" },
  VERIFICADA: { texto: "Verificada", clase: "text-ok" },
  INVALIDA: { texto: "Rechazada por el banco", clase: "text-error" },
};

export default async function ComerciosPage({
  searchParams,
}: {
  searchParams: { q?: string; estado?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const estado = Object.keys(ESTADO).includes(searchParams.estado ?? "")
    ? searchParams.estado
    : undefined;

  // Con búsqueda y filtro, el corte a 100 deja de ser un problema: lo que no
  // aparece se encuentra buscando (antes se listaba TODO, sin tope).
  const comercios = await db.organization.findMany({
    where: {
      ...(q ? { OR: [{ razonSocial: { contains: q } }, { rif: { contains: q } }] } : {}),
      ...(estado ? { status: estado as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      razonSocial: true,
      rif: true,
      status: true,
      plan: true,
      authKeyStatus: true,
      _count: { select: { users: true, accounts: true } },
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Comercios</h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        Todos los negocios de la plataforma. Entra a uno para gestionar sus
        usuarios y su llave del banco.
      </p>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Razón social o RIF"
            className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="estado" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={estado ?? ""}
            className="rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          >
            <option value="">Todos</option>
            {Object.entries(ESTADO).map(([clave, e]) => (
              <option key={clave} value={clave}>
                {e.texto}
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

      {comercios.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
          <Building2 className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
          <p className="mt-3 font-medium text-tinta">
            {q || estado ? "Nada coincide con ese filtro" : "Todavía no hay comercios"}
          </p>
          <p className="mt-1 text-sm text-tinta-tenue">
            {q || estado
              ? "Prueba con otra búsqueda u otro estado."
              : "Se crean convirtiendo una solicitud de la portada."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {comercios.map((c) => (
            <li key={c.id}>
              <Link
                href={`/plataforma/comercios/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-tinta-fondo"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-tinta">{c.razonSocial}</p>
                  <p className="mt-0.5 text-sm text-tinta-tenue">
                    {c.rif} · plan {c.plan} · {c._count.users} usuario(s) · {c._count.accounts}{" "}
                    cuenta(s) ·{" "}
                    <span className={LLAVE[c.authKeyStatus]?.clase}>
                      {LLAVE[c.authKeyStatus]?.texto ?? c.authKeyStatus}
                    </span>
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-control px-2.5 py-1 text-xs font-medium ${ESTADO[c.status]?.clase}`}
                >
                  {ESTADO[c.status]?.texto ?? c.status}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-tinta-tenue" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {comercios.length >= 100 && (
        <p className="mt-3 text-xs text-tinta-tenue">
          Se muestran los 100 más recientes — usa la búsqueda para encontrar el resto.
        </p>
      )}
    </main>
  );
}
