import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArmorPay — Plataforma de validación de pagos",
  description:
    "Confirmá en segundos que el pago móvil llegó a tu cuenta, con control por caja, turnos y cierre.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
