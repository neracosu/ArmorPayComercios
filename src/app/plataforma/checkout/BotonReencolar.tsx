"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { reencolarEntrega, type ResultadoMonitoreo } from "./actions";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-tinta-borde px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      )}
      Reencolar
    </button>
  );
}

export default function BotonReencolar({ deliveryId }: { deliveryId: string }) {
  const [estado, accion] = useFormState<ResultadoMonitoreo | null, FormData>(
    reencolarEntrega,
    null
  );

  if (estado?.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-ok">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        {estado.mensaje}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={accion}>
        <input type="hidden" name="id" value={deliveryId} />
        <Boton />
      </form>
      {estado && !estado.ok && (
        <p className="flex items-center gap-1.5 text-xs text-error">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}
    </div>
  );
}
