import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDot } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { turnoAbierto } from "@/lib/operacion";
import Cabecera from "@/components/Cabecera";
import BuscadorCobro from "./BuscadorCobro";

export const dynamic = "force-dynamic";

export default async function ValidarPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/validar");
  if (session.user.role === "PLATFORM_ADMIN") redirect("/plataforma/solicitudes");

  const { turno, comercio, cobrosDelTurno } = await withSessionTenant(session, async () => {
    const turno = await turnoAbierto(session.user.id);
    const [comercio, cobrosDelTurno] = await Promise.all([
      session.user.organizationId
        ? prisma.organization.findUnique({
            where: { id: session.user.organizationId },
            select: { razonSocial: true },
          })
        : null,
      turno
        ? prisma.paymentClaim.aggregate({
            where: { shiftId: turno.id },
            _count: true,
            _sum: { amount: true },
          })
        : null,
    ]);
    return { turno, comercio, cobrosDelTurno };
  });

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        usuario={session.user.name}
        turnoAbierto={Boolean(turno)}
      />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
          Cobrar un pago
        </h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Pedile al cliente los últimos dígitos de la referencia.
        </p>

        {!turno ? (
          <div className="mt-6 rounded-card border border-alerta/30 bg-alerta-suave p-5">
            <p className="flex items-center gap-2 font-medium text-alerta">
              <CircleDot className="h-4 w-4" aria-hidden />
              No tenés turno abierto
            </p>
            <p className="mt-1 text-sm text-alerta">
              Podés buscar pagos, pero para cobrarlos primero abrí tu turno.
            </p>
            <Link
              href="/turno"
              className="mt-3 inline-block rounded-control bg-alerta px-4 py-2 text-sm font-medium text-white hover:brightness-90"
            >
              Abrir turno
            </Link>
          </div>
        ) : (
          cobrosDelTurno && (
            <p className="mt-4 text-sm text-tinta-tenue">
              En este turno llevás <strong className="text-tinta">{cobrosDelTurno._count}</strong>{" "}
              cobro(s) por{" "}
              <strong className="text-tinta">
                Bs{" "}
                {Number(cobrosDelTurno._sum.amount ?? 0).toLocaleString("es-VE", {
                  minimumFractionDigits: 2,
                })}
              </strong>
              .
            </p>
          )
        )}

        <div className="mt-8">
          <BuscadorCobro hayTurno={Boolean(turno)} />
        </div>
      </main>
    </>
  );
}
