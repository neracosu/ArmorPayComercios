import { prisma } from "@/lib/prisma";
import { bancoLabel } from "@/lib/bancos-ve";

/**
 * Movimientos del inicio del comercio: lo que cobró (PaymentClaim) y lo que
 * el banco le notificó (BankTransaction), en filas planas para pintarlas como
 * reporte y bajarlas a CSV con las mismas columnas. Un solo lugar arma las
 * filas para que pantalla y descarga nunca se desalineen.
 *
 * Se llama SIEMPRE dentro de `withSessionTenant`: acá no hay `where` de
 * comercio a mano, lo pone la extensión de Prisma.
 */

export const BANCOS = ["BDT", "BT"] as const;
export type Banco = (typeof BANCOS)[number];

export const VISTAS = ["cobros", "pagos"] as const;
export type Vista = (typeof VISTAS)[number];

export const BANCO_TEXTO: Record<Banco, string> = {
  BDT: "BDT",
  BT: "Banco del Tesoro",
};

export function parseBanco(v: string | undefined): Banco | undefined {
  return BANCOS.find((b) => b === v);
}

export function parseVista(v: string | undefined): Vista {
  return VISTAS.find((x) => x === v) ?? "cobros";
}

/** Query string de la sección, sin parámetros vacíos. */
export function urlMovimientos(
  vista: Vista,
  banco: Banco | undefined,
  base = "/comercio",
  q = ""
): string {
  const params = new URLSearchParams();
  if (vista !== "cobros") params.set("vista", vista);
  if (banco) params.set("banco", banco);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

/** Lo que se teclea en el buscador: recortado y acotado, o vacío. */
export function parseBusqueda(v: string | undefined): string {
  return (v ?? "").trim().slice(0, 60);
}

/**
 * Búsqueda: cada palabra tecleada tiene que coincidir (AND) contra la fila,
 * por texto o por dígitos.
 *
 * - Texto: sin acentos ni mayúsculas (`boveda` encuentra `BOVEDA`).
 * - Dígitos: se comparan solo los números, así que da igual cómo se escriba
 *   un teléfono (`0424-286 1583`), una cédula (`V-30.170.723`), un monto
 *   (`2.539,53`, `2539,53`, `2539`), una fecha (`16/09`) o una hora (`21:57`).
 *   Un término de un solo dígito no busca por dígitos: coincidiría con todo.
 *
 * Sin tolerancia a errores de tipeo a propósito: en caja, una referencia
 * "parecida" presentada como coincidencia es un cobro equivocado.
 */
export interface CamposBusqueda {
  textos: string[];
  digitos: string[];
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Monto → dígitos comparables: "2539.53" → ["253953", "2539"]. */
function digitosDeMonto(monto: number): string[] {
  const centavos = Math.round(monto * 100).toString();
  return [centavos, Math.trunc(monto).toString()];
}

/** Fecha/hora en Venezuela → dígitos: ddmmyyyy, yyyymmdd y hhmm. */
function digitosDeFecha(d: Date): string[] {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  const [y, m, dd, h, mi] = [v("year"), v("month"), v("day"), v("hour"), v("minute")];
  return [`${dd}${m}${y}`, `${y}${m}${dd}`, `${h}${mi}`];
}

export function coincideBusqueda(campos: CamposBusqueda, q: string): boolean {
  const terminos = q.split(/\s+/).filter(Boolean);
  if (terminos.length === 0) return true;
  const textos = campos.textos.map(normalizar);
  return terminos.every((t) => {
    const tn = normalizar(t);
    if (textos.some((x) => x.includes(tn))) return true;
    const dig = soloDigitos(t);
    return dig.length >= 2 && campos.digitos.some((x) => x.includes(dig));
  });
}

function camposDeCobro(f: FilaCobro): CamposBusqueda {
  return {
    textos: [f.pagador, f.caja, f.sucursal, f.origen, bancoLabel(f.bancoPagador), BANCO_TEXTO[f.banco]],
    digitos: [
      soloDigitos(f.referencia),
      soloDigitos(f.cedula),
      soloDigitos(f.pagador),
      ...digitosDeMonto(f.monto),
      ...digitosDeFecha(f.fecha),
    ],
  };
}

function camposDePago(f: FilaPago): CamposBusqueda {
  return {
    textos: [f.pagador, f.descripcion, f.cobradoPor, f.origen, bancoLabel(f.bancoPagador), BANCO_TEXTO[f.banco]],
    digitos: [
      soloDigitos(f.referencia),
      soloDigitos(f.cedula),
      soloDigitos(f.pagador),
      soloDigitos(f.cuenta),
      ...digitosDeMonto(f.monto),
      // Fecha y hora que reporta el banco: ddmmyyyy, yyyymmdd, hhmm.
      soloDigitos(f.fechaBanco).replace(/^(\d{4})(\d{2})(\d{2})$/, "$3$2$1"),
      soloDigitos(f.fechaBanco),
      soloDigitos(f.horaBanco).slice(0, 4),
      ...digitosDeFecha(f.recibidoAt),
    ],
  };
}

/** "hhmmss" del banco → "hh:mm:ss". */
export function horaBanco(h: string): string {
  return h.length === 6 ? `${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4)}` : h;
}

/** "yyyy-mm-dd" del banco → "dd/mm/yyyy". */
export function fechaBanco(f: string): string {
  const [y, m, d] = f.split("-");
  return y && m && d ? `${d}/${m}/${y}` : f;
}

function tipoProdTexto(t: string | null | undefined): string {
  return t === "CELE" ? "celular" : t === "CNTA" ? "cuenta" : (t ?? "");
}

export interface FilaCobro {
  id: string;
  fecha: Date;
  banco: Banco;
  referencia: string;
  monto: number;
  /** Desde dónde pagó: "celular 0414…" / "cuenta 0102…". */
  pagador: string;
  cedula: string;
  /** Código del banco pagador (0134…), vacío si no se conoce. */
  bancoPagador: string;
  /** Quién cobró: nombre de la caja, o "Checkout web". */
  caja: string;
  sucursal: string;
  /** Por qué vía entró: Caja · Caja en línea · Caja C2P · Checkout · Checkout C2P. */
  origen: string;
  duplicado: boolean;
}

export interface FilaPago {
  id: string;
  /** Fecha y hora que reporta el banco (no cuando lo recibimos). */
  fechaBanco: string;
  horaBanco: string;
  recibidoAt: Date;
  banco: Banco;
  cuenta: string;
  referencia: string;
  monto: number;
  pagador: string;
  cedula: string;
  bancoPagador: string;
  /** Texto libre que manda el banco (concepto del pago móvil). */
  descripcion: string;
  /** Por dónde nos enteramos: notificación del banco o estado de cuenta. */
  origen: string;
  /** true si ya hay un cobro respaldado por este pago. */
  cobrado: boolean;
  /** Caja que lo cobró ("Checkout web" si fue la tienda); vacío si nadie. */
  cobradoPor: string;
}

const SELECT_COBRO = {
  id: true,
  amount: true,
  reference: true,
  source: true,
  isDuplicate: true,
  claimedAt: true,
  primaryKey: true,
  user: { select: { name: true } },
  branch: { select: { name: true } },
  bankTransaction: {
    select: { banco: true, desdeBanco: true, desdeCuenta: true, desdeDni: true, tipoProd: true },
  },
  checkoutIntent: {
    select: { method: true, c2pCelular: true, c2pCedula: true, c2pBancoPagador: true },
  },
  validationRequest: { select: { type: true, phone: true, dni: true, bankCode: true } },
} as const;

type CobroCrudo = Awaited<
  ReturnType<typeof prisma.paymentClaim.findMany<{ select: typeof SELECT_COBRO }>>
>[number];

/**
 * El cobro no guarda el banco receptor: se deduce de lo que lo respalda. Con
 * pago del banco detrás es ese banco; un C2P (de caja o de checkout) es del
 * Tesoro por definición; lo demás (consulta en línea BDT) es BDT.
 */
export function bancoDelCobro(c: CobroCrudo): Banco {
  if (c.bankTransaction) return c.bankTransaction.banco === "BT" ? "BT" : "BDT";
  if (c.validationRequest?.type === "BT_C2P") return "BT";
  if (c.checkoutIntent?.method === "C2P" || c.primaryKey?.startsWith("c2p:")) return "BT";
  return "BDT";
}

function origenDelCobro(c: CobroCrudo): string {
  if (c.source === "CHECKOUT") return c.checkoutIntent?.method === "C2P" ? "Checkout C2P" : "Checkout";
  if (c.validationRequest?.type === "BT_C2P") return "Caja C2P";
  if (c.source === "ONLINE") return "Caja en línea";
  return "Caja";
}

function aFilaCobro(c: CobroCrudo): FilaCobro {
  const tx = c.bankTransaction;
  const ci = c.checkoutIntent;
  const vr = c.validationRequest;
  const pagador = tx
    ? `${tipoProdTexto(tx.tipoProd)} ${tx.desdeCuenta}`.trim()
    : (ci?.c2pCelular ?? vr?.phone ?? "");
  return {
    id: c.id,
    fecha: c.claimedAt,
    banco: bancoDelCobro(c),
    referencia: c.reference,
    monto: Number(c.amount),
    pagador,
    cedula: tx?.desdeDni ?? ci?.c2pCedula ?? vr?.dni ?? "",
    bancoPagador: tx?.desdeBanco ?? ci?.c2pBancoPagador ?? vr?.bankCode ?? "",
    caja: c.user?.name ?? "Checkout web",
    sucursal: c.branch?.name ?? "",
    origen: origenDelCobro(c),
    duplicado: c.isDuplicate,
  };
}

/**
 * Cobros más recientes, opcionalmente de un banco. El banco se deduce fila a
 * fila (no es columna), así que con filtro se leen más filas de las que se
 * muestran y se recorta después.
 *
 * `userId` acota a los cobros de UNA caja: es lo único que un OPERATOR puede
 * listar. Quien llame desde una pantalla de caja lo pasa SIEMPRE; sin él
 * salen los de todo el comercio, que son del dueño.
 */
export async function listarCobros(opts: {
  banco?: Banco;
  q?: string;
  desde?: Date;
  hasta?: Date;
  userId?: string;
  take: number;
}): Promise<FilaCobro[]> {
  const { banco, q, desde, hasta, userId, take } = opts;
  // Banco y búsqueda se resuelven en memoria: con cualquiera de los dos se
  // leen más filas de las que se muestran y se recorta después.
  const ampliar = Boolean(banco || q);
  const crudos = await prisma.paymentClaim.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(desde || hasta ? { claimedAt: { gte: desde, lte: hasta } } : {}),
    },
    orderBy: { claimedAt: "desc" },
    take: ampliar ? Math.min(Math.max(take * 8, 2000), 5000) : take,
    select: SELECT_COBRO,
  });
  let filas = crudos.map(aFilaCobro);
  if (banco) filas = filas.filter((f) => f.banco === banco);
  if (q) filas = filas.filter((f) => coincideBusqueda(camposDeCobro(f), q));
  return filas.slice(0, take);
}

