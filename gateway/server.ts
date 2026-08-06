import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { z } from "zod";
import { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./contract";
import { c2pBancos, c2pPago, type BtC2pBanco } from "./bt-c2p";
import { movimientosDelDia } from "./bdt";
import { prisma } from "../src/lib/prisma";
import { runAsPlatform } from "../src/lib/tenant-context";
import { descifrar } from "../src/lib/crypto";

/**
 * Ejecutor bancario del gateway — la pata SALIENTE (Fase 1 del checkout).
 *
 * Servidor HTTP en `127.0.0.1` estricto: Apache no lo proxya, solo el SaaS
 * local le habla. Si el SaaS algún día se muda de servidor, esto se expone vía
 * Apache+TLS con la misma HMAC — el gateway no se muda nunca (la IP
 * whitelisteada por los bancos es la de este host).
 *
 * Autenticación: HMAC `timestamp.body` con el MISMO esquema de `contract.ts`
 * pero con SECRETO PROPIO (`GATEWAY_EXEC_HMAC_SECRET`). No se reusa el de la
 * ingesta a propósito: direcciones distintas (SaaS→gateway vs gateway→SaaS),
 * secretos distintos — un secreto filtrado no compromete la otra dirección.
 *
 * Credenciales bancarias: NUNCA viajan por HTTP. El SaaS manda solo
 * `organizationId`; este proceso carga la AuthKey / la afiliación C2P de la
 * base ÉL MISMO, dentro de `runAsPlatform` con motivo explícito.
 *
 * Este proceso no persiste nada de los cobros: devuelve la respuesta cruda del
 * banco + el veredicto, y la bitácora la escribe el SaaS (que es quien tiene
 * el modelo de datos del checkout). Logs siempre enmascarados.
 */

const EXEC_PORT = Number(process.env.GATEWAY_EXEC_PORT ?? 3102);
const MAX_BODY_BYTES = 32 * 1024;
/** El C2P puede tardar: timeout de request holgado sobre los 30 s del banco. */
const REQUEST_TIMEOUT_MS = 35_000;

type Log = (msg: string) => void;

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

/** Enmascara una referencia para logs: `****1234`. */
function maskRef(ref: string): string {
  return ref.length <= 4 ? "****" : "*".repeat(ref.length - 4) + ref.slice(-4);
}

/**
 * Mismo criterio que el gestor del interno: letra de identificación en
 * mayúscula pegada al número; solo dígitos ⇒ persona natural venezolana (V).
 */
function normalizeCedula(cedula: string): string {
  const clean = cedula.replace(/[\s.\-]/g, "").toUpperCase();
  if (/^[VEJGP]\d+$/.test(clean)) return clean;
  if (/^\d+$/.test(clean)) return `V${clean}`;
  return clean;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body demasiado grande"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ─────────────────────────────────────────────
// Esquemas de entrada
// ─────────────────────────────────────────────

const pagoSchema = z.object({
  organizationId: z.string().min(1),
  celular: z.string().regex(/^\d{10,12}$/, "celular de 10-12 dígitos"),
  bancoPagador: z.string().regex(/^\d{4}$/, "código de banco del catálogo C2P"),
  cedula: z.string().min(2).max(15),
  monto: z.string().regex(/^\d{1,16}\.\d{2}$/, "monto con punto y 2 decimales"),
  otp: z.string().regex(/^\d{4,12}$/, "clave dinámica numérica"),
  concepto: z.string().max(40).optional(),
  /** Correlación con el CheckoutIntent del SaaS; solo para bitácora y logs. */
  intentId: z.string().min(1),
});

const movimientosSchema = z.object({
  organizationId: z.string().min(1),
  cuenta: z.string().regex(/^\d{20}$/, "cuenta de 20 dígitos"),
  fecha: z.string().regex(/^\d{8}$/, "fecha YYYYMMDD"),
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

/** Catálogo de bancos C2P: cambia casi nunca — caché en memoria 1 h. */
let bancosCache: { data: BtC2pBanco[]; at: number } | null = null;
const BANCOS_TTL_MS = 60 * 60_000;

async function handleBancos(res: ServerResponse, log: Log): Promise<void> {
  if (bancosCache && Date.now() - bancosCache.at < BANCOS_TTL_MS) {
    json(res, 200, { bancos: bancosCache.data, cache: true });
    return;
  }
  const r = await c2pBancos();
  if (!Array.isArray(r.data) || r.data.length === 0) {
    log(`exec /c2p/bancos sin catálogo (HTTP ${r._http.status})`);
    json(res, 502, { error: "banco_sin_catalogo", httpStatus: r._http.status });
    return;
  }
  bancosCache = { data: r.data, at: Date.now() };
  log(`exec /c2p/bancos catálogo renovado: ${r.data.length} bancos (${r._http.durationMs}ms)`);
  json(res, 200, { bancos: r.data, cache: false });
}

async function handlePago(body: unknown, res: ServerResponse, log: Log): Promise<void> {
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) {
    json(res, 400, { error: "payload_invalido", issues: parsed.error.issues });
    return;
  }
  const input = parsed.data;

  const org = await runAsPlatform("exec: credenciales C2P de la organización", () =>
    prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { rif: true, btCodAfiliado: true, btC2pEnabled: true, status: true },
    })
  );
  if (!org) {
    json(res, 404, { error: "organizacion_no_existe" });
    return;
  }
  if (org.status !== "ACTIVA" || !org.btC2pEnabled || !org.btCodAfiliado) {
    json(res, 422, { error: "c2p_no_habilitado" });
    return;
  }

  let r;
  try {
    r = await c2pPago({
      celular: input.celular,
      banco: input.bancoPagador,
      cedula: normalizeCedula(input.cedula),
      monto: input.monto,
      token: input.otp,
      concepto: input.concepto?.trim() || "Pago ArmorPay",
      rif: org.rif,
      codAfiliado: org.btCodAfiliado,
    });
  } catch (e) {
    // Error de red: el banco no respondió. OJO: el débito PUDO haberse hecho —
    // el SaaS debe tratar NETERR como "desconocido", nunca como rechazo.
    const msg = (e as Error).message.slice(0, 250);
    log(`exec /c2p/pago NETERR intent=${input.intentId}: ${msg}`);
    json(res, 502, { code: "NETERR", message: "El banco no respondió", detail: msg });
    return;
  }

  const data = r.data ?? {};
  const codres = data.codres ?? "ERR";
  const aprobado = codres === "C2P0000"; // el ÚNICO criterio de éxito
  // descRes llega con padding y un punto colgando ("APROBADA   .").
  const message = (data.descRes ?? `Respuesta inesperada del banco (HTTP ${r._http.status})`)
    .trim()
    .replace(/\s+\.$/, "")
    .slice(0, 250);
  // Los montos de la RESPUESTA vienen con coma decimal aunque el request
  // viaje con punto — se normalizan acá para que el SaaS no cargue con eso.
  const montoComision = data.montoComision?.trim()
    ? data.montoComision.trim().replace(",", ".")
    : null;

  log(
    `exec /c2p/pago ${codres} intent=${input.intentId} ` +
      `ref=${data.referencia ? maskRef(data.referencia) : "-"} monto=${input.monto} ` +
      `lote=${data.numeroLote ?? "-"} ${r._http.durationMs}ms`
  );

  json(res, 200, {
    aprobado,
    codres,
    message,
    referencia: data.referencia || null,
    montoComision,
    fecha: data.fecha || null,
    hora: data.hora || null,
    numeroLote: data.numeroLote || null,
    autorizacionIBS: data.autorizacionIBS || null,
    raw: r.raw,
    durationMs: r._http.durationMs,
  });
}

async function handleMovimientos(body: unknown, res: ServerResponse, log: Log): Promise<void> {
  const parsed = movimientosSchema.safeParse(body);
  if (!parsed.success) {
    json(res, 400, { error: "payload_invalido", issues: parsed.error.issues });
    return;
  }
  const input = parsed.data;

  const org = await runAsPlatform("exec: AuthKey BDT de la organización", () =>
    prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { authKeyEnc: true, authKeyStatus: true },
    })
  );
  if (!org) {
    json(res, 404, { error: "organizacion_no_existe" });
    return;
  }
  if (!org.authKeyEnc || org.authKeyStatus === "SIN_LLAVE" || org.authKeyStatus === "INVALIDA") {
    json(res, 422, { error: "llave_no_operativa", status: org.authKeyStatus });
    return;
  }

  // La cuenta es dato del request, no secreto; la llave nunca sale de acá.
  const authKey = descifrar(org.authKeyEnc);
  const r = await movimientosDelDia(authKey, input.cuenta, input.fecha);

  log(
    `exec /bdt/movimientos ${r.code} cuenta=****${input.cuenta.slice(-4)} ` +
      `fecha=${input.fecha} ${r.http.duracionMs}ms`
  );

  json(res, 200, {
    ok: r.code === "GES0000", // éxito = código del banco, jamás HTTP 200
    code: r.code,
    message: r.message,
    transactions: (r.datos as { transactions?: unknown[] }).transactions ?? [],
    durationMs: r.http.duracionMs,
  });
}

