"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2, Zap } from "lucide-react";
import { cobrarBotonDePago, type ResultadoBotonDePago } from "./actions";

function bolivares(monto: string): string {
  const n = Number(monto.replace(",", "."));
  return Number.isFinite(n)
    ? n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : monto;
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2.5 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none";
const etiqueta = "mb-1.5 block text-sm font-medium text-tinta-suave";

function BotonDebitar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-5 py-3 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      ) : (
        <Zap className="h-5 w-5" aria-hidden />
      )}
      {pending ? "Cobrando en el banco…" : "Cobrar ahora"}
    </button>
  );
}

function FormularioC2p({
  bancos,
  alTerminar,
}: {
  bancos: Array<{ codigo: string; nombre: string }>;
  alTerminar: () => void;
}) {
  const [resultado, accion] = useFormState<ResultadoBotonDePago | null, FormData>(
    cobrarBotonDePago,
    null
  );

  if (resultado?.ok) {
    return (
      <div className="rounded-card bg-ok px-5 py-8 text-center text-white">
        <Check className="mx-auto h-10 w-10" strokeWidth={3} aria-hidden />
        <p className="monto mt-2 text-2xl text-white">Bs {bolivares(resultado.monto)}</p>
        <p className="mt-1 text-sm font-medium text-white/90">
          Cobro aprobado y registrado · Ref. {resultado.referencia}
        </p>
        <p className="mt-1 text-xs text-white/80">
          {resultado.comision && <>Comisión Bs {bolivares(resultado.comision)} · </>}
          {resultado.lote && <>Lote {resultado.lote}</>}
        </p>
        {resultado.duplicado && (
          <p className="mx-auto mt-3 max-w-sm rounded-control bg-white/15 px-3 py-2 text-xs font-medium text-white">
            Ojo: la referencia ya estaba cobrada — quedó registrado como duplicado
            para revisión del administrador.
          </p>
        )}
        <button
          type="button"
          onClick={alTerminar}
          className="mt-5 rounded-control bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25"
        >
          Hacer otro cobro
        </button>
      </div>
    );
  }

  return (
    <>
      <form action={accion} className="rounded-card border border-tinta-borde bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="monto-c2p" className={etiqueta}>
              Monto a cobrar (Bs)
            </label>
            <input
              id="monto-c2p"
              name="monto"
              inputMode="decimal"
              autoComplete="off"
              required
              autoFocus
              placeholder="1250.50"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="celular-c2p" className={etiqueta}>
              Celular afiliado del cliente
            </label>
            <input
              id="celular-c2p"
              name="celular"
              inputMode="tel"
              autoComplete="off"
              required
              placeholder="04125551234"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="banco-c2p" className={etiqueta}>
              Banco del cliente
            </label>
            <select id="banco-c2p" name="bancoPagador" required defaultValue="" className={campo}>
              <option value="" disabled>
                Elige el banco
              </option>
              {bancos.map((b) => (
                <option key={b.codigo} value={b.codigo}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cedula-c2p" className={etiqueta}>
              Cédula del cliente
            </label>
            <input
              id="cedula-c2p"
              name="cedula"
              autoComplete="off"
              required
              placeholder="V12345678"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="otp-c2p" className={etiqueta}>
              Clave dinámica (la genera el cliente en su banco)
            </label>
            <input
              id="otp-c2p"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="12345678"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="concepto-c2p" className={etiqueta}>
              Concepto (opcional)
            </label>
            <input
              id="concepto-c2p"
              name="concepto"
              maxLength={40}
              autoComplete="off"
              placeholder="Cobro en caja"
              className={campo}
            />
          </div>
        </div>

        <div className="mt-5">
          <BotonDebitar />
        </div>
      </form>

      {resultado && !resultado.ok && (
        <div
          className={`mt-4 rounded-card border p-4 ${
            resultado.desconocido
              ? "border-alerta/40 bg-alerta-suave text-alerta"
              : "border-error/40 bg-error-suave text-error"
          }`}
        >
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {resultado.error}
          </p>
          {resultado.hint && <p className="mt-1 text-sm leading-relaxed">{resultado.hint}</p>}
        </div>
      )}
    </>
  );
}

/**
 * Cobro «Botón de Pago» del Tesoro desde la caja. El débito es inmediato:
 * un cobro aprobado queda registrado en el acto, sin paso de confirmación.
 * «Hacer otro cobro» remonta el formulario limpio (key nueva).
 */
export default function CobroBotonPago({
  bancos,
  hayTurno,
}: {
  bancos: Array<{ codigo: string; nombre: string }>;
  hayTurno: boolean;
}) {
  const [ronda, setRonda] = useState(0);

  if (!hayTurno) {
    return (
      <div className="rounded-card border border-alerta/30 bg-alerta-suave p-5">
        <p className="font-medium text-alerta">Abre tu turno primero</p>
        <p className="mt-1 text-sm leading-relaxed text-alerta">
          El Botón de Pago debita al cliente al instante, así que el cobro
          necesita un turno abierto donde caer.
        </p>
      </div>
    );
  }

  if (bancos.length === 0) {
    return (
      <div className="rounded-card border border-alerta/30 bg-alerta-suave p-5">
        <p className="font-medium text-alerta">No pudimos cargar el catálogo de bancos</p>
        <p className="mt-1 text-sm leading-relaxed text-alerta">
          El banco no respondió el catálogo del Botón de Pago. Recarga la página
          en unos segundos; mientras, puedes validar por las otras vías.
        </p>
      </div>
    );
  }

  return <FormularioC2p key={ronda} bancos={bancos} alTerminar={() => setRonda((r) => r + 1)} />;
}
