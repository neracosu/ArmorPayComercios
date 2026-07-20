import Link from "next/link";
import {
  ArrowRight,
  Check,
  Store,
  Building2,
  ShieldCheck,
  Users,
  ClipboardList,
  X,
} from "lucide-react";

/**
 * Portada pública.
 *
 * El sujeto no es "un SaaS de pagos": es el instante en que un cliente muestra
 * una captura y la cajera tiene que decidir si entrega la mercancía. Todo lo
 * demás en esta página cuelga de ese momento.
 *
 * Regla de contenido: NADA inventado. Sin testimonios, sin logos de clientes,
 * sin cantidad de comercios, sin precios — el segmento y el tarifario todavía
 * no están decididos. Lo único que se afirma es lo que se puede sostener.
 *
 * Posicionamiento: "plataforma de validación de pagos", nunca "pasarela" ni
 * "gateway" — el regulador usa esa palabra para una categoría con obligaciones.
 */

export const metadata = {
  title: "ArmorPay — Validá el pago móvil antes de entregar la mercancía",
  description:
    "Plataforma venezolana de validación de pago móvil. Confirmá contra el banco en segundos, con control por caja, turnos y cierre. No custodiamos fondos.",
};

const PARA_QUIEN = [
  {
    icono: Store,
    titulo: "Comercio de una o dos cajas",
    texto:
      "Bodegón, farmacia, tienda de barrio. Dejás de confiar en la captura y de perder minutos revisando el teléfono con el cliente esperando.",
    puntos: ["Validación por referencia", "Historial de lo cobrado", "Instalable en la PC de la caja"],
  },
  {
    icono: Building2,
    titulo: "Cadena con varias sucursales",
    texto:
      "Acá es donde el resto de las herramientas se queda corto. Cada caja ve lo suyo, cada turno cierra con su comprobante, y vos ves todo consolidado.",
    puntos: ["Aislamiento por caja y sucursal", "Turnos con cierre Z", "Alarma de doble cobro"],
  },
];

const CAPACIDADES = [
  {
    icono: Users,
    titulo: "Cada caja ve lo suyo",
    texto:
      "Una cajera no ve las operaciones de las demás ni las de otra sucursal. Cuando algo no cuadra, se sabe en qué caja pasó.",
  },
  {
    icono: ClipboardList,
    titulo: "Turnos que cierran",
    texto:
      "Se abre turno, se cobra, se cierra con un comprobante del sistema. Sin conteo a ciegas: son pagos digitales, el total ya está.",
  },
  {
    icono: ShieldCheck,
    titulo: "Un pago se cobra una sola vez",
    texto:
      "Si alguien intenta cobrar dos veces el mismo pago, el sistema avisa antes de confirmar y deja el caso marcado para revisión.",
  },
];

