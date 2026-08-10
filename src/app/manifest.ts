import type { MetadataRoute } from "next";

/**
 * PWA mínima: honra el "instalable en la PC de la caja" de la portada. El
 * icono SVG escala a cualquier tamaño; `standalone` abre sin barra del
 * navegador, que es como una caja quiere vivir.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ArmorPay — Plataforma de validación de pagos",
    short_name: "ArmorPay",
    description:
      "Confirma en segundos que el pago móvil llegó a tu cuenta, con control por caja, turnos y cierre.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#F1F5F9",
    theme_color: "#0F172A",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
