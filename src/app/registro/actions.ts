"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { headers } from "next/headers";
import { normalizeUsername, usernameSchema } from "@/lib/username";
import { esRifJuridico, validarRif } from "@/lib/rif";

/**
 * Registro self-service de un comercio.
 *
 * Es la entrada pública que crea la cuenta SIN nuestra intervención: nace en
 * `REGISTRADA` y no puede cobrar nada — todo lo operativo (cuentas activas,
 * llave, API) llega recién con la activación, que sigue siendo nuestra
 * decisión desde el panel de plataforma. Por eso este formulario puede ser
 * generoso: lo peor que crea es un expediente vacío.
 *
 * Cliente crudo a propósito (como en /propuesta): todavía no hay tenant del
 * cual acotar — lo estamos creando.
 */

const registroDb = new PrismaClient();

export type ResultadoRegistro = { ok: true; usuario: string } | { ok: false; error: string };

// Freno en memoria por IP (patrón login-throttle): el registro crea filas,
// no puede ser gratis para un bot. Se limpia al reiniciar y alcanza.
const registrosPorIp = new Map<string, number[]>();
const MAX_POR_IP_POR_HORA = 3;

function frenar(ip: string): boolean {
  const ahora = Date.now();
  const previos = (registrosPorIp.get(ip) ?? []).filter((t) => ahora - t < 3600_000);
  registrosPorIp.set(ip, previos);
  if (previos.length >= MAX_POR_IP_POR_HORA) return true;
  previos.push(ahora);
  return false;
}

const schema = z.object({
  razonSocial: z.string().trim().min(3, "Pon la razón social completa").max(160),
  rif: z.string().trim().min(5, "Pon el RIF de tu empresa").max(20),
  nombre: z.string().trim().min(2, "Pon tu nombre").max(120),
  email: z.string().trim().email("Revisa el correo").max(160),
  usuario: usernameSchema,
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(72, "Máximo 72 caracteres"),
  // Honeypot: invisible para una persona, irresistible para un bot.
  sitioWeb: z.string().max(0).optional(),
});

/** Slug único derivado de la razón social; con sufijo si ya existe. */
async function slugLibre(razonSocial: string): Promise<string> {
  const base =
    razonSocial
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "comercio";
  for (let i = 0; i < 50; i++) {
    const candidato = i === 0 ? base : `${base}-${i + 1}`;
    const existe = await registroDb.organization.findUnique({
      where: { slug: candidato },
      select: { id: true },
    });
    if (!existe) return candidato;
  }
  return `${base}-${Date.now()}`;
}

export async function registrarComercio(
  _previo: ResultadoRegistro | null,
  datos: FormData
): Promise<ResultadoRegistro> {
  const parsed = schema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (frenar(ip)) {
    return { ok: false, error: "Demasiados registros seguidos. Espera un rato e intenta de nuevo." };
  }

  // El dígito de control se verifica acá aunque el formulario ya avise en
  // vivo: lo del cliente es cortesía, lo que protege la base es esto.
  const rifCheck = validarRif(parsed.data.rif);
  if (!rifCheck.ok) return { ok: false, error: rifCheck.error };
  if (!esRifJuridico(rifCheck.rif)) {
    return { ok: false, error: "Trabajamos con personas jurídicas: RIF que empiece con J o G." };
  }
  const rif = rifCheck.rif;
  const usuario = normalizeUsername(parsed.data.usuario);
  const slug = await slugLibre(parsed.data.razonSocial);

  try {
    await registroDb.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { slug, razonSocial: parsed.data.razonSocial, rif },
      });
      // Sin sucursal no se puede abrir turno: nace con la Principal.
      const branch = await tx.branch.create({
        data: { organizationId: org.id, name: "Principal", code: "PRIN" },
      });
      await tx.user.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          username: usuario,
          passwordHash: await bcrypt.hash(parsed.data.password, 10),
          name: parsed.data.nombre,
          email: parsed.data.email,
          role: "ORG_ADMIN",
        },
      });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? "");
      if (target.includes("rif")) {
        return {
          ok: false,
          error:
            "Ya existe un comercio registrado con ese RIF. Si es el tuyo, escríbenos desde la página de propuesta.",
        };
      }
      if (target.includes("username")) {
        return { ok: false, error: "Ese nombre de usuario ya está tomado. Prueba con otro." };
      }
    }
    throw e;
  }

  return { ok: true, usuario };
}
