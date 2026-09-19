import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { inicioDelDia } from "@/lib/operacion";
import { aCsv, fechaCsv, montoCsv, respuestaCsv } from "@/lib/csv";
import {
  BANCO_TEXTO,
  bancoPagadorTexto,
  fechaBanco,
  horaBanco,
  listarPagos,
  parseBanco,
  parseBusqueda,
} from "@/app/comercio/movimientos";

export const dynamic = "force-dynamic";

/**
 * CSV de los pagos recibidos HOY (`?banco=BDT|BT` opcional): mismas columnas
 * que la vista del dueño en /pagos, en el mismo orden. SOLO el dueño: es todo
 * lo que entró a las cuentas del comercio, y una caja ve nada más lo suyo
 * (hasta el 2026-09-18 esta ruta también le respondía al OPERATOR).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") {
    return new Response("No autorizado", { status: 401 });
  }

  const url = new URL(req.url);
  const banco = parseBanco(url.searchParams.get("banco") ?? undefined);
  const q = parseBusqueda(url.searchParams.get("q") ?? undefined);
  const filas = await withSessionTenant(session, () =>
    listarPagos({ banco, q, desde: inicioDelDia(), take: 1000 })
  );

  const csv = aCsv(
    ["Fecha banco", "Hora banco", "Nos llegó", "Banco receptor", "Cuenta", "Referencia", "Monto Bs", "Pagador", "Cédula pagador", "Banco pagador", "Descripción", "Origen", "Cobrado", "Cobrado por"],
    filas.map((p) => [
      fechaBanco(p.fechaBanco),
      horaBanco(p.horaBanco),
      fechaCsv(p.recibidoAt),
      BANCO_TEXTO[p.banco],
      p.cuenta,
      p.referencia,
      montoCsv(p.monto),
      p.pagador,
      p.cedula,
      bancoPagadorTexto(p.bancoPagador),
      p.descripcion,
      p.origen,
      p.cobrado ? "Sí" : "No",
      p.cobradoPor,
    ])
  );

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  return respuestaCsv(`pagos-recibidos-${hoy}${banco ? `-${banco.toLowerCase()}` : ""}.csv`, csv);
}
