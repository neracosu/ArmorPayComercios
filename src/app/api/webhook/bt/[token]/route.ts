import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runAsPlatform, runWithTenant } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

/**
 * Webhook entrante del Banco del Tesoro — "Identificador de Pagos" v1.0.
 *
 * Es el receptor PROPIO del SaaS: los comercios registrados acá reciben sus
 * notificaciones BT directo en armorpay.net, sin pasar por el validador
 * interno ni por el gateway (esa vía queda para Armor Market y las cuentas
 * que viven allá). Portado del receptor del interno, probado en producción
 * desde 2026-07-31.
 *
 * PROTOCOLO BT (INVERTIDO respecto del BDT — no "corregir" al patrón BDT):
 *   - 200 → notificación nueva recibida. El banco la marca "enviada".
 *   - 400 → la operación YA existía (duplicado). El banco TAMBIÉN la marca
 *     "enviada" y no la reenvía.
 *   - cualquier otro código → el banco reintenta hasta obtener 200/400, y el
 *     pago queda listado en /consulta/noEnviadas (recuperable).
 *
 * Por eso un payload inválido responde 5xx y NUNCA 400: un 400 lo marcaría
 * "enviada" y perderíamos el pago en silencio. Con 5xx el banco reintenta y,
 * si el problema es nuestro, al corregirlo el pago entra solo.
 *
 * La cuenta destino NO viene en el payload (el scope del webhook es la
 * afiliación/codSocio): el token del PATH es el discriminador — cada cuenta
 * BT lleva su `webhookToken` y su URL registrada en el banco. El token es de
 * 256 bits y se resuelve por índice único; no hay comparación de secreto de
 * longitud variable que proteger en tiempo constante.
 *
 * Entrada SIN sesión: el contexto de tenant se abre a mano y de forma
 * explícita, igual que la ingesta del gateway — `runAsPlatform` solo para
 * resolver el token a su cuenta, `runWithTenant` para escribir ya acotado.
 */

// Campos de texto tolerantes: el banco (stack Java) puede mandar `null` explícito
// en vez de omitir. `.nullish()` acepta ausente Y null; normalizamos a "".
const optText = z
  .string()
  .nullish()
  .transform((v) => v ?? "");

const payloadSchema = z.object({
  payment_type: optText, // "P2C" hoy
  reference: z.string().min(1), // completa, preserva ceros a la izquierda
  source_bank: z.string().min(1), // código 4 dígitos del banco pagador
  // La doc dice NÚMERO JSON (90.00); aceptamos número o string numérica (con
  // coma o punto) y VALIDAMOS en vez de coercer: fuera de rango o con >2
  // decimales → falla (5xx → reintento/noEnviadas) en vez de guardar un monto
  // distorsionado.
  amount: z.union([z.number(), z.string()]).transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n >= 1e13) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount fuera de rango" });
      return z.NEVER;
    }
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount con más de 2 decimales" });
      return z.NEVER;
    }
    return n;
  }),
  source_phone: optText,
  // Acepta separador espacio O 'T' (ISO) entre fecha y hora.
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/),
  document: optText,
  source_account: optText,
  description: optText,
});

/** Enmascara una referencia de pago para logs (regla de masking del proyecto). */
function maskRef(ref: string): string {
  return ref.length <= 4 ? "****" : "*".repeat(ref.length - 4) + ref.slice(-4);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cuenta = await runAsPlatform("webhook BT: resolver token a su cuenta", () =>
    prisma.bankAccount.findFirst({
      where: { webhookToken: token, banco: "BT" },
      select: { accountNumber: true, organizationId: true, isActive: true },
    })
  );
  if (!cuenta) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Cuenta desactivada (aprobación pendiente o retirada): 503 → el banco
  // reintenta y el pago queda recuperable en /noEnviadas hasta corregirla.
  // Nunca 200 con un pago que ninguna caja vería.
  if (!cuenta.isActive) {
    return NextResponse.json(
      { error: "webhook_account_not_available" },
      { status: 503 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    // 500 (NO 400: en protocolo BT el 400 marca "enviada" y perdería el pago).
    // Log sin datos sensibles (nunca phone/document completos).
    const ref =
      json && typeof json === "object" && "reference" in json
        ? maskRef(String((json as Record<string, unknown>).reference))
        : "?";
    console.error(
      `[webhook/bt] payload inválido (ref ${ref}):`,
      JSON.stringify(parsed.error.issues)
    );
    return NextResponse.json({ error: "invalid_payload" }, { status: 500 });
  }
  const p = parsed.data;

  try {
    await runWithTenant(cuenta.organizationId, () =>
      prisma.bankTransaction.create({
        data: {
          // TypeScript lo exige aunque la extensión lo inyecte igual en runtime.
          organizationId: cuenta.organizationId,
          banco: "BT",
          numeroCuenta: cuenta.accountNumber,
          montoTransaccion: p.amount.toFixed(2), // mismo formato string que BDT
          fechaTransaccion: p.payment_date.slice(0, 10), // "2026-08-12"
          horaTransaccion: p.payment_date.slice(11).replace(/:/g, ""), // "155048"
          referencia: p.reference,
          tipo: "CREDITO", // el webhook BT solo notifica pagos recibidos
          descripcion: p.description,
          desdeBanco: p.source_bank,
          // Pago móvil: si hay teléfono el origen es celular.
          tipoProd: p.source_phone ? "CELE" : "CNTA",
          desdeCuenta: p.source_phone || p.source_account,
          desdeDni: p.document,
          origen: "webhook",
          rawPayload: JSON.stringify(json), // crudo original, preserva campos desconocidos
        },
      })
    );
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      // uniq_tx → duplicado. Protocolo BT: 400 = "ya existe", el banco la
      // marca enviada y deja de reintentar.
      return NextResponse.json(
        { status: "DUPLICATE", message: "already received" },
        { status: 400 }
      );
    }
    // Error de DB real → 500: el banco reintenta, no se pierde nada.
    console.error("[webhook/bt] error al persistir:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ status: "OK", message: "received" });
}
