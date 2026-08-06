import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * La tasa BCV — fuente ÚNICA de conversión USD→VES del checkout (Fase 6).
 *
 * Diseño heredado de las pasarelas del grupo (guías 1 §7.2 y 3 §5):
 * - Dos fuentes públicas en cascada; cada lectura exitosa se PERSISTE — el
 *   historial es la auditoría de qué tasa se usó, y la fila más nueva es el
 *   caché (TTL 30 min: la tasa BCV cambia una vez al día hábil).
 * - Si ambas fuentes fallan, vale la última conocida hasta 24 h.
 * - Sin nada utilizable: ERROR EXPLÍCITO. Jamás una tasa hardcodeada, jamás
 *   una tasa vieja en silencio — cobrar con una tasa inventada es peor que
 *   no cobrar.
 *
 * `ExchangeRate` es modelo de plataforma (sin organizationId): funciona igual
 * dentro o fuera de un contexto de tenant.
 */

const TTL_FRESCA_MS = 30 * 60_000;
const TTL_ULTIMA_CONOCIDA_MS = 24 * 3600_000;
/** Cordura: fuera de este rango, la fuente devolvió basura y se descarta. */
const RATE_MIN = 1;
const RATE_MAX = 100_000_000;

export class TasaNoDisponible extends Error {
  constructor() {
    super("No hay tasa BCV utilizable: las fuentes no responden y no hay una reciente guardada.");
  }
}

export interface TasaBcv {
  id: string;
  rate: Prisma.Decimal;
  fetchedAt: Date;
  source: string;
}

interface Fuente {
  nombre: string;
  url: string;
  extraer: (json: unknown) => number | undefined;
}

const FUENTES: Fuente[] = [
  {
    nombre: "dolarapi",
    url: "https://ve.dolarapi.com/v1/dolares/oficial",
    extraer: (j) => (j as { promedio?: number }).promedio,
  },
  {
    nombre: "pydolarve",
    url: "https://pydolarve.org/api/v1/dollar?monitor=bcv",
    extraer: (j) => (j as { price?: number }).price,
  },
];

async function leerFuentes(): Promise<{ rate: number; source: string } | null> {
  for (const f of FUENTES) {
    try {
      const res = await fetch(f.url, {
        signal: AbortSignal.timeout(8_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const valor = f.extraer(await res.json());
      if (typeof valor === "number" && Number.isFinite(valor) && valor > RATE_MIN && valor < RATE_MAX) {
        return { rate: valor, source: f.nombre };
      }
    } catch {
      // La siguiente fuente decide; el error de red no es noticia.
    }
  }
  return null;
}

/**
 * La tasa vigente. Lanza `TasaNoDisponible` si no hay nada utilizable —
 * el que llama decide si eso frena (crear un intent en USD: sí) o si sigue
 * por otro camino (candidatos de validación: valida solo con la congelada).
 */
export async function tasaBcv(): Promise<TasaBcv> {
  const ultima = await prisma.exchangeRate.findFirst({ orderBy: { fetchedAt: "desc" } });

  if (ultima && Date.now() - ultima.fetchedAt.getTime() < TTL_FRESCA_MS) {
    return ultima;
  }

  const leida = await leerFuentes();
  if (leida) {
    return prisma.exchangeRate.create({
      data: { rate: new Prisma.Decimal(leida.rate.toFixed(4)), source: leida.source },
    });
  }

  // Fuentes caídas: la última conocida sirve un día — con su fecha a cuestas,
  // que el registro del intent diga la verdad de qué tasa se usó.
  if (ultima && Date.now() - ultima.fetchedAt.getTime() < TTL_ULTIMA_CONOCIDA_MS) {
    return ultima;
  }

  throw new TasaNoDisponible();
}

/** USD → VES con la tasa dada, redondeado a 2 (regla bancaria de céntimos). */
export function usdAVes(usd: Prisma.Decimal, rate: Prisma.Decimal): Prisma.Decimal {
  return usd.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
