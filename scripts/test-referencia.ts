/**
 * test-referencia.ts — emparejamiento de referencias bancarias.
 *
 * Segunda excepción a la convención de "sin tests" del stack, por la misma
 * razón que `test-isolation.ts`: acá se decide si un pago que YA entró al
 * banco se reconoce o no. Cuando esto falla no se rompe una pantalla — se
 * pierde una venta con el dinero ya transferido, y el comprador ve
 * "no encontramos ese pago" mientras su banco le dice que sí pagó.
 *
 * Los casos salen del incidente del 2026-08-17: un comprador de VIP Play
 * tecleó 12 dígitos contra una referencia de 9 y se comió 12 rechazos
 * seguidos antes de acertar por casualidad.
 *
 * Uso:  npx tsx --env-file=.env scripts/test-referencia.ts
 * Solo lectura: no escribe nada.
 */
import { prisma } from "../src/lib/prisma";
import { runAsPlatform } from "../src/lib/tenant-context";
import {
  mismaReferencia,
  soloDigitos,
  sufijoBusqueda,
  tecleoDeMas,
} from "../src/lib/referencia";

let pass = 0;
let fail = 0;

function check(nombre: string, real: boolean, esperado = true) {
  if (real === esperado) {
    pass++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fail++;
    console.log(`  ✗ ${nombre} → ${real}, esperado ${esperado}`);
  }
}

console.log("\nCASOS DEL INCIDENTE 2026-08-17");
const guardada = "004911412"; // tal cual la mandó el BT
check("los 9 dígitos exactos", mismaReferencia(guardada, "004911412"));
check("los últimos 6 (lo que ya funcionaba)", mismaReferencia(guardada, "911412"));
check("12 dígitos con ceros adelante — EL BUG", mismaReferencia(guardada, "000004911412"));
check("10 dígitos, un cero de más", mismaReferencia(guardada, "0004911412"));
check("copiada con espacios del comprobante", mismaReferencia(guardada, "0049 11412"));
check("copiada con guiones", mismaReferencia(guardada, "004-911-412"));
check("prueba de humo del Hotel (10 vs 9)", mismaReferencia("607058607", "0607058607"));

console.log("\nLO QUE NO SE PUEDE AFLOJAR");
check("referencia de otro pago", mismaReferencia(guardada, "999999"), false);
check("mismo final, distinto medio", mismaReferencia(guardada, "777911412".slice(0, 3) + "111412"), false);
check("menos de 6 dígitos (piso antifraude)", mismaReferencia(guardada, "11412"), false);
check("cadena vacía", mismaReferencia(guardada, ""), false);
check("prefijo en vez de sufijo", mismaReferencia(guardada, "004911"), false);
check("solo letras", mismaReferencia(guardada, "abcdef"), false);

console.log("\nAUXILIARES");
check("el prefiltro SQL usa los últimos 6", sufijoBusqueda("000004911412") === "911412");
check("limpia separadores", soloDigitos("0049-11 412") === "004911412");
check("detecta que tecleó de más", tecleoDeMas([guardada], "000004911412"));
check("no marca de más si el largo empata", tecleoDeMas([guardada], guardada), false);

async function contraProduccion() {
  console.log("\nCONTRA LAS REFERENCIAS REALES DE LA BASE");
  const txs = await runAsPlatform("test: emparejamiento de referencias", () =>
    prisma.bankTransaction.findMany({ select: { referencia: true } })
  );
  if (txs.length === 0) {
    console.log("  (sin transacciones en base — se omite)");
    return;
  }
  const largos = [...new Set(txs.map((t) => t.referencia.length))].join(", ");
  console.log(`  ${txs.length} referencias, largos: ${largos}`);

  for (const t of txs) {
    // Como la ve el pagador en su banco: la misma, con ceros por delante.
    const comoLaVeElPagador = "000" + t.referencia;
    const conMismoFinal = await runAsPlatform("test: buscar por sufijo", () =>
      prisma.bankTransaction.findMany({
        where: { tipo: "CREDITO", referencia: { endsWith: sufijoBusqueda(comoLaVeElPagador) } },
        select: { referencia: true },
        take: 50,
      })
    );
    const empatan = conMismoFinal.filter((e) => mismaReferencia(e.referencia, comoLaVeElPagador));
    check(
      `${t.referencia} tecleada como ${comoLaVeElPagador}`,
      empatan.length === 1 && empatan[0].referencia === t.referencia
    );
  }
}

contraProduccion()
  .then(() => {
    console.log(`\n${pass} OK, ${fail} fallos\n`);
    return prisma.$disconnect();
  })
  .then(() => process.exit(fail === 0 ? 0 : 1));
