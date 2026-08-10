/**
 * Códigos del Gestor BDT (guía técnica v1.11) traducidos a lenguaje de caja.
 * Portado del panel interno, que los tiene probados en producción desde 2025.
 *
 * - `label`    → etiqueta corta (chips, bitácora).
 * - `severity` → color del veredicto (ok / warn / err).
 * - `headline` → frase grande para la operadora (no técnica).
 * - `hint`     → qué hacer con ese resultado.
 *
 * La autoridad del comportamiento es la guía del banco; esto solo cambia cómo
 * se muestra. Un código no listado se muestra tal cual con severity "err":
 * preferimos un código crudo antes que un veredicto inventado.
 */

export type BdtSeverity = "ok" | "warn" | "err";

export interface BdtCodeInfo {
  label: string;
  severity: BdtSeverity;
  headline: string;
  hint?: string;
}

export const BDT_CODES: Record<string, BdtCodeInfo> = {
  // Gestor de Servicios Financieros
  GES0000: {
    label: "Aprobada",
    severity: "ok",
    headline: "Pago confirmado",
    hint: "El pago existe y coincide con los datos. Puedes despachar.",
  },
  GES0014: {
    label: "Transacción no existe",
    severity: "err",
    headline: "Pago no encontrado",
    hint: "No hay un pago con esos datos. Verifica monto, referencia y banco con el cliente e intenta de nuevo.",
  },
  GES0046: {
    label: "Token actual no existe",
    severity: "err",
    headline: "Conexión con el banco caída",
    hint: "Reintenta en unos segundos. Si persiste, avisa al administrador.",
  },
  GES0075: {
    label: "Sin movimientos en el período",
    severity: "warn",
    headline: "Sin movimientos",
    hint: "No hubo movimientos en esa cuenta para la fecha indicada. Confirma la fecha del pago.",
  },
  GES0081: {
    label: "Comercio no existe",
    severity: "err",
    headline: "Comercio no válido",
    hint: "El código de comercio no existe o no está afiliado. Revisa el código en el perfil del comercio.",
  },
  GES0098: {
    label: "Identificación del pagador inválida",
    severity: "err",
    headline: "Cédula inválida",
    hint: "Revisa la cédula del pagador e intenta de nuevo.",
  },
  GES9998: {
    label: "Programa no definido en el gestor",
    severity: "err",
    headline: "Error del banco",
    hint: "El gestor rechazó la operación. Avisa al administrador.",
  },

  // Crédito inmediato BCV / SIMF
  BCV0000: {
    label: "Aprobada por BCV",
    severity: "ok",
    headline: "Pago confirmado",
    hint: "El BCV confirmó la operación. Puedes despachar.",
  },
  BCV00OK: {
    label: "Confirmada — pendiente liquidación",
    severity: "warn",
    headline: "Confirmada (pendiente)",
    hint: "El banco la confirmó pero aún no liquida. Verifica el crédito final si lo necesitas antes de despachar.",
  },
  BCVNEGA: {
    label: "Negada por BCV",
    severity: "err",
    headline: "Pago negado",
    hint: "El banco rechazó la operación. No despaches.",
  },

  // Errores propios de nuestra capa
  NETERR: {
    label: "Banco no responde",
    severity: "warn",
    headline: "El banco no responde",
    hint: "No hubo respuesta del banco. Espera unos segundos e intenta de nuevo.",
  },
  ERR0000: {
    label: "Respuesta inválida del banco",
    severity: "err",
    headline: "Respuesta inesperada",
    hint: "Reintenta. Si persiste, avisa al administrador.",
  },
};

export function describeBdt(code: string): BdtCodeInfo {
  return (
    BDT_CODES[code] ?? {
      label: code,
      severity: "err",
      headline: "Resultado no reconocido",
      hint: "Avisa al administrador y comparte el código del resultado.",
    }
  );
}
