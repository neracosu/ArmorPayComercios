import Link from "next/link";
import { CircleDot, ClipboardList, Home, Image as ImageIcon, KeyRound, Search, ShoppingBag, Store, Users } from "lucide-react";
import CerrarSesion from "./CerrarSesion";

/**
 * Cabecera del panel operativo.
 *
 * El estado del turno vive acá arriba y no en una pantalla aparte: es lo que la
 * caja necesita saber de un vistazo, porque sin turno abierto no puede cobrar.
 */
export default function Cabecera({
  comercio,
  usuario,
  turnoAbierto,
  esAdminComercio = false,
  logoUrl = null,
}: {
  comercio: string;
  usuario: string;
  turnoAbierto: boolean;
  esAdminComercio?: boolean;
  /** Logo del comercio (`/api/logo/...`), o null si no cargó ninguno. */
  logoUrl?: string | null;
}) {
  return (
    <header className="border-b border-tinta-borde bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-bold tracking-tight text-tinta">
            Armor<span className="text-marca-700">Pay</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-tinta-tenue">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- viene de nuestra propia ruta, tamaño fijo
              <img
                src={logoUrl}
                alt=""
                className="h-6 w-6 rounded object-contain"
              />
            ) : (
              <Store className="h-3.5 w-3.5" aria-hidden />
            )}
            {comercio}
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href="/validar"
            className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
          >
            <Search className="h-4 w-4" aria-hidden />
            Cobrar
          </Link>
          <Link
            href="/turno"
            className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
          >
            <CircleDot
              className={`h-4 w-4 ${turnoAbierto ? "text-ok" : "text-tinta-tenue"}`}
              aria-hidden
            />
            {turnoAbierto ? "Turno abierto" : "Sin turno"}
          </Link>
          {esAdminComercio && (
            <>
              <Link
                href="/comercio"
                className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <Home className="h-4 w-4" aria-hidden />
                Inicio
              </Link>
              <Link
                href="/comercio/cierres"
                className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <ClipboardList className="h-4 w-4" aria-hidden />
                Cierres
              </Link>
              <Link
                href="/comercio/ventas"
                className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden />
                Ventas
              </Link>
              <Link
                href="/comercio/cajas"
                className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <Users className="h-4 w-4" aria-hidden />
                Cajas
              </Link>
              <Link
                href="/comercio/sucursales"
                className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <Store className="h-4 w-4" aria-hidden />
                Sucursales
              </Link>
              <Link
                href="/comercio/api"
                className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <KeyRound className="h-4 w-4" aria-hidden />
                API
              </Link>
              <Link
                href="/comercio/perfil"
                className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <ImageIcon className="h-4 w-4" aria-hidden />
                Perfil
              </Link>
            </>
          )}
          <span className="hidden px-2 text-sm text-tinta-tenue sm:inline">{usuario}</span>
          <CerrarSesion />
        </nav>
      </div>
    </header>
  );
}
