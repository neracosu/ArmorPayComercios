"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Copy, Loader2, Plus } from "lucide-react";
import { crearCaja, alternarCaja, resetearClave, type ResultadoComercio } from "../actions";

type Caja = { id: string; username: string; name: string; isActive: boolean; sucursal: string };
type Sucursal = { id: string; name: string };

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm focus:border-marca-600 focus:outline-none";

function Credenciales({ usuario, password }: { usuario: string; password: string }) {
  return (
    <div className="mt-3 rounded-control border border-tinta-borde bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-tinta-tenue">
        Anótala ahora — se muestra una sola vez
      </p>
      <p className="mt-2 font-mono text-sm">
        Usuario: <strong>{usuario}</strong>
      </p>
      <p className="font-mono text-sm">
        Contraseña: <strong>{password}</strong>
      </p>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(`Usuario: ${usuario}\nContraseña: ${password}`)
        }
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-marca-700"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        Copiar
      </button>
    </div>
  );
}

function BotonCrear() {
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
        <Plus className="h-4 w-4" aria-hidden />
      )}
      Crear caja
    </button>
  );
}

export default function GestionCajas({
  cajas,
  sucursales,
}: {
  cajas: Caja[];
  sucursales: Sucursal[];
}) {
  const [estado, accion] = useFormState<ResultadoComercio | null, FormData>(crearCaja, null);
  const [aviso, setAviso] = useState<ResultadoComercio | null>(null);

  return (
    <>
      <section className="rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="font-display font-bold tracking-tight text-tinta">Agregar una caja</h2>
        <p className="mb-4 mt-1 text-sm text-tinta-tenue">
          Cada punto de cobro necesita su propia caja: así cada una ve solo lo
          suyo y los turnos cierran por separado.
        </p>

        {estado?.ok && estado.credenciales ? (
          <div className="rounded-control border border-ok/30 bg-ok-suave/40 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ok">
              <Check className="h-4 w-4" aria-hidden />
              {estado.mensaje}
            </p>
            <Credenciales {...estado.credenciales} />
          </div>
        ) : (
          <form action={accion}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-tinta-tenue">Usuario</label>
                <input name="usuario" required placeholder="caja1-principal" className={campo} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-tinta-tenue">
                  Nombre visible
                </label>
                <input name="nombre" required placeholder="CAJA 1" className={campo} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-tinta-tenue">Sucursal</label>
                <select name="branchId" required className={campo}>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {estado && !estado.ok && (
              <p className="mt-3 flex items-start gap-2 text-sm text-error">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {estado.error}
              </p>
            )}
            <div className="mt-4">
              <BotonCrear />
            </div>
          </form>
        )}
      </section>

      {aviso && (
        <div
          className={`mt-4 rounded-card border p-4 ${
            aviso.ok ? "border-ok/30 bg-ok-suave/40" : "border-error/30 bg-error-suave"
          }`}
        >
          <p className={`text-sm font-medium ${aviso.ok ? "text-ok" : "text-error"}`}>
            {aviso.ok ? aviso.mensaje : aviso.error}
          </p>
          {aviso.ok && aviso.credenciales && <Credenciales {...aviso.credenciales} />}
        </div>
      )}

      <section className="mt-8">
        <h2 className="font-display font-bold tracking-tight text-tinta">
          Tus cajas ({cajas.length})
        </h2>
        {cajas.length === 0 ? (
          <p className="mt-2 text-sm text-tinta-tenue">Todavía no creaste ninguna.</p>
        ) : (
          <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {cajas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-tinta">
                    {c.name}{" "}
                    {!c.isActive && (
                      <span className="ml-1 rounded-control bg-error-suave px-2 py-0.5 text-xs text-error">
                        desactivada
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-tinta-tenue">
                    {c.username} · {c.sucursal}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => setAviso(await resetearClave(c.id))}
                  className="rounded-control border border-tinta-borde px-3 py-1.5 text-sm text-tinta-suave hover:bg-tinta-fondo"
                >
                  Cambiar clave
                </button>
                <button
                  type="button"
                  onClick={async () => setAviso(await alternarCaja(c.id))}
                  className="rounded-control px-3 py-1.5 text-sm text-tinta-tenue hover:bg-tinta-fondo"
                >
                  {c.isActive ? "Desactivar" : "Reactivar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
