import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { aCsv, fechaCsv, montoCsv, respuestaCsv } from "@/lib/csv";
import {
  BANCO_TEXTO,
  bancoPagadorTexto,
  fechaBanco,
  horaBanco,
  listarCobros,
  listarPagos,
  parseBanco,
  parseBusqueda,
  parseVista,
} from "../movimientos";

export const dynamic = "force-dynamic";

/**
 * CSV de los movimientos del inicio: `?vista=cobros|pagos` y `?banco=BDT|BT`
 * (los mismos filtros de la pantalla), rango `?desde=&hasta=` default últimos
 * 30 días. Mismas columnas que la tabla, en el mismo orden.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "ORG_ADMIN") {
    return new Response("No autorizado", { status: 401 });
  }

  const url = new URL(req.url);
  const vista = parseVista(url.searchParams.get("vista") ?? undefined);
  const banco = parseBanco(url.searchParams.get("banco") ?? undefined);
  const q = parseBusqueda(url.searchParams.get("q") ?? undefined);
  const desdeParam = url.searchParams.get("desde");
  const hastaParam = url.searchParams.get("hasta");
  const desde = desdeParam
    ? new Date(`${desdeParam}T00:00:00-04:00`)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const hasta = hastaParam ? new Date(`${hastaParam}T23:59:59.999-04:00`) : new Date();
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return new Response("Rango de fechas inválido", { status: 400 });
  }

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  const sufijo = banco ? `-${banco.toLowerCase()}` : "";

  if (vista === "pagos") {
    const filas = await withSessionTenant(session, () =>
      listarPagos({ banco, q, desde, hasta, take: 5000 })
    );
    const csv = aCsv(
      ["Fecha banco", "Hora banco", "Recibido", "Banco receptor", "Cuenta", "Referencia", "Monto Bs", "Pagador", "Cédula pagador", "Banco pagador", "Descripción", "Origen", "Cobrado", "Cobrado por"],
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
    return respuestaCsv(`pagos-recibidos${sufijo}-${hoy}.csv`, csv);
  }

  const filas = await withSessionTenant(session, () =>
    listarCobros({ banco, q, desde, hasta, take: 5000 })
  );
  const csv = aCsv(
    ["Fecha y hora", "Banco receptor", "Referencia", "Monto Bs", "Pagador", "Cédula pagador", "Banco pagador", "Caja", "Sucursal", "Origen", "Estado"],
    filas.map((c) => [
      fechaCsv(c.fecha),
      BANCO_TEXTO[c.banco],
      c.referencia,
      montoCsv(c.monto),
      c.pagador,
      c.cedula,
      bancoPagadorTexto(c.bancoPagador),
      c.caja,
      c.sucursal,
      c.origen,
      c.duplicado ? "Duplicado" : "OK",
    ])
  );
  return respuestaCsv(`cobros${sufijo}-${hoy}.csv`, csv);
}
