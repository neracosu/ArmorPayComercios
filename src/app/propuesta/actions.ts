"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { runAsPlatform } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

/**
 * Recepción de solicitudes de propuesta desde la portada.
 *
 * Es la ÚNICA escritura del sistema que hace un desconocido, sin sesión. Por
 * eso: validación estricta, un campo trampa contra bots, y un tope por IP para
 * que nadie llene la base a fuerza de envíos.
 */

const leadDb = new PrismaClient();

const schema = z.object({
  empresa: z.string().trim().min(2, "Pon el nombre de tu empresa").max(120),
  contacto: z.string().trim().min(2, "Pon tu nombre").max(120),
  email: z.string().trim().email("Revisa el correo").max(160),
  telefono: z.string().trim().max(40).optional().or(z.literal("")),
  rif: z.string().trim().max(20).optional().or(z.literal("")),
  cajas: z.coerce.number().int().min(0).max(9999).optional(),
  sucursales: z.coerce.number().int().min(0).max(999).optional(),
  banco: z.string().trim().max(80).optional().or(z.literal("")),
  mensaje: z.string().trim().max(2000).optional().or(z.literal("")),
  // Campo trampa: invisible para una persona, irresistible para un bot.
  sitioWeb: z.string().max(0).optional(),
});

export type EstadoEnvio = { ok: true } | { ok: false; error: string };

const MAX_POR_IP_POR_HORA = 5;

export async function enviarSolicitud(
  _previo: EstadoEnvio | null,
  datos: FormData
): Promise<EstadoEnvio> {
  const parsed = schema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  // El bot llenó el campo trampa: se responde OK para no darle señal de que
  // fue detectado, pero no se guarda nada.
  if (parsed.data.sitioWeb) return { ok: true };

  const cabeceras = headers();
  const clientIp =
    cabeceras.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconocida";

  const recientes = await leadDb.lead.count({
    where: { clientIp, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (recientes >= MAX_POR_IP_POR_HORA) {
    return {
      ok: false,
      error: "Ya recibimos varias solicitudes desde acá. Escríbenos por correo si es urgente.",
    };
  }

  const d = parsed.data;
  await runAsPlatform("alta de solicitud desde la portada", () =>
    prisma.lead.create({
      data: {
        empresa: d.empresa,
        contacto: d.contacto,
        email: d.email.toLowerCase(),
        telefono: d.telefono || null,
        rif: d.rif ? d.rif.toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
        cajas: d.cajas ?? null,
        sucursales: d.sucursales ?? null,
        banco: d.banco || null,
        mensaje: d.mensaje || null,
        clientIp,
      },
    })
  );

  return { ok: true };
}
