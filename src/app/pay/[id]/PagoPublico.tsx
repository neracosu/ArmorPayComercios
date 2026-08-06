"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  ShieldCheck,
  Smartphone,
  TimerReset,
} from "lucide-react";
import {
  validarReferenciaPublica,
  cobrarC2pPublico,
  type ResultadoPago,
} from "./actions";

interface IntentPublico {
  id: string;
  externalRef: string;
  amountVES: string;
  amountUSD?: string | null;
  exchangeRateUsed?: string | null;
  concepto: string;
  status: string;
  overpaidVES: string | null;
}

interface Props {
  intent: IntentPublico;
  comercio: {
    razonSocial: string;
    rif: string;
    logoUrl: string | null;
    cuentas: Array<{ banco: string; cuenta: string }>;
  };
  c2pDisponible: boolean;
  bancosC2p: Array<{ code: string; name: string }>;
}

const NOMBRE_BANCO: Record<string, string> = {
  BDT: "BDT (antes Bicentenario)",
  BT: "Banco del Tesoro",
};

const OTP_SEGUNDOS = 300;

function bolivares(monto: string): string {
  const n = Number(monto);
  return Number.isFinite(n)
    ? n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : monto;
}

function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={() => {
        navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-control border border-tinta-borde px-2.5 py-1.5 text-xs font-medium text-tinta-suave hover:bg-tinta-fondo focus:outline-none focus-visible:ring-2 focus-visible:ring-marca-600"
    >
      {copiado ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function BotonAccion({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-marca-700 px-5 py-3.5 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {pending ? "Verificando con el banco…" : children}
    </button>
  );
}

/**
 * El CTA con su señal de confianza pegada (donde sube la ansiedad, ahí va el
 * mensaje) y fijo al fondo del viewport en pantallas cortas.
 */
function ZonaAccion({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-1 mt-4 rounded-t-control bg-white px-1 pb-2 pt-2 sm:static sm:m-0 sm:p-0 sm:pt-4">
      {children}
      <p className="mt-2.5 flex items-start justify-center gap-1.5 text-xs leading-relaxed text-tinta-tenue">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
        <span>
          Verificamos directo con el banco. Nunca te pedimos la clave de tu
          banca en línea.
        </span>
      </p>
    </div>
  );
}

/** Página vencida: el carrito que nos embebe también tiene que enterarse. */
function AvisoVencido({ intentId, externalRef }: { intentId: string; externalRef: string }) {
  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage(
        { armorpay: { event: "expired", intentId, externalRef } },
        "*"
      );
    }
  }, [intentId, externalRef]);
  return null;
}

function AvisoError({ resultado }: { resultado: ResultadoPago }) {
  if (resultado.ok) return null;
  return (
    <div className="mt-4 rounded-control bg-error-suave px-4 py-3 text-sm text-error">
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {resultado.message}
          {resultado.faltanteVES && (
            <> Faltan Bs {bolivares(resultado.faltanteVES)}.</>
          )}
        </span>
      </p>
      {resultado.hint && <p className="mt-1.5 pl-6 text-error/90">{resultado.hint}</p>}
    </div>
  );
}

/** Pantalla final: el comprobante. */
function Confirmado({
  intent,
  sobrepago,
}: {
  intent: IntentPublico;
  sobrepago: string | null;
}) {
  useEffect(() => {
    // El carrito que nos embebe en un iframe se entera sin polling.
    if (window.parent !== window) {
      window.parent.postMessage(
        { armorpay: { event: "confirmed", intentId: intent.id, externalRef: intent.externalRef } },
        "*"
      );
    }
  }, [intent.id, intent.externalRef]);

  return (
    <div className="px-6 py-10 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-ok" aria-hidden />
      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-tinta">
        Pago confirmado
      </h2>
      <p className="monto mt-2 text-3xl">Bs {bolivares(intent.amountVES)}</p>
      <p className="mt-1 text-sm text-tinta-tenue">
        {intent.concepto} · pedido {intent.externalRef}
      </p>
      {sobrepago && (
        <p className="mx-auto mt-4 max-w-xs rounded-control bg-alerta-suave px-4 py-2.5 text-sm text-alerta">
          Pagaste Bs {bolivares(sobrepago)} de más. La tienda lo tiene registrado —
          contáctala si quieres el vuelto.
        </p>
      )}
      <p className="mx-auto mt-6 max-w-xs text-sm leading-relaxed text-tinta-tenue">
        Ya avisamos a la tienda: tu pedido sigue en marcha. Puedes cerrar esta
        página.
      </p>
    </div>
  );
}

