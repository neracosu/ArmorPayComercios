import Link from "next/link";
import { SOPORTE_EMAIL } from "@/lib/soporte";

export const metadata = {
  title: "API de ArmorPay — documentación para integradores",
  description:
    "Cobra en tu web con validación bancaria al instante: guía de integración paso a paso, referencia de la API v1, checkout alojado, plugin WooCommerce y webhooks firmados.",
};

/**
 * Documentación pública de la API v1. Una sola página, sin framework de docs:
 * el contrato es chico y esto se lee de arriba a abajo. TODO lo que dice acá
 * sale de la implementación real — si algo diverge, es un bug de docs.
 *
 * Estructura (pedida por Neri 2026-08-12, «que un comercio logre la
 * implementación sin escribirnos»): primero la guía (antes de empezar → elegir
 * vía → flujo completo con curl), después la referencia endpoint a endpoint,
 * y al final el checklist de salida a producción.
 */

const encabezado = "font-display text-xl font-bold tracking-tight text-tinta";
const codigo =
  "mt-3 overflow-x-auto rounded-card border border-tinta-borde bg-tinta p-4 text-sm leading-relaxed text-white";

function Metodo({ verbo, ruta }: { verbo: string; ruta: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 font-mono text-sm">
      <span
        className={`rounded-control px-2 py-0.5 text-xs font-bold ${
          verbo === "GET" ? "bg-ok-suave text-ok" : "bg-marca-700/10 text-marca-700"
        }`}
      >
        {verbo}
      </span>
      <span className="text-tinta">{ruta}</span>
    </p>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marca-700 font-display text-sm font-bold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-tinta">{titulo}</p>
        <div className="mt-1 text-sm leading-relaxed text-tinta-suave">{children}</div>
      </div>
    </li>
  );
}

