"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cambiarPlanComercio, type Resultado } from "../../actions";

interface PlanVisible {
  clave: string;
  nombre: string;
  precioUSD: number;
  cobros: number;
  cajas: string;
  sucursales: string;
}

function Boton({ deshabilitado }: { deshabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || deshabilitado}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      Cambiar plan
    </button>
  );
}

/** El plan del comercio, cambiable desde la ficha (solo ADMIN). */
export default function PlanComercio({
  organizationId,
  planActual,
  planes,
}: {
  organizationId: string;
  planActual: string;
  planes: PlanVisible[];
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(cambiarPlanComercio, null);
  const [elegido, setElegido] = useState(planActual);
  const plan = planes.find((p) => p.clave === elegido);

  return (
    <form action={accion} className="mt-3 rounded-control border border-tinta-borde bg-tinta-fondo p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <label htmlFor="plan" className="mb-1 block text-sm text-tinta-suave">
            Plan
          </label>
          <select
            id="plan"
            name="plan"
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          >
            {planes.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.nombre} — ${p.precioUSD}/mes
              </option>
            ))}
          </select>
        </div>
        <Boton deshabilitado={elegido === planActual} />
      </div>
      {plan && (
        <p className="mt-2 text-xs text-tinta-tenue">
          {plan.cobros.toLocaleString("es-VE")} cobros/mes · {plan.cajas} caja(s) ·{" "}
          {plan.sucursales} sucursal(es). Los límites aplican de inmediato.
        </p>
      )}
      {resultado && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${
            resultado.ok ? "bg-ok-suave/50 text-ok" : "bg-error-suave text-error"
          }`}
        >
          {resultado.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {resultado.ok ? resultado.mensaje : resultado.error}
        </p>
      )}
    </form>
  );
}
