/**
 * Emparejamiento de referencias bancarias con lo que teclea una persona.
 *
 * El banco nos manda la referencia en SU forma (las del BT llegan con 9
 * dígitos) y el pagador copia la que ve en su comprobante, que puede venir
 * más larga: con ceros a la izquierda, o con el número completo del
 * comprobante. Por eso el match es por SUFIJO — pero tiene que ser sufijo en
 * los DOS sentidos.
 *
 * Lección del 2026-08-17 (venta real de VIP Play, 6.172,63 Bs): el filtro era
 * solo `guardada.endsWith(tecleada)`, así que un pagador que escribió 12
 * dígitos contra una referencia de 9 recibió 12 rechazos seguidos —
 * "no encontramos ese pago, espera 1-2 minutos" — mientras su pago YA estaba
 * en nuestra base. Cobró al treceavo intento, cuando por casualidad escribió
 * los 9. Escribir de más nunca puede ser peor que escribir de menos.
 *
 * El piso de 6 dígitos es antifraude y no se toca: es lo que hace que una
 * referencia no se adivine a mano. Comparar sufijos no lo debilita — el
 * solapamiento exigido sigue siendo de al menos 6 dígitos.
 */

/** Mínimo de dígitos que se aceptan para buscar un pago. */
export const REF_MIN_DIGITOS = 6;

/** Lo que teclea una persona puede traer espacios, guiones o puntos. */
export function soloDigitos(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

/**
 * El sufijo con el que se PREFILTRA en SQL. Se usan los últimos 6 dígitos y
 * no la cadena completa justamente porque la tecleada puede ser más larga que
 * la guardada: filtrar por la cadena entera es lo que dejaba fuera al pago
 * correcto. El descarte fino lo hace `mismaReferencia` en memoria.
 */
export function sufijoBusqueda(tecleada: string): string {
  const d = soloDigitos(tecleada);
  return d.slice(-REF_MIN_DIGITOS);
}

/**
 * ¿La referencia guardada y la tecleada son el mismo pago? Sufijo mutuo: da
 * igual cuál de las dos venga más larga, mientras una termine en la otra.
 */
export function mismaReferencia(guardada: string, tecleada: string): boolean {
  const g = soloDigitos(guardada);
  const t = soloDigitos(tecleada);
  if (t.length < REF_MIN_DIGITOS || g.length === 0) return false;
  return g.endsWith(t) || t.endsWith(g);
}

/**
 * ¿Se tecleó de más? Sirve para decirle al pagador algo útil en vez de
 * repetirle "no encontramos ese pago": si su número es más largo que todas
 * las referencias que guardamos, el consejo es que pruebe con menos dígitos.
 */
export function tecleoDeMas(guardadas: string[], tecleada: string): boolean {
  const t = soloDigitos(tecleada);
  return guardadas.length > 0 && guardadas.every((g) => soloDigitos(g).length < t.length);
}
