/**
 * Definición de los planes — única fuente de verdad.
 *
 * Está en un módulo sin base de datos a propósito: lo lee la portada pública
 * (para mostrar precios) y `limites.ts` (para aplicar topes). Si estuviera
 * duplicado, tarde o temprano la web anunciaría un límite y el sistema
 * aplicaría otro, y el que queda mal parado es el vendedor.
 *
 * Modelo: el plan con piso incluido es el negocio; el precio por transacción
 * existe SOLO como excedente. Ver el razonamiento completo en el plan del
 * proyecto (`moonlit-pondering-parasol.md`, sección "Modelo de cobro").
 *
 * REGLA DE TARIFAS: `excedente` debe ser MAYOR que `precioUsd / cobrosIncluidos`.
 * Si costara menos, nadie subiría de plan y todos se quedarían abajo pagando
 * exceso. Hay una prueba que lo verifica: `scripts/test-planes.ts`.
 */

export const INFINITO = Number.POSITIVE_INFINITY;

export interface DefinicionPlan {
  clave: "PRUEBA" | "COMERCIO" | "CADENA";
  nombre: string;
  precioUsd: number;
  cobrosIncluidos: number;
  cajas: number;
  sucursales: number;
  /** USD por cobro pasado el piso. */
  excedente: number;
  /** Para quién es, en la web. */
  paraQuien: string;
  incluye: string[];
}

export const PLANES: DefinicionPlan[] = [
  {
    clave: "PRUEBA",
    nombre: "Prueba",
    precioUsd: 0,
    cobrosIncluidos: 200,
    cajas: 2,
    sucursales: 1,
    excedente: 0,
    paraQuien: "Para probarlo con tu operación real, no con datos de mentira.",
    incluye: [
      "200 cobros al mes",
      "2 cajas, 1 sucursal",
      "Validación contra tu banco",
      "Turnos y cierre",
    ],
  },
  {
    clave: "COMERCIO",
    nombre: "Comercio",
    precioUsd: 29,
    cobrosIncluidos: 2_000,
    cajas: 8,
    sucursales: 3,
    excedente: 0.02,
    paraQuien: "Lo que necesita un comercio con mostrador y varias cajas.",
    incluye: [
      "2.000 cobros al mes",
      "Hasta 8 cajas y 3 sucursales",
      "Alarma de doble cobro",
      "Cierres por caja y por turno",
      "Soporte por WhatsApp",
    ],
  },
  {
    clave: "CADENA",
    nombre: "Cadena",
    precioUsd: 99,
    cobrosIncluidos: 10_000,
    cajas: INFINITO,
    sucursales: INFINITO,
    excedente: 0.015,
    paraQuien: "Varias sucursales, muchas cajas y un dueño que quiere ver todo junto.",
    incluye: [
      "10.000 cobros al mes",
      "Cajas y sucursales sin límite",
      "Reportes consolidados",
      "Te tramitamos la afiliación ante el banco",
      "Soporte prioritario",
    ],
  },
];

export function planPorClave(clave: string): DefinicionPlan {
  return PLANES.find((p) => p.clave === clave) ?? PLANES[0];
}

/** Tarifa efectiva por cobro dentro del piso incluido. */
export function tarifaEfectiva(p: DefinicionPlan): number {
  return p.precioUsd === 0 ? 0 : p.precioUsd / p.cobrosIncluidos;
}