/** Confirmación por referencia: el cliente ya pagó, acá lo demuestra. */
function PanelReferencia({
  intent,
  comercio,
  alConfirmar,
}: {
  intent: IntentPublico;
  comercio: Props["comercio"];
  alConfirmar: (r: ResultadoPago) => void;
}) {
  const [resultado, accion] = useFormState<ResultadoPago | null, FormData>(
    validarReferenciaPublica,
    null
  );

  useEffect(() => {
    if (resultado?.ok) alConfirmar(resultado);
  }, [resultado, alConfirmar]);

  return (
    <div className="px-6 pb-6">
      <div className="rounded-control bg-tinta-fondo px-4 py-3 text-sm leading-relaxed text-tinta-suave">
        <p className="font-medium text-tinta">Paga por pago móvil a:</p>
        <ul className="mt-1.5 space-y-1">
          {comercio.cuentas.map((c) => (
            <li key={c.cuenta}>
              {NOMBRE_BANCO[c.banco] ?? c.banco} · cuenta {c.cuenta}
            </li>
          ))}
          <li className="flex items-center gap-2">
            RIF {comercio.rif}
            <BotonCopiar texto={comercio.rif} etiqueta="Copiar RIF" />
          </li>
        </ul>
      </div>

      <form action={accion} className="mt-5">
        <input type="hidden" name="intentId" value={intent.id} />
        <label htmlFor="referencia" className="mb-1.5 block text-sm font-medium text-tinta-suave">
          Últimos dígitos de la referencia (mínimo 6)
        </label>
        <input
          id="referencia"
          name="referencia"
          inputMode="numeric"
          pattern="\d{6,20}"
          autoComplete="off"
          required
          placeholder="123456"
          className="w-full rounded-control border border-tinta-borde bg-white px-4 py-3 text-lg tracking-wider text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-tinta-tenue">
          Está en el comprobante que te dio tu banco al pagar.
        </p>
        <ZonaAccion>
          <BotonAccion>Confirmar mi pago</BotonAccion>
        </ZonaAccion>
      </form>

      {resultado && !resultado.ok && <AvisoError resultado={resultado} />}
    </div>
  );
}

