import { request, Agent } from "undici";

/**
 * Cliente del servicio C2P «Botón de Pago» del Banco del Tesoro (doc V.4.1).
 * Portado de `armorpay/src/lib/bt-client.ts` (solo la parte C2P — el
 * Identificador de Pagos con token Bearer es del lado entrante del interno y
 * acá no aplica).
 *
 * Diferencia clave con el molde: el interno opera UNA afiliación y saca
 * `codAfiliado`/`RIF` de settings globales; el SaaS es multi-tenant, así que
 * la identidad viaja POR PARÁMETRO — el servidor del ejecutor la carga de la
 * `Organization` correspondiente antes de llamar.
 *
 * Puntos duros verificados en producción por el interno:
 * - Base prod `https://tpmovil.bt.gob.ve/RestTesoro_C2P/com/services`
 *   (env `BT_C2P_BASE_URL`); SIN autenticación — identidad = codAfiliado + RIF.
 * - Canal `"06"` fijo en `/botonDePago/pago`.
 * - Monto con PUNTO y 2 decimales; los montos de la RESPUESTA vienen con coma.
 * - `concepto` ≤ 40 caracteres.
 * - Aprobación ⇔ `codres === "C2P0000"`; rechazos con familia `C2P####` o el
 *   literal `"ERROR"`. Éxito NUNCA se decide por el HTTP 200.
 * - `/bancos` usa códigos PROPIOS del servicio (el BDT figura como "0007"),
 *   distintos de los códigos BCV — poblar selects SIEMPRE desde acá.
 */

const agente = new Agent({
  connect: { rejectUnauthorized: true },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});

export interface BtC2pBanco {
  codigo: string;
  nombre: string;
}

/** Respuesta cruda de un endpoint C2P + metadata HTTP (para auditoría). */
export interface BtC2pResponse<T> {
  /** JSON parseado (objeto o ARRAY pelado, según endpoint); null si no parseó. */
  data: T | null;
  /** Body crudo (truncado) — se persiste como evidencia forense. */
  raw: string;
  _http: { status: number; durationMs: number; url: string; method: string };
}

/**
 * Caller del C2P: sin token, y SIN asumir la forma del body (`/bancos`
 * devuelve un array pelado; los demás objetos con naming dispar). Solo lanza
 * en errores de red — nunca por status HTTP: el veredicto es del `codres`.
 */
async function c2pCall<T>(path: string, body: unknown): Promise<BtC2pResponse<T>> {
  const base = process.env.BT_C2P_BASE_URL;
  if (!base) throw new Error("BT_C2P_BASE_URL no configurada");

  const url = `${base}${path}`;
  const start = Date.now();
  const res = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    dispatcher: agente,
  });
  const text = await res.body.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return {
    data,
    raw: text.slice(0, 4000),
    _http: {
      status: res.statusCode,
      durationMs: Date.now() - start,
      url,
      method: "POST",
    },
  };
}

/** Catálogo de bancos del servicio C2P (códigos propios, NO BCV). */
export function c2pBancos() {
  return c2pCall<BtC2pBanco[]>("/bancos", {});
}

export interface C2pPagoInput {
  celular: string;
  banco: string; // código del catálogo C2P (NO BCV)
  cedula: string; // ya normalizada: letra mayúscula pegada al número
  monto: string; // "154.00" — punto y 2 decimales
  token: string; // clave dinámica que el pagador generó desde su banco
  concepto: string; // ≤40 chars
  rif: string; // identidad de la afiliación del comercio…
  codAfiliado: string; // …cargada de la Organization por el servidor
}

export interface C2pPagoData {
  codres?: string;
  descRes?: string;
  referencia?: string;
  montoComision?: string;
  fecha?: string;
  hora?: string;
  numeroLote?: string;
  autorizacionIBS?: string;
}

/** El cobro. Aprobado ⇔ `codres === "C2P0000"`. */
export function c2pPago(input: C2pPagoInput) {
  return c2pCall<C2pPagoData>("/botonDePago/pago", {
    canal: "06",
    celular: input.celular,
    banco: input.banco,
    RIF: input.rif,
    cedula: input.cedula,
    monto: input.monto,
    token: input.token,
    concepto: input.concepto.slice(0, 40),
    codAfiliado: input.codAfiliado,
    comercio: "",
  });
}
