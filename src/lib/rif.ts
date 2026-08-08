/**
 * Validación local del RIF venezolano.
 *
 * No existe una API pública del SENIAT para consultar un RIF (el endpoint
 * extraoficial murió en 2023 tras el captcha, y los .gob.ve no responden a
 * IPs fuera de Venezuela — verificado 2026-08-08 desde este servidor). Lo que
 * SÍ se puede verificar offline es el dígito de control que el propio SENIAT
 * calcula al emitirlo (módulo 11), y eso atrapa el error que de verdad ocurre
 * en un formulario: el tipeo. La razón social la escribe el comercio y la
 * contrasta la revisora contra el certificado de RIF que sube como recaudo.
 *
 * La forma canónica que guardamos es letra + 9 dígitos, sin separadores:
 * `J075370343`. Si faltan ceros a la izquierda (la gente los omite al copiar
 * de facturas viejas) se rellenan antes de verificar: J-95036-9 y
 * J-00095036-9 son el mismo contribuyente y deben chocar con el mismo UNIQUE.
 */

/** Peso de la letra inicial en la suma de control, según el SENIAT. */
const VALOR_LETRA: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5 };

/** Pesos de los 8 dígitos del cuerpo, en orden. */
const PESOS = [3, 2, 7, 6, 5, 4, 3, 2];

export type ResultadoRif =
  | { ok: true; rif: string }
  | { ok: false; error: string };

/** Mayúsculas y sin separadores: lo único que se guarda o compara. */
export function normalizarRif(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** `J075370343` → `J-07537034-3`, para mostrar. Devuelve tal cual si no es canónico. */
export function formatearRif(rif: string): string {
  const limpio = normalizarRif(rif);
  if (!/^[A-Z]\d{9}$/.test(limpio)) return rif;
  return `${limpio[0]}-${limpio.slice(1, 9)}-${limpio[9]}`;
}

/** Dígito de control módulo 11 sobre letra + cuerpo de 8 dígitos. */
function digitoControl(letra: string, cuerpo: string): number {
  let suma = VALOR_LETRA[letra] * 4;
  for (let i = 0; i < 8; i++) suma += Number(cuerpo[i]) * PESOS[i];
  const digito = 11 - (suma % 11);
  return digito > 9 ? 0 : digito;
}

/**
 * Valida sintaxis y dígito de control; devuelve la forma canónica.
 *
 * NO impone la política de "solo personas jurídicas" (J/G): esa decisión es
 * de cada formulario, con su propio mensaje. Acá solo se responde si el RIF
 * puede existir tal como el SENIAT lo emite.
 */
export function validarRif(texto: string): ResultadoRif {
  const limpio = normalizarRif(texto);

  const forma = /^([A-Z])(\d{6,9})$/.exec(limpio);
  if (!forma) {
    return {
      ok: false,
      error: "El RIF es una letra seguida de 9 números, como J-12345678-9.",
    };
  }

  const [, letra, numeros] = forma;
  if (!(letra in VALOR_LETRA)) {
    return { ok: false, error: "El RIF empieza con J, G, V, E o P." };
  }

  const completo = numeros.padStart(9, "0");
  const cuerpo = completo.slice(0, 8);
  const verificador = Number(completo[8]);

  if (digitoControl(letra, cuerpo) !== verificador) {
    return {
      ok: false,
      error: `El RIF ${formatearRif(letra + completo)} no cuadra con su dígito de control — revisa que esté bien copiado del certificado.`,
    };
  }

  return { ok: true, rif: letra + completo };
}

/** Política de los formularios públicos: solo personas jurídicas. */
export function esRifJuridico(rifCanonico: string): boolean {
  return /^[JG]/.test(rifCanonico);
}
