import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Contrato del evento bancario entre el gateway y el SaaS.
 *
 * Vive en este repo, compartido por los dos lados, para que un cambio se haga
 * en un solo lugar y el compilador avise. Es la ÚNICA frontera de API entre
 * ambos: el día que el SaaS se mude de servidor, esto sigue igual.
 */

/** Crédito recibido en una cuenta afiliada, tal como lo entrega el banco. */
export interface BankCreditEvent {
  /** Identificador estable del evento: mismo pago → mismo id, siempre. */
  id: string;
  numeroCuenta: string;
  montoTransaccion: string;
  fechaTransaccion: string; // yyyy-mm-dd
  horaTransaccion: string; // hhmmss
  referencia: string;
  tipo: string; // CREDITO | DEBITO
  descripcion: string;
  desdeBanco: string;
  tipoProd: string; // CELE | CNTA
  desdeCuenta: string;
  desdeDni: string;
  /** webhook = el banco nos notificó · estado_de_cuenta = lo trajimos del gestor */
  origen: string;
  /** Momento en que el sistema origen lo recibió (ISO). */
  receivedAt: string;
}

export interface EventEnvelope {
  version: 1;
  events: BankCreditEvent[];
}

export const SIGNATURE_HEADER = "x-armorpay-signature";
export const TIMESTAMP_HEADER = "x-armorpay-timestamp";

/** Ventana de tolerancia del timestamp firmado (anti-replay). */
export const MAX_SKEW_SECONDS = 300;

/**
 * Firma `timestamp.body` con HMAC-SHA256 — esquema Stripe/Svix. El timestamp
 * va DENTRO de lo firmado: sin eso, alguien podría reenviar un cuerpo válido
 * capturado antes y no habría forma de distinguirlo del original.
 */
export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/** Verifica firma y frescura. Comparación en tiempo constante. */
export function verify(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  body: string
): VerifyResult {
  if (!timestamp || !signature) return { ok: false, reason: "faltan cabeceras de firma" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "timestamp inválido" };
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (skew > MAX_SKEW_SECONDS) return { ok: false, reason: `timestamp fuera de ventana (${Math.round(skew)}s)` };

  const expected = Buffer.from(sign(secret, timestamp, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return { ok: false, reason: "firma no coincide" };
  if (!timingSafeEqual(expected, given)) return { ok: false, reason: "firma no coincide" };

  return { ok: true };
}
