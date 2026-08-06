import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, apiError } from "@/lib/api-auth";
import { tasaBcv, TasaNoDisponible } from "@/lib/bcv";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/exchange-rate — la tasa BCV que usa la plataforma.
 *
 * Valor agregado para el integrador: precia con LA MISMA tasa con la que
 * nosotros congelamos y validamos — cero discrepancias entre su carrito y el
 * cobro. La respuesta dice cuándo se leyó: la frescura es parte del dato.
 */
export async function GET(req: NextRequest) {
  return withApiAuth(req, async () => {
    try {
      const tasa = await tasaBcv();
      return NextResponse.json({
        currency: "USD/VES",
        rate: tasa.rate.toFixed(4),
        source: "BCV",
        fetchedAt: tasa.fetchedAt.toISOString(),
      });
    } catch (e) {
      if (!(e instanceof TasaNoDisponible)) throw e;
      return apiError(503, "RATE_UNAVAILABLE", "La tasa BCV no está disponible ahora.");
    }
  });
}
