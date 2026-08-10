/**
 * CSV para descargar reportes. Dos decisiones pensadas para el usuario real
 * (el contador del comercio, con Excel en Windows y regional es-VE):
 *
 * - BOM UTF-8 al frente: sin él, Excel abre "Pérez" como "PÃ©rez".
 * - Separador `;`: con regional venezolana (coma decimal), Excel espera
 *   punto y coma entre columnas — con coma, todo cae en una sola celda.
 *
 * Escapado RFC 4180: comillas dobles alrededor de todo campo con separador,
 * comilla o salto de línea.
 */

const SEPARADOR = ";";

function escapar(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function aCsv(cabeceras: string[], filas: Array<Array<string | number | null | undefined>>): string {
  const lineas = [cabeceras, ...filas].map((f) => f.map(escapar).join(SEPARADOR));
  return "\uFEFF" + lineas.join("\r\n") + "\r\n";
}

/** Respuesta HTTP de descarga con el nombre de archivo dado. */
export function respuestaCsv(nombre: string, contenido: string): Response {
  return new Response(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Monto Decimal/string → "1234,56" (coma decimal, como espera Excel es-VE). */
export function montoCsv(v: unknown): string {
  const n = Number(v ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2).replace(".", ",");
}

/** Fecha → "2026-08-10 16:30" en hora de Venezuela. */
export function fechaCsv(d: Date | null | undefined): string {
  if (!d) return "";
  return d
    .toLocaleString("sv-SE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })
    .replace("T", " ");
}
