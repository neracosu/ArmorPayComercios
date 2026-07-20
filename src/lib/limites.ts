import { prisma } from "./prisma";
import { planPorClave, INFINITO, type DefinicionPlan } from "./planes";

/**
 * Planes y consumo — decisión de cobro del 2026-07-20.
 *
 * MODELO HÍBRIDO: el plan con piso incluido es el negocio; el precio por
 * transacción existe SOLO como excedente. Cobrar únicamente por transacción a
 * precio de mercado ($0,0085 de MovilPay) exigiría ~940.000 cobros al mes para
 * llegar a la meta de ingresos — unos 300 comercios. Con planes, son 80.
 *
 * REGLA DURA: pasarse del límite **NUNCA bloquea una validación**. Si una caja
 * llega al tope un sábado a las 8pm, va a entregar la mercancía sin validar. El
 * cobro no puede desincentivar la acción que evita el fraude. Se avisa, se
 * factura el excedente y se sugiere subir de plan. Por eso acá no hay ninguna
 * función que devuelva "prohibido" para un cobro — solo para altas de
 * estructura (cajas, sucursales), donde esperar sí es aceptable.
 *
 * UNIDAD MEDIDA: el **cobro confirmado**, no la búsqueda. Una búsqueda se
 * repite cuando el banco tarda, y eso es culpa nuestra y del banco. Los
 * duplicados marcados para revisión NO se facturan: sería cobrar dos veces por
 * el mismo pago, justo lo que el producto evita.
 *
 * REGLA DE TARIFAS: el excedente cuesta MÁS por unidad que la tarifa efectiva
 * del plan. Si costara menos, nadie subiría de plan y todos se quedarían abajo
 * pagando exceso.
 */

export interface Veredicto {
  permitido: boolean;
  motivo?: string;
}

async function planDe(organizationId: string): Promise<DefinicionPlan> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });
  return planPorClave(org?.plan ?? "PRUEBA");
}

/**
 * ¿Puede el comercio crear otra caja?
 *
 * Acá sí se puede decir que no: dar de alta una caja es una tarea de
 * administración, no una operación con un cliente esperando enfrente.
 */
export async function puedeCrearCaja(organizationId: string): Promise<Veredicto> {
  const plan = await planDe(organizationId);
  if (plan.cajas === INFINITO) return { permitido: true };

  const usadas = await prisma.user.count({ where: { role: "OPERATOR" } });
  return usadas < plan.cajas
    ? { permitido: true }
    : {
        permitido: false,
        motivo: `Tu plan ${plan.nombre} incluye ${plan.cajas} cajas. Escríbenos para ampliarlo.`,
      };
}

/** ¿Puede el comercio crear otra sucursal? Mismo criterio que las cajas. */
export async function puedeCrearSucursal(organizationId: string): Promise<Veredicto> {
  const plan = await planDe(organizationId);
  if (plan.sucursales === INFINITO) return { permitido: true };

  const usadas = await prisma.branch.count({ where: { isActive: true } });
  return usadas < plan.sucursales
    ? { permitido: true }
    : {
        permitido: false,
        motivo: `Tu plan ${plan.nombre} incluye ${plan.sucursales} sucursal(es). Escríbenos para ampliarlo.`,
      };
}

export interface ConsumoDelMes {
  plan: DefinicionPlan;
  cobros: number;
  incluidos: number;
  excedidos: number;
  /** USD a facturar por el excedente. Cero mientras no se pase. */
  cargoExcedente: number;
  /** Porcentaje del piso consumido, para avisar ANTES de que se pase. */
  porcentaje: number;
}

/**
 * Consumo del mes en curso. Informativo: nunca frena una operación.
 *
 * Se cuenta desde el día 1 del mes, en hora de Venezuela.
 */
export async function consumoDelMes(organizationId: string): Promise<ConsumoDelMes> {
  const plan = await planDe(organizationId);

  const ahoraVe = new Date(Date.now() - 4 * 3600_000);
  const inicioMes = new Date(Date.UTC(ahoraVe.getUTCFullYear(), ahoraVe.getUTCMonth(), 1));
  const desde = new Date(inicioMes.getTime() + 4 * 3600_000);

  const cobros = await prisma.paymentClaim.count({
    // Los duplicados no se facturan: no son ventas distintas.
    where: { isDuplicate: false, claimedAt: { gte: desde } },
  });

  const excedidos = Math.max(0, cobros - plan.cobrosIncluidos);
  return {
    plan,
    cobros,
    incluidos: plan.cobrosIncluidos,
    excedidos,
    cargoExcedente: Number((excedidos * plan.excedente).toFixed(2)),
    porcentaje: Math.round((cobros / plan.cobrosIncluidos) * 100),
  };
}
