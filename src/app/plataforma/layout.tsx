import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, Building2, Globe, Inbox, ScrollText, ShieldAlert, Users } from "lucide-react";
import { getVerifiedSession } from "@/lib/session-guard";
import CerrarSesion from "@/components/CerrarSesion";
import AutoRefresco from "@/components/AutoRefresco";

export const dynamic = "force-dynamic";

/**
 * Armazón del panel de plataforma: `PLATFORM_ADMIN` completo, y
 * `PLATFORM_REVIEWER` (la revisora de expedientes) solo lo que su trabajo
 * necesita — solicitudes y comercios. Las pantallas administrativas
 * (usuarios, consumo) re-verifican el rol además del filtro del nav, y las
 * server actions sensibles lo exigen por su cuenta.
 */
const SECCIONES = [
  { href: "/plataforma", icono: ShieldAlert, texto: "Resumen", soloAdmin: true },
  { href: "/plataforma/solicitudes", icono: Inbox, texto: "Solicitudes", soloAdmin: false },
  { href: "/plataforma/comercios", icono: Building2, texto: "Comercios", soloAdmin: false },
  { href: "/plataforma/checkout", icono: Globe, texto: "Checkout", soloAdmin: true },
  { href: "/plataforma/usuarios", icono: Users, texto: "Usuarios", soloAdmin: true },
  { href: "/plataforma/consumo", icono: BarChart3, texto: "Consumo", soloAdmin: true },
  { href: "/plataforma/bitacora", icono: ScrollText, texto: "Bitácora", soloAdmin: true },
];

export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/plataforma");
  const esAdmin = session.user.role === "PLATFORM_ADMIN";
  if (!esAdmin && session.user.role !== "PLATFORM_REVIEWER") redirect("/validar");

  return (
    <>
      {/* Al volver a la pestaña, contadores y expedientes se actualizan solos */}
      <AutoRefresco />
      <header className="border-b border-tinta-borde bg-tinta">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold tracking-tight text-white">
              Armor<span className="text-marca-400">Pay</span>
            </span>
            <span className="rounded-control bg-white/10 px-2 py-0.5 text-xs font-medium text-marca-400">
              Plataforma
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/cuenta"
              title="Mi cuenta"
              className="hidden rounded-control px-2 py-1 text-sm text-white/60 hover:bg-white/10 hover:text-white sm:inline"
            >
              {session.user.name}
            </Link>
            <span className="text-white/60">
              <CerrarSesion />
            </span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pb-2">
          {SECCIONES.filter((s) => esAdmin || !s.soloAdmin).map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="flex shrink-0 items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <s.icono className="h-4 w-4" aria-hidden />
              {s.texto}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </>
  );
}
