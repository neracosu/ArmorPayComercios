import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runAsPlatform, runWithTenant } from "@/lib/tenant-context";
import { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "../../../../../gateway/contract";

export const dynamic = "force-dynamic";

/**
 * Ingesta de créditos bancarios que entrega el gateway.
 *
 * Es un endpoint SIN sesión de usuario: se autentica con HMAC sobre
 * `timestamp.body` (esquema Stripe/Svix). Por eso mismo es de los lugares donde
 * más fácil se cuela una fuga entre comercios — acá NO hay un usuario del cual
 * deducir el tenant, así que el contexto se abre a mano y de forma explícita:
 * `runAsPlatform` solo para resolver a qué comercio pertenece cada cuenta, y
 * `runWithTenant` para escribir, ya acotado.
 *
 * Idempotente: reentregar el mismo pago no duplica nada (`uniq_tx`). El gateway
 * se apoya en eso para leer con ventana de solapamiento.
 */

const eventSchema = z.object({
  id: z.string().min(1),
  numeroCuenta: z.string().min(1),
  montoTransaccion: z.string(),
  fechaTransaccion: z.string(),
  horaTransaccion: z.string(),
  referencia: z.string(),
  tipo: z.string(),
  descripcion: z.string(),
  desdeBanco: z.string(),
  tipoProd: z.string(),
  desdeCuenta: z.string(),
  desdeDni: z.string(),
  origen: z.string(),
  receivedAt: z.string(),
});

const envelopeSchema = z.object({
  version: z.literal(1),
  events: z.array(eventSchema).max(500),
});

export async function POST(req: NextRequest) {
  const secret = process.env.GATEWAY_HMAC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "gateway_secret_no_configurado" }, { status: 503 });
  }

  // El cuerpo crudo es lo que se firmó: hay que leerlo como texto, no como JSON.
  const raw = await req.text();
  const check = verify(
    secret,
    req.headers.get(TIMESTAMP_HEADER),
    req.headers.get(SIGNATURE_HEADER),
    raw
  );
  if (!check.ok) {
    return NextResponse.json({ error: "firma_invalida", detalle: check.reason }, { status: 401 });
  }

  const parsed = envelopeSchema.safeParse(JSON.parse(raw || "null"));
  if (!parsed.success) {
    return NextResponse.json({ error: "payload_invalido", issues: parsed.error.issues }, { status: 400 });
  }
  const { events } = parsed.data;
  if (events.length === 0) return NextResponse.json({ recibidos: 0, insertados: 0, sinComercio: 0 });

  // 1. Resolver cuenta → organización. Cruza comercios, así que va explícito.
  const cuentas = [...new Set(events.map((e) => e.numeroCuenta))];
  const accounts = await runAsPlatform("ingesta: resolver cuenta a organización", () =>
    prisma.bankAccount.findMany({
      where: { accountNumber: { in: cuentas }, isActive: true },
      select: { accountNumber: true, organizationId: true },
    })
  );
  const orgPorCuenta = new Map(accounts.map((a) => [a.accountNumber, a.organizationId]));

  // 2. Agrupar por organización para escribir ya acotado.
  const porOrg = new Map<string, typeof events>();
  const sinComercio: string[] = [];
  for (const e of events) {
    const orgId = orgPorCuenta.get(e.numeroCuenta);
    if (!orgId) {
      // Cuenta que todavía no pertenece a ningún comercio del SaaS. No es un
      // error: el sistema viejo recibe pagos de cuentas que aún no dimos de
      // alta acá. Se cuenta y se sigue — no puede frenar al resto.
      sinComercio.push(e.numeroCuenta);
      continue;
    }
    const lista = porOrg.get(orgId) ?? [];
    lista.push(e);
    porOrg.set(orgId, lista);
  }

  // 3. Escribir por comercio. `skipDuplicates` + `uniq_tx` = idempotencia.
  let insertados = 0;
  for (const [organizationId, lista] of porOrg) {
    const insertadosOrg = await runWithTenant(organizationId, async () => {
      const r = await prisma.bankTransaction.createMany({
        data: lista.map((e) => ({
          // TypeScript lo exige aunque la extensión lo inyecte igual en runtime.
          // Pasarlo no debilita nada: si acá viniera el comercio equivocado, la
          // extensión lo pisa con el del contexto (cubierto por el test de aislamiento).
          organizationId,
          numeroCuenta: e.numeroCuenta,
          montoTransaccion: e.montoTransaccion,
          fechaTransaccion: e.fechaTransaccion,
          horaTransaccion: e.horaTransaccion,
          referencia: e.referencia,
          tipo: e.tipo,
          descripcion: e.descripcion,
          desdeBanco: e.desdeBanco,
          tipoProd: e.tipoProd,
          desdeCuenta: e.desdeCuenta,
          desdeDni: e.desdeDni,
          origen: e.origen,
          receivedAt: new Date(e.receivedAt),
          rawPayload: JSON.stringify(e),
        })),
        skipDuplicates: true,
      });
      return r.count;
    });
    insertados += insertadosOrg;
  }

  return NextResponse.json({
    recibidos: events.length,
    insertados,
    sinComercio: sinComercio.length,
    cuentasSinComercio: [...new Set(sinComercio)],
  });
}
