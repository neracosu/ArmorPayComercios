import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import GestionApiKeys from "./GestionApiKeys";
import GestionWebhooks from "./GestionWebhooks";

export const dynamic = "force-dynamic";

export default async function ApiPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/api");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { llaves, endpoints, comercio } = await withSessionTenant(session, async () => {
    const [llaves, endpoints, comercio] = await Promise.all([
      prisma.apiKey.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          prefix: true,
          isActive: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),
      prisma.webhookEndpoint.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, url: true, isActive: true, createdAt: true },
      }),
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { id: true, razonSocial: true, logoMime: true, logoUpdatedAt: true },
      }),
    ]);
    return { llaves, endpoints, comercio };
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
          Llaves de API
        </h1>
        <p className="mb-2 mt-1 text-sm text-tinta-tenue">
          Con una llave, tu tienda en línea crea cobros y los confirma contra
          tus cuentas. La llave completa se muestra una sola vez al crearla:
          guárdala en tu servidor, nunca en el navegador de tus clientes.
        </p>
        <p className="mb-6 text-sm text-tinta-tenue">
          La guía completa para tu desarrollador está en{" "}
          <a href="/docs/api" target="_blank" className="font-medium text-marca-700 hover:underline">
            armorpay.net/docs/api
          </a>
          .
        </p>
        <GestionApiKeys
          llaves={llaves.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            isActive: k.isActive,
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            createdAt: k.createdAt.toISOString(),
          }))}
        />
        <GestionWebhooks
          endpoints={endpoints.map((e) => ({
            id: e.id,
            url: e.url,
            isActive: e.isActive,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
      </main>
    </>
  );
}
