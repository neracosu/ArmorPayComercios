import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import { describeBdt } from "@/lib/bdt-codes";
import { describeC2p } from "../../../../gateway/bt-c2p-codes";

export const dynamic = "force-dynamic";

const TIPO: Record<string, string> = {
  VAL_P2P: "P2P por cuenta",
  VAL_P2P_CC: "P2P por comercio",
  VAL_TRANSFER: "Transferencia",
  VAL_TRANSACTION: "Movimiento",
  BT_C2P: "Botón de Pago",
};

/**
 * Historial de consultas al banco y cobros C2P de las cajas. Cada intento
 * queda registrado en `ValidationRequest` desde que existe la validación
 * online — esta pantalla lo hace VISIBLE al dueño: qué preguntaron sus cajas,
 * qué respondió el banco y cuándo.
 */
export default async function ConsultasPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/consultas");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { comercio, consultas } = await withSessionTenant(session, async () => {
    const [comercio, consultas] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { id: true, razonSocial: true, logoMime: true, logoUpdatedAt: true },
      }),
      prisma.validationRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          reference: true,
          amount: true,
          bankCode: true,
          responseCode: true,
          durationMs: true,
          createdAt: true,
          user: { select: { name: true } },
          account: { select: { alias: true, accountNumber: true } },
          claim: { select: { id: true } },
        },
      }),
    ]);
    return { comercio, consultas };
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
          Consultas al banco
        </h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Cada consulta en línea y cada cobro con Botón de Pago que hicieron tus
          cajas, con la respuesta literal del banco.
        </p>

        {consultas.length === 0 ? (
          <div className="mt-6 rounded-card border border-dashed border-tinta-borde bg-white p-10 text-center">
            <Landmark className="mx-auto h-6 w-6 text-tinta-tenue" aria-hidden />
            <p className="mt-3 font-medium text-tinta">Todavía no hay consultas</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-tinta-tenue">
              Cuando una caja consulte un pago con datos completos o cobre con el
              Botón de Pago, queda registrado acá.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {consultas.map((v) => {
              const info =
                v.type === "BT_C2P" ? describeC2p(v.responseCode, "") : describeBdt(v.responseCode);
              const exito =
                v.type === "BT_C2P" ? v.responseCode === "C2P0000" : info.severity === "ok";
              return (
                <li key={v.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-control bg-tinta-fondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                      {TIPO[v.type] ?? v.type}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        exito
                          ? "bg-ok-suave text-ok"
                          : info.severity === "warn"
                            ? "bg-alerta-suave text-alerta"
                            : "bg-error-suave text-error"
                      }`}
                    >
                      {info.headline}
                    </span>
                    {v.claim && (
                      <span className="rounded-full bg-ok-suave px-2 py-0.5 text-xs font-medium text-ok">
                        cobrado
                      </span>
                    )}
                    <span className="ml-auto text-xs text-tinta-tenue">
                      {new Date(v.createdAt).toLocaleString("es-VE")}
                    </span>
                  </div>
                  <p className="mt-1 text-tinta-tenue">
                    Bs {v.amount}
                    {v.reference && <> · ref …{v.reference.slice(-6)}</>}
                    {v.account && <> · {v.account.alias} (…{v.account.accountNumber.slice(-4)})</>}
                    {" · "}
                    {v.user.name} · <span className="font-mono text-xs">{v.responseCode}</span> ·{" "}
                    {v.durationMs}ms
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {consultas.length >= 100 && (
          <p className="mt-3 text-xs text-tinta-tenue">Se muestran las últimas 100.</p>
        )}
      </main>
    </>
  );
}
