"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Loader2 } from "lucide-react";
import { enviarSolicitud, type EstadoEnvio } from "./actions";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-marca-700 px-5 py-3 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60 sm:w-auto"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? "Enviando…" : "Enviar solicitud"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </button>
  );
}

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-3 py-2.5 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none";
const etiqueta = "mb-1.5 block text-sm font-medium text-tinta-suave";

export default function FormularioPropuesta() {
  const [estado, accion] = useFormState<EstadoEnvio | null, FormData>(
    enviarSolicitud,
    null
  );

  if (estado?.ok) {
    return (
      <div className="rounded-card border border-tinta-borde bg-white p-8 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-ok-suave text-ok">
          <Check className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-tinta">
          Recibimos tu solicitud
        </h2>
        <p className="mt-2 leading-relaxed text-tinta-suave">
          Te vamos a escribir al correo que dejaste para entender cómo cobrás
          hoy y armarte una propuesta concreta.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-marca-700 underline underline-offset-4"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="rounded-card border border-tinta-borde bg-white p-6 sm:p-8">
      {/* Campo trampa: fuera de pantalla y sin foco, invisible para una persona. */}
      <div aria-hidden className="absolute left-[-9999px]">
        <label htmlFor="sitioWeb">No completar</label>
        <input id="sitioWeb" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="empresa" className={etiqueta}>
            Nombre de la empresa
          </label>
          <input id="empresa" name="empresa" required maxLength={120} className={campo} />
        </div>

        <div>
          <label htmlFor="contacto" className={etiqueta}>
            Tu nombre
          </label>
          <input id="contacto" name="contacto" required maxLength={120} className={campo} />
        </div>

        <div>
          <label htmlFor="rif" className={etiqueta}>
            RIF <span className="font-normal text-tinta-tenue">(opcional)</span>
          </label>
          <input id="rif" name="rif" maxLength={20} placeholder="J-12345678-9" className={campo} />
        </div>

        <div>
          <label htmlFor="email" className={etiqueta}>
            Correo
          </label>
          <input id="email" name="email" type="email" required maxLength={160} className={campo} />
        </div>

        <div>
          <label htmlFor="telefono" className={etiqueta}>
            Teléfono <span className="font-normal text-tinta-tenue">(opcional)</span>
          </label>
          <input id="telefono" name="telefono" maxLength={40} className={campo} />
        </div>

        <div>
          <label htmlFor="cajas" className={etiqueta}>
            ¿Cuántas cajas tenés?
          </label>
          <input id="cajas" name="cajas" type="number" min={0} max={9999} className={campo} />
        </div>

        <div>
          <label htmlFor="sucursales" className={etiqueta}>
            ¿Cuántas sucursales?
          </label>
          <input id="sucursales" name="sucursales" type="number" min={0} max={999} className={campo} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="banco" className={etiqueta}>
            ¿En qué banco cobrás?
          </label>
          <input
            id="banco"
            name="banco"
            maxLength={80}
            placeholder="Banco Digital de los Trabajadores, Mercantil, BDV…"
            className={campo}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="mensaje" className={etiqueta}>
            ¿Qué se te complica hoy para cobrar?
          </label>
          <textarea
            id="mensaje"
            name="mensaje"
            rows={4}
            maxLength={2000}
            placeholder="Contanos cómo verifican los pagos hoy y qué les cuesta más."
            className={campo}
          />
        </div>
      </div>

      {estado && !estado.ok && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}

      <div className="mt-7">
        <Enviar />
      </div>
    </form>
  );
}
