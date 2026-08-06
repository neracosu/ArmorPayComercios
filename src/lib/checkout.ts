import { Prisma, type CheckoutIntent } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Piezas compartidas del checkout: la forma pública del intent (la misma en la
 * API y en los webhooks), el encolado de entregas y los saneos de entrada.
 * Se asume contexto de tenant ya abierto.
 */

/**
 * La forma del intent que sale de la casa: API v1, webhooks y (Fase 5) la
 * página de pago. SIN datos del pagador — el comercio no los necesita para
 * conciliar y nosotros no los regalamos.
 */
export function intentPublico(i: CheckoutIntent) {
  const vencido = i.status === "PENDING" && i.expiresAt.getTime() < Date.now();
  return {
    id: i.id,
    externalRef: i.externalRef,
    amountVES: i.amountVES.toFixed(2),
    concepto: i.concepto,
    method: i.method,
    // El worker marca EXPIRED en la base; mientras tanto el estado reportado
    // ya es el real — nadie puede seguir operando un intent vencido.
    status: vencido ? ("EXPIRED" as const) : i.status,
    referencia: i.method === "C2P" ? i.c2pReferencia : null,
    overpaidVES: i.overpaidVES ? i.overpaidVES.toFixed(2) : null,
    expiresAt: i.expiresAt.toISOString(),
    confirmedAt: i.confirmedAt ? i.confirmedAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
  };
}

/**
 * Encola el aviso al comercio en TODOS sus endpoints activos. El worker
 * (Fase 4) entrega con firma y reintentos; acá solo se persiste la intención
 * — si el encolado corre después del cobro, un fallo acá no deshace nada.
 */
export async function encolarWebhooks(
  intent: CheckoutIntent,
  event: "intent.confirmed" | "intent.expired" | "intent.failed"
): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  if (endpoints.length === 0) return 0;

  const payload = JSON.stringify({ event, intent: intentPublico(intent) });
  await prisma.webhookDelivery.createMany({
    data: endpoints.map((e) => ({
      organizationId: intent.organizationId,
      endpointId: e.id,
      intentId: intent.id,
      payload,
    })),
  });
  return endpoints.length;
}

/** Enmascara una referencia para bitácora/logs: `****1234`. */
export function maskRef(ref: string): string {
  return ref.length <= 4 ? "****" : "*".repeat(ref.length - 4) + ref.slice(-4);
}

/**
 * Saneo del concepto: viaja al C2P del Tesoro, que exige ≤40 chars sin
 * acentos. Mejor recibir "Café Ñame #12" y mandar "Cafe Name 12" que dejar
 * que el banco rechace por un tilde.
 */
export function sanearConcepto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tildes/diéresis fuera (la ñ queda como n)
    .replace(/[^A-Za-z0-9 .,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/**
 * Monto del intent: acepta número o string, exige ≤2 decimales y > 0.
 * Devuelve el Decimal o null si no sirve. El monto NUNCA se redondea en
 * silencio — un monto mal formado se rechaza, no se interpreta.
 */
export function montoVES(v: unknown): Prisma.Decimal | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(s)) return null;
  const d = new Prisma.Decimal(s);
  return d.isPositive() ? d : null;
}

/** Tolerancia asimétrica del cobro: se acepta faltante de hasta max(1, 0.5%). */
export function toleranciaVES(amount: Prisma.Decimal): Prisma.Decimal {
  const medioPorciento = amount.mul("0.005");
  const uno = new Prisma.Decimal(1);
  return medioPorciento.greaterThan(uno) ? medioPorciento : uno;
}
