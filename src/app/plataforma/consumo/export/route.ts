import { PrismaClient } from "@prisma/client";
import { getVerifiedSession } from "@/lib/session-guard";
import { aCsv, montoCsv, respuestaCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const db = new PrismaClient();

/**
 * CSV del consumo por comercio (últimos 30 días) — la base de la facturación
 * del SaaS, por fin descargable. Solo PLATFORM_ADMIN.
 */
export async function GET(): Promise<Response> {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "PLATFORM_ADMIN") {
    return new Response("No autorizado", { status: 401 });
  }

  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const comercios = await db.organization.findMany({
    orderBy: { razonSocial: "asc" },
    select: { id: true, razonSocial: true, rif: true, plan: true, status: true },
  });

  const filas = [];
  for (const c of comercios) {
    const [cobros, enLinea, duplicados] = await Promise.all([
      db.paymentClaim.aggregate({
        where: { organizationId: c.id, claimedAt: { gte: desde } },
        _count: true,
        _sum: { amount: true },
      }),
      db.paymentClaim.count({
        where: { organizationId: c.id, source: "CHECKOUT", claimedAt: { gte: desde } },
      }),
      db.paymentClaim.count({
        where: { organizationId: c.id, isDuplicate: true, claimedAt: { gte: desde } },
      }),
    ]);
    filas.push([
      c.razonSocial,
      c.rif,
      c.plan,
      c.status,
      cobros._count,
      montoCsv(cobros._sum.amount),
      enLinea,
      duplicados,
    ]);
  }

  const csv = aCsv(
    ["Comercio", "RIF", "Plan", "Estado", "Cobros 30d", "Total Bs 30d", "En línea 30d", "Duplicados 30d"],
    filas
  );

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  return respuestaCsv(`consumo-${hoy}.csv`, csv);
}
