import type { Config } from "tailwindcss";

/**
 * Sistema visual de ArmorPay.
 *
 * Inspiración: Nequi. Se toma el MECANISMO, no los valores — Nequi no publica
 * ni sus hex ni su tipografía. El mecanismo, que comparte con Nubank y Wise:
 * un solo color saturado deliberadamente no-bancario, aplicado con disciplina,
 * sobre una base neutra que carga la densidad de información. El frescor vive
 * en un acento controlado, no en toda la superficie.
 *
 * Se evita morado y fucsia: ese territorio ya lo ocupan Nequi y Nubank en la
 * percepción del usuario latinoamericano, y usarlo daría confusión, no
 * diferenciación. El acento es teal — fresco, poco ocupado en fintech de la
 * región, y con suficiente contraste sobre la base oscura y sobre blanco.
 *
 * La restricción que manda sobre la estética: la cajera lee un monto y un
 * estado en MENOS DE UN SEGUNDO, con un cliente esperando, durante ocho horas.
 * Por eso los estados nunca se comunican solo con color, los montos usan cifras
 * tabulares, y todo par de colores cumple WCAG AA (4.5:1) con holgura.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Base neutra: estructura y texto. Carga la densidad.
        tinta: {
          DEFAULT: "#0F172A",
          suave: "#1E293B",
          tenue: "#475569",
          borde: "#E2E8F0",
          fondo: "#F8FAFC",
        },
        // Acento de marca. Un solo color, con disciplina.
        marca: {
          50: "#ECFEFF",
          100: "#CFFAFE",
          400: "#22D3EE",
          500: "#06B6D4",
          600: "#0891B2", // sobre blanco cumple AA en texto grande y en botones
          700: "#0E7490", // para texto normal sobre blanco
          900: "#164E63",
        },
        // Estados: separados del color de marca a propósito. Un pago confirmado
        // no debe pintarse del color de la marca — se confundirían.
        ok: { DEFAULT: "#15803D", suave: "#DCFCE7" },
        alerta: { DEFAULT: "#B45309", suave: "#FEF3C7" },
        error: { DEFAULT: "#B91C1C", suave: "#FEE2E2" },
      },
      fontFamily: {
        sans: ["var(--fuente-sans)", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        // Moderados en botones y tarjetas; mínimos en filas de tabla. Los radios
        // grandes de app móvil se ven a juguete en una grilla operativa.
        card: "12px",
        control: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
