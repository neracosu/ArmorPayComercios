import { tipoDeImagen } from "./logo";

/**
 * El expediente de afiliación: qué documentos pedimos y cómo se validan.
 * Igual que el logo: por BYTES MÁGICOS, nunca por la extensión.
 */

export const RECAUDO_MAX_BYTES = 2 * 1024 * 1024;

export const RECAUDOS_REQUERIDOS: Array<{ tipo: string; titulo: string; detalle: string }> = [
  {
    tipo: "rif",
    titulo: "RIF de la empresa",
    detalle: "Vigente, legible completo.",
  },
  {
    tipo: "registro_mercantil",
    titulo: "Registro mercantil",
    detalle: "Acta constitutiva y última modificación si la hay.",
  },
  {
    tipo: "cedula_representante",
    titulo: "Cédula del representante legal",
    detalle: "De quien firma ante el banco.",
  },
];

/** PDF o imagen raster. Devuelve el mime real o null si no es aceptable. */
export function tipoDeDocumento(buf: Buffer): string | null {
  if (buf.length > 4 && buf.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf";
  }
  return tipoDeImagen(buf);
}
