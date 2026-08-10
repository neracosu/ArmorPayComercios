"use client";

import { RotateCcw } from "lucide-react";

/**
 * Pantalla de error de servidor con la marca y en español. `reset()`
 * reintenta el render — la mayoría de los errores transitorios (red, reload
 * del proceso en un deploy) se resuelven con eso.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-base font-bold tracking-tight text-tinta">
        Armor<span className="text-marca-700">Pay</span>
      </p>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-tinta">
        Algo falló de nuestro lado
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-tinta-tenue">
        Ya quedó registrado. Reintenta — si acabamos de actualizar la
        plataforma, con reintentar alcanza.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-control bg-marca-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-marca-900"
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
        Reintentar
      </button>
    </main>
  );
}
