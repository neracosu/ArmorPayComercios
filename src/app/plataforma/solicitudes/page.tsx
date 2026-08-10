import Link from "next/link";
import { redirect } from "next/navigation";
import { PrismaClient, type LeadEstado } from "@prisma/client";
import { Inbox } from "lucide-react";
import { getVerifiedSession } from "@/lib/session-guard";
import TarjetaLead from "./TarjetaLead";

export const dynamic = "force-dynamic";

// Cliente sin la extensión de tenant: `Lead` es un modelo de plataforma y esta
// pantalla es intencionalmente multi-comercio. El aislamiento acá lo da el rol.
const db = new PrismaClient();

const FILTROS: Array<{ clave: string; texto: string; estados: LeadEstado[] }> = [
  { clave: "", texto: "Pendientes", estados: ["NUEVO", "CONTACTADO"] },
  { clave: "convertidas", texto: "Convertidas", estados: ["CONVERTIDO"] },
  { clave: "descartadas", texto: "Descartadas", estados: ["DESCARTADO"] },
];

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: { ver?: string };
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/plataforma/solicitudes");
  // La revisora VE la cola (su nav la promete); convertir y descartar siguen
  // siendo del admin — las server actions lo exigen por su cuenta.
  const rol = session.user.role;
  if (rol !== "PLATFORM_ADMIN" && rol !== "PLATFORM_REVIEWER") redirect("/validar");
  const soloLectura = rol !== "PLATFORM_ADMIN";

  // Antes solo se veían las pendientes: una solicitud convertida o descartada
  // desaparecía de TODAS las pantallas, historia incluida.
  const filtro = FILTROS.find((f) => f.clave === (searchParams.ver ?? "")) ?? FILTROS[0];
  const leads = await db.lead.findMany({
    where: { estado: { in: filtro.estados } },
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

      <nav className="mb-6 flex gap-1.5" aria-label="Filtro de solicitudes">
        {FILTROS.map((f) => (
          <Link
            key={f.clave}
            href={f.clave ? `/plataforma/solicitudes?ver=${f.clave}` : "/plataforma/solicitudes"}
            className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
              f.clave === filtro.clave
                ? "bg-tinta text-white"
                : "text-tinta-suave hover:bg-tinta-fondo"
            }`}
          >
            {f.texto}
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <div className="rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
          <Inbox className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
          <p className="mt-3 font-medium text-tinta">
            {filtro.clave === "" ? "No hay solicitudes pendientes" : `No hay solicitudes ${filtro.texto.toLowerCase()}`}
          </p>
          <p className="mt-1 text-sm text-tinta-tenue">
            Cuando alguien complete el formulario de la portada, aparece acá.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <TarjetaLead
              key={lead.id}
              lead={{
                ...lead,
                createdAt: lead.createdAt.toISOString(),
                convertidoAt: lead.convertidoAt?.toISOString() ?? null,
              }}
              soloLectura={soloLectura}
            />
          ))}
        </div>
      )}
    </main>
  );
}
