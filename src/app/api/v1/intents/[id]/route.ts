import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth, apiError } from "@/lib/api-auth";
import { intentPublico } from "@/lib/checkout";

export const dynamic = "force-dynamic";

/** GET /api/v1/intents/{id} — estado del intent (polling del carrito). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiAuth(req, async () => {
    const intent = await prisma.checkoutIntent.findUnique({ where: { id: params.id } });
    if (!intent) return apiError(404, "INTENT_NOT_FOUND", "Ese intent no existe.");
    return NextResponse.json({ intent: intentPublico(intent) });
  });
}
