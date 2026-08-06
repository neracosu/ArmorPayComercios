/**
 * Mapa de códigos de banco de Venezuela (4 dígitos, asignados por el BCV /
 * Cámara de Compensación Electrónica) a nombre corto reconocible.
 *
 * Portado del panel interno como LISTA ÚNICA del SaaS: la duplicación de
 * catálogos fue la deuda #1 de VIP Play — acá todo select y toda etiqueta de
 * banco sale de este archivo, sin excepción.
 *
 * Se usa solo para PRESENTACIÓN. No interviene en la lógica de envío: el banco
 * pagador viaja como los 4 dígitos crudos. OJO con el C2P: ese servicio usa un
 * catálogo PROPIO que se obtiene del ejecutor (`/exec/c2p/bancos`) — para
 * poblar el select de un cobro C2P se usa AQUEL, nunca este.
 *
 * Fuente: listado público de códigos de pago móvil (BCV), verificado 2026-06.
 * Cualquier código no listado se muestra tal cual (degradación segura) —
 * preferimos un código sin nombre antes que un nombre equivocado.
 *
 * No confundir: 0175 es el BDT (Banco Digital de los Trabajadores, antes
 * Bicentenario) — nuestro banco por webhook; 0163 es el Banco del Tesoro —
 * nuestro banco del C2P. Son bancos distintos con siglas parecidas.
 */

export const BANCOS_VE: Record<string, string> = {
  "0001": "Banco Central de Venezuela",
  "0102": "Banco de Venezuela",
  "0104": "Venezolano de Crédito",
  "0105": "Banco Mercantil",
  "0108": "Banco Provincial",
  "0114": "Bancaribe",
  "0115": "Banco Exterior",
  "0116": "Banco Occidental de Descuento",
  "0128": "Banco Caroní",
  "0134": "Banesco",
  "0137": "Banco Sofitasa",
  "0138": "Banco Plaza",
  "0146": "Bangente",
  "0149": "Banco del Pueblo Soberano",
  "0151": "BFC Banco Fondo Común",
  "0156": "100% Banco",
  "0157": "DelSur",
  "0163": "Banco del Tesoro",
  "0166": "Banco Agrícola de Venezuela",
  "0168": "Bancrecer",
  "0169": "Mi Banco",
  "0171": "Banco Activo",
  "0172": "Bancamiga",
  "0173": "Banco Internacional de Desarrollo",
  "0174": "Banplus",
  "0175": "BDT (antes Bicentenario)",
  "0177": "BANFANB",
  "0190": "Citibank",
  "0191": "Banco Nacional de Crédito (BNC)",
  "0601": "Instituto Municipal de Crédito Popular",
};

export interface BancoOption {
  code: string;
  name: string;
}

/**
 * Bancos seleccionables como BANCO PAGADOR, ordenados alfabéticamente por
 * nombre (favorece el type-ahead del <select>). Excluye el BCV (0001): no
 * emite pagos móviles.
 */
export const BANCOS_VE_OPTIONS: BancoOption[] = Object.entries(BANCOS_VE)
  .filter(([code]) => code !== "0001")
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

/** Nombre del banco si lo conocemos, o `undefined`. */
export function bancoNombre(code?: string | null): string | undefined {
  if (!code) return undefined;
  return BANCOS_VE[code];
}

/**
 * Etiqueta para mostrar el banco pagador: "0134 · Banesco" si conocemos el
 * código, o solo el código si no. Devuelve "" si no hay código.
 */
export function bancoLabel(code?: string | null): string {
  if (!code) return "";
  const name = BANCOS_VE[code];
  return name ? `${code} · ${name}` : code;
}