/** Pagos que el banco notificó a las cuentas del comercio, más recientes primero. */
export async function listarPagos(opts: {
  banco?: Banco;
  q?: string;
  desde?: Date;
  hasta?: Date;
  take: number;
}): Promise<FilaPago[]> {
  const { banco, q, desde, hasta, take } = opts;
  const crudos = await prisma.bankTransaction.findMany({
    where: {
      tipo: "CREDITO",
      ...(banco ? { banco } : {}),
      ...(desde || hasta ? { receivedAt: { gte: desde, lte: hasta } } : {}),
    },
    orderBy: { receivedAt: "desc" },
    // La búsqueda va en memoria con las mismas reglas que los cobros: con
    // ella se leen más filas de las que se muestran y se recorta después.
    take: q ? Math.min(Math.max(take * 8, 2000), 5000) : take,
    select: {
      id: true,
      banco: true,
      numeroCuenta: true,
      montoTransaccion: true,
      fechaTransaccion: true,
      horaTransaccion: true,
      referencia: true,
      desdeBanco: true,
      tipoProd: true,
      desdeCuenta: true,
      desdeDni: true,
      descripcion: true,
      origen: true,
      receivedAt: true,
      // El cobro primario (los duplicados no cuentan como "cobrado").
      claims: {
        where: { isDuplicate: false },
        select: { user: { select: { name: true } } },
        take: 1,
      },
    },
  });
  const filas: FilaPago[] = crudos.map((t) => ({
    id: t.id,
    fechaBanco: t.fechaTransaccion,
    horaBanco: t.horaTransaccion,
    recibidoAt: t.receivedAt,
    banco: t.banco === "BT" ? "BT" : "BDT",
    cuenta: t.numeroCuenta,
    referencia: t.referencia,
    monto: Number(t.montoTransaccion),
    pagador: `${tipoProdTexto(t.tipoProd)} ${t.desdeCuenta}`.trim(),
    cedula: t.desdeDni,
    bancoPagador: t.desdeBanco,
    descripcion: t.descripcion,
    origen: t.origen === "estado_de_cuenta" ? "Estado de cuenta" : "Notificación",
    cobrado: t.claims.length > 0,
    cobradoPor: t.claims.length > 0 ? (t.claims[0].user?.name ?? "Checkout web") : "",
  }));
  return (q ? filas.filter((f) => coincideBusqueda(camposDePago(f), q)) : filas).slice(0, take);
}

/** Etiqueta del banco pagador para pantalla y CSV. */
export function bancoPagadorTexto(code: string): string {
  return bancoLabel(code);
}
