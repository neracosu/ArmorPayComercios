import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de secretos en reposo — AES-256-GCM.
 *
 * Formato: base64( iv(12) || tag(16) || ciphertext ). GCM es cifrado
 * autenticado: si alguien altera el dato en la base, el descifrado falla en vez
 * de devolver basura silenciosamente.
 *
 * `APP_SECRET` vive en el `.env`, fuera de la base. Si se pierde, NINGUNA Llave
 * de Trabajo se puede recuperar — y si se restaura un respaldo en otro
 * servidor, hay que llevar el mismo secreto.
 */

function clave(): Buffer {
  const hex = process.env.APP_SECRET;
  if (!hex || hex.length !== 64) {
    throw new Error("APP_SECRET ausente o no tiene 64 caracteres hexadecimales");
  }
  return Buffer.from(hex, "hex");
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12); // nunca reusar (clave, iv) en GCM
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function descifrar(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const d = createDecipheriv("aes-256-gcm", clave(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

/**
 * Pista para mostrar en pantalla: `DDF…755`.
 *
 * Se guarda al grabar para no tener que descifrar la llave cada vez que se
 * pinta la ficha. Con 32 caracteres hexadecimales, mostrar 6 no compromete
 * nada y le alcanza al comercio para reconocer la que le dio el banco.
 */
export function pistaDeLlave(llave: string): string {
  if (llave.length <= 8) return "•".repeat(llave.length);
  return `${llave.slice(0, 3)}…${llave.slice(-3)}`;
}
