import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAsPlatform } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

/**
 * Sirve el logo de un comercio. Público a propósito: lo consumen el panel de
 * cajas Y la página de pago del cliente final. No revela nada que la página
 * `/pay` no muestre ya, y el id es un cuid (no enumerable).
 *
 * Caché larga con la versión en la URL (`?v=timestamp`): cambiar el logo
 * cambia la URL, así que se puede cachear un año sin miedo.
 */
export async function GET(_req: NextRequest, { params }: { params: { orgId: string } }) {
  const org = await runAsPlatform("logo: servir imagen pública", () =>
    prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { logo: true, logoMime: true },
    })
  );

  if (!org?.logo || !org.logoMime) {
    return NextResponse.json({ error: "sin_logo" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(org.logo), {
    headers: {
      "Content-Type": org.logoMime,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Aunque validamos raster, el navegador no debe adivinar otra cosa.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
