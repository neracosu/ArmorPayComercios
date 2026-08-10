"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, ImagePlus, Loader2 } from "lucide-react";
import { guardarAfiliacionC2p, subirLogoComercio, type Resultado } from "../../actions";

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

/**
 * Afiliación C2P del Tesoro. El código lo entrega el banco por empresa
 * (la identidad del servicio es codAfiliado + RIF); el interruptor es lo que
 * enciende el método en la API y en la página de pago.
 */
export function FormularioC2p({
  organizationId,
  codAfiliado,
  habilitado,
}: {
  organizationId: string;
  codAfiliado: string | null;
  habilitado: boolean;
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(guardarAfiliacionC2p, null);
  const [prendido, setPrendido] = useState(habilitado);

  return (
    <form action={accion} className="mt-3 rounded-control border border-tinta-borde bg-tinta-fondo p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44">
          <label htmlFor="codAfiliado" className="mb-1 block text-sm text-tinta-suave">
            Código de afiliado
          </label>
          <input
            id="codAfiliado"
            name="codAfiliado"
            inputMode="numeric"
            pattern="\d{4,12}"
            defaultValue={codAfiliado ?? ""}
            placeholder="012345"
            className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 font-mono text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 py-2 text-sm text-tinta-suave">
          <input
            type="checkbox"
            name="habilitado"
            value="1"
            checked={prendido}
            onChange={(e) => setPrendido(e.target.checked)}
            className="h-4 w-4 accent-marca-700"
          />
          C2P habilitado para cobrar
        </label>
        <BotonGuardar etiqueta="Guardar" />
      </div>
      <p className="mt-2 text-xs text-tinta-tenue">
        Se guarda tal cual lo emite el banco, con sus ceros a la izquierda.
        Habilítalo solo cuando el banco confirme la afiliación de ESTA empresa.
      </p>
      <Aviso resultado={resultado} />
    </form>
  );
}

/** Subida del logo en nombre del comercio, para dejar el alta completa. */
export function FormularioLogo({
  organizationId,
  logoUrl,
}: {
  organizationId: string;
  logoUrl: string | null;
}) {
  const [resultado, accion] = useFormState<Resultado | null, FormData>(subirLogoComercio, null);
  const [preview, setPreview] = useState<string | null>(null);
  const mostrado = preview ?? logoUrl;

  return (
    <form action={accion} className="mt-3 rounded-control border border-tinta-borde bg-tinta-fondo p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-dashed border-tinta-borde bg-white">
          {mostrado ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview local o nuestra propia ruta
            <img src={mostrado} alt="Logo" className="h-full w-full object-contain p-1" />
          ) : (
            <ImagePlus className="h-5 w-5 text-tinta-tenue" aria-hidden />
          )}
        </div>
        <div className="min-w-52 flex-1">
          <input
            name="logo"
            type="file"
            required
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            className="block w-full text-sm text-tinta-suave file:mr-3 file:rounded-control file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-tinta-suave"
          />
          <p className="mt-1 text-xs text-tinta-tenue">PNG, JPG o WebP · hasta 512 KB.</p>
        </div>
        <BotonGuardar etiqueta="Guardar logo" />
      </div>
      <Aviso resultado={resultado} />
    </form>
  );
}
