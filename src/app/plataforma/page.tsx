import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { ArrowRight, Building2, Inbox, KeyRound, Users } from "lucide-react";

export const dynamic = "force-dynamic";

// Sin extensión de tenant: el panel de plataforma es multi-comercio por
// definición. El aislamiento acá lo da el rol, verificado en el layout.
const db = new PrismaClient();

const ESTADO_TEXTO: Record<string, string> = {
  REGISTRADA: "Registrada",
  RECAUDOS_COMPLETOS: "Recaudos completos",
  ENVIADA_AL_BANCO: "Enviada al banco",
  CERTIFICACION: "En certificación",
  ACTIVA: "Activa",
  RECHAZADA: "Rechazada",
  SUSPENDIDA: "Suspendida",
};

export default async function ResumenPage() {
  const [solicitudes, comercios, usuarios, sinLlave, porEstado, cobrosHoy] = await Promise.all([
    db.lead.count({ where: { estado: { in: ["NUEVO", "CONTACTADO"] } } }),
    db.organization.count(),
    db.user.count({ where: { isActive: true } }),
    db.organization.count({ where: { authKeyStatus: { in: ["SIN_LLAVE", "INVALIDA"] } } }),
    db.organization.groupBy({ by: ["status"], _count: true }),
    db.paymentClaim.count({
      where: { claimedAt: { gt: new Date(Date.now() - 24 * 3600_000) } },
    }),
  ]);

  const tarjetas = [
    { icono: Inbox, valor: solicitudes, texto: "solicitudes sin atender", href: "/plataforma/solicitudes" },
    { icono: Building2, valor: comercios, texto: "comercios", href: "/plataforma/comercios" },
    { icono: Users, valor: usuarios, texto: "usuarios activos", href: "/plataforma/usuarios" },
    { icono: KeyRound, valor: sinLlave, texto: "comercios sin llave usable", href: "/plataforma/comercios" },
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Resumen</h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        Todo lo que está pasando en la plataforma, en una pantalla.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Link
            key={t.texto}
            href={t.href}
            className="rounded-card border border-tinta-borde bg-white p-5 transition-colors hover:border-marca-600"
          >
            <t.icono className="h-5 w-5 text-marca-700" aria-hidden />
            <p className="mt-3 font-display text-3xl font-bold tracking-tight text-tinta">
              {t.valor}
            </p>
            <p className="mt-0.5 text-sm leading-snug text-tinta-tenue">{t.texto}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <section className="rounded-card border border-tinta-borde bg-white p-5">
          <h2 className="font-display font-bold tracking-tight text-tinta">
            Comercios por estado
          </h2>
          {porEstado.length === 0 ? (
            <p className="mt-3 text-sm text-tinta-tenue">Todavía no hay comercios.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {porEstado.map((e) => (
                <li key={e.status} className="flex items-center justify-between text-sm">
                  <span className="text-tinta-suave">{ESTADO_TEXTO[e.status] ?? e.status}</span>
                  <span className="font-medium text-tinta">{e._count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-tinta-borde bg-white p-5">
          <h2 className="font-display font-bold tracking-tight text-tinta">Últimas 24 horas</h2>
          <p className="mt-3 font-display text-3xl font-bold tracking-tight text-tinta">
            {cobrosHoy}
          </p>
          <p className="mt-0.5 text-sm text-tinta-tenue">
            cobros registrados en todos los comercios
          </p>
          <Link
            href="/plataforma/comercios"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-marca-700 hover:text-marca-900"
          >
            Ver por comercio
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </section>
      </div>
    </main>
  );
}
