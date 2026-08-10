import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { runAsPlatform, runWithTenant } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

/**
 * Sirve un documento del expediente. NO es público: lo ve la plataforma
 * (admin Y revisora — dictaminar un recaudo exige poder VER el documento) y
 * el propio comercio dueño — nadie más. El tenant del ORG_ADMIN lo acota la
 * extensión, no un `where` a mano.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getVerifiedSession();
  if (!session) return NextResponse.json({ error: "no_autorizado" }, { status: 401 });

  let recaudo: { archivo: Buffer | Uint8Array; mime: string; nombre: string } | null = null;

  if (session.user.role === "PLATFORM_ADMIN" || session.user.role === "PLATFORM_REVIEWER") {
    recaudo = await runAsPlatform("recaudo: revisión de plataforma", () =>
      prisma.recaudo.findUnique({
        where: { id: params.id },
        select: { archivo: true, mime: true, nombre: true },
      })
    );
  } else if (session.user.role === "ORG_ADMIN" && session.user.organizationId) {
    recaudo = await runWithTenant(session.user.organizationId, () =>
      prisma.recaudo.findUnique({
        where: { id: params.id },
        select: { archivo: true, mime: true, nombre: true },
      })
    );
  }

  if (!recaudo) return NextResponse.json({ error: "no_existe" }, { status: 404 });

  return new NextResponse(Buffer.from(recaudo.archivo), {
    headers: {
      "Content-Type": recaudo.mime,
      "Content-Disposition": `inline; filename="${recaudo.nombre.replace(/[^\w. -]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
