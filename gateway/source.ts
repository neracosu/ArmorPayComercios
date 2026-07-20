import mysql from "mysql2/promise";
import type { BankCreditEvent } from "./contract";

/**
 * Lectura de la base del sistema viejo (`mardenli_armorpay`).
 *
 * Por qué se lee la base y no un endpoint: agregarle rutas al proyecto que
 * factura para Armor Market sería meter código en su proceso, y la regla es
 * que no se toca. El acoplamiento de esquema es tolerable porque la forma de
 * `WebhookTransaction` **la dicta el banco** — son los campos exactos de la
 * notificación del BDT, no una decisión de producto nuestra.
 *
 * La conexión usa un usuario de **solo lectura** (`mardenli_apgwro`, con
 * privilegio SELECT y nada más): si el gateway tuviera un bug, no puede
 * escribir en el sistema que factura. Eso no es una convención, está impuesto
 * por los permisos de MySQL.
 */

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (pool) return pool;
  const url = process.env.SOURCE_DATABASE_URL;
  if (!url) throw new Error("SOURCE_DATABASE_URL no configurada");
  pool = mysql.createPool({
    uri: url,
    connectionLimit: 2,
    waitForConnections: true,
    // OBLIGATORIO. Prisma guarda los DATETIME en UTC, pero mysql2 los
    // interpreta en la zona del proceso (acá, Caracas) salvo que se le diga.
    // Sin esto, cada `receivedAt` sale 4 horas adelantado: se corrompen las
    // marcas de tiempo en el SaaS y el cursor queda en el futuro, con lo cual
    // el gateway deja de ver los pagos nuevos hasta que el reloj lo alcance.
    timezone: "Z",
  });
  return pool;
}

interface Row {
  id: string;
  numeroCuenta: string;
  montoTransaccion: string;
  fechaTransaccion: string;
  horaTransaccion: string;
  referencia: string;
  tipo: string;
  descripcion: string;
  desdeBanco: string;
  tipoProd: string;
  desdeCuenta: string;
  desdeDni: string;
  clientIp: string;
  receivedAt: Date;
}

/**
 * Créditos con `receivedAt >= desde`, ordenados. Se lee con una ventana de
 * solapamiento (ver `index.ts`) porque `receivedAt` no es único: dos pagos en
 * el mismo milisegundo podrían saltearse con un cursor estricto. Reentregar es
 * inofensivo — la ingesta es idempotente por `uniq_tx`.
 */
export async function readCreditsSince(desde: Date, limite = 500): Promise<BankCreditEvent[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    `SELECT id, numeroCuenta, montoTransaccion, fechaTransaccion, horaTransaccion,
            referencia, tipo, descripcion, desdeBanco, tipoProd, desdeCuenta,
            desdeDni, clientIp, receivedAt
       FROM WebhookTransaction
      WHERE receivedAt >= ? AND tipo = 'CREDITO'
      ORDER BY receivedAt ASC
      LIMIT ?`,
    [desde, limite]
  );

  return (rows as unknown as Row[]).map((r) => ({
    id: r.id,
    numeroCuenta: r.numeroCuenta,
    montoTransaccion: r.montoTransaccion,
    fechaTransaccion: r.fechaTransaccion,
    horaTransaccion: r.horaTransaccion,
    referencia: r.referencia,
    tipo: r.tipo,
    descripcion: r.descripcion,
    desdeBanco: r.desdeBanco,
    tipoProd: r.tipoProd,
    desdeCuenta: r.desdeCuenta,
    desdeDni: r.desdeDni,
    // `clientIp` del origen: 'transactions_wi' marca lo traído del gestor en vivo.
    origen: r.clientIp === "transactions_wi" ? "estado_de_cuenta" : "webhook",
    receivedAt: new Date(r.receivedAt).toISOString(),
  }));
}

export async function closeSource(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
