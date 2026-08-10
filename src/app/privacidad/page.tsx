import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SOPORTE_EMAIL } from "@/lib/soporte";
import { TERMINOS_VERSION } from "@/lib/legales";

export const metadata: Metadata = {
  title: "Política de privacidad — ArmorPay",
  description: "Qué datos guarda ArmorPay, para qué, y qué no hacemos con ellos.",
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold tracking-tight text-tinta">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-tinta-suave">{children}</div>
    </section>
  );
}

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue hover:text-tinta">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        ArmorPay
      </Link>

      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-tinta">
        Política de privacidad
      </h1>
      <p className="mt-2 text-sm text-tinta-tenue">
        Versión {TERMINOS_VERSION}. En cristiano: qué guardamos, para qué, y qué no hacemos con
        tus datos.
      </p>

      <Seccion titulo="Qué datos guardamos y por qué">
        <p>
          <strong>Del comercio:</strong> razón social, RIF, datos de contacto, los documentos del
          expediente de afiliación (los exige el proceso con el banco) y el logo. Sirven para
          operar tu cuenta y tramitar tu afiliación — nada más.
        </p>
        <p>
          <strong>De los pagos:</strong> lo que el banco reporta de cada crédito a tu cuenta
          (monto, referencia, banco emisor, teléfono o cédula del pagador cuando el banco lo
          incluye). Es la materia prima de la validación: sin esos datos no hay confirmación.
        </p>
        <p>
          <strong>De los usuarios:</strong> usuario, nombre, correo (si lo diste) y registros de
          operación (quién cobró qué y cuándo). Las contraseñas se guardan con hash bcrypt —
          nosotros tampoco podemos leerlas.
        </p>
      </Seccion>

      <Seccion titulo="Cómo lo protegemos">
        <p>
          Cada comercio ve exclusivamente lo suyo: el aislamiento entre comercios está en el
          corazón del sistema y se prueba de forma automatizada. Las credenciales bancarias se
          cifran (AES-256-GCM) y jamás se muestran completas. Todo el tráfico va por HTTPS.
        </p>
      </Seccion>

      <Seccion titulo="Qué NO hacemos con tus datos">
        <p>
          No los vendemos, no los alquilamos y no los compartimos con terceros — con una sola
          excepción: el banco, que es parte necesaria de la validación y de tu afiliación. No
          hacemos perfiles publicitarios ni usamos tus datos de pago para nada distinto de
          confirmarte tus cobros.
        </p>
      </Seccion>

      <Seccion titulo="Datos del pagador final">
        <p>
          Si pagas en un comercio que usa ArmorPay, los datos que vemos son los que tu banco
          reporta del pago (y, si usas el Botón de Pago, los que tecleas para autorizarlo: van
          directo al banco). Se usan únicamente para confirmar ese pago al comercio y quedan en su
          registro de cobros, como en cualquier punto de venta.
        </p>
      </Seccion>

      <Seccion titulo="Retención y salida">
        <p>
          Los registros de pagos y cobros se conservan mientras la cuenta exista: son el historial
          contable del comercio. Si cierras tu cuenta, puedes pedirnos la eliminación de tus datos
          a{" "}
          <a href={`mailto:${SOPORTE_EMAIL}`} className="font-medium text-marca-700 hover:underline">
            {SOPORTE_EMAIL}
          </a>{" "}
          — se elimina todo salvo lo que una obligación legal o contable nos exija conservar.
        </p>
      </Seccion>

      <Seccion titulo="Contacto">
        <p>
          Cualquier duda sobre tus datos:{" "}
          <a href={`mailto:${SOPORTE_EMAIL}`} className="font-medium text-marca-700 hover:underline">
            {SOPORTE_EMAIL}
          </a>
          . Consulta también los{" "}
          <Link href="/terminos" className="font-medium text-marca-700 hover:underline">
            términos del servicio
          </Link>
          .
        </p>
      </Seccion>
    </main>
  );
}
