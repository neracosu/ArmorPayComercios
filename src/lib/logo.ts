/**
 * Logos de comercio: la URL pública y la validación de lo que se sube.
 *
 * La validación es por BYTES MÁGICOS, no por la extensión ni por el
 * Content-Type que declare el navegador — los dos se falsifican gratis.
 * Solo raster: un SVG puede llevar scripts y lo serviríamos desde nuestro
 * propio dominio (XSS servido por nosotros mismos).
 */

export const LOGO_MAX_BYTES = 512 * 1024;

export interface OrgConLogo {
  id: string;
  logoMime: string | null;
  logoUpdatedAt: Date | null;
}

/** URL cacheable del logo, o null si el comercio no cargó ninguno. */
export function logoUrlDe(org: OrgConLogo | null | undefined): string | null {
  if (!org?.logoMime) return null;
  const v = org.logoUpdatedAt ? org.logoUpdatedAt.getTime() : 0;
  return `/api/logo/${org.id}?v=${v}`;
}

/** Tipo real del archivo según sus primeros bytes, o null si no es aceptable. */
export function tipoDeImagen(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length > 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return "image/png";
    }
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      buf.subarray(0, 4).toString("ascii") === "RIFF" &&
      buf.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return "image/webp";
    }
  }
  return null;
}