// ─────────────────────────────────────────────
// Servidor
// ─────────────────────────────────────────────

export function startExecServer(log: Log): Server {
  const secret = process.env.GATEWAY_EXEC_HMAC_SECRET;
  if (!secret) throw new Error("GATEWAY_EXEC_HMAC_SECRET no configurada");

  const server = createServer(async (req, res) => {
    try {
      const path = (req.url ?? "").split("?")[0];

      // Salud sin HMAC: es loopback y no revela nada — para monitoreo local.
      if (req.method === "GET" && path === "/exec/health") {
        json(res, 200, { ok: true, uptimeS: Math.round(process.uptime()) });
        return;
      }

      if (req.method !== "POST") {
        json(res, 405, { error: "metodo_no_permitido" });
        return;
      }

      const raw = await readBody(req);
      const check = verify(
        secret,
        (req.headers[TIMESTAMP_HEADER] as string) ?? null,
        (req.headers[SIGNATURE_HEADER] as string) ?? null,
        raw
      );
      if (!check.ok) {
        json(res, 401, { error: "firma_invalida", detalle: check.reason });
        return;
      }

      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        json(res, 400, { error: "json_invalido" });
        return;
      }

      if (path === "/exec/c2p/pago") return await handlePago(body, res, log);
      if (path === "/exec/c2p/bancos") return await handleBancos(res, log);
      if (path === "/exec/bdt/movimientos") return await handleMovimientos(body, res, log);

      json(res, 404, { error: "ruta_desconocida" });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 250);
      log(`exec ERROR ${req.method} ${req.url}: ${msg}`);
      if (!res.headersSent) json(res, 500, { error: "interno" });
      else res.end();
    }
  });

  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.listen(EXEC_PORT, "127.0.0.1", () => {
    log(`ejecutor bancario escuchando en 127.0.0.1:${EXEC_PORT} (loopback estricto)`);
  });
  server.on("error", (e) => {
    // EADDRINUSE u otro fallo de bind: sin ejecutor no hay C2P — que se vea.
    log(`ejecutor NO pudo arrancar: ${(e as Error).message}`);
    throw e;
  });

  return server;
}
