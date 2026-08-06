import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { runAsPlatform } from "@/lib/tenant-context";
import { intentPublico } from "@/lib/checkout";
import { execC2pBancos } from "@/lib/exec-client";
import PagoPublico from "./PagoPublico";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirma tu pago",
  robots: { index: false },
};

/**
 * Página pública de pago — el checkout alojado (Fase 5).
 *
 * Es la SEGUNDA entrada sin sesión que abre contexto a mano (el comentario de
 * `tenant-context.ts` la anticipa): acá no hay usuario ni API key — el que
 * llega es el CLIENTE FINAL del comercio, con el link que le dio el carrito.
 * `runAsPlatform` solo para resolver el intent; todo lo demás pasa por las
 * acciones, que operan con `runWithTenant`.
 *
 * El id del intent es un cuid: no enumerable. Aun así la página no revela
 * nada sensible: razón social (el schema la define como LA que se muestra),
 * monto y datos de pago del comercio — lo mismo que un ticket impreso.
 */
export default async function PayPage({ params }: { params: { id: string } }) {
  const data = await runAsPlatform("pay: resolver intent público", async () => {
    const intent = await prisma.checkoutIntent.findUnique({ where: { id: params.id } });
    if (!intent) return null;
    const [org, cuentas] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: intent.organizationId },
        select: { razonSocial: true, rif: true, btC2pEnabled: true, btCodAfiliado: true },
      }),
      prisma.bankAccount.findMany({
        where: { organizationId: intent.organizationId, isActive: true },
        select: { banco: true, accountNumber: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { intent, org, cuentas };
  });

  if (!data || !data.org) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tinta-fondo px-6">
        <div className="w-full max-w-md rounded-card border border-tinta-borde bg-white p-8 text-center">
          <p className="font-display text-xl font-bold text-tinta">Este link de pago no existe</p>
          <p className="mt-2 text-sm leading-relaxed text-tinta-tenue">
            Revisa que el link esté completo o vuelve a la tienda para generar
            uno nuevo.
          </p>
        </div>
      </main>
    );
  }

  const c2pDisponible = Boolean(data.org.btC2pEnabled && data.org.btCodAfiliado);

  // El catálogo C2P se trae solo si el método existe; si el ejecutor no
  // responde, la página degrada a solo-referencia en vez de caerse.
  let bancosC2p: Array<{ code: string; name: string }> = [];
  if (c2pDisponible) {
    try {
      const r = await execC2pBancos();
      bancosC2p = r.bancos.map((b) => ({ code: b.codigo, name: b.nombre.trim() }));
    } catch {
      bancosC2p = [];
    }
  }

  return (
    <PagoPublico
      intent={intentPublico(data.intent)}
      comercio={{
        razonSocial: data.org.razonSocial,
        rif: data.org.rif,
        cuentas: data.cuentas.map((c) => ({
          banco: c.banco,
          // La cuenta se muestra como en un ticket: primeros 4 + últimos 4.
          cuenta: `${c.accountNumber.slice(0, 4)}…${c.accountNumber.slice(-4)}`,
        })),
      }}
      c2pDisponible={c2pDisponible && bancosC2p.length > 0}
      bancosC2p={bancosC2p}
    />
  );
}
