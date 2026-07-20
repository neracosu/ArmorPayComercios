import type { Metadata } from "next";
import { Inter, Archivo } from "next/font/google";
import "./globals.css";

// Inter: cifras tabulares nativas y buena distinción entre 1/l/I y 0/O, que
// importa cuando lo que se lee son montos y referencias de transacción.
const inter = Inter({
  subsets: ["latin"],
  variable: "--fuente-sans",
  display: "swap",
});

// Archivo para titulares: más ancha y con peso institucional, sin caer en el
// serif de alto contraste que hoy usan todos. Solo en la portada — el panel
// operativo no necesita personalidad, necesita que se lea rápido.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--fuente-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ArmorPay — Plataforma de validación de pagos",
  description:
    "Confirmá en segundos que el pago móvil llegó a tu cuenta, con control por caja, turnos y cierre.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${archivo.variable}`}>
      <body className="min-h-screen bg-tinta-fondo font-sans text-tinta antialiased">
        {children}
      </body>
    </html>
  );
}
