import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getVerifiedSession } from "@/lib/session-guard";
import FormularioContrasena from "./FormularioContrasena";

export const dynamic = "force-dynamic";

const ROL: Record<string, string> = {
  PLATFORM_ADMIN: "Administrador de la plataforma",
  PLATFORM_REVIEWER: "Revisora de expedientes",
  ORG_ADMIN: "Administrador del comercio",
  OPERATOR: "Caja",
};

/**
 * Mi cuenta: la página propia de CUALQUIER usuario logueado. Hoy, cambiar la
 * contraseña — antes de esto nadie podía cambiar la suya, de ningún rol.
 * Deliberadamente sin cabecera de panel: sirve igual a una caja, a un dueño
 * y a la plataforma.
 */
export default async function CuentaPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/cuenta");

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <Link
        href="/inicio"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue hover:text-tinta"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Volver a mi panel
      </Link>

      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-tinta">Mi cuenta</h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        <span className="font-medium text-tinta">{session.user.name}</span> ·{" "}
        {ROL[session.user.role] ?? session.user.role}
      </p>

      <div className="mt-6">
        <FormularioContrasena />
      </div>
    </main>
  );
}
