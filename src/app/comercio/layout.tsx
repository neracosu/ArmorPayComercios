import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";

/**
 * Banner del estado del alta, arriba de TODO el panel del comercio. La página
 * de activación ya tiene su stepper; este banner existe para las DEMÁS
 * páginas, donde antes no había ningún rastro del proceso: mientras la
 * organización no esté ACTIVA, el admin siempre sabe en qué paso va y tiene
 * el camino de vuelta a /comercio/activacion a un clic.
 */

const AVISO: Record<string, { progreso: string; texto: string }> = {
  REGISTRADA: {
    progreso: "paso 1 de 5",
    texto: "Registro recibido — te falta completar documentos, cuentas y credenciales.",
  },
  RECAUDOS_COMPLETOS: {
    progreso: "paso 2 de 5",
    texto: "Tu expediente está completo y en revisión de nuestro equipo.",
  },
  ENVIADA_AL_BANCO: {
    progreso: "paso 3 de 5",
    texto: "Tu afiliación está en trámite con el banco.",
  },
  CERTIFICACION: {
    progreso: "paso 4 de 5",
    texto: "Estamos certificando tus credenciales contra el banco.",
  },
};

export default async function ComercioLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();

  let status: string | null = null;
  if (session?.user.role === "ORG_ADMIN" && session.user.organizationId) {
    const org = await withSessionTenant(session, () =>
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { status: true },
      })
    );
    status = org?.status ?? null;
  }

  const aviso = status ? AVISO[status] : undefined;
  const rechazada = status === "RECHAZADA";

  return (
    <>
      {(aviso || rechazada) && (
        <div className={`px-6 py-2.5 text-sm text-white ${rechazada ? "bg-error" : "bg-marca-700"}`}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p>
              <span className="font-semibold">
                {rechazada ? "Solicitud rechazada:" : `Activación en curso (${aviso!.progreso}):`}
              </span>{" "}
              {rechazada
                ? "escríbenos desde la página de propuesta si crees que es un error."
                : aviso!.texto}
            </p>
            {!rechazada && (
              <Link
                href="/comercio/activacion"
                className="inline-flex shrink-0 items-center gap-1 font-medium underline underline-offset-2 hover:opacity-90"
              >
                Ver mi proceso
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      )}
      {children}
    </>
  );
}
