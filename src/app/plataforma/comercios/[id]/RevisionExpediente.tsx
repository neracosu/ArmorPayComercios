"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, ExternalLink, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { revisarRecaudo, aprobarCuenta, type Resultado } from "../../actions";

const CHIP: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: "en revisión", clase: "bg-alerta-suave text-alerta" },
  APROBADO: { texto: "aprobado", clase: "bg-ok-suave text-ok" },
  RECHAZADO: { texto: "rechazado", clase: "bg-error-suave text-error" },
};

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return (
    <p
      className={`mt-2 flex items-start gap-2 rounded-control px-3 py-2 text-sm ${
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

function BotonChico({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-control bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-900 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function FilaRecaudoRevision({
  recaudo,
}: {
  recaudo: { id: string; tipo: string; nombre: string; status: string; nota: string | null };
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(revisarRecaudo, null);
  const [rechazando, setRechazando] = useState(false);
  const chip = CHIP[recaudo.status] ?? CHIP.PENDIENTE;

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-tinta">
            {recaudo.tipo.replace(/_/g, " ")}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${chip.clase}`}>
              {chip.texto}
            </span>
          </p>
          <a
            href={`/api/recaudo/${recaudo.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-tinta-tenue hover:text-tinta"
          >
            {recaudo.nombre}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          {recaudo.nota && <p className="mt-0.5 text-error">Motivo: {recaudo.nota}</p>}
        </div>

        {recaudo.status === "PENDIENTE" && (
          <form action={accion} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={recaudo.id} />
            {rechazando ? (
              <>
                <input
                  name="nota"
                  required
                  maxLength={500}
                  placeholder="¿Qué debe corregir?"
                  className="w-52 rounded-control border border-tinta-borde bg-white px-3 py-1.5 text-sm focus:border-marca-600 focus:outline-none"
                />
                <button
                  type="submit"
                  name="veredicto"
                  value="rechazar"
                  className="inline-flex items-center gap-1.5 rounded-control bg-error px-3 py-1.5 text-sm font-medium text-white hover:brightness-90"
                >
                  <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                  Rechazar
                </button>
              </>
            ) : (
              <>
                <button
                  type="submit"
                  name="veredicto"
                  value="aprobar"
                  className="inline-flex items-center gap-1.5 rounded-control bg-ok px-3 py-1.5 text-sm font-medium text-white hover:brightness-90"
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => setRechazando(true)}
                  className="rounded-control border border-error/40 px-3 py-1.5 text-sm font-medium text-error hover:bg-error-suave"
                >
                  Rechazar…
                </button>
              </>
            )}
          </form>
        )}
      </div>
      <Aviso r={resultado} />
    </li>
  );
}

export function FilaCuentaPorAprobar({
  cuenta,
}: {
  cuenta: { id: string; accountNumber: string; banco: string; alias: string };
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(aprobarCuenta, null);

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <span className="font-mono text-tinta">{cuenta.accountNumber}</span>
      <span className="text-tinta-tenue">
        {cuenta.banco} · {cuenta.alias}
      </span>
      <form action={accion} className="ml-auto">
        <input type="hidden" name="id" value={cuenta.id} />
        <BotonChico>Aprobar cuenta</BotonChico>
      </form>
      <Aviso r={resultado} />
    </li>
  );
}
