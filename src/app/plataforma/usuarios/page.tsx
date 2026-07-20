import Link from "next/link";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const db = new PrismaClient();

const ROL: Record<string, { texto: string; clase: string }> = {
  PLATFORM_ADMIN: { texto: "Plataforma", clase: "bg-tinta text-white" },
  ORG_ADMIN: { texto: "Administrador", clase: "bg-marca-100 text-marca-900" },
  OPERATOR: { texto: "Caja", clase: "bg-tinta-fondo text-tinta-tenue" },
};

export default async function UsuariosPage() {
  const usuarios = await db.user.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
    take: 500,
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      organization: { select: { id: true, razonSocial: true } },
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Usuarios</h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        Todos los usuarios de la plataforma, de todos los comercios. Las cajas
        las crea cada comercio; acá se ven para auditar.
      </p>

      <ul className="mt-6 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
        {usuarios.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-tinta">
                {u.username}
                {!u.isActive && (
                  <span className="ml-2 rounded-control bg-error-suave px-2 py-0.5 text-xs text-error">
                    inactivo
                  </span>
                )}
              </p>
              <p className="text-sm text-tinta-tenue">
                {u.name}
                {u.organization && (
                  <>
                    {" · "}
                    <Link
                      href={`/plataforma/comercios/${u.organization.id}`}
                      className="underline underline-offset-2 hover:text-tinta"
                    >
                      {u.organization.razonSocial}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-control px-2.5 py-1 text-xs font-medium ${ROL[u.role]?.clase}`}
            >
              {ROL[u.role]?.texto ?? u.role}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
