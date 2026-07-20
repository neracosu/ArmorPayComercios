import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter: cifras tabulares nativas y buena distinción entre 1/l/I y 0/O, que
// importa cuando lo que se lee son montos y referencias de transacción.
const inter = Inter({
  subsets: ["latin"],
  variable: "--fuente-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ArmorPay — Plataforma de validación de pagos",
  description:
    "Confirmá en segundos que el pago móvil llegó a tu cuenta, con control por caja, turnos y cierre.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-tinta-fondo font-sans text-tinta antialiased">
        {children}
      </body>
    </html>
  );
}
