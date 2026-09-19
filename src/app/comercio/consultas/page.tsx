import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import ListaConsultas, { SELECT_CONSULTA } from "@/components/ListaConsultas";

export const dynamic = "force-dynamic";

/**
 * Historial de consultas al banco y cobros C2P de las cajas. Cada intento
 * queda registrado en `ValidationRequest` desde que existe la validación
 * online — esta pantalla lo hace VISIBLE al dueño: qué preguntaron sus cajas,
 * qué respondió el banco y cuándo.
 */
export default async function ConsultasPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/consultas");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { comercio, consultas } = await withSessionTenant(session, async () => {
    const [comercio, consultas] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { id: true, razonSocial: true, logoMime: true, logoUpdatedAt: true },
      }),
      prisma.validationRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: SELECT_CONSULTA,
      }),
    ]);
    return { comercio, consultas };
  });

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        logoUrl={logoUrlDe(comercio)}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
          Consultas al banco
        </h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Cada consulta en línea y cada cobro con Botón de Pago que hicieron tus
          cajas, con la respuesta literal del banco.
        </p>

        {consultas.length === 0 ? (
          <div className="mt-6 rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
            <Landmark className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
            <p className="mt-3 font-medium text-tinta">Todavía no hay consultas</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-tinta-tenue">
              Cuando una caja consulte un pago con datos completos o cobre con el
              Botón de Pago, queda registrado acá.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <ListaConsultas consultas={consultas} mostrarCaja />
          </div>
        )}
        {consultas.length >= 100 && (
          <p className="mt-3 text-xs text-tinta-tenue">Se muestran las últimas 100.</p>
        )}
      </main>
    </>
  );
}
