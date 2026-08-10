/**
 * Códigos del servicio C2P «Botón de Pago» del Banco del Tesoro, mapeados a
 * mensajes en español. Portado del panel interno (`bt-c2p-codes.ts`), que los
 * transcribió del catálogo oficial de producción entregado por el banco el
 * 2026-08-03 (doc V.4.1 — el catálogo es RESTRINGIDO y no se commitea; acá
 * solo los códigos como capa de presentación).
 *
 * Alcance deliberado: familias `C2P` (el servicio), `ISO` (el tramo
 * interbancario) y `GEN` — las que pueden salir de los endpoints que usamos.
 * Las familias P2P/MQR/LGI del catálogo pertenecen a otros servicios del banco.
 *
 * Perla dev: el ambiente de desarrollo devolvía rechazos como `codres:"ERROR"`
 * literal (sin código de familia) — se mapea también por si producción lo repite.
 *
 * `hint` solo en códigos que el pagador o el comercio pueden provocar/resolver;
 * el resto cae al fallback de `describeC2p`. Esto es SOLO presentación: la
 * autoridad del veredicto es `codres === "C2P0000"`, nunca este catálogo.
 */

export type C2pSeverity = "ok" | "warn" | "err";

export interface C2pCodeInfo {
  label: string;
  severity: C2pSeverity;
  hint?: string;
}

