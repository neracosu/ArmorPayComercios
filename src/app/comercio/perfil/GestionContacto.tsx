"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2, Phone } from "lucide-react";
import { guardarMiContacto, type ResultadoPerfil } from "./actions";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      Guardar contacto
    </button>
  );
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none";

/** El dato de contacto del comercio, mantenido por su dueño. */
export default function GestionContacto({
  contactoNombre,
  contactoTelefono,
  contactoEmail,
}: {
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
}) {
  const [resultado, accion] = useFormState<ResultadoPerfil | null, FormData>(
    guardarMiContacto,
    null
  );

  return (
    <section className="mt-6 rounded-card border border-tinta-borde bg-white p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
        <Phone className="h-4 w-4 text-marca-700" aria-hidden />
        Datos de contacto
      </h2>
      <p className="mt-1 text-sm text-tinta-tenue">
        A quién llamamos si algo pasa con tu cuenta o tus credenciales. Mantenlo al día.
      </p>
      <form action={accion} className="mt-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="mi-contacto-nombre" className="mb-1 block text-xs font-medium text-tinta-tenue">
              Persona
            </label>
            <input
              id="mi-contacto-nombre"
              name="contactoNombre"
              defaultValue={contactoNombre ?? ""}
              placeholder="María Pérez"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="mi-contacto-telefono" className="mb-1 block text-xs font-medium text-tinta-tenue">
              Teléfono
            </label>
            <input
              id="mi-contacto-telefono"
              name="contactoTelefono"
              inputMode="tel"
              defaultValue={contactoTelefono ?? ""}
              placeholder="04125551234"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="mi-contacto-email" className="mb-1 block text-xs font-medium text-tinta-tenue">
              Correo
            </label>
            <input
              id="mi-contacto-email"
              name="contactoEmail"
              inputMode="email"
              defaultValue={contactoEmail ?? ""}
              placeholder="dueno@comercio.com"
              className={campo}
            />
          </div>
        </div>
        <div className="mt-3">
          <Boton />
        </div>
        {resultado && (
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
        )}
      </form>
    </section>
  );
}
