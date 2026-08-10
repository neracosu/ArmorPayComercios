import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SOPORTE_EMAIL } from "@/lib/soporte";
import { TERMINOS_VERSION } from "@/lib/legales";

export const metadata: Metadata = {
  title: "Términos del servicio — ArmorPay",
  description: "Condiciones de uso de la plataforma de validación de pagos ArmorPay.",
};

/**
 * Términos honestos y en cristiano: dicen lo que el producto de verdad hace
 * y lo que NO hace (custodiar fondos, regla innegociable del proyecto).
 * Redacción de producto, no dictamen legal — el gate G0 (opinión legal del
 * plan maestro) sigue su curso y puede refinarlos; por eso van versionados.
 */

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold tracking-tight text-tinta">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-tinta-suave">{children}</div>
    </section>
  );
}

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue hover:text-tinta">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        ArmorPay
      </Link>

      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-tinta">
        Términos del servicio
      </h1>
      <p className="mt-2 text-sm text-tinta-tenue">
        Versión {TERMINOS_VERSION}. Aplican al usar la plataforma, el panel y la API de ArmorPay
        (armorpay.net).
      </p>

      <Seccion titulo="Qué es ArmorPay">
        <p>
          ArmorPay es una <strong>plataforma de validación de pagos</strong>: le confirma a tu
          comercio, contra la información que reporta tu banco, que un pago móvil o una
          transferencia llegó a tu cuenta. También te da herramientas de operación (cajas, turnos,
          cierres) y de cobro en línea (página de pago, API, Botón de Pago C2P del banco).
        </p>
      </Seccion>

      <Seccion titulo="Qué NO hacemos">
        <p>
          <strong>Nunca custodiamos ni movemos tu dinero.</strong> Los pagos van directo de tu
          cliente a la cuenta bancaria de tu comercio; nosotros solo confirmamos que llegaron. No
          somos un banco ni procesamos fondos, y no podemos revertir, retener ni redirigir un pago.
        </p>
      </Seccion>

      <Seccion titulo="Tu cuenta y tus credenciales bancarias">
        <p>
          El servicio es para personas jurídicas con cuenta bancaria a nombre de la empresa. Al
          registrarte declaras que los datos y documentos que subes son reales y que estás
          autorizado a actuar por el comercio.
        </p>
        <p>
          Las credenciales que el banco le emite a tu comercio (Llave de Trabajo, credenciales del
          Identificador de Pagos) se usan exclusivamente para validar y cobrar tus pagos. Se
          guardan cifradas, no se muestran completas nunca, y solo las conoce el proceso que habla
          con el banco.
        </p>
        <p>
          Eres responsable de las personas que operan tus cajas y de mantener tus contraseñas a
          resguardo. Puedes desactivar una caja o resetear su clave en cualquier momento desde tu
          panel.
        </p>
      </Seccion>

      <Seccion titulo="La validación y sus límites">
        <p>
          Una validación refleja lo que el banco reporta en ese momento. Si el banco reporta con
          retraso, o su servicio está caído, la confirmación puede demorar — el panel siempre te
          dice con franqueza qué está esperando. La decisión de despachar un producto es del
          comercio.
        </p>
        <p>
          El antifraude de doble cobro marca los cobros repetidos para tu revisión, y permite
          insistir con confirmación explícita porque a veces un doble cobro es legítimo. La
          revisión de esos casos es tuya.
        </p>
      </Seccion>

      <Seccion titulo="Planes y facturación">
        <p>
          Los planes, sus límites y sus precios están publicados en la portada. El plan de prueba
          es gratuito. Los cargos por excedente se calculan por cobro validado según el plan
          vigente. Podemos ajustar precios avisando con anticipación razonable.
        </p>
      </Seccion>

      <Seccion titulo="Suspensión y salida">
        <p>
          Podemos suspender una cuenta por uso fraudulento, por datos falsos en el alta o por
          impago. Puedes irte cuando quieras: tu dinero nunca pasó por nosotros, así que no hay
          fondos que liquidar — solo se cierra el acceso a la plataforma.
        </p>
      </Seccion>

      <Seccion titulo="Cambios y contacto">
        <p>
          Si cambiamos estos términos de forma sustantiva, subimos la versión y te lo avisamos por
          los canales de la plataforma. Dudas y reclamos:{" "}
          <a href={`mailto:${SOPORTE_EMAIL}`} className="font-medium text-marca-700 hover:underline">
            {SOPORTE_EMAIL}
          </a>
          .
        </p>
        <p>
          Consulta también nuestra{" "}
          <Link href="/privacidad" className="font-medium text-marca-700 hover:underline">
            política de privacidad
          </Link>
          .
        </p>
      </Seccion>
    </main>
  );
}
