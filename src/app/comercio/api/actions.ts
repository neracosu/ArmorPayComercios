"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-auth";

/**
 * Gestión de API keys del comercio (checkout / API v1).
 *
 * El key completo existe UNA vez: en la respuesta de `crearApiKey`. Después
 * solo quedan el prefijo (para reconocerlo) y el hash (para verificarlo) —
 * ni nosotros podemos volver a verlo, igual que la Llave de Trabajo.
 */

export type ResultadoApiKey =
  | { ok: true; mensaje: string; key?: string; prefix?: string }
  | { ok: false; error: string };

const MAX_KEYS_ACTIVAS = 5;

async function exigirAdminComercio() {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") throw new Error("No autorizado");
  return session;
}

const nombreSchema = z
  .string()
  .trim()
  .min(2, "Ponle un nombre para reconocerla (ej. «tienda web»)")
  .max(60);

export async function crearApiKey(
  _previo: ResultadoApiKey | null,
  datos: FormData
): Promise<ResultadoApiKey> {
  const session = await exigirAdminComercio();

  const parsed = nombreSchema.safeParse(datos.get("nombre"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  return withSessionTenant(session, async () => {
    const activas = await prisma.apiKey.count({ where: { isActive: true } });
    if (activas >= MAX_KEYS_ACTIVAS) {
      return {
        ok: false,
        error: `Ya tienes ${MAX_KEYS_ACTIVAS} llaves activas. Desactiva una antes de crear otra.`,
      };
    }

    const { key, prefix, hashedKey } = generateApiKey();
    await prisma.apiKey.create({
      data: {
        organizationId: session.user.organizationId!,
        name: parsed.data,
        prefix,
        hashedKey,
      },
    });

    revalidatePath("/comercio/api");
    return {
      ok: true,
      mensaje:
        "Llave creada. Cópiala AHORA: por seguridad no se puede volver a ver.",
      key,
      prefix,
    };
  });
}

export async function desactivarApiKey(
  _previo: ResultadoApiKey | null,
  datos: FormData
): Promise<ResultadoApiKey> {
  const session = await exigirAdminComercio();
  const id = String(datos.get("id") ?? "");
  if (!id) return { ok: false, error: "Falta la llave." };

  return withSessionTenant(session, async () => {
    const r = await prisma.apiKey.updateMany({
      where: { id, isActive: true },
      data: { isActive: false },
    });
    if (r.count === 0) return { ok: false, error: "Esa llave no existe o ya estaba inactiva." };

    revalidatePath("/comercio/api");
    return { ok: true, mensaje: "Llave desactivada. Las peticiones con ella van a fallar." };
  });
}
