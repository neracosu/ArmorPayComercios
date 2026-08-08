import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import GestionApiKeys from "./GestionApiKeys";
import GestionWebhooks from "./GestionWebhooks";
import EntregasWebhooks, { type Entrega } from "./EntregasWebhooks";

export const dynamic = "force-dynamic";

export default async function ApiPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/api");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { llaves, endpoints, comercio, entregas } = await withSessionTenant(session, async () => {
    const [llaves, endpoints, comercio, entregas] = await Promise.all([
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
      prisma.webhookDelivery.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          endpointId: true,
          payload: true,
          status: true,
          attempts: true,
          nextRetryAt: true,
          lastError: true,
          createdAt: true,
        },
      }),
    ]);
    return { llaves, endpoints, comercio, entregas };
  });

  // El payload guarda el evento y el intent completos; para la lista alcanza
  // con el evento y el pedido. Sin FK a propósito (tabla de alto volumen):
  // la URL se resuelve acá contra los endpoints ya leídos.
  const urlPorEndpoint = new Map(endpoints.map((e) => [e.id, e.url]));
  const filasEntregas: Entrega[] = entregas.map((d) => {
    let evento = "aviso";
    let externalRef: string | null = null;
    try {
      const p = JSON.parse(d.payload) as { event?: string; intent?: { externalRef?: string } };
      evento = p.event ?? evento;
      externalRef = p.intent?.externalRef ?? null;
    } catch {
      // payload ilegible: se muestra genérico, nunca se rompe la página
    }
    return {
      id: d.id,
      endpointUrl: urlPorEndpoint.get(d.endpointId) ?? "(webhook eliminado)",
      evento,
      externalRef,
      status: d.status,
      attempts: d.attempts,
      nextRetryAt: d.nextRetryAt.toISOString(),
      lastError: d.lastError,
      createdAt: d.createdAt.toISOString(),
    };
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
          . ¿Tu tienda es WooCommerce?{" "}
          <a
            href="/descargas/armorpay-woocommerce.zip"
            className="font-medium text-marca-700 hover:underline"
          >
            Descarga el plugin (.zip)
          </a>
          , súbelo a tu WordPress y solo te falta pegar la llave y el webhook.
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
        <EntregasWebhooks entregas={filasEntregas} />
      </main>
    </>
  );
}