export default function Portada() {
  return (
    <div className="bg-white">
      {/* ── Barra ── */}
      <header className="border-b border-tinta-borde">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-display text-lg font-bold tracking-tight text-tinta">
            Armor<span className="text-marca-700">Pay</span>
          </span>
          <Link
            href="/login"
            className="rounded-control px-3 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-tinta-fondo"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* ── Hero: el momento de la duda ── */}
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-16 sm:pt-24">
        <p className="font-medium uppercase tracking-[0.2em] text-marca-700 text-xs">
          Plataforma de validación de pagos
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-tinta sm:text-6xl">
          &ldquo;Ya te pagué, mira la captura.&rdquo;
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-tinta-suave">
          Y tu cajera tiene que decidir en ese momento: entrega la mercancía o
          hace esperar al cliente. Cincuenta veces al día.
        </p>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-tinta-suave">
          ArmorPay le contesta esa pregunta{" "}
          <strong className="font-semibold text-tinta">
            preguntándole al banco, no a la pantalla del cliente
          </strong>
          .
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/propuesta"
            className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-5 py-3 font-medium text-white transition-colors hover:bg-marca-900"
          >
            Pedir una propuesta
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href="#como-funciona"
            className="text-sm font-medium text-tinta-suave underline underline-offset-4 hover:text-tinta"
          >
            Ver cómo funciona
          </a>
        </div>
      </section>

      {/* ── Elemento firma: la captura contra el banco ── */}
      <section id="como-funciona" className="bg-tinta px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Una captura se edita en treinta segundos.
            <br />
            <span className="text-marca-400">Un movimiento bancario, no.</span>
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {/* Lo que muestra el cliente */}
            <div className="rounded-card border border-white/10 bg-white/[0.04] p-6">
              <p className="flex items-center gap-2 text-sm font-medium text-white/50">
                <X className="h-4 w-4" aria-hidden />
                Lo que te muestran
              </p>
              <div className="mt-5 rounded-control bg-white/[0.07] p-5">
                <p className="text-xs uppercase tracking-wider text-white/40">
                  Pago móvil enviado
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">Bs 36.846,69</p>
                <p className="mt-3 text-sm text-white/60">Referencia 890365344</p>
                <p className="text-sm text-white/60">Hoy, 15:54</p>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-white/50">
                Una imagen. Puede ser real, puede ser de ayer, puede estar
                editada, puede ser de otro comercio.
              </p>
            </div>

            {/* Lo que dice el banco */}
            <div className="rounded-card border border-marca-500/40 bg-marca-500/[0.08] p-6">
              <p className="flex items-center gap-2 text-sm font-medium text-marca-400">
                <Check className="h-4 w-4" aria-hidden />
                Lo que dice tu banco
              </p>
              <div className="mt-5 rounded-control bg-white/[0.07] p-5">
                <p className="text-xs uppercase tracking-wider text-marca-400">
                  Crédito recibido en tu cuenta
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">Bs 36.846,69</p>
                <p className="mt-3 text-sm text-white/60">Referencia 890365344</p>
                <p className="text-sm text-white/60">Banco emisor 0174 · 15:54</p>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-white/70">
                El movimiento en tu cuenta. Consultado en vivo contra el banco,
                no una notificación que puede tardar.
              </p>
            </div>
          </div>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-white/50">
            La cajera teclea los últimos dígitos de la referencia. Si el dinero
            entró, aparece en segundos con el monto y el banco de origen. Si no
            entró, no aparece — y esa es toda la respuesta que necesita.
          </p>
        </div>
      </section>

      {/* ── Lo que nos separa del resto ── */}
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <h2 className="max-w-2xl font-display text-2xl font-bold tracking-tight text-tinta sm:text-3xl">
          Verificar el pago es la mitad del trabajo. La otra mitad es la caja.
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-tinta-suave">
          Las herramientas del mercado te dicen si el pago llegó y ahí terminan.
          Sirven para una tienda en línea. Pero un comercio con mostrador tiene
          cajeras, turnos, cierres y un dueño que necesita saber quién cobró qué.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {CAPACIDADES.map((c) => (
            <div key={c.titulo} className="border-t-2 border-marca-600 pt-5">
              <c.icono className="h-5 w-5 text-marca-700" aria-hidden />
              <h3 className="mt-3 font-display font-bold tracking-tight text-tinta">
                {c.titulo}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-tinta-suave">{c.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Para quién ── */}
      <section className="border-y border-tinta-borde bg-tinta-fondo px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl font-bold tracking-tight text-tinta sm:text-3xl">
            Para quién lo construimos
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {PARA_QUIEN.map((p) => (
              <div
                key={p.titulo}
                className="rounded-card border border-tinta-borde bg-white p-7"
              >
                <p.icono className="h-6 w-6 text-marca-700" aria-hidden />
                <h3 className="mt-4 font-display text-lg font-bold tracking-tight text-tinta">
                  {p.titulo}
                </h3>
                <p className="mt-2 leading-relaxed text-tinta-suave">{p.texto}</p>
                <ul className="mt-5 space-y-2">
                  {p.puntos.map((punto) => (
                    <li key={punto} className="flex items-start gap-2 text-sm text-tinta-suave">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-marca-700" aria-hidden />
                      {punto}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Lo que NO hacemos: la confianza se gana siendo explícito ── */}
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <h2 className="font-display text-2xl font-bold tracking-tight text-tinta sm:text-3xl">
          Tu dinero nunca pasa por nosotros
        </h2>
        <div className="mt-6 grid max-w-3xl gap-4 text-tinta-suave sm:grid-cols-2">
          <p className="leading-relaxed">
            El cliente le paga <strong className="font-semibold text-tinta">a tu cuenta</strong>,
            directo, como lo hace hoy. Nosotros leemos tu cuenta para confirmarte
            que el dinero llegó.
          </p>
          <p className="leading-relaxed">
            No custodiamos fondos, no los movemos y no somos parte de la
            transacción. Si mañana dejás de usarnos, tu plata siguió siempre en
            tu banco.
          </p>
        </div>
      </section>

      {/* ── Cierre ── */}
      <section id="propuesta" className="border-t border-tinta-borde bg-tinta-fondo px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-tinta sm:text-3xl">
            Contanos cómo cobrás hoy
          </h2>
          <p className="mt-4 leading-relaxed text-tinta-suave">
            Cuántas cajas tenés, en qué banco cobrás y qué se te complica. Con
            eso armamos una propuesta concreta, sin plantillas.
          </p>
          <Link
            href="/propuesta"
            className="mt-8 inline-flex items-center gap-2 rounded-control bg-marca-700 px-5 py-3 font-medium text-white transition-colors hover:bg-marca-900"
          >
            Pedir una propuesta
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <p className="mt-4 text-sm text-tinta-tenue">
            Hoy operamos con el Banco Digital de los Trabajadores. Si cobrás en
            otro banco, escribinos igual y te decimos con franqueza si podemos.
          </p>
        </div>
      </section>

      <footer className="border-t border-tinta-borde px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 text-sm text-tinta-tenue sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display font-bold text-tinta">ArmorPay</span>
          <span>Plataforma de validación de pagos · Venezuela</span>
        </div>
      </footer>
    </div>
  );
}
