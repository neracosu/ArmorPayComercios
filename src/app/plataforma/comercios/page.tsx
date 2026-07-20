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

export default async function ComerciosPage() {
  const comercios = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      razonSocial: true,
      rif: true,
      status: true,
      authKeyStatus: true,
      _count: { select: { users: true, accounts: true } },
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Comercios</h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        Todos los negocios de la plataforma. Entrá a uno para gestionar sus
        usuarios y su llave del banco.
      </p>

      {comercios.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
          <Building2 className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
          <p className="mt-3 font-medium text-tinta">Todavía no hay comercios</p>
          <p className="mt-1 text-sm text-tinta-tenue">
            Se crean convirtiendo una solicitud de la portada.
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
                    {c.rif} · {c._count.users} usuario(s) · {c._count.accounts} cuenta(s) ·{" "}
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
    </main>
  );
}
