/**
 * Clases de la tabla de reporte (movimientos, pagos del día).
 *
 * Regla: NUNCA scroll lateral. En `md` y más es una tabla real, con celdas
 * que envuelven texto en vez de forzar una línea; por debajo cada fila se
 * apila como ficha y cada celda pinta su etiqueta (`data-label`) delante del
 * valor, así la caja lo lee en el teléfono sin arrastrar. Las celdas que no
 * tienen sentido apiladas (rellenos del pie) van con `hidden md:table-cell`.
 */
export const TABLA = "w-full text-sm";
export const THEAD = "hidden md:table-header-group";
export const TR_CAB =
  "border-b border-tinta-borde bg-tinta-fondo/60 text-left text-xs uppercase tracking-wide text-tinta-tenue";
export const TH = "px-2 py-2.5 font-medium first:pl-4 last:pr-4";
export const TBODY = "block md:table-row-group md:divide-y md:divide-tinta-borde";
export const TR =
  "block border-b border-tinta-borde px-4 py-3 last:border-b-0 md:table-row md:border-0 md:px-0 md:py-0 md:hover:bg-tinta-fondo/40";
export const TD =
  "flex items-baseline justify-between gap-4 py-0.5 text-right before:shrink-0 before:text-xs before:uppercase before:tracking-wide before:text-tinta-tenue before:content-[attr(data-label)] md:table-cell md:px-2 md:py-2 md:text-left md:align-top md:first:pl-4 md:last:pr-4 md:before:hidden";
/** Variante numérica: a la derecha también en escritorio, sin partir. */
export const TD_NUM = `${TD} whitespace-nowrap tabular-nums md:text-right`;
/** Variante que no se parte (fechas, referencias, cédulas). */
export const TD_FIJO = `${TD} whitespace-nowrap tabular-nums`;
export const TFOOT = "block md:table-footer-group";
export const TR_PIE =
  "block border-t border-tinta-borde bg-tinta-fondo/60 px-4 py-3 font-medium text-tinta md:table-row md:px-0 md:py-0";
/** Relleno del pie: solo existe en la tabla de escritorio. */
export const TD_RELLENO = "hidden md:table-cell";
