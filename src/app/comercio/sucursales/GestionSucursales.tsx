"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2, Pencil, Plus } from "lucide-react";
import { crearSucursal, renombrarSucursal, type ResultadoComercio } from "../actions";

type Sucursal = { id: string; name: string; code: string; cajas: number };

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm focus:border-marca-600 focus:outline-none";

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
      Crear sucursal
    </button>
  );
}

function Fila({ s }: { s: Sucursal }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(s.name);
  const [aviso, setAviso] = useState<ResultadoComercio | null>(null);

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {editando ? (
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={`${campo} max-w-xs flex-1`}
            autoFocus
          />
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-tinta">{s.name}</p>
            <p className="text-sm text-tinta-tenue">
              Código {s.code} · {s.cajas} caja(s)
            </p>
          </div>
        )}

        {editando ? (
          <>
            <button
              type="button"
              onClick={async () => {
                setAviso(await renombrarSucursal(s.id, nombre));
                setEditando(false);
              }}
              className="rounded-control bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-900"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNombre(s.name);
                setEditando(false);
              }}
              className="rounded-control px-3 py-1.5 text-sm text-tinta-tenue hover:bg-tinta-fondo"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1.5 rounded-control border border-tinta-borde px-3 py-1.5 text-sm text-tinta-suave hover:bg-tinta-fondo"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Renombrar
          </button>
        )}
      </div>
      {aviso && (
        <p className={`mt-2 text-sm ${aviso.ok ? "text-ok" : "text-error"}`}>
          {aviso.ok ? aviso.mensaje : aviso.error}
        </p>
      )}
    </li>
  );
}

export default function GestionSucursales({ sucursales }: { sucursales: Sucursal[] }) {
  const [estado, accion] = useFormState<ResultadoComercio | null, FormData>(crearSucursal, null);

  return (
    <>
      <section className="rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="font-display font-bold tracking-tight text-tinta">Agregar una sucursal</h2>
        <p className="mb-4 mt-1 text-sm text-tinta-tenue">
          Una por cada local. Sirve para agrupar las cajas y ver los cierres
          separados por local.
        </p>
        <form action={accion}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-tinta-tenue">Nombre</label>
              <input name="nombre" required placeholder="Sabana Grande" className={campo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tinta-tenue">
                Código corto
              </label>
              <input name="codigo" required placeholder="SGDE" maxLength={8} className={campo} />
            </div>
          </div>
          {estado && (
            <p
              className={`mt-3 flex items-start gap-2 text-sm ${estado.ok ? "text-ok" : "text-error"}`}
            >
              {estado.ok ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              {estado.ok ? estado.mensaje : estado.error}
            </p>
          )}
          <div className="mt-4">
            <BotonCrear />
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="font-display font-bold tracking-tight text-tinta">
          Tus sucursales ({sucursales.length})
        </h2>
        <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {sucursales.map((s) => (
            <Fila key={s.id} s={s} />
          ))}
        </ul>
      </section>
    </>
  );
}
