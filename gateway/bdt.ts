import { request, Agent } from "undici";

/**
 * Cliente del Gestor de Servicios Financieros del BDT.
 *
 * Vive en `gateway/` porque el gateway es el único componente que existe para
 * hablar con el banco, aunque hoy el panel lo importe directo: los dos corren
 * en el mismo host, que es el que tiene la IP autorizada. El día que el panel
 * se mude de servidor, esto pasa a ser una llamada al gateway y el resto del
 * código no se entera.
 *
 * `undici` y NO el fetch nativo: el banco exige ajustes de TLS que el fetch
 * global de Node no expone. Regla heredada del sistema en producción.
 *
 * La AuthKey va SIEMPRE por parámetro. Acá no hay llave por defecto: el banco
 * emite una por RIF y usar la equivocada es peor que fallar.
 */

const agente = new Agent({
  connect: { rejectUnauthorized: true },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});

export interface RespuestaBdt<T = Record<string, unknown>> {
  code: string;
  message: string;
  datos: T;
  http: { status: number; duracionMs: number };
}

/**
 * Header TmSt: `yyyy-MM-dd HH:mm:ss.ffffff`, 26 caracteres exactos, con SEIS
 * dígitos de fracción de segundo. El banco lo valida con una expresión regular
 * y rechaza con GES0098 cualquier otra forma — probado en cabeza propia.
 *
 * JavaScript no expone microsegundos, así que los tres últimos dígitos se
 * derivan de `hrtime`, que sí tiene resolución de nanosegundos. Si el reloj de
 * pared salta (NTP), se reancla.
 *
 * La hora es LOCAL del proceso: PM2 lo corre con TZ=America/Caracas.
 */
let anclaEpochMs = Date.now();
let anclaHrNs = process.hrtime.bigint();

function tmst(): string {
  const p = (n: number, l: number) => String(n).padStart(l, "0");

  const estimado =
    anclaEpochMs + Number((process.hrtime.bigint() - anclaHrNs) / BigInt(1_000_000));
  if (Math.abs(Date.now() - estimado) > 1000) {
    anclaEpochMs = Date.now();
    anclaHrNs = process.hrtime.bigint();
  }

  const transcurridoNs = process.hrtime.bigint() - anclaHrNs;
  const d = new Date(anclaEpochMs + Number(transcurridoNs / BigInt(1_000_000)));
  const subMs = Math.floor(Number(transcurridoNs % BigInt(1_000_000)) / 1000);

  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1, 2)}-${p(d.getDate(), 2)} ` +
    `${p(d.getHours(), 2)}:${p(d.getMinutes(), 2)}:${p(d.getSeconds(), 2)}.` +
    `${p(d.getMilliseconds(), 3)}${p(subMs, 3)}`
  );
}

async function llamar<T>(
  authKey: string,
  ruta: string,
  query?: Record<string, string | number | undefined>
): Promise<RespuestaBdt<T>> {
  const base = process.env.BDT_BASE_URL;
  if (!base) throw new Error("BDT_BASE_URL no configurada");

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const url = `${base}${ruta}${qs.toString() ? `?${qs}` : ""}`;

  const inicio = Date.now();
  const res = await request(url, {
    method: "GET",
    headers: { AuthKey: authKey, TmSt: tmst(), Trace: String(Date.now() % 1_000_000) },
    dispatcher: agente,
  });
  const texto = await res.body.text();
  const duracionMs = Date.now() - inicio;

  let parsed: Record<string, unknown>;
  try {
    parsed = texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(`El banco respondió algo que no es JSON (${res.statusCode})`);
  }

  return {
    code: (parsed.code as string) ?? "ERR0000",
    message: (parsed.message as string) ?? "Sin mensaje",
    datos: parsed as T,
    http: { status: res.statusCode, duracionMs },
  };
}

/** Prueba de vida. Es la forma de saber si una Llave de Trabajo sirve. */
export function echoTest(authKey: string) {
  return llamar<{ services_stat?: { p2p_stat: string; simf_stat: string } }>(
    authKey,
    "/api/v1/bank/echo-test"
  );
}

/** Cuentas que el banco reconoce para esa llave — o sea, las de ese RIF. */
export function cuentasDeLaLlave(authKey: string) {
  return llamar<{ cuentas?: Array<{ account_number?: string; balance?: string }> }>(
    authKey,
    "/api/v1/bank/accounts"
  );
}

/** Créditos del día en una cuenta, para la consulta en vivo. */
export function movimientosDelDia(authKey: string, cuenta: string, fechaYYYYMMDD: string) {
  return llamar<{ transactions?: unknown[] }>(
    authKey,
    `/api/v1/bank/accounts/${encodeURIComponent(cuenta)}/transactions_wi`,
    { from_date: fechaYYYYMMDD, to_date: fechaYYYYMMDD, from_time: "000000", to_time: "235959", limit: 500, page: 1 }
  );
}
