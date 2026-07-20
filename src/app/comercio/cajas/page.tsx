import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import GestionCajas from "./GestionCajas";

export const dynamic = "force-dynamic";

export default async function CajasPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/cajas");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { cajas, sucursales, comercio } = await withSessionTenant(session, async () => {
    const [cajas, sucursales, comercio] = await Promise.all([
      prisma.user.findMany({
        where: { role: "OPERATOR" },
        orderBy: { username: "asc" },
        select: {
          id: true,
          username: true,
          name: true,
          isActive: true,
          branch: { select: { name: true } },
        },
      }),
      prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { razonSocial: true },
      }),
    ]);
    return { cajas, sucursales, comercio };
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
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Cajas</h1>
        <p className="mb-6 mt-1 text-sm text-tinta-tenue">
          Las cajas de tu negocio. Vos las creás y las administrás; nosotros no
          tocamos nada de acá.
        </p>
        <GestionCajas
          cajas={cajas.map((c) => ({
            id: c.id,
            username: c.username,
            name: c.name,
            isActive: c.isActive,
            sucursal: c.branch?.name ?? "—",
          }))}
          sucursales={sucursales}
        />
      </main>
    </>
  );
}
