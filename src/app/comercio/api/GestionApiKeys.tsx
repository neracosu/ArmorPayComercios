"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Power } from "lucide-react";
import { crearApiKey, desactivarApiKey, type ResultadoApiKey } from "./actions";

interface Llave {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-2 rounded-control bg-marca-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <KeyRound className="h-4 w-4" aria-hidden />
      )}
      Crear llave
    </button>
  );
}

/** El key completo, visible UNA vez, con botón de copiar. */
function LlaveRecienCreada({ resultado }: { resultado: ResultadoApiKey }) {
  const [copiado, setCopiado] = useState(false);
  if (!resultado.ok || !resultado.key) return null;

  return (
    <div className="mt-4 rounded-card border border-ok/40 bg-ok-suave/50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ok">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        {resultado.mensaje}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-control border border-tinta-borde bg-white px-3 py-2 font-mono text-sm text-tinta">
          {resultado.key}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(resultado.key!).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            });
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-tinta-borde px-3 py-2 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
        >
          {copiado ? (
            <Check className="h-4 w-4 text-ok" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copiado ? "Copiada" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function FilaLlave({ llave }: { llave: Llave }) {
  const [estado, accion] = useFormState<ResultadoApiKey | null, FormData>(desactivarApiKey, null);
  const [confirmar, setConfirmar] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-tinta">
          {llave.name}
          {!llave.isActive && (
            <span className="ml-2 rounded-full bg-tinta-fondo px-2 py-0.5 text-xs text-tinta-tenue">
              inactiva
            </span>
          )}
        </p>
        <p className="mt-0.5 font-mono text-sm text-tinta-tenue">{llave.prefix}…</p>
        <p className="mt-0.5 text-xs text-tinta-tenue">
          Creada {new Date(llave.createdAt).toLocaleDateString("es-VE")}
          {llave.lastUsedAt
            ? ` · último uso ${new Date(llave.lastUsedAt).toLocaleString("es-VE")}`
            : " · sin uso todavía"}
        </p>
        {estado && !estado.ok && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-error">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {estado.error}
          </p>
        )}
      </div>
      {llave.isActive && (
        <form action={accion}>
          <input type="hidden" name="id" value={llave.id} />
          {confirmar ? (
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-control bg-error px-3 py-2 text-sm font-medium text-white hover:brightness-90"
            >
              <Power className="h-4 w-4" aria-hidden />
              Confirmar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmar(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-error/40 px-3 py-2 text-sm font-medium text-error hover:bg-error-suave"
            >
              <Power className="h-4 w-4" aria-hidden />
              Desactivar
            </button>
          )}
        </form>
      )}
    </li>
  );
}

export default function GestionApiKeys({ llaves }: { llaves: Llave[] }) {
  const [resultado, accion] = useFormState<ResultadoApiKey | null, FormData>(crearApiKey, null);

  return (
    <>
      <form action={accion} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="nombre" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Nombre de la llave
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            maxLength={60}
            placeholder="tienda web"
            className="w-full rounded-control border border-tinta-borde bg-white px-4 py-2.5 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <BotonCrear />
      </form>

      {resultado && !resultado.ok && (
        <p className="mt-4 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {resultado.error}
        </p>
      )}
      {resultado?.ok && <LlaveRecienCreada resultado={resultado} />}

      {llaves.length === 0 ? (
        <div className="mt-8 rounded-card border border-dashed border-tinta-borde bg-white p-8 text-center">
          <p className="font-medium text-tinta">Todavía no tienes llaves</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-tinta-tenue">
            Crea una para conectar tu tienda en línea. Cada integración (web,
            app, sistema) debería tener la suya.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {llaves.map((k) => (
            <FilaLlave key={k.id} llave={k} />
          ))}
        </ul>
      )}
    </>
  );
}
