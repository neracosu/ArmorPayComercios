import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session-guard";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Si ya hay sesión válida, no tiene sentido pedirla de nuevo.
  const session = await getVerifiedSession();
  if (session) redirect("/validar");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-marca-700">
            ArmorPay
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-tinta">
            Validación de pagos
          </h1>
          <p className="mt-2 text-sm text-tinta-tenue">
            Confirmá en segundos que el pago llegó a tu cuenta.
          </p>
        </div>

        <div className="rounded-card border border-tinta-borde bg-white p-6 shadow-sm">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-tinta-tenue">
          ¿Problemas para entrar? Pedile a tu administrador que revise tu usuario.
        </p>
      </div>
    </main>
  );
}
