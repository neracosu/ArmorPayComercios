import Link from "next/link";
import { CircleDot, Search, Store } from "lucide-react";
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
}: {
  comercio: string;
  usuario: string;
  turnoAbierto: boolean;
}) {
  return (
    <header className="border-b border-tinta-borde bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-bold tracking-tight text-tinta">
            Armor<span className="text-marca-700">Pay</span>
          </span>
          <span className="flex items-center gap-1 text-sm text-tinta-tenue">
            <Store className="h-3.5 w-3.5" aria-hidden />
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
          <span className="hidden px-2 text-sm text-tinta-tenue sm:inline">{usuario}</span>
          <CerrarSesion />
        </nav>
      </div>
    </header>
  );
}
