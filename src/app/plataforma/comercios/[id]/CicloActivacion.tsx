"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, ChevronRight, Loader2, X } from "lucide-react";
import { avanzarEstadoComercio, rechazarComercio, type Resultado } from "../../actions";

/**
 * El ciclo de activación, visible y accionable: dónde está el comercio, qué
 * falta para activarlo, y UN botón que avanza al paso siguiente. El orden es
 * fijo — cada paso deja constancia de una verificación real ante el banco.
 */

const PASOS = [
  { estado: "REGISTRADA", titulo: "Registrado" },
  { estado: "RECAUDOS_COMPLETOS", titulo: "Recaudos completos" },
  { estado: "ENVIADA_AL_BANCO", titulo: "Enviada al banco" },
  { estado: "CERTIFICACION", titulo: "Certificación" },
  { estado: "ACTIVA", titulo: "Activo" },
];

const SIGUIENTE: Record<string, string> = {
  REGISTRADA: "Marcar recaudos completos",
  RECAUDOS_COMPLETOS: "Marcar solicitud enviada al banco",
  ENVIADA_AL_BANCO: "El banco afilió — pasar a certificación",
  CERTIFICACION: "Activar el comercio",
};

export interface ItemChecklist {
  etiqueta: string;
  listo: boolean;
  /** true = sin esto no se activa; false = deseable pero no bloquea. */
  requerido: boolean;
}

function BotonAvanzar({ etiqueta }: { etiqueta: string }) {
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
        <ChevronRight className="h-4 w-4" aria-hidden />
      )}
      {etiqueta}
    </button>
  );
}

export default function CicloActivacion({
  organizationId,
  status,
  checklist,
}: {
  organizationId: string;
  status: string;
  checklist: ItemChecklist[];
}) {
  const [resultado, avanzar] = useFormState<Resultado | null, FormData>(avanzarEstadoComercio, null);
  const [rechazo, rechazar] = useFormState<Resultado | null, FormData>(rechazarComercio, null);
  const [confirmarRechazo, setConfirmarRechazo] = useState(false);

  const indice = PASOS.findIndex((p) => p.estado === status);
  const terminalLateral = status === "RECHAZADA" || status === "SUSPENDIDA";
  const mensaje = resultado ?? rechazo;

  return (
    <div>
      {/* La línea del ciclo */}
      {!terminalLateral && (
        <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {PASOS.map((p, i) => (
            <li key={p.estado} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 text-tinta-tenue" aria-hidden />}
              <span
                className={`rounded-control px-2 py-1 font-medium ${
                  i < indice
                    ? "bg-ok-suave text-ok"
                    : i === indice
                      ? "bg-marca-700 text-white"
                      : "bg-tinta-fondo text-tinta-tenue"
                }`}
              >
                {p.titulo}
              </span>
            </li>
          ))}
        </ol>
      )}
      {terminalLateral && (
        <p className="mt-3 text-sm font-medium text-error">
          {status === "RECHAZADA" ? "Rechazado" : "Suspendido"}
        </p>
      )}

      {/* Qué falta para activar */}
      {status !== "ACTIVA" && !terminalLateral && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {checklist.map((item) => (
            <li key={item.etiqueta} className="flex items-center gap-2">
              {item.listo ? (
                <Check className="h-4 w-4 shrink-0 text-ok" aria-hidden />
              ) : (
                <X
                  className={`h-4 w-4 shrink-0 ${item.requerido ? "text-error" : "text-tinta-tenue"}`}
                  aria-hidden
                />
              )}
              <span className={item.listo ? "text-tinta-suave" : "text-tinta"}>
                {item.etiqueta}
                {!item.listo && !item.requerido && (
                  <span className="text-tinta-tenue"> (opcional)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Acciones */}
      {SIGUIENTE[status] && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={avanzar}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <BotonAvanzar etiqueta={SIGUIENTE[status]} />
          </form>
          <form action={rechazar}>
            <input type="hidden" name="organizationId" value={organizationId} />
            {confirmarRechazo ? (
              <button
                type="submit"
                className="rounded-control bg-error px-3 py-2.5 text-sm font-medium text-white hover:brightness-90"
              >
                Confirmar rechazo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarRechazo(true)}
                className="rounded-control border border-error/40 px-3 py-2.5 text-sm font-medium text-error hover:bg-error-suave"
              >
                Rechazar
              </button>
            )}
          </form>
        </div>
      )}

      {mensaje && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${
            mensaje.ok ? "bg-ok-suave/50 text-ok" : "bg-error-suave text-error"
          }`}
        >
          {mensaje.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {mensaje.ok ? mensaje.mensaje : mensaje.error}
        </p>
      )}
    </div>
  );
}
