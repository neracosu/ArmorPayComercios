import Link from "next/link";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const db = new PrismaClient();

/**
 * Consumo por comercio — la evidencia para decidir el modelo de cobro.
 *
 * La unidad medida es el **cobro confirmado**, no la búsqueda. Una búsqueda se
 * repite cuando el banco tarda, y eso es culpa nuestra y del banco, no del
 * comercio: cobrárselo se sentiría como estafa la primera vez que lo note. Un
 * cobro es una venta real, que el comerciante puede cruzar contra sus propios
 * números y le va a cuadrar.
 *
 * Los duplicados se muestran aparte: son cobros que el sistema marcó para
 * revisión, y facturarlos como si fueran ventas distintas sería cobrar dos
 * veces por el mismo pago — exactamente lo que el producto existe para evitar.
 */

function inicioDiasAtras(dias: number): Date {
  const d = new Date(Date.now() - dias * 24 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function ConsumoPage() {
  const comercios = await db.organization.findMany({
    orderBy: { razonSocial: "asc" },
    select: { id: true, razonSocial: true, rif: true },
  });

  const hoy = inicioDiasAtras(0);
  const semana = inicioDiasAtras(7);
  const mes = inicioDiasAtras(30);

  const filas = await Promise.all(
    comercios.map(async (c) => {
      const [dia, sem, mes30, dup] = await Promise.all([
        db.paymentClaim.count({
          where: { organizationId: c.id, isDuplicate: false, claimedAt: { gte: hoy } },
        }),
        db.paymentClaim.count({
          where: { organizationId: c.id, isDuplicate: false, claimedAt: { gte: semana } },
        }),
        db.paymentClaim.count({
          where: { organizationId: c.id, isDuplicate: false, claimedAt: { gte: mes } },
        }),
        db.paymentClaim.count({
          where: { organizationId: c.id, isDuplicate: true, claimedAt: { gte: mes } },
        }),
      ]);
      return { ...c, dia, sem, mes30, dup, promedioDiario: Math.round(mes30 / 30) };
    })
  );

  const total = filas.reduce((s, f) => s + f.mes30, 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Consumo</h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        Cobros confirmados por comercio. Es la unidad con la que tiene sentido
        cobrar: una venta real, no una búsqueda que se repitió porque el banco
        tardó.
      </p>

      <div className="mt-6 rounded-card border border-tinta-borde bg-white p-5">
        <p className="font-display text-3xl font-bold tracking-tight text-tinta">{total}</p>
        <p className="mt-0.5 text-sm text-tinta-tenue">
          cobros en los últimos 30 días, en toda la plataforma
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-tinta-borde bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tinta-borde text-left text-tinta-tenue">
              <th className="px-5 py-3 font-medium">Comercio</th>
              <th className="px-3 py-3 text-right font-medium">Hoy</th>
              <th className="px-3 py-3 text-right font-medium">7 días</th>
              <th className="px-3 py-3 text-right font-medium">30 días</th>
              <th className="px-3 py-3 text-right font-medium">Prom./día</th>
              <th className="px-5 py-3 text-right font-medium">Duplicados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tinta-borde">
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="px-5 py-3">
                  <Link
                    href={`/plataforma/comercios/${f.id}`}
                    className="font-medium text-tinta hover:underline"
                  >
                    {f.razonSocial}
                  </Link>
                  <span className="block text-tinta-tenue">{f.rif}</span>
                </td>
                <td className="px-3 py-3 text-right text-tinta">{f.dia}</td>
                <td className="px-3 py-3 text-right text-tinta">{f.sem}</td>
                <td className="px-3 py-3 text-right font-medium text-tinta">{f.mes30}</td>
                <td className="px-3 py-3 text-right text-tinta-tenue">{f.promedioDiario}</td>
                <td className="px-5 py-3 text-right">
                  <span className={f.dup > 0 ? "font-medium text-alerta" : "text-tinta-tenue"}>
                    {f.dup}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-tinta-tenue">
        Los duplicados van aparte a propósito: son cobros que el sistema marcó
        para revisión. Facturarlos como ventas distintas sería cobrar dos veces
        por el mismo pago, que es justo lo que el producto evita.
      </p>
    </main>
  );
}
