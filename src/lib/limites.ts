import { prisma } from "./prisma";

/**
 * Límites por comercio — el lugar donde va a enchufarse el plan.
 *
 * Hoy NO hay planes ni cobro: todo devuelve "permitido". Pero toda creación de
 * caja o de sucursal pasa por acá, así que el día que exista un plan se cambia
 * este archivo y nada más. Si el conteo quedara disperso en cada pantalla,
 * habría que perseguirlo por todo el código y algún camino se olvidaría — que
 * es exactamente como se cuelan los clientes que usan más de lo que pagan.
 *
 * Cuando llegue el momento, `Organization` gana un campo de plan y esta función
 * lee sus topes. La firma no cambia.
 */

export interface Veredicto {
  permitido: boolean;
  motivo?: string;
}

const SIN_LIMITE = Number.POSITIVE_INFINITY;

/** Topes vigentes del comercio. Sin planes todavía: todo ilimitado. */
function topes() {
  return { cajas: SIN_LIMITE, sucursales: SIN_LIMITE };
}

/** ¿Puede el comercio crear otra caja? Se asume contexto de tenant abierto. */
export async function puedeCrearCaja(): Promise<Veredicto> {
  const tope = topes().cajas;
  if (tope === SIN_LIMITE) return { permitido: true };

  const usadas = await prisma.user.count({ where: { role: "OPERATOR" } });
  return usadas < tope
    ? { permitido: true }
    : { permitido: false, motivo: `Tu plan permite ${tope} caja(s). Escríbenos para ampliarlo.` };
}

/** ¿Puede el comercio crear otra sucursal? Se asume contexto de tenant abierto. */
export async function puedeCrearSucursal(): Promise<Veredicto> {
  const tope = topes().sucursales;
  if (tope === SIN_LIMITE) return { permitido: true };

  const usadas = await prisma.branch.count({ where: { isActive: true } });
  return usadas < tope
    ? { permitido: true }
    : { permitido: false, motivo: `Tu plan permite ${tope} sucursal(es). Escríbenos para ampliarlo.` };
}
