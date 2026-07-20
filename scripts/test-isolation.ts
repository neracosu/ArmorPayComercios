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

  // 9. Los modelos que no son de tenant no exigen contexto.
  const settings = await prisma.platformSetting.findMany();
  check("PlatformSetting no exige contexto de tenant", Array.isArray(settings));

  // ── Limpieza ──
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
