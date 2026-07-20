/**
 * Freno de intentos de login.
 *
 * Contraparte necesaria de las contraseñas cortas (`password.ts`): una clave de
 * 5 caracteres es adivinable a fuerza bruta SOLO si el atacante puede probar
 * miles por segundo. Este freno lo impide — tras varios fallos seguidos para un
 * mismo usuario, rechaza durante un rato aunque la clave sea correcta.
 *
 * Se cuenta por USUARIO, no por IP: las cajas de un mismo local salen por la
 * misma IP (NAT), así que frenar por IP castigaría a las cajas legítimas por el
 * error de una. El objetivo no es el DoS, es el barrido de contraseñas.
 *
 * Estado en memoria del proceso, a propósito: si el proceso reinicia se limpia,
 * y no hace falta durabilidad para esto. Con un solo proceso alcanza; el día que
 * el panel escale a varios, esto se mueve a Redis (ya está en el VPS).
 */

const MAX_FALLOS = 5;
const VENTANA_MS = 10 * 60 * 1000; // los fallos “viejos” dejan de contar
const BLOQUEO_MS = 5 * 60 * 1000; // cuánto dura el freno tras alcanzar el tope

interface Registro {
  fallos: number;
  primerFallo: number;
  bloqueadoHasta: number;
}

const registros = new Map<string, Registro>();

/** ¿Está frenado este usuario ahora? Devuelve los segundos que faltan, o 0. */
export function segundosDeBloqueo(usuario: string): number {
  const r = registros.get(usuario.toLowerCase());
  if (!r || r.bloqueadoHasta <= Date.now()) return 0;
  return Math.ceil((r.bloqueadoHasta - Date.now()) / 1000);
}

/** Registra un intento fallido y aplica el freno si se pasa del tope. */
export function registrarFallo(usuario: string): void {
  const clave = usuario.toLowerCase();
  const ahora = Date.now();
  const r = registros.get(clave);

  if (!r || ahora - r.primerFallo > VENTANA_MS) {
    registros.set(clave, { fallos: 1, primerFallo: ahora, bloqueadoHasta: 0 });
    return;
  }

  r.fallos++;
  if (r.fallos >= MAX_FALLOS) {
    r.bloqueadoHasta = ahora + BLOQUEO_MS;
    r.fallos = 0; // reinicia el conteo; el freno ya está puesto
    r.primerFallo = ahora;
  }
}

/** Un login exitoso borra el historial de fallos del usuario. */
export function limpiarFallos(usuario: string): void {
  registros.delete(usuario.toLowerCase());
}
