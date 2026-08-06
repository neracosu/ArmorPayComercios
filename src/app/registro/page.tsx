import Link from "next/link";
import FormularioRegistro from "./FormularioRegistro";

export const metadata = {
  title: "Crear cuenta — ArmorPay",
  description:
    "Registra tu comercio, sube tus recaudos y sigue el estatus de tu activación paso a paso.",
};

export default function RegistroPage() {
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
          Crea la cuenta de tu comercio
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-tinta-suave">
          En dos minutos tienes tu cuenta. Después subes los recaudos, registras
          tus cuentas bancarias y sigues el estatus de tu activación —
          todo desde tu panel, sin llamadas ni correos perdidos.
        </p>

        {/* El proceso completo, dicho ANTES de pedir un solo dato. */}
        <ol className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          {[
            {
              n: "1",
              t: "Crea tu cuenta",
              d: "Dos minutos: tu empresa, tu RIF y tu usuario. Gratis y sin compromiso.",
            },
            {
              n: "2",
              t: "Arma tu expediente",
              d: "Sube tus documentos, registra tus cuentas bancarias y pega tu llave del banco — todo desde tu panel.",
            },
            {
              n: "3",
              t: "Nosotros aprobamos",
              d: "Revisamos cada documento (si algo falta, ves el motivo exacto), verificamos tu llave contra el banco y aprobamos tus cuentas.",
            },
            {
              n: "4",
              t: "A cobrar",
              d: "Comercio activo: tus cajas validan pagos al instante y tu tienda en línea cobra con nuestra API.",
            },
          ].map((paso) => (
            <li key={paso.n} className="flex gap-3 rounded-card border border-tinta-borde bg-white p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marca-700 text-sm font-bold text-white">
                {paso.n}
              </span>
              <div>
                <p className="font-medium text-tinta">{paso.t}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-tinta-tenue">{paso.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 max-w-xl rounded-card border border-tinta-borde bg-tinta-fondo/60 p-5">
          <p className="text-sm font-medium text-tinta">Vas a necesitar:</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-tinta-suave">
            <li>· Ser <strong>persona jurídica</strong> (RIF J o G) — no funciona con cuentas personales.</li>
            <li>· RIF, registro mercantil y cédula del representante (se suben después, en PDF o foto).</li>
            <li>· Una cuenta bancaria a nombre de la empresa en un banco que soportamos.</li>
            <li className="text-tinta">
              · ¿No tienes nada tramitado con el banco? <strong>Nosotros
              gestionamos tu afiliación completa</strong> — lo eliges dentro de
              tu panel.
            </li>
          </ul>
        </div>

        <div className="relative mt-9 max-w-xl">
          <FormularioRegistro />
        </div>

        <p className="mt-8 text-sm text-tinta-tenue">
          ¿Prefieres que te contactemos nosotros?{" "}
          <Link href="/propuesta" className="font-medium text-marca-700 hover:underline">
            Pide una propuesta
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
