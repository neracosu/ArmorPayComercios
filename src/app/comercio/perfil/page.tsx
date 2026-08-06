import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import GestionLogo from "./GestionLogo";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/perfil");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const comercio = await withSessionTenant(session, () =>
    prisma.organization.findUnique({
      where: { id: session.user.organizationId! },
      select: { id: true, razonSocial: true, rif: true, logoMime: true, logoUpdatedAt: true },
    })
  );

  const logoUrl = logoUrlDe(comercio);

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        logoUrl={logoUrl}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Perfil</h1>
        <p className="mb-6 mt-1 text-sm text-tinta-tenue">
          Tu marca dentro de la plataforma. El logo aparece en el panel de tus
          cajas y en tu página de pago — donde tus clientes confirman sus
          compras.
        </p>

        <div className="mb-6 rounded-card border border-tinta-borde bg-white p-6">
          <p className="text-sm text-tinta-tenue">Razón social certificada</p>
          <p className="mt-0.5 font-medium text-tinta">{comercio?.razonSocial}</p>
          <p className="mt-2 text-sm text-tinta-tenue">RIF</p>
          <p className="mt-0.5 font-mono text-sm text-tinta">{comercio?.rif}</p>
        </div>

        <GestionLogo logoUrl={logoUrl} />
      </main>
    </>
  );
}
