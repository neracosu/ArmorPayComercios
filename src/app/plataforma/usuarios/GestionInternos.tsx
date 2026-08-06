"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Copy, Loader2, Power, UserPlus } from "lucide-react";
import { crearUsuarioInterno, alternarUsuarioInterno, type Resultado } from "../actions";

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${
        r.ok ? "bg-ok-suave/50 text-ok" : "bg-error-suave text-error"
      }`}
    >
      {r.ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      {r.ok ? r.mensaje : r.error}
    </p>
  );
}

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <UserPlus className="h-4 w-4" aria-hidden />
      )}
      Crear
    </button>
  );
}

export function CrearInterno() {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(crearUsuarioInterno, null);
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="mt-6 rounded-card border border-tinta-borde bg-white p-5">
      <h2 className="font-display font-bold tracking-tight text-tinta">Crear usuario interno</h2>
      <p className="mb-3 mt-1 text-sm text-tinta-tenue">
        Empleados nuestros. La revisora de expedientes ve solicitudes y
        comercios, revisa recaudos, aprueba cuentas y avanza las altas —
        activar comercios, llaves y usuarios quedan reservados al administrador.
      </p>

      <form action={accion} className="flex flex-wrap items-end gap-3">
        <div className="min-w-44">
          <label htmlFor="nombre-int" className="mb-1 block text-sm text-tinta-suave">
            Nombre
          </label>
          <input
            id="nombre-int"
            name="nombre"
            required
            maxLength={120}
            className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          />
        </div>
        <div className="min-w-40">
          <label htmlFor="usuario-int" className="mb-1 block text-sm text-tinta-suave">
            Usuario
          </label>
          <input
            id="usuario-int"
            name="usuario"
            required
            maxLength={30}
            placeholder="maria-recaudos"
            className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 font-mono text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="rol-int" className="mb-1 block text-sm text-tinta-suave">
            Rol
          </label>
          <select
            id="rol-int"
            name="rol"
            required
            defaultValue="PLATFORM_REVIEWER"
            className="rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          >
            <option value="PLATFORM_REVIEWER">Revisora de expedientes</option>
            <option value="PLATFORM_ADMIN">Administrador de plataforma</option>
          </select>
        </div>
        <BotonCrear />
      </form>

      <Aviso r={resultado} />
      {resultado?.ok && resultado.credenciales && (
        <div className="mt-3 flex items-center gap-2">
          <code className="rounded-control border border-tinta-borde bg-tinta-fondo px-3 py-2 font-mono text-sm text-tinta">
            {resultado.credenciales.usuario} · {resultado.credenciales.password}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(`${resultado.credenciales!.usuario} / ${resultado.credenciales!.password}`)
                .then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                });
            }}
            className="inline-flex items-center gap-1.5 rounded-control border border-tinta-borde px-3 py-2 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
          >
            {copiado ? <Check className="h-4 w-4 text-ok" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  );
}

export function BotonAlternarInterno({ userId, activo }: { userId: string; activo: boolean }) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(alternarUsuarioInterno, null);
  const [confirmar, setConfirmar] = useState(false);

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="id" value={userId} />
      {resultado && !resultado.ok && (
        <span className="text-xs text-error">{resultado.error}</span>
      )}
      {activo && !confirmar ? (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="inline-flex items-center gap-1.5 rounded-control border border-error/40 px-2.5 py-1.5 text-xs font-medium text-error hover:bg-error-suave"
        >
          <Power className="h-3.5 w-3.5" aria-hidden />
          Desactivar
        </button>
      ) : (
        <button
          type="submit"
          className={`inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-medium text-white ${
            activo ? "bg-error hover:brightness-90" : "bg-ok hover:brightness-90"
          }`}
        >
          <Power className="h-3.5 w-3.5" aria-hidden />
          {activo ? "Confirmar" : "Reactivar"}
        </button>
      )}
    </form>
  );
}
