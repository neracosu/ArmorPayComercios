/**
 * test-isolation.ts — prueba de aislamiento entre tenants.
 *
 * Es la excepción explícita a la convención de "sin tests" del stack: el
 * aislamiento es lo único que, si falla, hace que un comercio vea —y cobre— el
 * dinero de otro. En el proyecto anterior esa suposición produjo R-16.
 *
 * No alcanza con "buscar una referencia ajena no la encuentra". Se prueba
 * también el barrido por fuerza bruta, el acceso directo por id, la escritura
 * cruzada y el fallo cerrado sin contexto.
 *
 * Uso:  npx tsx --env-file=.env scripts/test-isolation.ts
 * Deja la base como la encontró (borra lo que crea).
 */
import { PrismaClient } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { runWithTenant, runAsPlatform } from "../src/lib/tenant-context";

const raw = new PrismaClient(); // sin extensión: para preparar y limpiar
let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "— no lanzó, debería haber fallado cerrado");
  } catch {
    check(name, true);
  }
}

const SUFFIX_SWEEP = 2000; // barrido de fuerza bruta

async function main() {
  const stamp = Date.now();
  const slugA = `test-a-${stamp}`;
  const slugB = `test-b-${stamp}`;

  // ── Preparación (sin extensión) ──
  const orgA = await raw.organization.create({
    data: { slug: slugA, razonSocial: "COMERCIO A", rif: `J${stamp}A` },
  });
  const orgB = await raw.organization.create({
    data: { slug: slugB, razonSocial: "COMERCIO B", rif: `J${stamp}B` },
  });

  const txCommon = {
    montoTransaccion: "100.00",
    fechaTransaccion: "2026-07-20",
    horaTransaccion: "120000",
    tipo: "CREDITO",
    descripcion: "prueba",
    desdeBanco: "0102",
    tipoProd: "CELE",
    desdeCuenta: "04141234567",
    desdeDni: "V12345678",
    origen: "webhook",
    rawPayload: "{}",
  };
  await raw.bankTransaction.create({
    data: { ...txCommon, organizationId: orgA.id, numeroCuenta: "0175A", referencia: `${stamp}0001` },
  });
  const txB = await raw.bankTransaction.create({
    data: { ...txCommon, organizationId: orgB.id, numeroCuenta: "0175B", referencia: `${stamp}0002` },
  });

  console.log("\nAislamiento entre tenants\n");

  // 1. Sin contexto: fallo cerrado.
  await expectThrow("sin contexto de tenant, la consulta lanza", () =>
    prisma.bankTransaction.findMany()
  );

  // 2. Cada tenant ve lo suyo y nada más.
  await runWithTenant(orgA.id, async () => {
    const rows = await prisma.bankTransaction.findMany();
    check(
      "el tenant A ve solo sus pagos",
      rows.length === 1 && rows[0].organizationId === orgA.id,
      `— vio ${rows.length} fila(s)`
    );
  });

  // 3. Buscar la referencia EXACTA del otro tenant no la encuentra.
  await runWithTenant(orgA.id, async () => {
    const found = await prisma.bankTransaction.findFirst({
      where: { referencia: txB.referencia },
    });
    check("la referencia exacta del tenant B no aparece desde A", found === null);
  });

  // 4. Barrido de fuerza bruta por sufijo: ninguna fila ajena, nunca.
  await runWithTenant(orgA.id, async () => {
    let leaked = 0;
    for (let i = 0; i < SUFFIX_SWEEP; i++) {
      const suffix = String(i).padStart(4, "0");
      const rows = await prisma.bankTransaction.findMany({
        where: { referencia: { endsWith: suffix } },
        select: { organizationId: true },
      });
      leaked += rows.filter((r) => r.organizationId !== orgA.id).length;
    }
    check(`barrido de ${SUFFIX_SWEEP} sufijos sin filtrar nada ajeno`, leaked === 0, `— ${leaked} fuga(s)`);
  });

  // 5. Acceso directo por id ajeno.
  await runWithTenant(orgA.id, async () => {
    const row = await prisma.bankTransaction.findUnique({ where: { id: txB.id } });
    check("findUnique por id del tenant B devuelve null desde A", row === null);
  });

  // 6. Escritura cruzada: no puede tocar la fila ajena.
  await runWithTenant(orgA.id, async () => {
    const r = await prisma.bankTransaction.updateMany({
      where: { id: txB.id },
      data: { descripcion: "PISADO POR A" },
    });
    check("updateMany no alcanza la fila del tenant B", r.count === 0, `— afectó ${r.count}`);
  });
  const untouched = await raw.bankTransaction.findUnique({ where: { id: txB.id } });
  check("la fila de B quedó intacta", untouched?.descripcion === "prueba");

  // 7. Crear desde A no permite falsificar el dueño.
  await runWithTenant(orgA.id, async () => {
    const created = await prisma.bankTransaction.create({
      data: {
        ...txCommon,
        organizationId: orgB.id, // intento de falsificación
        numeroCuenta: "0175A",
        referencia: `${stamp}0003`,
      },
    });
    check("al crear, el organizationId del contexto pisa el del payload", created.organizationId === orgA.id);
  });

  // 8. El modo plataforma sí ve todo (y es explícito).
  await runAsPlatform("prueba de aislamiento", async () => {
    const rows = await prisma.bankTransaction.findMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    check("runAsPlatform ve los dos tenants", rows.length === 3, `— vio ${rows.length}`);
  });

  // 9. Promesa perezosa: callback NO async, con el await afuera del contexto.
  //    Las promesas de Prisma no ejecutan hasta que se las espera, así que este
  //    caso corría la extensión fuera del contexto y lanzaba. Cubierto desde
  //    que `runWithTenant` absorbe el await.
  await runWithTenant(orgA.id, () =>
    prisma.bankTransaction.findMany({ select: { organizationId: true } })
  ).then((rows) => {
    check(
      "callback no-async (promesa perezosa) resuelve dentro del contexto",
      rows.length > 0 && rows.every((r) => r.organizationId === orgA.id),
      `— devolvió ${rows.length} fila(s)`
    );
  });

  // 10. Los modelos que no son de tenant no exigen contexto.
  const settings = await prisma.platformSetting.findMany();
  check("PlatformSetting no exige contexto de tenant", Array.isArray(settings));

  // ── Checkout (Fase 2): los modelos nuevos quedan protegidos solos ──

  // 11. Con el contexto de la org A (el que abre su ApiKey), un intent de B
  //     no se resuelve ni por id ni por idempotencyKey.
  const keyA = await raw.apiKey.create({
    data: { organizationId: orgA.id, name: "test", prefix: `ak_test_${stamp}`, hashedKey: "x" },
  });
  const intentB = await raw.checkoutIntent.create({
    data: {
      organizationId: orgB.id,
      apiKeyId: "key-de-b",
      externalRef: "pedido-b",
      amountVES: "50.00",
      concepto: "prueba",
      idempotencyKey: `idem-${stamp}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  await runWithTenant(orgA.id, async () => {
    const porId = await prisma.checkoutIntent.findUnique({ where: { id: intentB.id } });
    const porIdem = await prisma.checkoutIntent.findFirst({
      where: { idempotencyKey: `idem-${stamp}` },
    });
    check("la ApiKey de la org A no resuelve intents de B", porId === null && porIdem === null);
  });

  // 12. La MISMA idempotencyKey en dos orgs distintas no colisiona: el unique
  //     es compuesto [organizationId, idempotencyKey].
  let intentA: { id: string } | null = null;
  try {
    intentA = await runWithTenant(orgA.id, () =>
      prisma.checkoutIntent.create({
        data: {
          organizationId: orgA.id,
          apiKeyId: keyA.id,
          externalRef: "pedido-a",
          amountVES: "100.00",
          concepto: "prueba",
          idempotencyKey: `idem-${stamp}`, // la misma que usó B
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      })
    );
  } catch {
    intentA = null;
  }
  check("idempotencyKey repetida entre orgs distintas NO colisiona", intentA !== null);

  // 13. El árbitro compartido: caja y checkout no pueden cobrar el mismo pago,
  //     en ningún orden. Lo garantiza `primaryKey @unique`, no el código.
  const txArb1 = await raw.bankTransaction.create({
    data: { ...txCommon, organizationId: orgA.id, numeroCuenta: "0175A", referencia: `${stamp}0004` },
  });
  const txArb2 = await raw.bankTransaction.create({
    data: { ...txCommon, organizationId: orgA.id, numeroCuenta: "0175A", referencia: `${stamp}0005` },
  });

  // 13a. Caja cobra primero → el checkout pierde con P2002.
  await raw.paymentClaim.create({
    data: {
      organizationId: orgA.id,
      source: "LOOKUP",
      bankTransactionId: txArb1.id,
      reference: txArb1.referencia,
      amount: "100.00",
      numeroCuenta: txArb1.numeroCuenta,
      primaryKey: txArb1.id,
    },
  });
  let p2002Checkout = false;
  try {
    await runWithTenant(orgA.id, () =>
      prisma.paymentClaim.create({
        data: {
          organizationId: orgA.id,
          source: "CHECKOUT",
          bankTransactionId: txArb1.id,
          reference: txArb1.referencia,
          amount: "100.00",
          numeroCuenta: txArb1.numeroCuenta,
          primaryKey: txArb1.id,
        },
      })
    );
  } catch (e) {
    p2002Checkout = (e as { code?: string }).code === "P2002";
  }
  check("un pago cobrado en caja NO confirma un checkout (P2002)", p2002Checkout);

  // 13b. Checkout cobra primero (sin caja: shift/user/branch null) → la caja
  //      pierde con P2002.
  const claimCheckout = await runWithTenant(orgA.id, () =>
    prisma.paymentClaim.create({
      data: {
        organizationId: orgA.id,
        source: "CHECKOUT",
        bankTransactionId: txArb2.id,
        checkoutIntentId: intentA!.id,
        reference: txArb2.referencia,
        amount: "100.00",
        numeroCuenta: txArb2.numeroCuenta,
        primaryKey: txArb2.id,
      },
    })
  );
  let p2002Caja = false;
  try {
    await raw.paymentClaim.create({
      data: {
        organizationId: orgA.id,
        source: "LOOKUP",
        bankTransactionId: txArb2.id,
        reference: txArb2.referencia,
        amount: "100.00",
        numeroCuenta: txArb2.numeroCuenta,
        primaryKey: txArb2.id,
      },
    });
  } catch (e) {
    p2002Caja = (e as { code?: string }).code === "P2002";
  }
  check(
    "un pago cobrado por checkout NO se cobra en caja (P2002, sin caja asignada)",
    p2002Caja && claimCheckout.shiftId === null
  );

  // ── Limpieza ──
  await raw.paymentClaim.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await raw.checkoutIntent.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await raw.apiKey.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await raw.bankTransaction.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await raw.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });

  console.log(`\n${pass} pasaron, ${fail} fallaron\n`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await raw.$disconnect();
  });
