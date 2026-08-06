"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { subirLogo, quitarLogo, type ResultadoPerfil } from "./actions";

function BotonSubir() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <ImagePlus className="h-4 w-4" aria-hidden />
      )}
      Guardar logo
    </button>
  );
}

export default function GestionLogo({ logoUrl }: { logoUrl: string | null }) {
  const [subida, accionSubir] = useFormState<ResultadoPerfil | null, FormData>(subirLogo, null);
  const [quitada, accionQuitar] = useFormState<ResultadoPerfil | null, FormData>(quitarLogo, null);
  const [preview, setPreview] = useState<string | null>(null);

  const resultado = subida ?? quitada;
  const mostrado = preview ?? logoUrl;

  return (
    <div className="rounded-card border border-tinta-borde bg-white p-6">
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-card border border-dashed border-tinta-borde bg-tinta-fondo">
          {mostrado ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview local o nuestra propia ruta
            <img src={mostrado} alt="Logo del comercio" className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="px-2 text-center text-xs text-tinta-tenue">Sin logo todavía</span>
          )}
        </div>

        <form action={accionSubir} className="min-w-56 flex-1">
          <label htmlFor="logo" className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Imagen del logo
          </label>
          <input
            id="logo"
            name="logo"
            type="file"
            required
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            className="block w-full text-sm text-tinta-suave file:mr-3 file:rounded-control file:border-0 file:bg-tinta-fondo file:px-4 file:py-2 file:text-sm file:font-medium file:text-tinta-suave hover:file:bg-tinta-borde/50"
          />
          <p className="mt-1.5 text-xs text-tinta-tenue">
            PNG, JPG o WebP, hasta 512 KB. Se ve mejor cuadrado y con fondo
            transparente.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <BotonSubir />
            {logoUrl && (
              <button
                type="submit"
                formAction={accionQuitar}
                formNoValidate
                className="inline-flex items-center gap-1.5 rounded-control border border-error/40 px-4 py-2.5 text-sm font-medium text-error hover:bg-error-suave"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Quitar
              </button>
            )}
          </div>
        </form>
      </div>

      {resultado && (
        <p
          className={`mt-4 flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${
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
    </div>
  );
}
