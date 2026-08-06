import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiError } from "@/lib/api-auth";
import { BANCOS_VE_OPTIONS } from "@/lib/bancos-ve";
import { execC2pBancos } from "@/lib/exec-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/banks — catálogo de bancos.
 *
 * Dos catálogos porque son dos mundos:
 * - Por defecto: la lista ÚNICA del BCV (`bancos-ve.ts`) — para mostrar el
 *   banco pagador de una validación por referencia.
 * - `?service=c2p`: el catálogo PROPIO del servicio C2P del Tesoro, vía el
 *   ejecutor (cacheado 1 h allá). Los selects de un cobro C2P se pueblan
 *   SIEMPRE de este — sus códigos no son los del BCV.
 */
export async function GET(req: NextRequest) {
  return withApiAuth(req, async () => {
    const service = new URL(req.url).searchParams.get("service");

    if (service === "c2p") {
      try {
        const r = await execC2pBancos();
        return NextResponse.json({
          service: "c2p",
          banks: r.bancos.map((b) => ({ code: b.codigo, name: b.nombre.trim() })),
        });
      } catch {
        return apiError(502, "BANK_UNAVAILABLE", "El catálogo C2P no está disponible ahora.");
      }
    }

    return NextResponse.json({
      service: "referencia",
      banks: BANCOS_VE_OPTIONS.map((b) => ({ code: b.code, name: b.name })),
    });
  });
}
