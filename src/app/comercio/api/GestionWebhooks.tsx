"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Power, Webhook } from "lucide-react";
import {
  crearWebhookEndpoint,
  desactivarWebhookEndpoint,
  rotarSecretoWebhook,
  type ResultadoApiKey,
} from "./actions";

interface Endpoint {
  id: string;
  url: string;
  isActive: boolean;
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
        <Webhook className="h-4 w-4" aria-hidden />
      )}
      Agregar webhook
    </button>
  );
}

function SecretoRecienCreado({ resultado }: { resultado: ResultadoApiKey }) {
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
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 text-xs text-tinta-tenue">
        Con este secreto tu servidor verifica la firma de cada aviso
        (headers <code>x-armorpay-timestamp</code> y{" "}
        <code>x-armorpay-signature</code>: HMAC-SHA256 de{" "}
        <code>timestamp.body</code>).
      </p>
    </div>
  );
}

function FilaEndpoint({ endpoint }: { endpoint: Endpoint }) {
  const [estado, accion] = useFormState<ResultadoApiKey | null, FormData>(
    desactivarWebhookEndpoint,
    null
  );
  const [estadoRotar, accionRotar] = useFormState<ResultadoApiKey | null, FormData>(
    rotarSecretoWebhook,
    null
  );
  const [confirmar, setConfirmar] = useState(false);
  const [confirmarRotar, setConfirmarRotar] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-tinta">
          {endpoint.url}
          {!endpoint.isActive && (
            <span className="ml-2 rounded-full bg-tinta-fondo px-2 py-0.5 font-sans text-xs text-tinta-tenue">
              inactivo
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-tinta-tenue">
          Desde {new Date(endpoint.createdAt).toLocaleDateString("es-VE")}
        </p>
        {estado && !estado.ok && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-error">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {estado.error}
          </p>
        )}
        {estadoRotar && !estadoRotar.ok && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-error">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {estadoRotar.error}
          </p>
        )}
      </div>
      {endpoint.isActive && (
        <div className="flex shrink-0 items-center gap-2">
          <form action={accionRotar}>
            <input type="hidden" name="id" value={endpoint.id} />
            {confirmarRotar ? (
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-control bg-alerta px-3 py-2 text-sm font-medium text-white hover:brightness-90"
              >
                <KeyRound className="h-4 w-4" aria-hidden />
                El anterior deja de valer ya
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarRotar(true)}
                className="inline-flex items-center gap-1.5 rounded-control border border-tinta-borde px-3 py-2 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
              >
                <KeyRound className="h-4 w-4" aria-hidden />
                Rotar secreto
              </button>
            )}
          </form>
          <form action={accion}>
            <input type="hidden" name="id" value={endpoint.id} />
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
        </div>
      )}
      {estadoRotar?.ok && (
        <div className="w-full">
          <SecretoRecienCreado resultado={estadoRotar} />
        </div>
      )}
    </li>
  );
}

export default function GestionWebhooks({ endpoints }: { endpoints: Endpoint[] }) {
  const [resultado, accion] = useFormState<ResultadoApiKey | null, FormData>(
    crearWebhookEndpoint,
    null
  );

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-bold tracking-tight text-tinta">Webhooks</h2>
      <p className="mb-4 mt-1 text-sm text-tinta-tenue">
        Te avisamos a tu servidor cada vez que un cobro se confirma o vence —
        firmado, con reintentos automáticos. Tu tienda no necesita quedarse
        preguntando.
      </p>

      <form action={accion} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="url" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            URL de tu servidor
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            maxLength={500}
            placeholder="https://mitienda.com/armorpay/webhook"
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
      {resultado?.ok && <SecretoRecienCreado resultado={resultado} />}

      {endpoints.length > 0 && (
        <ul className="mt-6 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {endpoints.map((e) => (
            <FilaEndpoint key={e.id} endpoint={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
