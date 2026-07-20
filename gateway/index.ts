import { execFileSync } from "node:child_process";
import { readCreditsSince, closeSource } from "./source";
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER, type EventEnvelope } from "./contract";
import { prisma } from "../src/lib/prisma";
import { runAsPlatform } from "../src/lib/tenant-context";

/**
 * Gateway bancario — proceso PM2 aparte (:3102 conceptual; no expone HTTP).
 *
 * Lee los créditos que el sistema viejo ya persistió y se los entrega firmados
 * al SaaS. Vive en este host para siempre: la IP que el banco tiene
 * whitelisteada es la de este servidor.
 *
 * POR QUÉ NO HAY COLA NI REDIS. El plan original preveía BullMQ con reintentos
 * y dead-letter. Al implementarlo quedó claro que sobra: `WebhookTransaction`
 * del sistema viejo **ya es el registro durable**. Si una entrega falla, el
 * cursor no avanza y se reintenta en el ciclo siguiente. Eso da reintento
 * infinito y idempotencia sin cola, sin Redis compartido con n8n, y sin una
 * dead-letter que vigilar. Menos piezas que se puedan romper de madrugada.
 *
 * Ventana de solapamiento: `receivedAt` no es único (dos pagos pueden caer en
 * el mismo milisegundo), así que cada ciclo relee un poco hacia atrás. Reentregar
 * es inofensivo porque la ingesta deduplica por `uniq_tx`.
 */

const INGEST_URL = process.env.GATEWAY_INGEST_URL ?? "http://127.0.0.1:3101/api/ingest/bdt";
const POLL_MS = Number(process.env.GATEWAY_POLL_MS ?? 15_000);
const OVERLAP_MS = Number(process.env.GATEWAY_OVERLAP_MS ?? 120_000);
const CURSOR_KEY = "gateway.cursor";
const ALERT_TO = process.env.ALERT_EMAIL ?? "neracosu@gmail.com";
const ALERT_FROM = process.env.ALERT_FROM ?? "alertas@vipsoft.cloud";
/** Ciclos fallidos seguidos antes de avisar por correo. */
const FAILURES_BEFORE_ALERT = 4;

let consecutiveFailures = 0;
let alerted = false;
let parando = false;

function log(msg: string) {
  const ts = new Date().toLocaleString("sv-SE", { timeZone: "America/Caracas" });
  console.log(`${ts} ${msg}`);
}

function sendMail(subject: string, body: string) {
  try {
    // `-f` fija el remitente de SOBRE. Sin esto sale como
    // mardenli@<hostname>.contaboserver.net, dominio sin SPF, y Gmail rechaza
    // con 550-5.7.26 "sender unauthenticated" — el correo NUNCA llega.
    // `vipsoft.cloud` sí tiene SPF y DKIM; los subdominios no, y no se hereda.
    execFileSync("/usr/sbin/sendmail", ["-t", "-f", ALERT_FROM], {
      input: `To: ${ALERT_TO}\nFrom: ArmorPay Alertas <${ALERT_FROM}>\nSubject: ${subject}\n\n${body}\n`,
    });
  } catch (e) {
    log(`no se pudo enviar el correo de alerta: ${(e as Error).message}`);
  }
}

/** El cursor vive en la base del SaaS: sobrevive reinicios y despliegues. */
async function readCursor(): Promise<Date> {
  const row = await prisma.platformSetting.findUnique({ where: { key: CURSOR_KEY } });
  if (row?.value) {
    const d = new Date(row.value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Primer arranque: solo lo del día en curso, para no reprocesar meses.
  const inicio = new Date(Date.now() - 24 * 3600_000);
  log(`sin cursor previo — se arranca desde ${inicio.toISOString()}`);
  return inicio;
}

async function writeCursor(value: Date): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key: CURSOR_KEY },
    update: { value: value.toISOString() },
    create: { key: CURSOR_KEY, value: value.toISOString() },
  });
}

async function deliver(envelope: EventEnvelope): Promise<{ insertados: number; sinComercio: number }> {
  const secret = process.env.GATEWAY_HMAC_SECRET;
  if (!secret) throw new Error("GATEWAY_HMAC_SECRET no configurada");

  const body = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: sign(secret, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`ingesta respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as { insertados: number; sinComercio: number };
}

async function tick(): Promise<void> {
  const cursor = await runAsPlatform("gateway: leer cursor", readCursor);
  const desde = new Date(cursor.getTime() - OVERLAP_MS);

  const events = await readCreditsSince(desde);
  if (events.length === 0) {
    consecutiveFailures = 0;
    return;
  }

  const r = await deliver({ version: 1, events });

  // Solo después de una entrega exitosa se avanza el cursor. Si falló, la
  // excepción sube y el cursor queda donde estaba: se reintenta solo.
  const maxRecibido = events.reduce(
    (max, e) => (e.receivedAt > max ? e.receivedAt : max),
    events[0].receivedAt
  );
  await runAsPlatform("gateway: guardar cursor", () => writeCursor(new Date(maxRecibido)));

  if (r.insertados > 0 || r.sinComercio > 0) {
    log(`entregados ${events.length} · nuevos ${r.insertados} · sin comercio ${r.sinComercio}`);
  }
}

async function loop(): Promise<void> {
  log(`gateway arriba — destino ${INGEST_URL}, ciclo ${POLL_MS}ms, solapamiento ${OVERLAP_MS}ms`);

  while (!parando) {
    try {
      await tick();
      if (alerted) {
        sendMail(
          "[ArmorPay] Gateway RECUPERADO",
          `El gateway volvió a entregar eventos con normalidad tras ${consecutiveFailures} ciclos fallidos.`
        );
        alerted = false;
      }
      consecutiveFailures = 0;
    } catch (e) {
      consecutiveFailures++;
      const msg = e instanceof Error ? e.message : String(e);
      log(`FALLO(${consecutiveFailures}) ${msg}`);

      if (consecutiveFailures >= FAILURES_BEFORE_ALERT && !alerted) {
        sendMail(
          "[ArmorPay] ALERTA: el gateway no entrega eventos",
          `El gateway lleva ${consecutiveFailures} ciclos seguidos fallando.\n\n` +
            `Último error: ${msg}\n\n` +
            `Los pagos NO se pierden: quedan en la base del sistema viejo y se ` +
            `reentregan solos cuando esto se resuelva. Pero mientras tanto los ` +
            `comercios del SaaS no ven sus pagos nuevos.\n\n` +
            `Bitácora: pm2 logs armorpay-gateway`
        );
        alerted = true;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function shutdown(signal: string) {
  log(`${signal} recibido — cerrando`);
  parando = true;
  await closeSource().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

loop().catch((e) => {
  log(`error fatal: ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
