import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDot } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { turnoAbierto } from "@/lib/operacion";
import { execC2pBancos } from "@/lib/exec-client";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import PanelValidacion, { type CuentaCaja } from "./PanelValidacion";

export const dynamic = "force-dynamic";

export default async function ValidarPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/validar");
  if (session.user.role === "PLATFORM_ADMIN") redirect("/plataforma/solicitudes");
  if (session.user.role === "PLATFORM_REVIEWER") redirect("/plataforma/comercios");

  const { turno, comercio, cobrosDelTurno, cuentas } = await withSessionTenant(
    session,
    async () => {
      const turno = await turnoAbierto(session.user.id);
      const [comercio, cobrosDelTurno, cuentas] = await Promise.all([
        session.user.organizationId
          ? prisma.organization.findUnique({
              where: { id: session.user.organizationId },
              select: {
                id: true,
                razonSocial: true,
                status: true,
                logoMime: true,
                logoUpdatedAt: true,
                authKeyStatus: true,
                btC2pEnabled: true,
                btCodAfiliado: true,
              },
            })
          : null,
        turno
          ? prisma.paymentClaim.aggregate({
              where: { shiftId: turno.id },
              _count: true,
              _sum: { amount: true },
            })
          : null,
        prisma.bankAccount.findMany({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, alias: true, accountNumber: true, banco: true, merchantCode: true },
        }),
      ]);
      return { turno, comercio, cobrosDelTurno, cuentas };
    }
  );

  // Comercio sin activar: el dueño va a su paso a paso; la caja se entera de
  // por qué todavía no puede cobrar en vez de buscar contra una pared.
  const activo = comercio?.status === "ACTIVA";
  if (!activo && session.user.role === "ORG_ADMIN") redirect("/comercio/activacion");
  if (!activo) {
    return (
      <>
        <Cabecera
          comercio={comercio?.razonSocial ?? "—"}
          logoUrl={logoUrlDe(comercio)}
          usuario={session.user.name}
          turnoAbierto={false}
        />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <div className="rounded-card border border-alerta/30 bg-alerta-suave p-6">
            <p className="font-medium text-alerta">Tu comercio todavía no está activo</p>
            <p className="mt-1 text-sm leading-relaxed text-alerta">
              La activación está en proceso. Cuando esté lista, desde esta misma
              pantalla vas a poder buscar y cobrar pagos.
            </p>
          </div>
        </main>
      </>
    );
  }

  const cuentasCaja: CuentaCaja[] = cuentas.map((c) => ({
    id: c.id,
    alias: c.alias,
    ultimos: c.accountNumber.slice(-4),
    banco: c.banco,
    merchantCode: c.merchantCode,
  }));

  // La llave operativa habilita las consultas online al gestor BDT (el
  // ejecutor rechaza SIN_LLAVE e INVALIDA con el mismo criterio).
  const llaveOperativa =
    comercio?.authKeyStatus === "VERIFICADA" || comercio?.authKeyStatus === "CARGADA";
  const c2pHabilitado = Boolean(comercio?.btC2pEnabled && comercio?.btCodAfiliado);

  // El catálogo C2P vive en el banco; si no responde, la pestaña avisa en vez
  // de romper la página (la caja puede seguir validando por las otras vías).
  let bancosC2p: Array<{ codigo: string; nombre: string }> = [];
  if (c2pHabilitado) {
    try {
      const r = await execC2pBancos();
      bancosC2p = r.bancos;
    } catch {
      bancosC2p = [];
    }
  }

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        logoUrl={logoUrlDe(comercio)}
        usuario={session.user.name}
        turnoAbierto={Boolean(turno)}
        esAdminComercio={session.user.role === "ORG_ADMIN"}
      />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
          Cobrar un pago
        </h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Busca por referencia, consulta al banco con los datos completos o cobra
          con el Botón de Pago.
        </p>

        {!turno ? (
          <div className="mt-6 rounded-card border border-alerta/30 bg-alerta-suave p-5">
            <p className="flex items-center gap-2 font-medium text-alerta">
              <CircleDot className="h-4 w-4" aria-hidden />
              No tienes turno abierto
            </p>
            <p className="mt-1 text-sm text-alerta">
              Puedes buscar y consultar pagos, pero para cobrarlos primero abre tu turno.
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
              En este turno llevas <strong className="text-tinta">{cobrosDelTurno._count}</strong>{" "}
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
          <PanelValidacion
            hayTurno={Boolean(turno)}
            cuentas={cuentasCaja}
            llaveOperativa={llaveOperativa}
            c2pHabilitado={c2pHabilitado}
            bancosC2p={bancosC2p}
          />
        </div>
      </main>
    </>
  );
}
