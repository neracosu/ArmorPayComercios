"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { reenviarWebhookDelivery, type ResultadoApiKey } from "./actions";

/**
 * Las entregas recientes de webhooks: la contraparte de la promesa
 * «te avisamos con reintentos automáticos» — acá el comercio VE cada aviso,
 * si llegó, y puede reenviar el que se agotó.
 */

export interface Entrega {
  id: string;
  endpointUrl: string;
  evento: string;
  externalRef: string | null;
  status: "PENDING" | "DELIVERED" | "FAILED_RETRYING" | "DEAD";
  attempts: number;
  nextRetryAt: string;
  lastError: string | null;
  createdAt: string;
}

const CHIP: Record<Entrega["status"], { texto: string; clase: string }> = {
  DELIVERED: { texto: "entregado", clase: "bg-ok-suave text-ok" },
  PENDING: { texto: "en cola", clase: "bg-tinta-fondo text-tinta-suave" },
  FAILED_RETRYING: { texto: "reintentando", clase: "bg-alerta-suave text-alerta" },
  DEAD: { texto: "agotado", clase: "bg-error-suave text-error" },
};

const EVENTO_TEXTO: Record<string, string> = {
  "intent.confirmed": "cobro confirmado",
  "intent.expired": "cobro vencido",
  "intent.failed": "cobro fallido",
};

function BotonReenviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-tinta-borde px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      )}
      Reenviar
    </button>
  );
}

function FilaEntrega({ entrega }: { entrega: Entrega }) {
  const [estado, accion] = useFormState<ResultadoApiKey | null, FormData>(
    reenviarWebhookDelivery,
    null
  );
  const chip = CHIP[entrega.status];

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tinta">
          {EVENTO_TEXTO[entrega.evento] ?? entrega.evento}
          {entrega.externalRef && (
            <span className="font-normal text-tinta-tenue"> · pedido {entrega.externalRef}</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm text-tinta-tenue">
          {new Date(entrega.createdAt).toLocaleString("es-VE")} · {entrega.endpointUrl}
        </p>
        {entrega.status === "FAILED_RETRYING" && (
          <p className="mt-0.5 text-sm text-tinta-tenue">
            Intento {entrega.attempts} · próximo:{" "}
            {new Date(entrega.nextRetryAt).toLocaleTimeString("es-VE")}
          </p>
        )}
        {entrega.lastError && entrega.status !== "DELIVERED" && (
          <p className="mt-0.5 truncate text-sm text-error">{entrega.lastError}</p>
        )}
        {estado &&
          (estado.ok ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ok">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              {estado.mensaje}
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-error">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {estado.error}
            </p>
          ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded-control px-2 py-0.5 text-xs font-medium ${chip.clase}`}>
          {chip.texto}
        </span>
        {(entrega.status === "DEAD" || entrega.status === "FAILED_RETRYING") && !estado?.ok && (
          <form action={accion}>
            <input type="hidden" name="id" value={entrega.id} />
            <BotonReenviar />
          </form>
        )}
      </div>
    </li>
  );
}

export default function EntregasWebhooks({ entregas }: { entregas: Entrega[] }) {
  if (entregas.length === 0) return null;

  return (
    <section className="mt-8">
      <h3 className="font-display font-bold tracking-tight text-tinta">Entregas recientes</h3>
      <p className="mb-3 mt-1 text-sm text-tinta-tenue">
        Cada aviso que te enviamos y si llegó. Un aviso agotado se puede
        reenviar cuando tu servidor vuelva a estar arriba.
      </p>
      <ul className="divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
        {entregas.map((e) => (
          <FilaEntrega key={e.id} entrega={e} />
        ))}
      </ul>
    </section>
  );
}
