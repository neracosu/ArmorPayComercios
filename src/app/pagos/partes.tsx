import Link from "next/link";
import { Search, X } from "lucide-react";
import { MarcaBt } from "@/components/BancoTesoro";
import { BANCOS, BANCO_TEXTO, type Banco } from "@/app/comercio/movimientos";

/**
 * Piezas que comparten las dos vistas de /pagos: la del dueño (todo lo que el
 * banco notificó) y la de la caja (solo lo suyo). Viven acá porque un
 * `page.tsx` de Next no puede exportar nada más que la página.
 */

export function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function horaVe(d: Date): string {
  return d.toLocaleTimeString("es-VE", { timeZone: "America/Caracas", timeStyle: "short" });
}

function chipClase(activo: boolean): string {
  return `rounded-control px-3 py-1.5 text-sm font-medium ${
    activo ? "bg-tinta text-white" : "text-tinta-suave hover:bg-tinta-fondo"
  }`;
}

export function CeldaBanco({ banco }: { banco: Banco }) {
  if (banco === "BT") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <MarcaBt className="h-3.5 w-auto" /> Tesoro
      </span>
    );
  }
  return <>BDT</>;
}

/** Dos líneas en una celda: el dato y, debajo, su complemento en gris. */
export function Doble({ arriba, abajo }: { arriba: string; abajo?: string }) {
  return (
    <span className="block break-words">
      {arriba || "—"}
      {abajo && <span className="block text-xs text-tinta-tenue">{abajo}</span>}
    </span>
  );
}

export function urlPagos(banco: Banco | undefined, base = "/pagos", q = ""): string {
  const params = new URLSearchParams();
  if (banco) params.set("banco", banco);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

/** Chips de banco + buscador. Mismas reglas de búsqueda en las dos vistas. */
export function BarraFiltros({
  banco,
  q,
  etiqueta,
  placeholder,
}: {
  banco: Banco | undefined;
  q: string;
  /** Texto accesible del buscador. */
  etiqueta: string;
  placeholder: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tinta-tenue">Banco:</span>
        <Link href={urlPagos(undefined, "/pagos", q)} className={chipClase(!banco)}>
          Todos
        </Link>
        {BANCOS.map((b) => (
          <Link key={b} href={urlPagos(b, "/pagos", q)} className={chipClase(banco === b)}>
            {b === "BT" ? (
              <span className="inline-flex items-center gap-1.5">
                <MarcaBt className="h-3.5 w-auto" /> {BANCO_TEXTO[b]}
              </span>
            ) : (
              BANCO_TEXTO[b]
            )}
          </Link>
        ))}
      </div>
      <form method="get" action="/pagos" className="flex items-center gap-2">
        {banco && <input type="hidden" name="banco" value={banco} />}
        <label htmlFor="q" className="sr-only">
          {etiqueta}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={60}
            placeholder={placeholder}
            className="w-72 rounded-control border border-tinta-borde bg-white py-1.5 pl-9 pr-3 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-control bg-tinta px-3 py-1.5 text-sm font-medium text-white hover:bg-tinta/90"
        >
          Buscar
        </button>
        {q && (
          <Link
            href={urlPagos(banco)}
            className="flex items-center gap-1 rounded-control px-2 py-1.5 text-sm text-tinta-suave hover:bg-tinta-fondo"
            aria-label="Quitar búsqueda"
          >
            <X className="h-4 w-4" aria-hidden /> Limpiar
          </Link>
        )}
      </form>
    </div>
  );
}
