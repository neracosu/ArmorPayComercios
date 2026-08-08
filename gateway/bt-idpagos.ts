import { request, Agent } from "undici";

/**
 * Probador de credenciales del «Identificador de Pagos» del Tesoro (doc v1.0).
 * Contrato portado de `armorpay/src/lib/bt-client.ts` (solo el login — la
 * consulta de movimientos es del lado entrante del interno y acá no aplica).
 *
 * El login ES el echo-test de BT: `POST /credenciales {appUser, appKey,
 * codSocio}` → `{status:"OK", token}`. Si el banco entrega token, las
 * credenciales del comercio sirven — el equivalente exacto del GES0000 del
 * BDT, sin mover un bolívar. Base prod
 * `https://idpagos.bt.com.ve:8084/idpagos/com/services/consulta`
 * (env `BT_IDPAGOS_BASE_URL`).
 *
 * Igual que el resto del gateway: multi-tenant, la identidad viaja POR
 * PARÁMETRO; TLS estricto; solo lanza en errores de red — el veredicto sale
 * del `status` del banco, nunca del HTTP 200.
 */

const agente = new Agent({
  connect: { rejectUnauthorized: true },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});

export interface CredencialesBtInput {
  codSocio: string;
  appUser: string;
  appKey: string;
}

export interface PruebaCredencialesBt {
  /** true ⇔ el banco respondió status "OK" y entregó token. */
  ok: boolean;
  /** `status` del banco ("OK" | otro | "ERR" si el body no parseó). */
  status: string;
  /** `mensaje` del banco, si vino. */
  mensaje: string;
  _http: { status: number; durationMs: number };
}

export async function probarCredencialesBt(
  cred: CredencialesBtInput
): Promise<PruebaCredencialesBt> {
  const base = process.env.BT_IDPAGOS_BASE_URL;
  if (!base) throw new Error("BT_IDPAGOS_BASE_URL no configurada");

  const start = Date.now();
  const res = await request(`${base}/credenciales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appUser: cred.appUser,
      appKey: cred.appKey,
      codSocio: cred.codSocio,
    }),
    dispatcher: agente,
  });
  const text = await res.body.text();

  let parsed: { status?: string; mensaje?: string; token?: string } = {};
  let parseFailed = false;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parseFailed = true;
  }

  // El token completo no se retorna ni se loguea: solo interesa si existe.
  return {
    ok: !parseFailed && parsed.status === "OK" && Boolean(parsed.token),
    status: parseFailed ? "ERR" : (parsed.status ?? "ERR"),
    mensaje: parseFailed
      ? `Respuesta no-JSON (HTTP ${res.statusCode}): ${text.slice(0, 120)}`
      : (parsed.mensaje ?? ""),
    _http: { status: res.statusCode, durationMs: Date.now() - start },
  };
}
