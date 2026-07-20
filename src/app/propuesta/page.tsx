import Link from "next/link";
import FormularioPropuesta from "./FormularioPropuesta";

export const metadata = {
  title: "Pedir una propuesta — ArmorPay",
  description:
    "Cuéntanos cuántas cajas tienes y en qué banco cobras, y armamos una propuesta concreta.",
};

export default function PropuestaPage() {
  return (
    <div className="bg-white">
      <header className="border-b border-tinta-borde">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-lg font-bold tracking-tight text-tinta">
            Armor<span className="text-marca-700">Pay</span>
          </Link>
          <Link
            href="/login"
            className="rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-tinta-fondo"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          Cuéntanos cómo cobras hoy
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-tinta-suave">
          Con estos datos armamos una propuesta concreta, no una plantilla. Si
          por lo que nos cuentas todavía no podemos ayudarte, te lo decimos.
        </p>

        <div className="mt-9">
          <FormularioPropuesta />
        </div>

        <p className="mt-6 text-sm text-tinta-tenue">
          Usamos estos datos solo para contactarte por esta solicitud.
        </p>
      </main>
    </div>
  );
}
