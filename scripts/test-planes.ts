/**
 * test-planes.ts — coherencia del tarifario.
 *
 * El excedente TIENE que costar más por unidad que la tarifa efectiva del plan.
 * Si costara menos, a nadie le convendría subir de plan: se quedarían todos en
 * el más barato pagando exceso, y el modelo de ingresos se rompe en silencio.
 *
 * Se corre cada vez que se toca un precio:
 *   npx tsx scripts/test-planes.ts
 */
import { PLANES, tarifaEfectiva, INFINITO } from "../src/lib/planes";

const MOVILPAY_POR_TX = 0.0085; // referencia de mercado, julio 2026

let fallas = 0;

console.log("\nplan        precio  incluidos  tarifa efectiva  excedente   lo mismo con MovilPay");
for (const p of PLANES) {
  const efectiva = tarifaEfectiva(p);
  console.log(
    p.nombre.padEnd(10),
    `$${p.precioUsd}`.padStart(7),
    String(p.cobrosIncluidos).padStart(10),
    `$${efectiva.toFixed(4)}`.padStart(16),
    `$${p.excedente.toFixed(3)}`.padStart(10),
    `$${(p.cobrosIncluidos * MOVILPAY_POR_TX).toFixed(2)}`.padStart(22)
  );
}

console.log("\nEl excedente debe costar MÁS que la tarifa incluida:");
for (const p of PLANES) {
  if (p.precioUsd === 0) continue;
  const ok = p.excedente > tarifaEfectiva(p);
  if (!ok) fallas++;
  console.log(`  ${ok ? "✓" : "✗"} ${p.nombre}`);
}

console.log("\nSubir de plan tiene que convenir antes de duplicar el piso:");
for (let i = 0; i < PLANES.length - 1; i++) {
  const actual = PLANES[i];
  const siguiente = PLANES[i + 1];
  if (actual.precioUsd === 0) continue;
  // Volumen en el que quedarse pagando excedente cuesta lo mismo que subir.
  const puntoDeQuiebre =
    actual.cobrosIncluidos + (siguiente.precioUsd - actual.precioUsd) / actual.excedente;
  const ok = puntoDeQuiebre < siguiente.cobrosIncluidos;
  if (!ok) fallas++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${actual.nombre} → ${siguiente.nombre}: conviene subir a partir de ` +
      `${Math.round(puntoDeQuiebre)} cobros (el plan de arriba incluye ${siguiente.cobrosIncluidos})`
  );
}

console.log("\nTopes de estructura:");
for (const p of PLANES) {
  console.log(
    `  ${p.nombre.padEnd(10)} ${p.cajas === INFINITO ? "sin límite" : `${p.cajas} cajas`}, ` +
      `${p.sucursales === INFINITO ? "sin límite" : `${p.sucursales} sucursal(es)`}`
  );
}

console.log(fallas === 0 ? "\nTarifario coherente.\n" : `\n${fallas} problema(s).\n`);
process.exit(fallas === 0 ? 0 : 1);