export const C2P_CODES: Record<string, C2pCodeInfo> = {
  // ── Aprobaciones ──────────────────────────────────────────────
  C2P0000: {
    label: "Transacción aprobada",
    severity: "ok",
    hint: "El banco debitó la cuenta del pagador y abonó a la cuenta del comercio.",
  },
  ISO0000: { label: "Transacción aprobada", severity: "ok" },

  // ── Clave dinámica (lo más común en un cobro) ─────────────────
  C2P0104: {
    label: "Clave de pago inválida",
    severity: "err",
    hint: "La clave está mal escrita, vencida o ya se usó. Genera una nueva desde tu banco e intenta otra vez.",
  },
  C2P0055: {
    label: "Clave de comercio inválida",
    severity: "err",
    hint: "Intenta de nuevo. Si persiste, es un problema de la afiliación del comercio.",
  },
  ISO0055: {
    label: "Clave inválida",
    severity: "err",
    hint: "Genera una clave nueva desde tu banco e intenta otra vez.",
  },
  ISO0005: {
    label: "Tiempo excedido",
    severity: "err",
    hint: "La operación tardó demasiado (la clave pudo vencer). Genera una clave nueva e intenta otra vez.",
  },

  // ── Datos del pagador ─────────────────────────────────────────
  ISO0014: {
    label: "Teléfono no afiliado o errado",
    severity: "err",
    hint: "Verifica el celular y el banco. El número debe estar afiliado a pago móvil en ese banco.",
  },
  ISO0056: {
    label: "Teléfono y cédula no se corresponden",
    severity: "err",
    hint: "Revisa que la cédula y el celular sean los afiliados a tu pago móvil.",
  },
  ISO0080: {
    label: "Cédula o pasaporte errado",
    severity: "err",
    hint: "Revisa la cédula e intenta de nuevo.",
  },
  C2P0001: {
    label: "Documento inválido",
    severity: "err",
    hint: "El tipo de documento no es válido para este cobro. Revisa la cédula/RIF.",
  },
  ISO0013: {
    label: "Monto no permitido",
    severity: "err",
    hint: "El monto excede los límites del pagador o del servicio.",
  },
  ISO0041: { label: "Beneficiario no activo", severity: "err" },
  ISO0043: { label: "Beneficiario no activo", severity: "err" },
  ISO0062: { label: "Cuenta del beneficiario restringida", severity: "err" },
  ISO0087: { label: "Código de moneda errado", severity: "err" },

  // ── Banco del pagador / red interbancaria ─────────────────────
  ISO0091: {
    label: "Banco destino no disponible",
    severity: "warn",
    hint: "El banco del pagador no responde en este momento. Espera un momento e intenta de nuevo.",
  },
  ISO0092: {
    label: "Banco destino inválido",
    severity: "err",
    hint: "Verifica que el banco seleccionado sea el del pagador.",
  },
  ISO0058: {
    label: "Institución no operativa",
    severity: "warn",
    hint: "El banco del pagador no está operativo ahora. Intenta más tarde.",
  },
  ISO0088: {
    label: "Sin respuesta de la red interbancaria",
    severity: "warn",
    hint: "Fallo temporal de la red. Confirma que no se te debitó antes de reintentar.",
  },
  ISO0089: {
    label: "Sin respuesta de conexión",
    severity: "warn",
    hint: "Fallo temporal de conexión. Confirma que no se te debitó antes de reintentar.",
  },
  ISO0090: {
    label: "Institución no disponible",
    severity: "warn",
    hint: "Fallo temporal. Intenta de nuevo en unos minutos.",
  },
  GEN9999: {
    label: "Intente de nuevo la operación",
    severity: "warn",
    hint: "Error genérico del banco. Espera unos segundos e intenta otra vez.",
  },
  ISO0006: { label: "Error de formato", severity: "err" },
  ISO0012: { label: "Transacción inválida", severity: "err" },
  ISO0030: { label: "Error de formato", severity: "err" },

  // ── Reversos ──────────────────────────────────────────────────
  C2P0002: { label: "Transacción reversada", severity: "warn" },
  C2P0003: { label: "Transacción original no existe", severity: "err" },

  // ── Afiliación / configuración (los resuelve la plataforma) ───
  C2P0017: {
    label: "RIF no registrado en el banco",
    severity: "err",
    hint: "Problema de afiliación del comercio con el banco.",
  },
  C2P0019: {
    label: "Código de afiliado errado",
    severity: "err",
    hint: "El código de afiliado configurado no es el correcto.",
  },
  C2P0076: {
    label: "Afiliado no existe",
    severity: "err",
    hint: "Problema de afiliación del comercio con el banco.",
  },
  C2P0077: {
    label: "Afiliado inactivo",
    severity: "err",
    hint: "La afiliación del comercio está inactiva en el banco.",
  },
  C2P0070: { label: "Canal no personalizado para el afiliado", severity: "err" },
  C2P0075: { label: "Afiliado ya registrado", severity: "err" },
  C2P0078: { label: "Código de servicio inválido", severity: "err" },
  C2P0093: { label: "Afiliado con estado inactivo", severity: "err" },
  C2P0107: { label: "Código de país inválido en el teléfono", severity: "err" },
  C2P0108: { label: "Estado del afiliado inactivo", severity: "err" },
  C2P0110: {
    label: "Servicio no disponible para el afiliado",
    severity: "err",
    hint: "El servicio C2P no está habilitado para la afiliación del comercio.",
  },
  C2P0111: { label: "Estado del servicio C2P errado", severity: "err" },
  C2P0113: {
    label: "Servicio bloqueado para el afiliado",
    severity: "err",
    hint: "El banco bloqueó el servicio para la afiliación del comercio.",
  },

  // ── Sucursal / caja / lote (modelo del banco; no lo operamos) ─
  C2P0015: { label: "Clave de cajero en blanco", severity: "err" },
  C2P0016: { label: "Clave de supervisor en blanco", severity: "err" },
  C2P0018: { label: "Teléfono ya registrado", severity: "err" },
  C2P0079: { label: "Sucursal inactiva", severity: "err" },
  C2P0080: { label: "Sucursal ya existe", severity: "err" },
  C2P0081: { label: "Sucursal no existe", severity: "err" },
  C2P0085: { label: "Cajero ya existe en la sucursal", severity: "err" },
  C2P0086: { label: "Cajero no existe en la sucursal", severity: "err" },
  C2P0087: { label: "No se puede eliminar la caja (única de la sucursal)", severity: "err" },
  C2P0088: { label: "Nombre de caja sin información", severity: "err" },
  C2P0089: { label: "Cierre de lote de caja en ceros", severity: "err" },
  C2P0090: { label: "Cierre de lote en ceros", severity: "err" },
  C2P0091: { label: "Estado de caja inválido", severity: "err" },
  C2P0092: { label: "Estado de sucursal inválido", severity: "err" },
  C2P0094: { label: "No se puede eliminar la sucursal (única del afiliado)", severity: "err" },
  C2P0095: { label: "Caja inactiva para el comercio", severity: "err" },
  C2P0096: { label: "Caja abierta", severity: "err" },
  C2P0097: { label: "Caja con lote abierto", severity: "err" },
  C2P0098: { label: "Lote cerrado en la caja", severity: "err" },
  C2P0099: { label: "Lote no existe en la caja", severity: "err" },
  C2P0100: { label: "No existe la información solicitada", severity: "err" },
  C2P0101: { label: "Clave de supervisor errada", severity: "err" },
  C2P0102: { label: "Lote no existe o está cerrado", severity: "err" },
  C2P0103: { label: "Tipo de búsqueda inválido", severity: "err" },
  C2P0105: { label: "Máximo de sucursales permitido", severity: "err" },
  C2P0106: { label: "Máximo de cajas permitido", severity: "err" },
  C2P0109: { label: "Caja inactiva para el servicio", severity: "err" },
  C2P0112: { label: "Estado del servicio MQR errado", severity: "err" },
  C2P0114: { label: "Servicio no disponible para la caja", severity: "err" },
  C2P0115: { label: "Servicio bloqueado para la caja", severity: "err" },
  C2P0116: { label: "Caja cerrada", severity: "err" },
  C2P0117: { label: "Clave de caja inválida", severity: "err" },
  C2P0118: { label: "Caja con sesión abierta", severity: "err" },

  // Rechazo sin código de familia (visto en el dev del banco).
  ERROR: {
    label: "Rechazado por el banco",
    severity: "err",
    hint: "El banco no aprobó el cobro. Verifica la clave y los datos, y genera una clave nueva.",
  },
};

