"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function CerrarSesion() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tinta-tenue hover:bg-tinta-fondo hover:text-tinta"
    >
      <LogOut className="h-4 w-4" aria-hidden />
      <span className="sr-only sm:not-sr-only">Salir</span>
    </button>
  );
}
