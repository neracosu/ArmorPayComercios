import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { Inbox } from "lucide-react";
import { getVerifiedSession } from "@/lib/session-guard";
import TarjetaLead from "./TarjetaLead";

export const dynamic = "force-dynamic";

// Cliente sin la extensión de tenant: `Lead` es un modelo de plataforma y esta
// pantalla es intencionalmente multi-comercio. El aislamiento acá lo da el rol.
const db = new PrismaClient();

export default async function SolicitudesPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/plataforma/solicitudes");
  if (session.user.role !== "PLATFORM_ADMIN") redirect("/validar");

  const leads = await db.lead.findMany({
    where: { estado: { in: ["NUEVO", "CONTACTADO"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-widest text-marca-700">
          Plataforma
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-tinta">
          Solicitudes de propuesta
        </h1>
        <p className="mt-2 text-sm text-tinta-tenue">
          Lo que llega desde la portada. Convertir una crea el comercio, su
          sucursal y el usuario administrador.
        </p>
      </header>

      {leads.length === 0 ? (
        <div className="rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
          <Inbox className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
          <p className="mt-3 font-medium text-tinta">No hay solicitudes pendientes</p>
          <p className="mt-1 text-sm text-tinta-tenue">
            Cuando alguien complete el formulario de la portada, aparece acá.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <TarjetaLead
              key={lead.id}
              lead={{ ...lead, createdAt: lead.createdAt.toISOString() }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
