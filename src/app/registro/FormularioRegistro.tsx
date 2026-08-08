"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { esRifJuridico, formatearRif, normalizarRif, validarRif } from "@/lib/rif";
import { registrarComercio, type ResultadoRegistro } from "./actions";

const campo =
  "w-full rounded-control border border-tinta-borde bg-white px-4 py-2.5 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none";
const etiqueta = "mb-1.5 block text-sm font-medium text-tinta-suave";

/**
 * Campo de RIF con verificación en vivo del dígito de control (módulo 11 del
 * SENIAT, calculado local — no hay API pública que consultar). Avisa recién
 * cuando hay un RIF completo o el campo pierde el foco: nada de regañar a
 * mitad de tipeo. El servidor revalida igual; esto es solo la cortesía.
 */
function CampoRif() {
  const [valor, setValor] = useState("");
  const [tocado, setTocado] = useState(false);

  const limpio = normalizarRif(valor);
  const completo = /^[A-Z]\d{9}/.test(limpio);
  const resultado = completo || (tocado && limpio.length > 0) ? validarRif(valor) : null;

  const veredicto = !resultado ? null : !resultado.ok ? (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-error">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {resultado.error}
    </p>
  ) : !esRifJuridico(resultado.rif) ? (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-error">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      Ese RIF es de persona natural. Trabajamos con personas jurídicas (J o G).
    </p>
  ) : (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-ok">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      RIF válido: {formatearRif(resultado.rif)}
    </p>
  );

  return (
    <div>
      <label htmlFor="rif" className={etiqueta}>
        RIF de la empresa
      </label>
      <input
        id="rif"
        name="rif"
        required
        maxLength={20}
        placeholder="J-12345678-9"
        className={campo}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => setTocado(true)}
      />
      {veredicto ?? (
        <p className="mt-1 text-xs text-tinta-tenue">De persona jurídica (empieza con J o G).</p>
      )}
    </div>
  );
}

function BotonRegistrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-marca-700 px-5 py-3 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60 sm:w-auto"
    >
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      ) : (
        <UserPlus className="h-5 w-5" aria-hidden />
      )}
      Crear la cuenta
    </button>
  );
}

export default function FormularioRegistro() {
  const [resultado, accion] = useFormState<ResultadoRegistro | null, FormData>(
    registrarComercio,
    null
  );

  if (resultado?.ok) {
    return (
      <div className="rounded-card border border-ok/40 bg-ok-suave/50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-ok" aria-hidden />
        <p className="mt-3 font-display text-lg font-bold text-tinta">Cuenta creada</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-tinta-suave">
          Entra con tu usuario <strong className="font-mono">{resultado.usuario}</strong> y
          sigue el paso a paso de activación: subir tus documentos, registrar
          tus cuentas bancarias y ver el estatus de tu aprobación.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex items-center justify-center rounded-control bg-marca-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-marca-900"
        >
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      {/* Honeypot, igual que en la propuesta. */}
      <div className="absolute -left-[9999px]" aria-hidden>
        <label htmlFor="sitioWeb">No completar</label>
        <input id="sitioWeb" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="razonSocial" className={etiqueta}>
          Razón social de la empresa
        </label>
        <input
          id="razonSocial"
          name="razonSocial"
          required
          maxLength={160}
          placeholder="Comercial Ejemplo, C.A."
          className={campo}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoRif />
        <div>
          <label htmlFor="nombre" className={etiqueta}>
            Tu nombre
          </label>
          <input id="nombre" name="nombre" required maxLength={120} className={campo} />
        </div>
      </div>

      <div>
        <label htmlFor="email" className={etiqueta}>
          Correo de contacto
        </label>
        <input id="email" name="email" type="email" required maxLength={160} className={campo} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="usuario" className={etiqueta}>
            Usuario para entrar
          </label>
          <input
            id="usuario"
            name="usuario"
            required
            maxLength={30}
            autoComplete="username"
            placeholder="mi-comercio"
            className={campo}
          />
          <p className="mt-1 text-xs text-tinta-tenue">Minúsculas, números y guiones.</p>
        </div>
        <div>
          <label htmlFor="password" className={etiqueta}>
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            className={campo}
          />
          <p className="mt-1 text-xs text-tinta-tenue">Mínimo 8 caracteres.</p>
        </div>
      </div>

      {resultado && !resultado.ok && (
        <p className="flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {resultado.error}
        </p>
      )}

      <BotonRegistrar />
    </form>
  );
}
