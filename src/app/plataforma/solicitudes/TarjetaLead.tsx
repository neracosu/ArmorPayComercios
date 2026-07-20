"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, Check, Copy, Loader2, UserPlus } from "lucide-react";
import { convertirLead, cambiarEstadoLead, type Resultado } from "../actions";

type Lead = {
  id: string;
  empresa: string;
  rif: string | null;
  contacto: string;
  email: string;
  telefono: string | null;
  cajas: number | null;
  sucursales: number | null;
  banco: string | null;
  mensaje: string | null;
  estado: string;
  createdAt: string;
};

/** `ARMOR MARKET, C.A.` → `armor-market` — sugerencia, siempre editable. */
function sugerirSlug(empresa: string): string {
  return empresa
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function Boton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none";

export default function TarjetaLead({ lead }: { lead: Lead }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useFormState<Resultado | null, FormData>(convertirLead, null);
  const slug = sugerirSlug(lead.empresa);

  // Convertido: se muestran las credenciales UNA vez. No se pueden recuperar
  // después — si se pierden, se resetea la contraseña, no se busca en la base.
  if (estado?.ok && estado.credenciales) {
    return (
      <article className="rounded-card border border-ok/30 bg-ok-suave/40 p-5">
        <p className="flex items-center gap-2 font-medium text-ok">
          <Check className="h-4 w-4" aria-hidden />
          {estado.mensaje}
        </p>
        <div className="mt-4 rounded-control border border-tinta-borde bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-tinta-tenue">
            Credenciales — se muestran una sola vez
          </p>
          <p className="mt-2 font-mono text-sm text-tinta">
            Usuario: <strong>{estado.credenciales.usuario}</strong>
          </p>
          <p className="font-mono text-sm text-tinta">
            Contraseña: <strong>{estado.credenciales.password}</strong>
          </p>
          <button
            type="button"
            onClick={() =>
              navigator.clipboard.writeText(
                `Usuario: ${estado.credenciales!.usuario}\nContraseña: ${estado.credenciales!.password}`
              )
            }
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-marca-700 hover:text-marca-900"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copiar
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-card border border-tinta-borde bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-bold tracking-tight text-tinta">{lead.empresa}</h3>
          <p className="mt-0.5 text-sm text-tinta-tenue">
            {lead.contacto} · {lead.email}
            {lead.telefono ? ` · ${lead.telefono}` : ""}
          </p>
        </div>
        <span className="rounded-control bg-tinta-fondo px-2 py-1 text-xs font-medium text-tinta-tenue">
          {new Date(lead.createdAt).toLocaleDateString("es-VE")}
        </span>
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {lead.rif && (
          <div>
            <dt className="inline text-tinta-tenue">RIF: </dt>
            <dd className="inline font-medium text-tinta">{lead.rif}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-tinta-tenue">Cajas: </dt>
          <dd className="inline font-medium text-tinta">{lead.cajas ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-tinta-tenue">Sucursales: </dt>
          <dd className="inline font-medium text-tinta">{lead.sucursales ?? "—"}</dd>
        </div>
        {lead.banco && (
          <div>
            <dt className="inline text-tinta-tenue">Banco: </dt>
            <dd className="inline font-medium text-tinta">{lead.banco}</dd>
          </div>
        )}
      </dl>

      {lead.mensaje && (
        <p className="mt-4 rounded-control bg-tinta-fondo p-3 text-sm leading-relaxed text-tinta-suave">
          {lead.mensaje}
        </p>
      )}

      {!abierto ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Convertir en comercio
          </button>
          {lead.estado === "NUEVO" && (
            <button
              type="button"
              onClick={() => cambiarEstadoLead(lead.id, "CONTACTADO")}
              className="rounded-control border border-tinta-borde px-4 py-2 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
            >
              Marcar contactado
            </button>
          )}
          <button
            type="button"
            onClick={() => cambiarEstadoLead(lead.id, "DESCARTADO")}
            className="rounded-control px-4 py-2 text-sm font-medium text-tinta-tenue hover:bg-tinta-fondo"
          >
            Descartar
          </button>
        </div>
      ) : (
        <form action={accion} className="mt-5 border-t border-tinta-borde pt-5">
          <input type="hidden" name="leadId" value={lead.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-tinta-tenue">
                Razón social (como figura ante el banco)
              </label>
              <input name="razonSocial" defaultValue={lead.empresa} required className={campo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tinta-tenue">RIF</label>
              <input name="rif" defaultValue={lead.rif ?? ""} required className={campo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tinta-tenue">
                Identificador
              </label>
              <input name="slug" defaultValue={slug} required className={campo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tinta-tenue">
                Usuario administrador
              </label>
              <input name="usuario" defaultValue={`admin-${slug}`} required className={campo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tinta-tenue">
                Nombre del responsable
              </label>
              <input
                name="nombreUsuario"
                defaultValue={lead.contacto}
                required
                className={campo}
              />
            </div>
          </div>

          {estado && !estado.ok && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2 text-sm text-error"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {estado.error}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <Boton>Crear comercio</Boton>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-control px-4 py-2 text-sm font-medium text-tinta-tenue hover:bg-tinta-fondo"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
