import { execFileSync } from "node:child_process";
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "../gateway/contract";
import { prisma } from "../src/lib/prisma";
import { runAsPlatform, runWithTenant } from "../src/lib/tenant-context";
import { descifrar } from "../src/lib/crypto";
import { encolarWebhooks } from "../src/lib/checkout";

/**
 * Worker del checkout — proceso PM2 aparte (`armorpay-worker`).
 *
 * Dos oficios, mismo loop (patrón del gateway: loop + try/catch + alerta por
 * correo tras N fallos — sin cola externa, la tabla ES la cola durable):
 *
 * 1. ENTREGAS: los `WebhookDelivery` pendientes se POSTean al comercio con la
 *    MISMA firma HMAC del contrato (`timestamp.body`, headers x-armorpay-*):
 *    el comercio nos verifica igual que nosotros verificamos la ingesta. Este
 *    aviso es EL diferenciador: ni MovilPay ni el BDV avisan — nosotros sí,
 *    porque el banco NOS avisa primero.
 * 2. HOUSEKEEPING: los intents PENDING vencidos pasan a EXPIRED (+ webhook
 *    `intent.expired`), para que el carrito no espere para siempre.
 *
 * Lecturas cross-tenant con `runAsPlatform` y motivo; escrituras SIEMPRE con
 * `runWithTenant` del comercio dueño.
 */

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 15_000);
const LOTE = 50;
const DELIVERY_TIMEOUT_MS = 10_000;
/** Reintentos: 1m, 5m, 30m, 2h, 12h; agotados → DEAD. */
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
const ALERT_TO = process.env.ALERT_EMAIL ?? "neracosu@gmail.com";
const ALERT_FROM = process.env.ALERT_FROM ?? "alertas@vipsoft.cloud";
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
    // `-f` fija el remitente de SOBRE (lección SPF del gateway: sin esto Gmail
    // rechaza con 550-5.7.26 y el correo nunca llega).
    execFileSync("/usr/sbin/sendmail", ["-t", "-f", ALERT_FROM], {
      input: `To: ${ALERT_TO}\nFrom: ArmorPay Alertas <${ALERT_FROM}>\nSubject: ${subject}\n\n${body}\n`,
    });
  } catch (e) {
    log(`no se pudo enviar el correo de alerta: ${(e as Error).message}`);
  }
}

/** POST firmado al endpoint del comercio. Éxito = cualquier 2xx. */
async function entregar(url: string, secret: string, payload: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: sign(secret, timestamp, payload),
    },
    body: payload,
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}`);
  }
}

async function procesarEntregas(): Promise<number> {
  const pendientes = await runAsPlatform("worker: leer entregas vencidas", () =>
    prisma.webhookDelivery.findMany({
      where: {
        status: { in: ["PENDING", "FAILED_RETRYING"] },
        nextRetryAt: { lte: new Date() },
      },
      orderBy: { nextRetryAt: "asc" },
      take: LOTE,
    })
  );

  for (const d of pendientes) {
    await runWithTenant(d.organizationId, async () => {
      const endpoint = await prisma.webhookEndpoint.findUnique({
        where: { id: d.endpointId },
        select: { url: true, secretEnc: true, isActive: true },
      });
      // Endpoint borrado o apagado por el comercio: la entrega muere sin ruido.
      if (!endpoint || !endpoint.isActive) {
        await prisma.webhookDelivery.update({
          where: { id: d.id },
          data: { status: "DEAD", lastError: "endpoint inactivo o inexistente" },
        });
        return;
      }

      try {
        await entregar(endpoint.url, descifrar(endpoint.secretEnc), d.payload);
        await prisma.webhookDelivery.update({
          where: { id: d.id },
          data: { status: "DELIVERED", attempts: d.attempts + 1, lastError: null },
        });
      } catch (e) {
        const attempts = d.attempts + 1;
        const agotado = attempts > BACKOFF_MS.length;
        await prisma.webhookDelivery.update({
          where: { id: d.id },
          data: {
            status: agotado ? "DEAD" : "FAILED_RETRYING",
            attempts,
            lastError: (e as Error).message.slice(0, 500),
            ...(agotado ? {} : { nextRetryAt: new Date(Date.now() + BACKOFF_MS[attempts - 1]) }),
          },
        });
        log(
          `entrega ${d.id} fallo ${attempts}/${BACKOFF_MS.length + 1}: ${(e as Error).message.slice(0, 120)}${agotado ? " → DEAD" : ""}`
        );
      }
    });
  }
  return pendientes.length;
}

async function vencerIntents(): Promise<number> {
  const vencidos = await runAsPlatform("worker: buscar intents vencidos", () =>
    prisma.checkoutIntent.findMany({
      where: { status: "PENDING", expiresAt: { lte: new Date() } },
      select: { id: true, organizationId: true },
      take: LOTE,
    })
  );

  for (const v of vencidos) {
    await runWithTenant(v.organizationId, async () => {
      // updateMany condicionado: si otra cosa lo confirmó en el medio, no se pisa.
      const r = await prisma.checkoutIntent.updateMany({
        where: { id: v.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      if (r.count === 1) {
        const intent = await prisma.checkoutIntent.findUnique({ where: { id: v.id } });
        if (intent) await encolarWebhooks(intent, "intent.expired");
      }
    });
  }
  return vencidos.length;
}

async function tick(): Promise<void> {
  const entregas = await procesarEntregas();
  const vencidos = await vencerIntents();
  if (entregas > 0 || vencidos > 0) {
    log(`entregas procesadas ${entregas} · intents vencidos ${vencidos}`);
  }
}

async function loop(): Promise<void> {
  log(`worker arriba — ciclo ${POLL_MS}ms, lote ${LOTE}`);

  while (!parando) {
    try {
      await tick();
      if (alerted) {
        sendMail(
          "[ArmorPay] Worker RECUPERADO",
          `El worker volvió a procesar con normalidad tras ${consecutiveFailures} ciclos fallidos.`
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
          "[ArmorPay] ALERTA: el worker del checkout no procesa",
          `El worker lleva ${consecutiveFailures} ciclos seguidos fallando.\n\n` +
            `Último error: ${msg}\n\n` +
            `Nada se pierde: las entregas y los vencimientos quedan en la base ` +
            `y se procesan solos cuando esto se resuelva. Pero mientras tanto ` +
            `los comercios no reciben sus webhooks.\n\n` +
            `Bitácora: pm2 logs armorpay-worker`
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
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

loop().catch((e) => {
  log(`error fatal: ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
