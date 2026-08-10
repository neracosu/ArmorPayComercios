"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cambiarMiContrasena, type ResultadoCuenta } from "./actions";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      Cambiar contraseña
    </button>
  );
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2.5 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none";

export default function FormularioContrasena() {
  const [resultado, accion] = useFormState<ResultadoCuenta | null, FormData>(
    cambiarMiContrasena,
    null
  );

  // El cambio sube tokenVersion: esta sesión ya no sirve. Se despide con
  // el mensaje a la vista y se lleva al login limpio, sin dejar un panel
  // que va a rebotar en la próxima navegación.
  useEffect(() => {
    if (!resultado?.ok) return;
    const t = setTimeout(() => void signOut({ callbackUrl: "/login" }), 2500);
    return () => clearTimeout(t);
  }, [resultado]);

  if (resultado?.ok) {
    return (
      <div className="rounded-card border border-ok/30 bg-ok-suave/40 p-6 text-center">
        <Check className="mx-auto h-8 w-8 text-ok" strokeWidth={2.5} aria-hidden />
        <p className="mt-2 font-medium text-ok">{resultado.mensaje}</p>
        <p className="mt-1 text-sm text-tinta-tenue">Te llevamos al login…</p>
      </div>
    );
  }

  return (
    <form action={accion} className="rounded-card border border-tinta-borde bg-white p-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="actual" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Contraseña actual
          </label>
          <input
            id="actual"
            name="actual"
            type="password"
            autoComplete="current-password"
            required
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="nueva" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Contraseña nueva (mínimo 10 caracteres)
          </label>
          <input
            id="nueva"
            name="nueva"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="repetida" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Repítela
          </label>
          <input
            id="repetida"
            name="repetida"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            className={campo}
          />
        </div>
      </div>

      {resultado && !resultado.ok && (
        <p className="mt-4 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {resultado.error}
        </p>
      )}

      <div className="mt-5">
        <Boton />
      </div>
      <p className="mt-3 text-xs text-tinta-tenue">
        Al cambiarla se cierran todas tus sesiones abiertas, esta incluida.
      </p>
    </form>
  );
}
