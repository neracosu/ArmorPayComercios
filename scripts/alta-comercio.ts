/**
 * alta-comercio.ts — da de alta un comercio con su cuenta bancaria.
 *
 * Mientras no exista el panel de plataforma, esta es la vía para incorporar un
 * tenant. Idempotente: si el comercio o la cuenta ya existen, no los pisa.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/alta-comercio.ts \
 *     --rif=J506923017 --razon="ARMORPETS" --slug=armorpets \
 *     --cuenta=01750190970077506582 --alias="ARMORPETS — Principal"
 *
 * La Llave de Trabajo NO se carga acá: se pega desde la ficha del comercio,
 * que es campo de solo escritura y deja bitácora de quién la puso.
 */
import { PrismaClient } from "@prisma/client";
import { runWithTenant } from "../src/lib/tenant-context";
import { prisma } from "../src/lib/prisma";

const raw = new PrismaClient();

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

/** `J-50692301-7` → `J506923017`, como lo escribe el banco. */
function normalizeRif(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function main() {
  const rif = normalizeRif(arg("rif") ?? "");
  const razonSocial = arg("razon");
  const slug = arg("slug");
  const cuenta = arg("cuenta");
  const alias = arg("alias") ?? razonSocial;

  if (!rif || !razonSocial || !slug || !cuenta) {
    throw new Error("Faltan argumentos: --rif --razon --slug --cuenta [--alias]");
  }

  // Organization no es modelo de tenant (es la raíz), así que no exige contexto.
  const org = await raw.organization.upsert({
    where: { rif },
    update: {},
    create: { rif, razonSocial, slug },
  });
  console.log(`Comercio: ${org.razonSocial} (${org.rif}) — estado ${org.status}`);

  const existente = await raw.bankAccount.findUnique({ where: { accountNumber: cuenta } });
  if (existente) {
    if (existente.organizationId !== org.id) {
      throw new Error(`La cuenta ${cuenta} ya pertenece a OTRO comercio. Abortado.`);
    }
    console.log(`  = cuenta ${cuenta} ya estaba`);
  } else {
    await runWithTenant(org.id, () =>
      prisma.bankAccount.create({
        data: { organizationId: org.id, accountNumber: cuenta, alias: alias! },
      })
    );
    console.log(`  + cuenta ${cuenta}`);
  }

  // Sucursal por defecto: sin ella una caja no puede abrir turno.
  const branch = await runWithTenant(org.id, () =>
    prisma.branch.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "PRIN" } },
      update: {},
      create: { organizationId: org.id, name: "Principal", code: "PRIN" },
    })
  );
  console.log(`  · sucursal ${branch.name} (${branch.code})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => raw.$disconnect());
