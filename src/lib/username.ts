import { z } from "zod";

/**
 * Identificador de login. Minúsculas, números y guiones; sin guión al inicio ni
 * al final. Mismo contrato que el proyecto viejo, para que las cajas que migren
 * conserven su usuario tal cual.
 */
export const usernameSchema = z
  .string()
  .min(3, "El usuario debe tener al menos 3 caracteres")
  .max(30, "El usuario no puede superar 30 caracteres")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Solo minúsculas, números y guiones; no puede empezar ni terminar con guión"
  );

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
