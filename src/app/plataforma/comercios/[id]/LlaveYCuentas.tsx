"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, KeyRound, Loader2, Plus, ShieldCheck } from "lucide-react";
import { guardarLlave, verificarLlave, agregarCuenta, type Resultado } from "../../actions";

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm focus:border-marca-600 focus:outline-none";

function Boton({ icono: Icono, texto }: { icono: typeof KeyRound; texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icono className="h-4 w-4" aria-hidden />}
      {texto}
    </button>
  );
}

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-control px-3 py-2 text-sm ${
        r.ok ? "bg-ok-suave text-ok" : "bg-error-suave text-error"
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

export function FormularioLlave({
  organizationId,
  tieneLlave,
}: {
  organizationId: string;
  tieneLlave: boolean;
}) {
  const [estado, accion] = useFormState<Resultado | null, FormData>(guardarLlave, null);
  const [verificando, setVerificando] = useState(false);
  const [resultadoVerif, setResultadoVerif] = useState<Resultado | null>(null);

  return (
    <div className="mt-4">
      <form action={accion}>
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="mb-1 block text-xs font-medium text-tinta-tenue">
          {tieneLlave ? "Reemplazar la llave" : "Pegar la Llave de Trabajo que dio el banco"}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            name="authKey"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="DDFB1106AE8B79A81854AA1854896755"
            className={`${campo} flex-1 font-mono`}
          />
          <Boton icono={KeyRound} texto="Guardar" />
        </div>
        <p className="mt-2 text-xs text-tinta-tenue">
          Una vez guardada no se puede volver a leer completa desde ninguna
          pantalla. Para cambiarla se pega una nueva.
        </p>
        <Aviso r={estado} />
      </form>

      {tieneLlave && (
        <div className="mt-4 border-t border-tinta-borde pt-4">
          <button
            type="button"
            disabled={verificando}
            onClick={async () => {
              setVerificando(true);
              setResultadoVerif(await verificarLlave(organizationId));
              setVerificando(false);
            }}
            className="inline-flex items-center gap-2 rounded-control border border-tinta-borde px-4 py-2 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo disabled:opacity-60"
          >
            {verificando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            Verificar contra el banco
          </button>
          <Aviso r={resultadoVerif} />
        </div>
      )}
    </div>
  );
}

export function FormularioCuenta({ organizationId }: { organizationId: string }) {
  const [estado, accion] = useFormState<Resultado | null, FormData>(agregarCuenta, null);
  return (
    <form action={accion} className="mt-3 rounded-control border border-tinta-borde bg-tinta-fondo p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-tinta-tenue">
            Número de cuenta (20 dígitos)
          </label>
          <input
            name="accountNumber"
            required
            inputMode="numeric"
            placeholder="01750190910077122886"
            className={`${campo} font-mono`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-tinta-tenue">Alias</label>
          <input name="alias" required placeholder="Cuenta principal" className={campo} />
        </div>
      </div>
      <Aviso r={estado} />
      <div className="mt-3">
        <Boton icono={Plus} texto="Agregar cuenta" />
      </div>
    </form>
  );
}
