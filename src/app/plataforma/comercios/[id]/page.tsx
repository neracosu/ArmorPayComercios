import Link from "next/link";
import { notFound } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { ArrowLeft, KeyRound } from "lucide-react";
import CrearAdmin from "./CrearAdmin";

export const dynamic = "force-dynamic";

const db = new PrismaClient();

const ROL: Record<string, string> = {
  PLATFORM_ADMIN: "Plataforma",
  ORG_ADMIN: "Administrador",
  OPERATOR: "Caja",
};

const LLAVE: Record<string, { texto: string; clase: string }> = {
  SIN_LLAVE: { texto: "Sin llave cargada", clase: "text-tinta-tenue" },
  CARGADA: { texto: "Cargada, sin probar contra el banco", clase: "text-alerta" },
  VERIFICADA: { texto: "Verificada", clase: "text-ok" },
  INVALIDA: { texto: "Rechazada por el banco", clase: "text-error" },
};

export default async function ComercioPage({ params }: { params: { id: string } }) {
  const comercio = await db.organization.findUnique({
    where: { id: params.id },
    include: {
      users: { orderBy: { username: "asc" } },
      accounts: { orderBy: { accountNumber: "asc" } },
      branches: { orderBy: { name: "asc" } },
    },
  });
  if (!comercio) notFound();

  const [pagos, cobros] = await Promise.all([
    db.bankTransaction.count({ where: { organizationId: comercio.id } }),
    db.paymentClaim.count({ where: { organizationId: comercio.id } }),
  ]);

  const llave = LLAVE[comercio.authKeyStatus] ?? {
    texto: comercio.authKeyStatus,
    clase: "text-tinta-tenue",
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/plataforma/comercios"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue hover:text-tinta"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Comercios
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-tinta">
        {comercio.razonSocial}
      </h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        {comercio.rif} · {comercio.status.toLowerCase().replace(/_/g, " ")} · {pagos} pago(s)
        recibido(s) · {cobros} cobro(s)
      </p>

      {/* Llave de Trabajo: es lo que hace que su validador funcione */}
      <section className="mt-6 rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-tinta">
          <KeyRound className="h-4 w-4 text-marca-700" aria-hidden />
          Llave de Trabajo del banco
        </h2>
        <p className={`mt-2 text-sm font-medium ${llave.clase}`}>{llave.texto}</p>
        {comercio.authKeyHint && (
          <p className="mt-1 font-mono text-sm text-tinta-tenue">{comercio.authKeyHint}</p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-tinta-tenue">
          El banco emite una llave por RIF, no por cuenta: este comercio usa la
          misma para todas sus cuentas. Cargarla y probarla se hace desde acá —
          pendiente de construir.
        </p>
      </section>

      {/* Cuentas */}
      <section className="mt-6">
        <h2 className="font-display font-bold tracking-tight text-tinta">Cuentas afiliadas</h2>
        {comercio.accounts.length === 0 ? (
          <p className="mt-2 text-sm text-tinta-tenue">
            Ninguna todavía. Sin cuenta afiliada, sus cajas no ven pagos.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {comercio.accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-mono text-tinta">{a.accountNumber}</span>
                <span className="text-tinta-tenue">{a.alias}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Usuarios */}
      <section className="mt-8">
        <h2 className="font-display font-bold tracking-tight text-tinta">Usuarios</h2>
        <p className="mb-3 mt-1 text-sm text-tinta-tenue">
          El administrador del comercio crea sus propias cajas. Nosotros solo
          creamos al administrador.
        </p>

        {comercio.users.length > 0 && (
          <ul className="mb-4 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {comercio.users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-tinta">{u.username}</span>
                  <span className="text-tinta-tenue"> · {u.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  {!u.isActive && (
                    <span className="rounded-control bg-error-suave px-2 py-0.5 text-xs text-error">
                      inactivo
                    </span>
                  )}
                  <span className="text-tinta-tenue">{ROL[u.role] ?? u.role}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <CrearAdmin organizationId={comercio.id} slug={comercio.slug} />
      </section>

      <section className="mt-8">
        <h2 className="font-display font-bold tracking-tight text-tinta">Sucursales</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {comercio.branches.map((b) => (
            <li
              key={b.id}
              className="rounded-control border border-tinta-borde bg-white px-3 py-1.5 text-sm text-tinta-suave"
            >
              {b.name} <span className="text-tinta-tenue">({b.code})</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
