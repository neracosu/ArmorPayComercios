import { randomInt } from "node:crypto";

/**
 * Contraseña inicial de una caja: corta y fácil de dictar.
 *
 * Las cajas son PCs fijas donde alguien teclea la clave una vez y la sesión
 * dura 30 días. Una clave larga con mayúsculas y símbolos se copia mal y
 * termina anotada en un papel pegado al monitor — peor que una corta.
 *
 * Alfabeto SIN los caracteres que se confunden al leer o dictar: nada de
 * 0/O/o, 1/l/i, ni mayúsculas (para no depender de Shift). Quedan 31 símbolos.
 *
 * OJO: 5 caracteres es corto a propósito, por pedido de operación. Lo que
 * sostiene la seguridad no es la longitud sino el freno de intentos del login
 * (`login-throttle.ts`): sin ese freno, una clave de 5 sería adivinable a
 * fuerza bruta. Los dos van juntos; no bajar la longitud sin el freno puesto.
 */
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789"; // sin i, l, o, 0, 1
const LARGO_DEFECTO = 5;

export function generarPassword(largo = LARGO_DEFECTO): string {
  let salida = "";
  for (let i = 0; i < largo; i++) {
    // randomInt es uniforme: no tiene el sesgo de módulo de randomBytes % n.
    salida += ALFABETO[randomInt(ALFABETO.length)];
  }
  return salida;
}
