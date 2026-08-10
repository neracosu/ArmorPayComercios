"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { eliminarComercio, type Resultado } from "../../actions";

function BotonEliminar({ habilitado }: { habilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !habilitado}
      className="inline-flex items-center gap-2 rounded-control bg-error px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="h-4 w-4" aria-hidden />
      )}
      Eliminar definitivamente
    </button>
  );
}

/**
 * Borrado total del comercio. El botón solo se activa cuando lo escrito
 * coincide con el RIF (misma comparación laxa del servidor: sin guiones ni
 * minúsculas), y aun así el servidor vuelve a verificar — esto es UX, no el
 * guard.
 */
export function ZonaPeligro({
  organizationId,
  rif,
  razonSocial,
}: {
  organizationId: string;
  rif: string;
  razonSocial: string;
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(eliminarComercio, null);
  const [escrito, setEscrito] = useState("");
  const coincide = escrito.trim().toUpperCase().replace(/-/g, "") === rif;

  return (
    <section className="mt-6 rounded-card border border-error/40 bg-white p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-error">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Zona de peligro
      </h2>
      <p className="mt-2 text-sm text-tinta-suave">
        Eliminar <strong>{razonSocial}</strong> borra TODO su rastro y no tiene vuelta atrás:
        usuarios, cuentas bancarias, pagos recibidos, cobros, turnos, intents de checkout, API
        keys, webhooks, bitácora y expediente. Los pagos ya recibidos del banco no se vuelven a
        ingerir. Es para registros de prueba y altas abandonadas — un comercio operativo no se
        elimina, se desactiva.
      </p>
      <form action={accion} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="min-w-52">
          <label htmlFor="rifConfirmacion" className="mb-1 block text-sm text-tinta-suave">
            Escribe el RIF <span className="font-mono">{rif}</span> para confirmar
          </label>
          <input
            id="rifConfirmacion"
            name="rifConfirmacion"
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            placeholder={rif}
            autoComplete="off"
            className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 font-mono text-sm text-tinta placeholder:text-tinta-tenue focus:border-error focus:outline-none"
          />
        </div>
        <BotonEliminar habilitado={coincide} />
      </form>
      {resultado && !resultado.ok && (
        <p className="mt-3 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {resultado.error}
        </p>
      )}
    </section>
  );
}
