import Link from "next/link";
import { SOPORTE_EMAIL } from "@/lib/soporte";

export const metadata = {
  title: "API de ArmorPay — documentación para integradores",
  description:
    "Cobra en tu web con validación bancaria al instante: referencia de la API v1, checkout alojado y webhooks firmados.",
};

/**
 * Documentación pública de la API v1. Una sola página, sin framework de docs:
 * el contrato es chico y esto se lee de arriba a abajo. TODO lo que dice acá
 * sale de la implementación real — si algo diverge, es un bug de docs.
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
          Tres formas de integrar, de menos a más código: el{" "}
          <strong className="text-tinta">plugin de WooCommerce</strong>, el{" "}
          <strong className="text-tinta">checkout alojado</strong> (rediriges y nosotros
          hacemos el resto), o la <strong className="text-tinta">API REST</strong> completa.
          En todas, el pedido se confirma cuando el banco confirma — nunca antes.
        </p>

        <nav className="mt-6 flex flex-wrap gap-1.5 text-sm" aria-label="Secciones">
          {[
            ["#auth", "Autenticación"],
            ["#intents", "Cobros (intents)"],
            ["#referencia", "Validar referencia"],
            ["#c2p", "Cobro C2P"],
            ["#rate", "Tasa BCV"],
            ["#banks", "Bancos"],
            ["#pay", "Checkout alojado"],
            ["#webhooks", "Webhooks"],
            ["#errores", "Errores"],
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

        {/* ── Autenticación ── */}
        <section id="auth" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Autenticación</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Crea tu llave en tu panel (<strong className="text-tinta">API → Crear llave</strong>).
            Se muestra una sola vez: guárdala en tu servidor. Nunca la pongas en el
            navegador de tus clientes ni en el código de tu tienda visible al público.
          </p>
          <pre className={codigo}>{`Base:          https://armorpay.net/api/v1
Autorización:  Authorization: Bearer ak_live_...

Límites: 60 peticiones/min por llave · 15 intentos/5 min por IP
en validación de referencia. Al superarlos: 429 con Retry-After.`}</pre>
        </section>

        {/* ── Intents ── */}
        <section id="intents" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Cobros (intents)</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Un <em>intent</em> es un cobro que esperas recibir. Lo creas server-to-server
            con el monto que TÚ decides — la validación compara contra ese monto, nunca
            contra lo que declare el cliente final. Vence a los 30 minutos.
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

# ¿Tus precios están en dólares? Manda amountUSD EN VEZ de amountVES: congelamos
# el monto en Bs con la tasa BCV del momento, y la validación acepta
# también USD × tasa vigente (el que paga con la tasa de hoy no falla).
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
    "status": "PENDING",            # PENDING | CONFIRMED | FAILED | EXPIRED
    "referencia": null,
    "overpaidVES": null,
    "expiresAt": "2026-08-06T21:30:00.000Z",
    "confirmedAt": null,
    "createdAt": "2026-08-06T21:00:00.000Z"
  }
}

# Reintentar con la MISMA Idempotency-Key devuelve el mismo intent (200):
# un timeout de red nunca duplica un cobro.`}</pre>
        </section>

        {/* ── Validate reference ── */}
        <section id="referencia" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Validar una referencia</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Tu cliente ya pagó por pago móvil a tu cuenta y te da los últimos dígitos de
            la referencia de su comprobante. Nosotros confirmamos que el pago{" "}
            <strong className="text-tinta">existe, alcanza y no se usó antes</strong> —
            el mismo árbitro antifraude que usan las cajas físicas.
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
        </section>

        {/* ── C2P ── */}
        <section id="c2p" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Cobro C2P (Botón de Pago)</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Cobro activo: tu cliente genera una clave de pago desde su banco y el débito
            ocurre al instante. Requiere que tu comercio tenga C2P habilitado (se tramita
            con nosotros).
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

El monto y el concepto salen del intent — el body nunca los lleva.`}</pre>
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
            cliente por referencia o C2P, y confirma con las mismas reglas de la API.
          </p>
          <pre className={codigo}>{`Redirección:   https://armorpay.net/pay/{intentId}

En iframe, te avisamos por postMessage:
window.addEventListener("message", (e) => {
  const a = e.data?.armorpay;
  if (a?.event === "confirmed") { /* pedido pagado: a.intentId, a.externalRef */ }
  if (a?.event === "expired")   { /* venció sin pagar */ }
});

# La confirmación de VERDAD llega por webhook (abajo) o consultando
# GET /intents/{id}: nunca confíes solo en el postMessage del navegador.`}</pre>
          <p className="mt-3 text-sm leading-relaxed text-tinta-tenue">
            ¿Usas WooCommerce? Nuestro plugin hace todo esto por ti:{" "}
            <a
              href="/descargas/armorpay-woocommerce.zip"
              className="font-medium text-marca-700 hover:underline"
            >
              descarga el plugin (.zip)
            </a>
            , súbelo en Plugins → Añadir nuevo → Subir plugin, configura tu llave y tu
            webhook, y listo.
          </p>
        </section>

        {/* ── Webhooks ── */}
        <section id="webhooks" className="mt-12 scroll-mt-4">
          <h2 className={encabezado}>Webhooks firmados</h2>
          <p className="mt-3 leading-relaxed text-tinta-suave">
            Registra tu URL en tu panel (<strong className="text-tinta">API → Webhooks</strong>)
            y te avisamos a tu servidor cada confirmación o vencimiento — con firma, para
            que verifiques que fuimos nosotros. Si tu servidor no responde 2xx,
            reintentamos con espera creciente: 1 min, 5 min, 30 min, 2 h y 12 h.
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
                  ["404", "PAYMENT_NOT_FOUND", "El pago aún no llegó. Espera 1-2 min y reintenta."],
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

        <p className="mt-14 border-t border-tinta-borde pt-6 text-sm text-tinta-tenue">
          ¿Algo no cuadra entre estas docs y la API? Es un bug nuestro — escríbenos
          a <a href={`mailto:${SOPORTE_EMAIL}`} className="text-marca-700 hover:underline">{SOPORTE_EMAIL}</a>.
        </p>
      </main>
    </div>
  );
}