/**
 * Códigos que señalan un problema DE LA AFILIACIÓN del comercio (código
 * errado, afiliado inexistente/inactivo, servicio bloqueado) — no del pagador
 * ni de la red. Los resuelve la plataforma con el banco, jamás el pagador
 * reintentando: por eso alimentan la alerta de la ficha de plataforma.
 */
const REBOTES_AFILIACION = new Set([
  "C2P0017",
  "C2P0019",
  "C2P0070",
  "C2P0076",
  "C2P0077",
  "C2P0078",
  "C2P0093",
  "C2P0108",
  "C2P0110",
  "C2P0111",
  "C2P0113",
]);

export function esReboteDeAfiliacion(codres?: string): boolean {
  return Boolean(codres && REBOTES_AFILIACION.has(codres));
}

export interface C2pDescription {
  headline: string;
  hint: string;
  severity: C2pSeverity;
}

/**
 * Copy del resultado para quien paga o cobra. Código conocido → su label como
 * titular y el hint accionable; desconocido → titular genérico con el mensaje
 * crudo del banco como pista (degradación segura: nunca inventa un motivo).
 */
export function describeC2p(code?: string, bankMsg?: string): C2pDescription {
  const info = code ? C2P_CODES[code] : undefined;
  if (info) {
    return {
      headline: info.severity === "ok" ? "Pago aprobado" : info.label,
      hint:
        info.hint ??
        (info.severity === "ok"
          ? ""
          : "El banco no aprobó el cobro. Verifica los datos e intenta de nuevo."),
      severity: info.severity,
    };
  }
  return {
    headline: "Pago rechazado",
    hint:
      bankMsg ||
      "El banco no aprobó el cobro. Verifica la clave y los datos, y genera una clave nueva.",
    severity: "err",
  };
}
