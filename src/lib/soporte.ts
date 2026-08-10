/**
 * El canal de soporte, en UN solo lugar. Los «escríbenos» del panel apuntaban
 * al vacío — en este mercado el soporte visible ES parte del producto (la
 * competencia lo vende como "atención 24/7").
 *
 * `SOPORTE_WHATSAPP` es opcional a propósito: aún no existe el número. El día
 * que exista, se agrega al .env (formato internacional sin +, ej. 584121234567)
 * y aparece solo en toda la interfaz, sin tocar código.
 */

export const SOPORTE_EMAIL = process.env.SOPORTE_EMAIL ?? "info@armorpay.net";

/** Número WhatsApp en formato wa.me (sin +), o null si todavía no hay. */
export const SOPORTE_WHATSAPP = process.env.SOPORTE_WHATSAPP?.replace(/\D/g, "") || null;

export const SOPORTE_WHATSAPP_URL = SOPORTE_WHATSAPP ? `https://wa.me/${SOPORTE_WHATSAPP}` : null;
