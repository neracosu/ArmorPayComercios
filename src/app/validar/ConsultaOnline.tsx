"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Landmark, Loader2, TriangleAlert } from "lucide-react";
import { BANCOS_VE_OPTIONS } from "@/lib/bancos-ve";
import {
  cobrarValidacion,
  validarEnLinea,
  type ResultadoCobro,
  type ResultadoValidacion,
} from "./actions";
import type { CuentaCaja } from "./PanelValidacion";

type TipoConsulta = "VAL_P2P" | "VAL_P2P_CC" | "VAL_TRANSFER" | "VAL_TRANSACTION";

/** Hoy en Venezuela (el reloj del equipo de la caja puede estar en otra zona). */
function hoyCaracas(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
}

function bolivares(monto: string): string {
  const n = Number(monto.replace(",", "."));
  return Number.isFinite(n)
    ? n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : monto;
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2.5 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none";
const etiqueta = "mb-1.5 block text-sm font-medium text-tinta-suave";

function BotonConsultar() {
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
        <Landmark className="h-5 w-5" aria-hidden />
      )}
      {pending ? "Consultando al banco…" : "Consultar al banco"}
    </button>
  );
}

function BotonCobrar({ duplicado }: { duplicado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
        duplicado ? "bg-alerta hover:brightness-90" : "bg-ok hover:brightness-90"
      }`}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {duplicado ? "Cobrar igual" : "Confirmar cobro"}
    </button>
  );
}

/**
 * El cobro que nace de una validación exitosa. Mismo comportamiento de la
 * fila de lookup: alarma de doble cobro ANTES de dejar insistir.
 */
function CobroDesdeValidacion({
  validationRequestId,
  monto,
}: {
  validationRequestId: string;
  monto: string;
}) {
  const [estado, accion] = useFormState<ResultadoCobro | null, FormData>(cobrarValidacion, null);
  const [insistir, setInsistir] = useState(false);

  const yaCobrado = estado && !estado.ok ? estado.yaCobrado ?? null : null;

  if (estado?.ok) {
    return (
      <div className="mt-4 rounded-card bg-ok px-5 py-6 text-center text-white">
        <Check className="mx-auto h-10 w-10" strokeWidth={3} aria-hidden />
        <p className="monto mt-2 text-2xl text-white">Bs {bolivares(monto)}</p>
        <p className="mt-1 text-sm font-medium text-white/90">
          Cobro registrado{estado.duplicado ? " como duplicado — queda para revisión" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {yaCobrado && (
        <p className="mb-3 flex items-start gap-2 rounded-control bg-alerta-suave px-3 py-2.5 text-sm text-alerta">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Este pago ya fue cobrado</strong> por {yaCobrado.caja} ({yaCobrado.sucursal}),{" "}
            {new Date(yaCobrado.cuando).toLocaleString("es-VE")}.
          </span>
        </p>
      )}
      {estado && !estado.ok && !estado.yaCobrado && (
        <p className="mb-3 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}
      <form action={accion}>
        <input type="hidden" name="validationRequestId" value={validationRequestId} />
        {yaCobrado && insistir && (
          <div className="mb-3">
            <label htmlFor="motivo-online" className="mb-1 block text-sm text-tinta-suave">
              ¿Por qué se cobra de nuevo?
            </label>
            <input
              id="motivo-online"
              name="motivo"
              required
              maxLength={500}
              placeholder="El cliente pagó dos compras distintas con la misma referencia…"
              className="w-full rounded-control border border-tinta-borde px-3 py-2 text-sm focus:border-marca-600 focus:outline-none"
            />
            <input type="hidden" name="aceptaDuplicado" value="1" />
          </div>
        )}
        {yaCobrado && !insistir ? (
          <button
            type="button"
            onClick={() => setInsistir(true)}
            className="rounded-control border border-alerta/40 px-4 py-2 text-sm font-medium text-alerta hover:bg-alerta-suave"
          >
            Cobrar igual
          </button>
        ) : (
          <BotonCobrar duplicado={Boolean(yaCobrado)} />
        )}
      </form>
    </div>
  );
}

export default function ConsultaOnline({
  tipo,
  cuentas,
  hayTurno,
}: {
  tipo: TipoConsulta;
  cuentas: CuentaCaja[];
  hayTurno: boolean;
}) {
  const [resultado, accion] = useFormState<ResultadoValidacion | null, FormData>(
    validarEnLinea,
    null
  );
  // El monto tecleado se recuerda para pintarlo en el comprobante del cobro.
  const [montoTecleado, setMontoTecleado] = useState("");

  const porComercio = tipo === "VAL_P2P_CC";
  const pideBanco = tipo !== "VAL_TRANSACTION";
  const pideTelefono = tipo === "VAL_P2P" || porComercio;
  const pideCedula = tipo === "VAL_TRANSFER";
  const comercios = cuentas.filter((c) => c.merchantCode);

  const veredicto =
    resultado?.ok === true
      ? resultado
      : null;
  const colorVeredicto =
    veredicto?.severity === "ok"
      ? "border-ok/40 bg-ok-suave text-ok"
      : veredicto?.severity === "warn"
        ? "border-alerta/40 bg-alerta-suave text-alerta"
        : "border-error/40 bg-error-suave text-error";

  return (
    <>
      <form action={accion} className="rounded-card border border-tinta-borde bg-white p-5">
        <input type="hidden" name="tipo" value={tipo} />
        <div className="grid gap-4 sm:grid-cols-2">
          {porComercio ? (
            <div className="sm:col-span-2">
              <label htmlFor="codigoComercio" className={etiqueta}>
                Código de comercio
              </label>
              <select id="codigoComercio" name="codigoComercio" required className={campo}>
                {comercios.map((c) => (
                  <option key={c.id} value={c.merchantCode ?? ""}>
                    {c.merchantCode} — {c.alias} (…{c.ultimos})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label htmlFor="cuentaId" className={etiqueta}>
                Cuenta que recibió el pago
              </label>
              <select id="cuentaId" name="cuentaId" required className={campo}>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.alias} · cuenta …{c.ultimos}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="fecha" className={etiqueta}>
              Fecha del pago
            </label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              required
              defaultValue={hoyCaracas()}
              className={campo}
            />
          </div>

          <div>
            <label htmlFor="monto" className={etiqueta}>
              Monto exacto (Bs)
            </label>
            <input
              id="monto"
              name="monto"
              inputMode="decimal"
              autoComplete="off"
              required
              placeholder="1250.50"
              onChange={(e) => setMontoTecleado(e.target.value)}
              className={campo}
            />
          </div>

          <div>
            <label htmlFor="referencia-online" className={etiqueta}>
              Referencia (3 a 10 dígitos)
            </label>
            <input
              id="referencia-online"
              name="referencia"
              inputMode="numeric"
              autoComplete="off"
              required
              placeholder="123456"
              className={campo}
            />
          </div>

          {pideBanco && (
            <div>
              <label htmlFor="bancoEmisor" className={etiqueta}>
                Banco desde donde pagó
              </label>
              <select id="bancoEmisor" name="bancoEmisor" required defaultValue="" className={campo}>
                <option value="" disabled>
                  Elige el banco
                </option>
                {BANCOS_VE_OPTIONS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {pideTelefono && (
            <div>
              <label htmlFor="telefono" className={etiqueta}>
                Teléfono del pagador
              </label>
              <input
                id="telefono"
                name="telefono"
                inputMode="tel"
                autoComplete="off"
                required
                placeholder="04125551234"
                className={campo}
              />
            </div>
          )}

          {pideCedula && (
            <div>
              <label htmlFor="cedula-online" className={etiqueta}>
                Cédula del pagador
              </label>
              <input
                id="cedula-online"
                name="cedula"
                autoComplete="off"
                required
                placeholder="V12345678"
                className={campo}
              />
            </div>
          )}
        </div>

        <div className="mt-5">
          <BotonConsultar />
        </div>
      </form>

      {resultado && !resultado.ok && (
        <p className="mt-4 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {resultado.error}
        </p>
      )}

      {veredicto && (
        <div className={`mt-6 rounded-card border p-5 ${colorVeredicto}`}>
          <p className="text-lg font-semibold">{veredicto.headline}</p>
          {veredicto.hint && <p className="mt-1 text-sm leading-relaxed">{veredicto.hint}</p>}
          <p className="mt-2 text-xs opacity-80">
            {veredicto.code} · {veredicto.label} · {veredicto.durationMs}ms
          </p>

          {veredicto.cobrable && hayTurno && (
            <CobroDesdeValidacion
              key={veredicto.validationRequestId}
              validationRequestId={veredicto.validationRequestId}
              monto={montoTecleado}
            />
          )}
          {veredicto.cobrable && !hayTurno && (
            <p className="mt-3 text-sm font-medium">
              El banco lo confirma, pero necesitas un turno abierto para registrar el cobro.
            </p>
          )}
        </div>
      )}
    </>
  );
}
