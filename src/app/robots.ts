import type { MetadataRoute } from "next";

/**
 * Lo público se indexa; lo operativo y las páginas de pago, jamás — un link
 * de pago en un buscador sería un dato de una compra ajena.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/pay/", "/api/", "/validar", "/turno", "/comercio/", "/plataforma/", "/login"],
    },
    sitemap: "https://armorpay.net/sitemap.xml",
  };
}
