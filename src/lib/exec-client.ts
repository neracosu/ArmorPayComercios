import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "../../gateway/contract";

/**
 * Cliente del ejecutor bancario del gateway (127.0.0.1:3102, Fase 1).
 *
 * El SaaS nunca habla con un banco directo: le encarga la operación al
 * gateway, que es el proceso con la IP whitelisteada y el único que toca
 * credenciales. Por eso acá SOLO viaja `organizationId` — jamás una AuthKey
 * ni un código de afiliado.
 *
 * Firmado con `GATEWAY_EXEC_HMAC_SECRET` (secreto propio de esta dirección,
 * distinto del de la ingesta). Mismo esquema `timestamp.body` del contrato.
 */

const EXEC_URL = process.env.GATEWAY_EXEC_URL ?? "http://127.0.0.1:3102";

async function execCall<T>(path: string, body: unknown, timeoutMs = 35_000): Promise<T> {
  const secret = process.env.GATEWAY_EXEC_HMAC_SECRET;
  if (!secret) throw new Error("GATEWAY_EXEC_HMAC_SECRET no configurada");

  const raw = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(`${EXEC_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: sign(secret, timestamp, raw),
    },
    body: raw,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || data === null) {
    const detalle = data ? JSON.stringify(data).slice(0, 200) : `HTTP ${res.status}`;
    throw new ExecError(res.status, detalle);
  }
  return data;
}

/** Falla del ejecutor (no del banco): HMAC, validación, org sin C2P, etc. */
export class ExecError extends Error {
  constructor(
    public httpStatus: number,
    detail: string
  ) {
    super(`ejecutor respondió ${httpStatus}: ${detail}`);
  }
}

export interface ExecC2pPagoResult {
  aprobado: boolean;
  codres: string;
  message: string;
  referencia: string | null;
  montoComision: string | null;
  fecha: string | null;
  hora: string | null;
  numeroLote: string | null;
  autorizacionIBS: string | null;
  raw: string;
  durationMs: number;
}

export function execC2pPago(input: {
  organizationId: string;
  celular: string;
  bancoPagador: string;
  cedula: string;
  monto: string;
  otp: string;
  concepto?: string;
  intentId: string;
}): Promise<ExecC2pPagoResult> {
  return execCall<ExecC2pPagoResult>("/exec/c2p/pago", input);
}

export function execC2pBancos(): Promise<{ bancos: Array<{ codigo: string; nombre: string }> }> {
  return execCall("/exec/c2p/bancos", {}, 15_000);
}

export function execBdtMovimientos(input: {
  organizationId: string;
  cuenta: string;
  fecha: string; // YYYYMMDD
}): Promise<{ ok: boolean; code: string; message: string; transactions: unknown[] }> {
  return execCall("/exec/bdt/movimientos", input);
}
