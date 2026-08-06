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

        <div className="mt-6 max-w-xl rounded-card border border-tinta-borde bg-tinta-fondo/60 p-5">
          <p className="text-sm font-medium text-tinta">Antes de escribirnos, verifica que cumples esto:</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-tinta-suave">
            <li>
              · Tu negocio es una <strong>persona jurídica</strong> (RIF J o G).
              El servicio no funciona con cuentas personales.
            </li>
            <li>
              · Cobras (o vas a cobrar) en una <strong>cuenta bancaria a nombre
              de la empresa</strong> en un banco que soportamos.
            </li>
            <li>
              · Puedes tramitar con tu banco la afiliación de pago móvil
              empresarial — te acompañamos en ese paso.
            </li>
          </ul>
        </div>

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