/** Cobro C2P: datos → clave dinámica con vencimiento visible → pagar. */
function PanelC2p({
  intent,
  bancos,
  alConfirmar,
}: {
  intent: IntentPublico;
  bancos: Array<{ code: string; name: string }>;
  alConfirmar: (r: ResultadoPago) => void;
}) {
  const [paso, setPaso] = useState<"datos" | "otp">("datos");
  const [restante, setRestante] = useState(OTP_SEGUNDOS);
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, accion] = useFormState<ResultadoPago | null, FormData>(cobrarC2pPublico, null);

  useEffect(() => {
    if (resultado?.ok) alConfirmar(resultado);
  }, [resultado, alConfirmar]);

  useEffect(() => {
    if (paso !== "otp" || restante <= 0) return;
    const t = setInterval(() => setRestante((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [paso, restante]);

  const mm = String(Math.floor(Math.max(restante, 0) / 60));
  const ss = String(Math.max(restante, 0) % 60).padStart(2, "0");

  return (
    <div className="px-6 pb-6">
      <form ref={formRef} action={accion}>
        <input type="hidden" name="intentId" value={intent.id} />

        <div className={paso === "datos" ? "space-y-4" : "hidden"}>
          <div>
            <label htmlFor="celular" className="mb-1.5 block text-sm font-medium text-tinta-suave">
              Tu celular afiliado a pago móvil
            </label>
            <input
              id="celular"
              name="celular"
              inputMode="numeric"
              pattern="04(12|14|16|24|26)\d{7}"
              autoComplete="tel-national"
              required
              placeholder="04121234567"
              className="w-full rounded-control border border-tinta-borde bg-white px-4 py-3 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="banco" className="mb-1.5 block text-sm font-medium text-tinta-suave">
              Tu banco
            </label>
            <select
              id="banco"
              name="banco"
              required
              defaultValue=""
              className="w-full rounded-control border border-tinta-borde bg-white px-4 py-3 text-tinta focus:border-marca-600 focus:outline-none"
            >
              <option value="" disabled>
                Elige tu banco
              </option>
              {bancos.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cedula" className="mb-1.5 block text-sm font-medium text-tinta-suave">
              Tu cédula
            </label>
            <input
              id="cedula"
              name="cedula"
              inputMode="numeric"
              pattern="[VEPvep]?\d{6,9}"
              autoComplete="off"
              required
              placeholder="V12345678"
              className="w-full rounded-control border border-tinta-borde bg-white px-4 py-3 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (formRef.current?.reportValidity()) {
                setPaso("otp");
                setRestante(OTP_SEGUNDOS);
              }
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-marca-700 px-5 py-3.5 font-medium text-white transition-colors hover:bg-marca-900"
          >
            Continuar
          </button>
        </div>

        <div className={paso === "otp" ? "" : "hidden"}>
          <div className="rounded-control bg-tinta-fondo px-4 py-3 text-sm leading-relaxed text-tinta-suave">
            <p className="flex items-start gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-marca-700" aria-hidden />
              <span>
                Entra a tu banco (app, SMS o web) y genera tu{" "}
                <strong className="text-tinta">clave de pago</strong> (clave
                dinámica C2P). Escríbela aquí antes de que venza.
              </span>
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label htmlFor="otp" className="block text-sm font-medium text-tinta-suave">
              Clave de pago
            </label>
            <span
              className={`font-mono text-sm tabular-nums ${restante <= 60 ? "text-error" : "text-tinta-tenue"}`}
              aria-live="polite"
            >
              {restante > 0 ? `vence en ${mm}:${ss}` : "clave vencida"}
            </span>
          </div>
          <input
            id="otp"
            name="otp"
            inputMode="numeric"
            pattern="\d{4,12}"
            autoComplete="one-time-code"
            required
            placeholder="12345678"
            className="mt-1.5 w-full rounded-control border border-tinta-borde bg-white px-4 py-3 text-center text-2xl tracking-[0.3em] text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />

          {restante > 0 ? (
            <ZonaAccion>
              <BotonAccion>Pagar Bs {bolivares(intent.amountVES)}</BotonAccion>
            </ZonaAccion>
          ) : (
            <button
              type="button"
              onClick={() => setRestante(OTP_SEGUNDOS)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control border border-tinta-borde px-5 py-3.5 font-medium text-tinta-suave hover:bg-tinta-fondo"
            >
              <TimerReset className="h-5 w-5" aria-hidden />
              Ya generé una clave nueva
            </button>
          )}
          <button
            type="button"
            onClick={() => setPaso("datos")}
            className="mt-2 w-full py-2 text-sm text-tinta-tenue hover:text-tinta"
          >
            Corregir mis datos
          </button>
        </div>
      </form>

      {resultado && !resultado.ok && <AvisoError resultado={resultado} />}
    </div>
  );
}

export default function PagoPublico({ intent, comercio, c2pDisponible, bancosC2p }: Props) {
  const [confirmado, setConfirmado] = useState<{ intent: IntentPublico; sobrepago: string | null } | null>(
    intent.status === "CONFIRMED" ? { intent, sobrepago: intent.overpaidVES } : null
  );
  // FAILED = un C2P rechazado; el intent sigue operable hasta vencer.
  const operable = intent.status === "PENDING" || intent.status === "FAILED";
  const [metodo, setMetodo] = useState<"referencia" | "c2p">("referencia");

  const alConfirmar = (r: ResultadoPago) => {
    if (r.ok) setConfirmado({ intent: { ...intent, ...r.intent }, sobrepago: r.sobrepago });
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-tinta-fondo px-4 py-8 sm:py-12">
      <div className="w-full max-w-md overflow-hidden rounded-card border border-tinta-borde bg-white shadow-sm">
        {confirmado ? (
          <Confirmado intent={confirmado.intent} sobrepago={confirmado.sobrepago} />
        ) : !operable ? (
          <div className="px-6 py-10 text-center">
            <AvisoVencido intentId={intent.id} externalRef={intent.externalRef} />
            <p className="font-display text-xl font-bold text-tinta">Este link de pago venció</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-tinta-tenue">
              Vuelve a la tienda y genera el pago de nuevo. Si ya pagaste, tu
              dinero está en tu historial bancario — contacta a la tienda.
            </p>
          </div>
        ) : (
          <>
            {/* El ticket: quién cobra y el monto exacto. */}
            <div className="px-6 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-tinta-tenue">
                    Estás pagando a
                  </p>
                  <h1 className="mt-1 font-display text-xl font-bold tracking-tight text-tinta">
                    {comercio.razonSocial}
                  </h1>
                  <p className="text-sm text-tinta-tenue">RIF {comercio.rif}</p>
                </div>
                {comercio.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- nuestra propia ruta, tamaño fijo
                  <img
                    src={comercio.logoUrl}
                    alt={`Logo de ${comercio.razonSocial}`}
                    className="h-14 w-14 shrink-0 rounded-card object-contain"
                  />
                )}
              </div>

              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-tinta-tenue">
                    Monto exacto
                  </p>
                  <p className="monto mt-1 text-4xl">Bs {bolivares(intent.amountVES)}</p>
                  {/* La referencia en divisa se muestra como manda la norma:
                      el Bs es el precio; la divisa va declarada con su moneda
                      y su tasa BCV — nunca un "$" suelto ni una tasa muda. */}
                  {intent.amountUSD && intent.exchangeRateUsed && (
                    <p className="mt-0.5 text-sm text-tinta-tenue">
                      Ref. USD {bolivares(intent.amountUSD)} · tasa oficial BCV{" "}
                      {Number(intent.exchangeRateUsed).toLocaleString("es-VE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-tinta-tenue">
                    {intent.concepto} · pedido {intent.externalRef}
                  </p>
                </div>
                <BotonCopiar texto={intent.amountVES} etiqueta="Copiar monto" />
              </div>
            </div>

            {/* Borde de ticket: separa el comprobante de la acción. */}
            <div className="relative mt-6" aria-hidden>
              <div className="border-t-2 border-dashed border-tinta-borde" />
              <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-tinta-fondo" />
              <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-tinta-fondo" />
            </div>

            {c2pDisponible && (
              <div className="grid grid-cols-2 gap-2 px-6 py-5">
                <button
                  type="button"
                  onClick={() => setMetodo("referencia")}
                  aria-pressed={metodo === "referencia"}
                  className={`rounded-control border px-3 py-2.5 text-sm font-medium transition-colors ${
                    metodo === "referencia"
                      ? "border-marca-700 bg-marca-700/10 text-marca-700"
                      : "border-tinta-borde text-tinta-suave hover:bg-tinta-fondo"
                  }`}
                >
                  Ya pagué por pago móvil
                </button>
                <button
                  type="button"
                  onClick={() => setMetodo("c2p")}
                  aria-pressed={metodo === "c2p"}
                  className={`rounded-control border px-3 py-2.5 text-sm font-medium transition-colors ${
                    metodo === "c2p"
                      ? "border-marca-700 bg-marca-700/10 text-marca-700"
                      : "border-tinta-borde text-tinta-suave hover:bg-tinta-fondo"
                  }`}
                >
                  Pagar desde mi banco
                </button>
              </div>
            )}
            {!c2pDisponible && <div className="pt-5" />}

            {metodo === "referencia" || !c2pDisponible ? (
              <PanelReferencia intent={intent} comercio={comercio} alConfirmar={alConfirmar} />
            ) : (
              <PanelC2p intent={intent} bancos={bancosC2p} alConfirmar={alConfirmar} />
            )}
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-tinta-tenue">
        Validado por <span className="font-medium text-tinta-suave">ArmorPay</span> ·
        plataforma de validación de pagos
      </p>
    </main>
  );
}
