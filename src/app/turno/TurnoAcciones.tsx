"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { abrirTurno, cerrarTurno, type ResultadoTurno } from "./actions";

function Boton({ texto, tono }: { texto: string; tono: "abrir" | "cerrar" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-control px-5 py-2.5 font-medium text-white transition-colors disabled:opacity-60 ${
        tono === "abrir" ? "bg-marca-700 hover:bg-marca-900" : "bg-tinta hover:bg-tinta-suave"
      }`}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {texto}
    </button>
  );
}

function Error({ estado }: { estado: ResultadoTurno | null }) {
  if (!estado || estado.ok) return null;
  return (
    <p className="mt-3 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {estado.error}
    </p>
  );
}

export function AbrirTurno() {
  const [estado, accion] = useFormState<ResultadoTurno | null, FormData>(abrirTurno, null);
  return (
    <form action={accion}>
      <label htmlFor="responsable" className="mb-1.5 block text-sm font-medium text-tinta-suave">
        ¿Quién está en la caja? <span className="font-normal text-tinta-tenue">(opcional)</span>
      </label>
      <input
        id="responsable"
        name="responsable"
        maxLength={120}
        placeholder="Nombre de quien atiende"
        className="mb-4 w-full max-w-sm rounded-control border border-tinta-borde bg-white px-3 py-2.5 focus:border-marca-600 focus:outline-none"
      />
      <div>
        <Boton texto="Abrir turno" tono="abrir" />
      </div>
      <Error estado={estado} />
    </form>
  );
}

export function CerrarTurno() {
  const [estado, accion] = useFormState<ResultadoTurno | null, FormData>(cerrarTurno, null);
  return (
    <form action={accion}>
      <label htmlFor="nota" className="mb-1.5 block text-sm font-medium text-tinta-suave">
        Nota de cierre <span className="font-normal text-tinta-tenue">(opcional)</span>
      </label>
      <input
        id="nota"
        name="nota"
        maxLength={500}
        placeholder="Algo que haya que dejar anotado del turno"
        className="mb-4 w-full max-w-sm rounded-control border border-tinta-borde bg-white px-3 py-2.5 focus:border-marca-600 focus:outline-none"
      />
      <div>
        <Boton texto="Cerrar turno" tono="cerrar" />
      </div>
      <Error estado={estado} />
    </form>
  );
}
