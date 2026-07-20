/**
 * alta-usuario.ts — crea un usuario del panel.
 *
 * Mientras no exista la pantalla de usuarios, esta es la vía. Idempotente: si
 * el usuario ya existe no lo toca (ni le pisa la contraseña).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/alta-usuario.ts \
 *     --usuario=caja1-terraza --nombre="CAJA 1 TERRAZA" \
 *     --rif=J505942140 --rol=OPERATOR --password=...
 *
 * Un PLATFORM_ADMIN (nosotros) va SIN --rif: no pertenece a ningún comercio.
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizeUsername, usernameSchema } from "../src/lib/username";

const db = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const username = normalizeUsername(arg("usuario") ?? "");
  const nombre = arg("nombre");
  const rol = (arg("rol") ?? "OPERATOR") as Role;
  const password = arg("password");
  const rif = arg("rif")?.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const check = usernameSchema.safeParse(username);
  if (!check.success) throw new Error(check.error.issues[0].message);
  if (!nombre || !password) throw new Error("Faltan --nombre o --password");
  if (password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");
  if (rol !== "PLATFORM_ADMIN" && !rif) {
    throw new Error("Todo rol que no sea PLATFORM_ADMIN necesita --rif de su comercio");
  }

  const existe = await db.user.findUnique({ where: { username } });
  if (existe) {
    console.log(`= ${username} ya existía — no se toca`);
    return;
  }

  let organizationId: string | null = null;
  let branchId: string | null = null;
  if (rif) {
    const org = await db.organization.findUnique({ where: { rif } });
    if (!org) throw new Error(`No existe un comercio con RIF ${rif}`);
    organizationId = org.id;
    // Toda caja necesita sucursal para poder abrir turno.
    branchId = (await db.branch.findFirst({ where: { organizationId } }))?.id ?? null;
  }

  await db.user.create({
    data: {
      username,
      name: nombre,
      passwordHash: await bcrypt.hash(password, 12),
      role: rol,
      organizationId,
      branchId,
      isActive: true,
    },
  });
  console.log(`+ ${username} (${rol}${rif ? ` · ${rif}` : " · plataforma"})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
