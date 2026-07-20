"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Copy, Loader2, UserPlus } from "lucide-react";
import { crearAdminComercio, type Resultado } from "../../actions";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <UserPlus className="h-4 w-4" aria-hidden />
      )}
      Crear administrador
    </button>
  );
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm focus:border-marca-600 focus:outline-none";

export default function CrearAdmin({
  organizationId,
  slug,
}: {
  organizationId: string;
  slug: string;
}) {
  const [estado, accion] = useFormState<Resultado | null, FormData>(crearAdminComercio, null);

  if (estado?.ok && estado.credenciales) {
    return (
      <div className="rounded-control border border-ok/30 bg-ok-suave/40 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-ok">
          <Check className="h-4 w-4" aria-hidden />
          {estado.mensaje}
        </p>
        <div className="mt-3 rounded-control border border-tinta-borde bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-tinta-tenue">
            Se muestran una sola vez
          </p>
          <p className="mt-2 font-mono text-sm">
            Usuario: <strong>{estado.credenciales.usuario}</strong>
          </p>
          <p className="font-mono text-sm">
            Contraseña: <strong>{estado.credenciales.password}</strong>
          </p>
          <button
            type="button"
            onClick={() =>
              navigator.clipboard.writeText(
                `Usuario: ${estado.credenciales!.usuario}\nContraseña: ${estado.credenciales!.password}`
              )
            }
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-marca-700"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copiar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={accion} className="rounded-control border border-tinta-borde bg-tinta-fondo p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-tinta-tenue">Usuario</label>
          <input name="usuario" defaultValue={`admin-${slug}`} required className={campo} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-tinta-tenue">
            Nombre del responsable
          </label>
          <input name="nombre" required className={campo} />
        </div>
      </div>
      {estado && !estado.ok && (
        <p className="mt-3 flex items-start gap-2 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}
      <div className="mt-3">
        <Boton />
      </div>
    </form>
  );
}
