import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * Correo transaccional por el SMTP local de cPanel (info@armorpay.net:465).
 *
 * Dos reglas que no se negocian:
 *
 * 1. **Enviar jamás bloquea ni rompe el flujo que lo dispara.** Un registro,
 *    una aprobación o una solicitud valen más que su notificación: todo envío
 *    se hace con `void enviarCorreo(...)` DESPUÉS de que la escritura en base
 *    quedó confirmada, y cualquier fallo se loguea y se traga.
 *
 * 2. **Deliverability es DNS, no código.** El dominio necesita SPF + DKIM
 *    publicados (el DNS vive en Contabo, no acá); sin eso Gmail rechaza con
 *    550-5.7.26 — la misma lección del gateway (`gateway/index.ts`). El buzón
 *    local siempre recibe, así que los avisos internos a MAIL_INTERNO
 *    funcionan aunque el DNS esté a medias.
 *
 * Sin SMTP_PASS en el entorno el módulo queda apagado: avisa una vez por
 * consola y omite los envíos, para que un entorno de desarrollo no truene.
 */

const HOST = process.env.SMTP_HOST ?? "mail.armorpay.net";
const PORT = Number(process.env.SMTP_PORT ?? 465);
const USER = process.env.SMTP_USER ?? "info@armorpay.net";
const PASS = process.env.SMTP_PASS ?? "";
const FROM = process.env.MAIL_FROM ?? "ArmorPay <info@armorpay.net>";

/** Buzón nuestro para avisos operativos (leads, registros nuevos). */
export const CORREO_INTERNO = process.env.MAIL_INTERNO ?? "info@armorpay.net";

/** Base para los enlaces de los correos (sin barra final). */
export const URL_APP = (process.env.NEXTAUTH_URL ?? "https://armorpay.net").replace(/\/+$/, "");

let transporter: Transporter | null = null;
let avisoApagado = false;

function transporte(): Transporter | null {
  if (!PASS) {
    if (!avisoApagado) {
      console.warn("correo: sin SMTP_PASS en el entorno — los envíos se omiten.");
      avisoApagado = true;
    }
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: USER, pass: PASS },
    });
  }
  return transporter;
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Correo = {
  para: string | string[];
  asunto: string;
  /** Encabezado grande dentro del correo. */
  titulo: string;
  /** Párrafos en texto plano; el HTML se arma escapando acá. */
  parrafos: string[];
  /** Botón opcional al final. */
  boton?: { texto: string; url: string };
};

function armarHtml(c: Correo): string {
  const cuerpo = c.parrafos
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6;color:#3f3f46;">${escapar(p)}</p>`)
    .join("");
  const boton = c.boton
    ? `<p style="margin:24px 0 8px;"><a href="${escapar(c.boton.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;">${escapar(c.boton.texto)}</a></p>`
    : "";
  return `<div style="background:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 20px;font-size:15px;font-weight:700;letter-spacing:0.02em;color:#1d4ed8;">ArmorPay</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#18181b;">${escapar(c.titulo)}</h1>
    ${cuerpo}${boton}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#a1a1aa;text-align:center;">ArmorPay — plataforma de validación de pagos · armorpay.net</p>
</div>`;
}

/**
 * Envía un correo. Nunca lanza: el error queda en el log del proceso.
 * Usar siempre como `void enviarCorreo(...)`, después del commit en base.
 */
export async function enviarCorreo(c: Correo): Promise<void> {
  const t = transporte();
  if (!t) return;
  try {
    const texto = [c.titulo, "", ...c.parrafos, ...(c.boton ? ["", `${c.boton.texto}: ${c.boton.url}`] : [])].join("\n");
    await t.sendMail({
      from: FROM,
      to: c.para,
      subject: c.asunto,
      text: texto,
      html: armarHtml(c),
    });
  } catch (e) {
    console.error(`correo: fallo enviando "${c.asunto}" a ${c.para}: ${(e as Error).message}`);
  }
}
