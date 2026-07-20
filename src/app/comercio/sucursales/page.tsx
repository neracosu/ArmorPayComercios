import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import GestionSucursales from "./GestionSucursales";

export const dynamic = "force-dynamic";

export default async function SucursalesPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/sucursales");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { sucursales, comercio } = await withSessionTenant(session, async () => {
    const [sucursales, comercio] = await Promise.all([
      prisma.branch.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true, _count: { select: { users: true } } },
      }),
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { razonSocial: true },
      }),
    ]);
    return { sucursales, comercio };
  });

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Sucursales</h1>
        <p className="mb-6 mt-1 text-sm text-tinta-tenue">
          Los locales de tu negocio. Cada caja pertenece a una, y los cierres se
          pueden ver separados por local.
        </p>
        <GestionSucursales
          sucursales={sucursales.map((s) => ({
            id: s.id,
            name: s.name,
            code: s.code,
            cajas: s._count.users,
          }))}
        />
      </main>
    </>
  );
}
