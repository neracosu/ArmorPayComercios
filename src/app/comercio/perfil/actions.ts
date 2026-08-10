"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { runAsPlatform } from "@/lib/tenant-context";
import { LOGO_MAX_BYTES, tipoDeImagen } from "@/lib/logo";

/**
 * Perfil del comercio: hoy, el logo. La imagen se valida por bytes mágicos
 * (nunca por extensión) y vive en la base — el backup se la lleva junto con
 * todo lo demás.
 *
 * OJO: `Organization` es la raíz del tenant (sin columna `organizationId`),
 * así que la extensión NO la filtra — el `where` con el id de la sesión es
 * el que acota, y por eso se escribe SOLO con ese id, nunca con uno recibido.
 */

export type ResultadoPerfil = { ok: true; mensaje: string } | { ok: false; error: string };

async function exigirAdminComercio() {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") throw new Error("No autorizado");
  return session;
}

export async function subirLogo(
  _previo: ResultadoPerfil | null,
  datos: FormData
): Promise<ResultadoPerfil> {
  const session = await exigirAdminComercio();

  const archivo = datos.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige una imagen primero." };
  }
  if (archivo.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "La imagen pesa más de 512 KB. Reducila y vuelve a intentar." };
  }

  const buf = Buffer.from(await archivo.arrayBuffer());
  const mime = tipoDeImagen(buf);
  if (!mime) {
    return { ok: false, error: "Solo aceptamos PNG, JPG o WebP." };
  }

  await withSessionTenant(session, () =>
    runAsPlatform("perfil: guardar logo del comercio de la sesión", () =>
      prisma.organization.update({
        where: { id: session.user.organizationId! },
        data: { logo: buf, logoMime: mime, logoUpdatedAt: new Date() },
      })
    )
  );

  revalidatePath("/comercio/perfil");
  return { ok: true, mensaje: "Logo guardado. Ya se ve en tus cajas y en tu página de pago." };
}

/**
 * El dueño mantiene su propio dato de contacto — es SU ficha. Mismo patrón
 * del logo: el `where` es SIEMPRE el id de la sesión, nunca uno recibido.
 */
export async function guardarMiContacto(
  _previo: ResultadoPerfil | null,
  datos: FormData
): Promise<ResultadoPerfil> {
  const session = await exigirAdminComercio();

  const nombre = String(datos.get("contactoNombre") ?? "").trim().slice(0, 120);
  const telefono = String(datos.get("contactoTelefono") ?? "").trim().slice(0, 30);
  const email = String(datos.get("contactoEmail") ?? "").trim().slice(0, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Revisa el correo de contacto." };
  }

  await withSessionTenant(session, () =>
    runAsPlatform("perfil: contacto del comercio de la sesión", () =>
      prisma.organization.update({
        where: { id: session.user.organizationId! },
        data: {
          contactoNombre: nombre || null,
          contactoTelefono: telefono || null,
          contactoEmail: email || null,
        },
      })
    )
  );

  revalidatePath("/comercio/perfil");
  return { ok: true, mensaje: "Contacto guardado. Es a quien vamos a llamar si algo pasa con tu cuenta." };
}

export async function quitarLogo(
  _previo: ResultadoPerfil | null,
  _datos: FormData
): Promise<ResultadoPerfil> {
  const session = await exigirAdminComercio();

  await withSessionTenant(session, () =>
    runAsPlatform("perfil: quitar logo del comercio de la sesión", () =>
      prisma.organization.update({
        where: { id: session.user.organizationId! },
        data: { logo: null, logoMime: null, logoUpdatedAt: new Date() },
      })
    )
  );

  revalidatePath("/comercio/perfil");
  return { ok: true, mensaje: "Logo quitado." };
}