export default function DocsApiPage() {
  return (
    <div className="bg-white">
      <header className="border-b border-tinta-borde">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-lg font-bold tracking-tight text-tinta">
            Armor<span className="text-marca-700">Pay</span>
          </Link>
          <Link
            href="/registro"
            className="rounded-control bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-900"
          >
            Crear cuenta
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-medium uppercase tracking-widest text-marca-700">
          Documentación · API v1
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-tinta">
          Cobra en tu web con validación bancaria al instante
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-tinta-suave">
          Tu cliente paga por pago móvil o Botón de Pago{" "}
          <strong className="text-tinta">directo a TU cuenta bancaria</strong> — el dinero
          nunca pasa por nosotros. Lo que hace ArmorPay es confirmar contra el banco, en
          segundos, que ese pago llegó, alcanza y no se usó antes. Tu pedido se confirma
          cuando el banco confirma — nunca antes.
        </p>

        <nav className="mt-6 flex flex-wrap gap-1.5 text-sm" aria-label="Secciones">
          {[
            ["#empezar", "Antes de empezar"],
            ["#vias", "Las 3 vías"],
            ["#flujo", "El flujo completo"],
            ["#auth", "Autenticación"],
            ["#intents", "Cobros (intents)"],
            ["#referencia", "Validar referencia"],
            ["#c2p", "Cobro C2P"],
            ["#rate", "Tasa BCV"],
            ["#banks", "Bancos"],
            ["#pay", "Checkout alojado"],
            ["#woocommerce", "WooCommerce"],
            ["#webhooks", "Webhooks"],
            ["#errores", "Errores"],
            ["#checklist", "Checklist"],
          ].map(([href, texto]) => (
            <a
              key={href}
              href={href}
              className="rounded-control border border-tinta-borde px-2.5 py-1 text-tinta-suave hover:bg-tinta-fondo"
            >
              {texto}
            </a>
          ))}
        </nav>

        {/* ── Antes de empezar ── */}
        <section id="empezar" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Antes de empezar</h2>
          <ol className="mt-4 space-y-4">
            <Paso n={1} titulo="Tu comercio tiene que estar ACTIVO">
              El alta se hace una sola vez en{" "}
              <a href="/registro" className="font-medium text-marca-700 hover:underline">
                armorpay.net/registro
              </a>
              : subes tus documentos, registras la cuenta bancaria de tu empresa y
              nosotros la verificamos contra el banco. Mientras tu comercio no esté
              activo, la API responde 401 a todo — no pierdas tiempo depurando tu
              código si aún estás en revisión.
            </Paso>
            <Paso n={2} titulo="Crea tu llave de API">
              En tu panel: <strong className="text-tinta">API → Crear llave</strong>. Se
              muestra UNA sola vez — guárdala en la configuración de tu servidor. Empieza
              con <code className="text-tinta">ak_live_</code>.
            </Paso>
            <Paso n={3} titulo="Registra tu webhook (recomendado)">
              En <strong className="text-tinta">API → Webhooks</strong>: pon la URL de tu
              servidor y guarda el secreto (<code className="text-tinta">whsec_...</code>).
              Es la vía en la que tu tienda se entera de cada pago confirmado sin
              preguntar. Puedes integrar sin webhook usando{" "}
              <code className="text-tinta">GET /intents/&#123;id&#125;</code>, pero el
              webhook es lo que hace la confirmación instantánea.
            </Paso>
          </ol>
          <div className="mt-5 rounded-card border border-tinta-borde bg-tinta-fondo p-4 text-sm leading-relaxed text-tinta-suave">
            <p className="font-medium text-tinta">¿Cómo pruebo? (no hay modo sandbox)</p>
            <p className="mt-1.5">
              La API valida contra pagos reales del banco, así que la prueba honesta es
              un pago real chiquito: crea un intent de{" "}
              <strong className="text-tinta">1,00 Bs</strong>, paga por pago móvil a tu
              propia cuenta desde otro banco, y valida la referencia. Es un pago a tu
              propia empresa: no pierdes nada y pruebas el circuito completo, webhook
              incluido.
            </p>
          </div>
        </section>

        {/* ── Las 3 vías ── */}
        <section id="vias" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Las 3 vías de integración</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            De menos a más código. Las tres confirman con las mismas reglas — elige por
            comodidad, no por seguridad.
          </p>
          <div className="mt-4 overflow-x-auto rounded-card border border-tinta-borde">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-tinta-borde bg-tinta-fondo text-left">
                  <th className="px-4 py-2.5 font-medium text-tinta">Vía</th>
                  <th className="px-4 py-2.5 font-medium text-tinta">Código que escribes</th>
                  <th className="px-4 py-2.5 font-medium text-tinta">Úsala si…</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta-borde text-tinta-suave">
                <tr>
                  <td className="px-4 py-2.5">
                    <a href="#woocommerce" className="font-medium text-marca-700 hover:underline">
                      Plugin WooCommerce
                    </a>
                  </td>
                  <td className="px-4 py-2.5">Ninguno: instalar y pegar 2 valores</td>
                  <td className="px-4 py-2.5">Tu tienda es WordPress + WooCommerce.</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    <a href="#pay" className="font-medium text-marca-700 hover:underline">
                      Checkout alojado
                    </a>
                  </td>
                  <td className="px-4 py-2.5">1 llamada + 1 redirección</td>
                  <td className="px-4 py-2.5">
                    Cualquier carrito propio: nosotros ponemos el formulario de pago.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    <a href="#intents" className="font-medium text-marca-700 hover:underline">
                      API completa
                    </a>
                  </td>
                  <td className="px-4 py-2.5">Tu propio formulario + 2-3 llamadas</td>
                  <td className="px-4 py-2.5">
                    Quieres la experiencia 100% con tu marca, o cobras desde una app.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── El flujo completo ── */}
        <section id="flujo" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>El flujo completo, de punta a punta</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Sea cual sea la vía, por debajo siempre pasan estas cuatro cosas, en este
            orden:
          </p>
          <ol className="mt-4 space-y-4">
            <Paso n={1} titulo="Tu servidor crea el intent (el cobro que esperas)">
              Con el monto que TU sistema calculó — nunca un monto que declare el
              navegador del cliente. El intent vence a los 30 minutos.
            </Paso>
            <Paso n={2} titulo="Tu cliente paga">
              Por pago móvil a tu cuenta (y te da los últimos dígitos de la referencia
              del comprobante), o por Botón de Pago C2P (genera una clave en su banco y
              el débito es al instante).
            </Paso>
            <Paso n={3} titulo="ArmorPay valida contra el banco">
              El pago existe, el monto alcanza y esa referencia no se usó antes — ni en
              tu web ni en tus cajas físicas. Es el mismo árbitro antifraude para todos
              tus canales.
            </Paso>
            <Paso n={4} titulo="Tu tienda se entera y entrega">
              Por el webhook firmado (instantáneo) o consultando el intent. Cuando el
              status es CONFIRMED, entregas el pedido.
            </Paso>
          </ol>
          <p className="mt-5 leading-relaxed text-tinta-suave">
            En curl, la integración mínima con checkout alojado son DOS pasos:
          </p>
          <pre className={codigo}>{`# 1. Crear el intent (server-to-server, desde tu backend)
curl -X POST https://armorpay.net/api/v1/intents \\
  -H "Authorization: Bearer ak_live_TU_LLAVE" \\
  -H "Idempotency-Key: pedido-8812" \\
  -H "Content-Type: application/json" \\
  -d '{ "externalRef": "8812", "amountVES": "1450.00", "concepto": "Pedido 8812" }'

# → 201 { "intent": { "id": "cmm...", "status": "PENDING", ... } }

# 2. Redirigir al cliente a la página de pago
https://armorpay.net/pay/cmm...

# 3. (automático) Al confirmarse te llega el webhook intent.confirmed
#    — o consultas tú mismo:
curl https://armorpay.net/api/v1/intents/cmm... \\
  -H "Authorization: Bearer ak_live_TU_LLAVE"
# → 200 { "intent": { "status": "CONFIRMED", "method": "REFERENCIA", ... } }`}</pre>
        </section>

        {/* ── Autenticación ── */}
        <section id="auth" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Autenticación</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Todas las llamadas llevan tu llave en el header{" "}
            <code className="text-tinta">Authorization</code>. La llave es{" "}
            <strong className="text-tinta">secreta y solo de servidor</strong>: nunca la
            pongas en el navegador de tus clientes, en el código fuente visible de tu
            tienda ni en una app instalable. Si se te filtra, revócala y crea otra desde
            el panel — al instante.
          </p>
          <pre className={codigo}>{`Base:          https://armorpay.net/api/v1
Autorización:  Authorization: Bearer ak_live_...

Límites: 60 peticiones/min por llave · 15 intentos/5 min por IP
en validación de referencia. Al superarlos: 429 con Retry-After.

# La API es server-to-server: no hay CORS abierto. Si intentas llamarla
# con fetch() desde el navegador, fallará — y así debe ser: proteger tu
# llave es proteger tu dinero.`}</pre>
        </section>

        {/* ── Intents ── */}
        <section id="intents" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Cobros (intents)</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Un <em>intent</em> es un cobro que esperas recibir. Lo creas server-to-server
            con el monto que TÚ decides — la validación compara contra ese monto, nunca
            contra lo que declare el cliente final.
          </p>
          <div className="mt-4 space-y-1">
            <Metodo verbo="POST" ruta="/api/v1/intents" />
            <Metodo verbo="GET" ruta="/api/v1/intents/{id}" />
          </div>
          <pre className={codigo}>{`POST /api/v1/intents
Authorization: Bearer ak_live_...
Idempotency-Key: pedido-8812        # obligatorio: único por pedido
Content-Type: application/json

{
  "externalRef": "8812",            # el id del pedido en TU sistema
  "amountVES": "1450.00",           # máx. 2 decimales; string o número
  "concepto": "Tienda X pedido 8812"  # opcional, ≤40 tras sanear
}

# ¿Tus precios están en dólares? Manda amountUSD EN VEZ de amountVES:
# congelamos el monto en Bs con la tasa BCV del momento, y la validación
# acepta también USD × tasa vigente (el que paga con la tasa de hoy no falla).
# { "externalRef": "8812", "amountUSD": "25.00" }
# → el intent trae además amountUSD y exchangeRateUsed.

→ 201
{
  "intent": {
    "id": "cmm...",                 # úsalo para validar o redirigir a /pay
    "externalRef": "8812",
    "amountVES": "1450.00",
    "concepto": "Tienda X pedido 8812",
    "method": null,                 # REFERENCIA | C2P al confirmarse
    "status": "PENDING",            # ver ciclo de vida abajo
    "referencia": null,
    "overpaidVES": null,
    "expiresAt": "2026-08-06T21:30:00.000Z",
    "confirmedAt": null,
    "createdAt": "2026-08-06T21:00:00.000Z"
  }
}

# Reintentar con la MISMA Idempotency-Key devuelve el mismo intent (200):
# un timeout de red nunca duplica un cobro. Usa el id de TU pedido como
# key y el reintento sale gratis.

GET /api/v1/intents/{id}
→ 200 { "intent": { ...la misma forma... } }
# Consúltalo al volver el cliente a tu tienda o como respaldo del webhook.
# Es de lectura: consultarlo no cambia nada.`}</pre>
          <div className="mt-4 rounded-card border border-tinta-borde bg-tinta-fondo p-4 text-sm leading-relaxed text-tinta-suave">
            <p className="font-medium text-tinta">Ciclo de vida del intent</p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs text-tinta">
{`PENDING ──(pago validado)──────────→ CONFIRMED   (final: entrega el pedido)
   │
   └──(30 min sin confirmarse)─────→ EXPIRED     (final: crea uno nuevo)`}
            </pre>
            <p className="mt-2">
              CONFIRMED y EXPIRED son finales: un intent nunca se confirma dos veces ni
              «revive» después de vencer. Si el cliente quiere pagar un pedido vencido,
              crea un intent nuevo con otra Idempotency-Key (por ejemplo{" "}
              <code className="text-tinta">pedido-8812-2</code>).
            </p>
          </div>
        </section>

        {/* ── Validate reference ── */}
        <section id="referencia" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Validar una referencia</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Tu cliente ya pagó por pago móvil a tu cuenta y te da los últimos dígitos de
            la referencia de su comprobante (pídele 6 o más). Nosotros confirmamos que el
            pago <strong className="text-tinta">existe, alcanza y no se usó antes</strong>{" "}
            — el mismo árbitro antifraude que usan las cajas físicas.
          </p>
          <Metodo verbo="POST" ruta="/api/v1/intents/{id}/validate-reference" />
          <pre className={codigo}>{`{
  "referencia": "789123"            # 6 a 20 dígitos, del comprobante
}

→ 200 (confirmado)
{
  "intent": { ... "status": "CONFIRMED", "method": "REFERENCIA" ... },
  "pago": {
    "referencia": "000000789123",
    "banco": "BDT",                 # banco receptor
    "bancoPagador": "0134 · Banesco",
    "montoVES": "1450.00",
    "overpaidVES": null,            # sobrepago aceptado y registrado
    "fecha": "2026-08-06",
    "hora": "153000"
  }
}

Reglas de monto: se acepta un faltante de hasta max(1 Bs, 0.5%).
Subpago → 422 INSUFFICIENT_AMOUNT (con faltanteVES).
Sobrepago → se confirma y queda en overpaidVES.
Referencia ya cobrada (en caja o por otro intent) → 409 REFERENCE_ALREADY_USED.`}</pre>
          <div className="mt-4 rounded-card border border-tinta-borde bg-tinta-fondo p-4 text-sm leading-relaxed text-tinta-suave">
            <p className="font-medium text-tinta">
              404 PAYMENT_NOT_FOUND no siempre es un error del cliente
            </p>
            <p className="mt-1.5">
              La notificación del banco tarda unos segundos en llegarnos después de que
              tu cliente paga. Si validas en el instante siguiente al pago, puede
              responder 404. El patrón correcto: reintenta la misma llamada cada 5-10
              segundos durante 1-2 minutos antes de decirle al cliente que verifique su
              pago (nuestra página <code className="text-tinta">/pay</code> ya lo hace
              sola). Si tras 2 minutos sigue en 404, lo más probable es que el pago haya
              ido a otra cuenta.
            </p>
          </div>
        </section>

        {/* ── C2P ── */}
        <section id="c2p" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Cobro C2P (Botón de Pago)</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Cobro activo: tu cliente genera una <em>clave de pago</em> (OTP) desde la app
            o banca en línea de su banco, te la da junto a su celular y cédula, y el
            débito ocurre al instante — sin comprobantes ni referencias que copiar.
            Requiere que tu comercio tenga C2P habilitado (se tramita con nosotros; en tu
            panel se ve si ya lo tienes).
          </p>
          <Metodo verbo="POST" ruta="/api/v1/intents/{id}/c2p" />
          <pre className={codigo}>{`{
  "celular": "04121234567",         # 04(12|14|16|24|26) + 7 dígitos
  "bancoPagador": "0102",           # del catálogo C2P (ver Bancos)
  "cedula": "V12345678",
  "otp": "12345678"                 # clave dinámica que generó tu cliente
}

→ 200 confirmado: { "intent": {...CONFIRMED...}, "cobro": { "referencia", "montoComision", ... } }
→ 422 C2P_REJECTED: rechazo del banco, con "hint" en español y
  "retriable": true — puedes reintentar con una clave nueva
  mientras el intent no venza.
→ 502 BANK_UNAVAILABLE: el banco no respondió. NO asumas rechazo:
  verifica con tu cliente antes de reintentar.

El monto y el concepto salen del intent — el body nunca los lleva.
Pobla el select de bancos con GET /banks?service=c2p (los códigos del
catálogo C2P no siempre coinciden con los del BCV).`}</pre>
        </section>

        {/* ── Exchange rate ── */}
        <section id="rate" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Tasa BCV</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Fija tus precios con la misma tasa con la que nosotros congelamos y validamos:
            cero discrepancias entre tu carrito y el cobro.
          </p>
          <Metodo verbo="GET" ruta="/api/v1/exchange-rate" />
          <pre className={codigo}>{`→ 200
{ "currency": "USD/VES", "rate": "168.4200", "source": "BCV",
  "fetchedAt": "2026-08-06T14:00:00.000Z" }

# Sin tasa utilizable: 503 RATE_UNAVAILABLE — nunca inventamos una.`}</pre>
          <div className="mt-4 rounded-card border border-alerta/40 bg-alerta-suave/40 p-4 text-sm leading-relaxed text-tinta-suave">
            <p className="font-medium text-tinta">Cumplimiento en Venezuela</p>
            <p className="mt-1.5">
              Si tu catálogo muestra precios en divisas, la norma exige que el
              precio en <strong className="text-tinta">bolívares esté exhibido</strong> y
              que la conversión sea a <strong className="text-tinta">tasa oficial BCV</strong>,
              con la moneda y la tasa claramente informadas — nunca una tasa
              paralela, y nunca precios distintos según el método de pago.
              Nuestra página de pago ya lo resuelve en el paso de cobro (Bs como
              monto principal + «Ref. USD … · tasa oficial BCV …»); para tu
              catálogo, usa este endpoint y muestra ambos. Esto es una guía, no
              asesoría legal.
            </p>
          </div>
        </section>

        {/* ── Banks ── */}
        <section id="banks" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Bancos</h2>
          <Metodo verbo="GET" ruta="/api/v1/banks" />
          <pre className={codigo}>{`GET /api/v1/banks              # lista BCV — para mostrar el banco pagador
GET /api/v1/banks?service=c2p  # catálogo PROPIO del C2P — para poblar el
                               # select de un cobro C2P (sus códigos no
                               # siempre coinciden con los del BCV)

→ 200 { "service": "...", "banks": [{ "code": "0102", "name": "..." }] }`}</pre>
        </section>

        {/* ── Hosted checkout ── */}
        <section id="pay" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Checkout alojado (la vía rápida)</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Si no quieres construir el formulario: crea el intent y redirige (o abre en
            iframe) nuestra página de pago. Muestra tu razón social y tu logo, guía al
            cliente por referencia o C2P según lo que tu comercio tenga habilitado,
            reintenta sola mientras llega la notificación del banco, y confirma con las
            mismas reglas de la API.
          </p>
          <pre className={codigo}>{`Redirección:   https://armorpay.net/pay/{intentId}

# No lleva parámetros de retorno: la página no redirige de vuelta sola.
# Pon tú un enlace/botón «volver a la tienda» en tu página de gracias, o
# usa el iframe para quedarte en tu dominio:

En iframe, te avisamos por postMessage:
window.addEventListener("message", (e) => {
  const a = e.data?.armorpay;
  if (a?.event === "confirmed") { /* pagado: a.intentId, a.externalRef */ }
  if (a?.event === "expired")   { /* venció sin pagar */ }
});

# El postMessage es UX (cerrar el modal, mostrar el check): la señal de
# VERDAD para entregar el pedido es el webhook o GET /intents/{id}.
# Un navegador puede fabricar un postMessage; tu servidor no debe creerle.`}</pre>
        </section>

        {/* ── WooCommerce ── */}
        <section id="woocommerce" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Plugin WooCommerce</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Todo lo de arriba, sin escribir código: el plugin crea el intent al hacer el
            pedido, manda al cliente a la página de pago, recibe el webhook firmado y
            marca el pedido como pagado — con un respaldo por consulta cuando el cliente
            vuelve a la tienda.
          </p>
          <ol className="mt-4 space-y-4">
            <Paso n={1} titulo="Instala el plugin">
              <a
                href="/descargas/armorpay-woocommerce.zip"
                className="font-medium text-marca-700 hover:underline"
              >
                Descarga el .zip
              </a>{" "}
              y súbelo en <strong className="text-tinta">Plugins → Añadir nuevo → Subir
              plugin</strong>. Se actualiza solo cuando publicamos versiones nuevas.
            </Paso>
            <Paso n={2} titulo="Pega tus 2 valores">
              En <strong className="text-tinta">WooCommerce → Ajustes → Pagos →
              ArmorPay</strong>: tu <strong className="text-tinta">Llave de API</strong>{" "}
              (<code className="text-tinta">ak_live_...</code>) y el{" "}
              <strong className="text-tinta">Secreto del webhook</strong>{" "}
              (<code className="text-tinta">whsec_...</code>). El título y la descripción
              que ve tu cliente en el checkout también se editan ahí.
            </Paso>
            <Paso n={3} titulo="Registra el webhook apuntando a tu tienda">
              En tu panel de ArmorPay (<strong className="text-tinta">API → Webhooks</strong>),
              la URL es tu tienda más{" "}
              <code className="text-tinta">/?wc-api=armorpay</code> — por ejemplo{" "}
              <code className="text-tinta">https://mitienda.com/?wc-api=armorpay</code>.
              El secreto que te dé el panel es el que pegas en el paso 2.
            </Paso>
            <Paso n={4} titulo="Prueba con un pedido real de 1 Bs">
              Crea un producto de prueba, cómpralo tú mismo pagando 1 Bs a tu cuenta, y
              verifica que el pedido pase a «Procesando». Luego borra el producto.
            </Paso>
          </ol>
        </section>

        {/* ── Webhooks ── */}
        <section id="webhooks" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Webhooks firmados</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Registra tu URL en tu panel (<strong className="text-tinta">API → Webhooks</strong>)
            y te avisamos a tu servidor cada confirmación o vencimiento — con firma, para
            que verifiques que fuimos nosotros.
          </p>
          <pre className={codigo}>{`POST a tu URL
x-armorpay-timestamp: 1754516096        # epoch en segundos
x-armorpay-signature: hex(HMAC-SHA256(secreto, timestamp + "." + body))

{ "event": "intent.confirmed",          # o "intent.expired"
  "intent": { ...la misma forma de la API... } }

— Verificación en Node.js —
const crypto = require("node:crypto");
function verificar(secreto, timestamp, firma, bodyCrudo) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const esperada = crypto.createHmac("sha256", secreto)
    .update(timestamp + "." + bodyCrudo).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(firma));
}

— Verificación en PHP —
function verificar($secreto, $timestamp, $firma, $bodyCrudo) {
  if (abs(time() - (int)$timestamp) > 300) return false;
  $esperada = hash_hmac("sha256", $timestamp . "." . $bodyCrudo, $secreto);
  return hash_equals($esperada, $firma);
}

# Usa el body CRUDO (antes de parsear el JSON): re-serializarlo
# cambia bytes y la firma deja de coincidir.`}</pre>
          <div className="mt-4 rounded-card border border-tinta-borde bg-tinta-fondo p-4 text-sm leading-relaxed text-tinta-suave">
            <p className="font-medium text-tinta">Reglas de la casa</p>
            <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-tinta">Responde 2xx rápido</strong> (y procesa
                después si tu trabajo es lento). Sin 2xx, reintentamos 5 veces con espera
                creciente: 1 min, 5 min, 30 min, 2 h y 12 h — después la entrega queda
                marcada fallida y puedes reenviarla a mano desde tu panel.
              </li>
              <li>
                <strong className="text-tinta">Procesa una sola vez</strong>: entre
                reintentos y reenvíos, el mismo evento puede llegarte dos veces. Usa{" "}
                <code className="text-tinta">intent.id + event</code> como clave: si ya lo
                procesaste, responde 200 y no hagas nada.
              </li>
              <li>
                <strong className="text-tinta">¿Rotaste el secreto?</strong> Desde el
                panel puedes rotarlo cuando quieras; actualiza tu servidor en el momento —
                las entregas siguientes ya van firmadas con el nuevo.
              </li>
            </ul>
          </div>
        </section>

        {/* ── Errores ── */}
        <section id="errores" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Errores</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Toda respuesta de error trae un <code className="text-tinta">code</code>{" "}
            estable (programa contra él) y un <code className="text-tinta">message</code>{" "}
            en español (muéstralo si te sirve).
          </p>
          <div className="mt-4 overflow-x-auto rounded-card border border-tinta-borde">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-tinta-borde bg-tinta-fondo text-left">
                  <th className="px-4 py-2.5 font-medium text-tinta">HTTP</th>
                  <th className="px-4 py-2.5 font-medium text-tinta">code</th>
                  <th className="px-4 py-2.5 font-medium text-tinta">Qué hacer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta-borde text-tinta-suave">
                {[
                  ["401", "UNAUTHORIZED", "Revisa la llave: inválida, inactiva o el comercio no está activo."],
                  ["429", "RATE_LIMITED", "Espera lo que diga Retry-After y reintenta."],
                  ["400", "IDEMPOTENCY_KEY_REQUIRED", "Manda el header Idempotency-Key al crear intents."],
                  ["400", "VALIDATION / INVALID_AMOUNT", "El body no cumple el formato; el detalle viene en issues."],
                  ["404", "INTENT_NOT_FOUND", "Ese intent no existe (o no es tuyo)."],
                  ["410", "INTENT_EXPIRED", "Venció: crea un intent nuevo."],
                  ["404", "PAYMENT_NOT_FOUND", "El pago aún no llegó. Reintenta cada 5-10 s durante 1-2 min."],
                  ["422", "INSUFFICIENT_AMOUNT", "Subpago: faltanteVES dice cuánto falta."],
                  ["409", "AMBIGUOUS_REFERENCE", "Pide más dígitos de la referencia."],
                  ["409", "REFERENCE_ALREADY_USED", "Ese pago ya se cobró; cobradoPor dice dónde."],
                  ["422", "C2P_NOT_ENABLED", "El comercio no tiene C2P habilitado todavía."],
                  ["422", "C2P_REJECTED", "El banco rechazó: muestra hint y permite clave nueva."],
                  ["502", "BANK_UNAVAILABLE", "El banco no respondió: verifica antes de reintentar."],
                  ["422", "MERCHANT_NOT_READY", "El comercio no tiene cuentas activas."],
                  ["503", "RATE_UNAVAILABLE", "Sin tasa BCV utilizable: reintenta o cobra en VES."],
                ].map(([http, code, que]) => (
                  <tr key={code}>
                    <td className="px-4 py-2 font-mono text-xs">{http}</td>
                    <td className="px-4 py-2 font-mono text-xs text-tinta">{code}</td>
                    <td className="px-4 py-2">{que}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Checklist ── */}
        <section id="checklist" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Checklist antes de salir a producción</h2>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-tinta-suave">
            {[
              ["El monto lo calcula tu servidor", "y va en el intent. Nada del navegador del cliente decide cuánto se cobra."],
              ["La llave vive solo en tu servidor", "no en JavaScript del navegador, no en el repositorio público, no en una app."],
              ["Verificas la firma de cada webhook", "con el body crudo, y descartas timestamps de más de 5 minutos."],
              ["Entregas pedidos solo con CONFIRMED", "del webhook o de GET /intents/{id} — nunca por el postMessage ni porque el cliente 'volvió' a tu tienda."],
              ["Manejas PAYMENT_NOT_FOUND con reintentos", "la notificación del banco tarda segundos; no lo trates como fallo definitivo."],
              ["Procesas cada evento una sola vez", "mismo intent.id + event repetido = responder 200 sin repetir la entrega."],
              ["Hiciste una compra real de 1 Bs", "de punta a punta, webhook incluido, antes de anunciar el botón de pago."],
            ].map(([titulo, resto]) => (
              <li key={titulo} className="flex gap-2.5">
                <span className="mt-0.5 text-ok">✓</span>
                <span>
                  <strong className="text-tinta">{titulo}</strong> — {resto}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-relaxed text-tinta-tenue">
            Tus ventas en línea, sus estados y cada webhook entregado o fallido los ves en
            tu panel (<strong>Ventas</strong> y <strong>API → Webhooks</strong>) — la misma
            fuente que usa esta API.
          </p>
        </section>

        <p className="mt-14 border-t border-tinta-borde pt-6 text-sm text-tinta-tenue">
          ¿Algo no cuadra entre estas docs y la API? Es un bug nuestro — escríbenos
          a <a href={`mailto:${SOPORTE_EMAIL}`} className="text-marca-700 hover:underline">{SOPORTE_EMAIL}</a>.
        </p>
      </main>
    </div>
  );
}
