"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, ArrowDownLeft, Check, Loader2, Search, TriangleAlert } from "lucide-react";
import { buscar, cobrar, type ResultadoBusqueda, type ResultadoCobro } from "./actions";

function bolivares(monto: string): string {
  const n = Number(monto);
  return Number.isFinite(n)
    ? n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : monto;
}

function hora(hhmmss: string): string {
  return hhmmss.length >= 4 ? `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}` : hhmmss;
}

function BotonBuscar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-2 rounded-control bg-marca-700 px-5 py-3 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      ) : (
        <Search className="h-5 w-5" aria-hidden />
      )}
      Buscar
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

/** Una fila de pago con su acción de cobro y su propia alarma. */
function FilaPago({ pago, hayTurno }: { pago: any; hayTurno: boolean }) {
  const [estado, accion] = useFormState<ResultadoCobro | null, FormData>(cobrar, null);
  const [insistir, setInsistir] = useState(false);

  // La alarma sale de la búsqueda o de un cobro que perdió la carrera contra
  // otra caja: en los dos casos hay que mostrarla antes de dejar insistir.
  const yaCobrado =
    pago.cobrado ?? (estado && !estado.ok ? estado.yaCobrado ?? null : null);

  if (estado?.ok) {
    return (
      <li className="flex items-center gap-3 bg-ok-suave/50 px-5 py-4">
        <Check className="h-5 w-5 shrink-0 text-ok" aria-hidden />
        <p className="text-sm font-medium text-ok">
          Cobro registrado{estado.duplicado ? " como duplicado, queda para revisión" : ""} · Bs{" "}
          {bolivares(pago.monto)}
        </p>
      </li>
    );
  }

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-suave text-ok">
          <ArrowDownLeft className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="monto">Bs {bolivares(pago.monto)}</p>
          <p className="mt-1 text-sm text-tinta-tenue">
            Ref. {pago.referencia} · Banco {pago.bancoOrigen} · {pago.fecha} {hora(pago.hora)}
          </p>
          <p className="text-sm text-tinta-tenue">
            De {pago.desdeCuenta} · {pago.desdeDni}
          </p>
        </div>
      </div>

      {yaCobrado && (
        <p className="mt-3 flex items-start gap-2 rounded-control bg-alerta-suave px-3 py-2.5 text-sm text-alerta">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Este pago ya fue cobrado</strong> por {yaCobrado.caja} ({yaCobrado.sucursal}),{" "}
            {new Date(yaCobrado.cuando).toLocaleString("es-VE")}.
          </span>
        </p>
      )}

      {estado && !estado.ok && !estado.yaCobrado && (
        <p className="mt-3 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}

      {hayTurno && (
        <form action={accion} className="mt-3">
          <input type="hidden" name="pagoId" value={pago.id} />
          {yaCobrado && insistir && (
            <div className="mb-3">
              <label htmlFor={`motivo-${pago.id}`} className="mb-1 block text-sm text-tinta-suave">
                ¿Por qué se cobra de nuevo?
              </label>
              <input
                id={`motivo-${pago.id}`}
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
      )}
    </li>
  );
}

export default function BuscadorCobro({ hayTurno }: { hayTurno: boolean }) {
  const [resultado, accion] = useFormState<ResultadoBusqueda | null, FormData>(buscar, null);

  return (
    <>
      <form action={accion} className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="referencia" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Últimos dígitos de la referencia
          </label>
          <input
            id="referencia"
            name="referencia"
            inputMode="numeric"
            pattern="\d*"
            autoComplete="off"
            required
            autoFocus
            placeholder="123456"
            className="w-full rounded-control border border-tinta-borde bg-white px-4 py-3 text-lg tracking-wider text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <div className="flex items-end">
          <BotonBuscar />
        </div>
      </form>

      {resultado && !resultado.ok && (
        <p className="mt-4 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {resultado.error}
        </p>
      )}

      {resultado?.ok && resultado.pagos.length === 0 && (
        <div className="mt-6 rounded-card border border-dashed border-tinta-borde bg-white p-8 text-center">
          <p className="font-medium text-tinta">No aparece ningún pago con esos dígitos</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-tinta-tenue">
            Puede que el banco todavía no lo haya reportado. Esperá unos segundos
            y volvé a buscar. Si sigue sin aparecer, el pago no entró a la cuenta.
          </p>
        </div>
      )}

      {resultado?.ok && resultado.pagos.length > 0 && (
        <ul className="mt-6 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {resultado.pagos.map((p) => (
            <FilaPago key={p.id} pago={p} hayTurno={hayTurno} />
          ))}
        </ul>
      )}
    </>
  );
}
