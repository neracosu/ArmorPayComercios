"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Copy, KeyRound, Loader2 } from "lucide-react";
import {
  guardarContactoComercio,
  guardarNotasComercio,
  resetearClaveDeUsuario,
  type Resultado,
} from "../../actions";

function Aviso({ resultado }: { resultado: Resultado | null }) {
  if (!resultado) return null;
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${
        resultado.ok ? "bg-ok-suave/50 text-ok" : "bg-error-suave text-error"
      }`}
    >
      {resultado.ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      {resultado.ok ? resultado.mensaje : resultado.error}
    </p>
  );
}

function BotonGuardar({ etiqueta }: { etiqueta: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {etiqueta}
    </button>
  );
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none";

/** A quién llamar cuando algo pasa con este comercio. */
export function FormularioContacto({
  organizationId,
  contactoNombre,
  contactoTelefono,
  contactoEmail,
}: {
  organizationId: string;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(
    guardarContactoComercio,
    null
  );

  return (
    <form action={accion} className="mt-3 rounded-control border border-tinta-borde bg-tinta-fondo p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="contactoNombre" className="mb-1 block text-xs font-medium text-tinta-tenue">
            Persona de contacto
          </label>
          <input
            id="contactoNombre"
            name="contactoNombre"
            defaultValue={contactoNombre ?? ""}
            placeholder="María Pérez"
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="contactoTelefono" className="mb-1 block text-xs font-medium text-tinta-tenue">
            Teléfono
          </label>
          <input
            id="contactoTelefono"
            name="contactoTelefono"
            inputMode="tel"
            defaultValue={contactoTelefono ?? ""}
            placeholder="04125551234"
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="contactoEmail" className="mb-1 block text-xs font-medium text-tinta-tenue">
            Correo
          </label>
          <input
            id="contactoEmail"
            name="contactoEmail"
            inputMode="email"
            defaultValue={contactoEmail ?? ""}
            placeholder="dueno@comercio.com"
            className={campo}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <BotonGuardar etiqueta="Guardar contacto" />
        {contactoTelefono && (
          <a
            href={`https://wa.me/${contactoTelefono.replace(/\D/g, "").replace(/^0/, "58")}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-marca-700 hover:underline"
          >
            Abrir WhatsApp
          </a>
        )}
        {contactoEmail && (
          <a href={`mailto:${contactoEmail}`} className="text-sm font-medium text-marca-700 hover:underline">
            Escribir correo
          </a>
        )}
      </div>
      <Aviso resultado={resultado} />
    </form>
  );
}

/** Notas internas de la relación. El comercio nunca las ve. */
export function FormularioNotas({
  organizationId,
  notasInternas,
}: {
  organizationId: string;
  notasInternas: string | null;
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(guardarNotasComercio, null);

  return (
    <form action={accion} className="mt-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <textarea
        name="notasInternas"
        rows={4}
        maxLength={5000}
        defaultValue={notasInternas ?? ""}
        placeholder="Acuerdos, números de trámite con el banco, contexto de la relación… Solo lo vemos nosotros."
        className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
      />
      <div className="mt-2">
        <BotonGuardar etiqueta="Guardar notas" />
      </div>
      <Aviso resultado={resultado} />
    </form>
  );
}

/**
 * Reset de contraseña de un usuario del comercio (o interno), con la nueva
 * mostrada una sola vez. Solo lo ve el PLATFORM_ADMIN.
 */
export function BotonResetClave({ userId, username }: { userId: string; username: string }) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(
    resetearClaveDeUsuario,
    null
  );
  const [confirmando, setConfirmando] = useState(false);

  if (resultado?.ok && resultado.credenciales) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-control border border-ok/30 bg-ok-suave/40 px-2.5 py-1 font-mono text-xs">
        Nueva: <strong>{resultado.credenciales.password}</strong>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(resultado.credenciales!.password)}
          className="inline-flex items-center gap-1 font-sans font-medium text-marca-700"
        >
          <Copy className="h-3 w-3" aria-hidden />
          Copiar
        </button>
      </span>
    );
  }

  if (!confirmando) {
    return (
      <span className="inline-flex items-center gap-2">
        {resultado && !resultado.ok && (
          <span className="text-xs text-error">{resultado.error}</span>
        )}
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          title={`Resetear la contraseña de ${username}`}
          className="inline-flex items-center gap-1 rounded-control border border-tinta-borde px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-tinta-fondo"
        >
          <KeyRound className="h-3 w-3" aria-hidden />
          Resetear clave
        </button>
      </span>
    );
  }

  return (
    <form action={accion} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <BotonResetConfirmar />
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="rounded-control px-2 py-1 text-xs text-tinta-tenue hover:bg-tinta-fondo"
      >
        Cancelar
      </button>
    </form>
  );
}

function BotonResetConfirmar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-control bg-alerta px-2 py-1 text-xs font-medium text-white hover:brightness-90 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      Sí, resetear y cerrar sesiones
    </button>
  );
}
