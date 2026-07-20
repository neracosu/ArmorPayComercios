import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Inbox, ShieldAlert, Users } from "lucide-react";
import { getVerifiedSession } from "@/lib/session-guard";
import CerrarSesion from "@/components/CerrarSesion";

export const dynamic = "force-dynamic";

/**
 * Armazón del panel de plataforma. Solo `PLATFORM_ADMIN`.
 *
 * El guardia está acá, en el layout, y no repetido en cada pantalla: una
 * pantalla nueva colgada de esta ruta queda protegida sin que nadie se acuerde
 * de protegerla. Cada página igual verifica de nuevo, porque el layout no
 * cubre las server actions.
 */
const SECCIONES = [
  { href: "/plataforma", icono: ShieldAlert, texto: "Resumen" },
  { href: "/plataforma/solicitudes", icono: Inbox, texto: "Solicitudes" },
  { href: "/plataforma/comercios", icono: Building2, texto: "Comercios" },
  { href: "/plataforma/usuarios", icono: Users, texto: "Usuarios" },
];

export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/plataforma");
  if (session.user.role !== "PLATFORM_ADMIN") redirect("/validar");

  return (
    <>
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
            <span className="hidden px-2 text-sm text-white/60 sm:inline">
              {session.user.name}
            </span>
            <span className="text-white/60">
              <CerrarSesion />
            </span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pb-2">
          {SECCIONES.map((s) => (
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
