"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";

/**
 * Acceso al panel.
 *
 * Pensado para una caja: se entra una vez y la sesión dura. El usuario suele
 * tipearse con el teclado numérico al lado, así que el foco arranca en el
 * campo de usuario y el envío con Enter funciona sin tocar el mouse.
 */
export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const datos = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      username: String(datos.get("username") ?? ""),
      password: String(datos.get("password") ?? ""),
      redirect: false,
    });

    if (res?.ok) {
      router.push(params.get("callbackUrl") ?? "/validar");
      router.refresh();
      return;
    }

    // Deliberadamente sin distinguir "no existe" de "contraseña incorrecta":
    // esa diferencia le sirve más a quien prueba usuarios que a la cajera.
    setError("Usuario o contraseña incorrectos.");
    setEnviando(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-tinta-suave">
          Usuario
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2.5 text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          placeholder="caja1-principal"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-tinta-suave">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2.5 text-tinta focus:border-marca-600 focus:outline-none"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="flex w-full items-center justify-center gap-2 rounded-control bg-marca-700 px-4 py-2.5 font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
      >
        {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
