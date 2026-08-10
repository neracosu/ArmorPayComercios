"use client";

import { Printer } from "lucide-react";

export default function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 print:hidden"
    >
      <Printer className="h-4 w-4" aria-hidden />
      Imprimir
    </button>
  );
}
