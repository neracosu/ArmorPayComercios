"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type ValidationType } from "@prisma/client";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { buscarPorReferencia, turnoAbierto, type PagoEncontrado } from "@/lib/operacion";
import { describeBdt, type BdtSeverity } from "@/lib/bdt-codes";
import { execBdtValidar, execC2pPago, ExecError } from "@/lib/exec-client";
import { describeC2p, esReboteDeAfiliacion } from "../../../gateway/bt-c2p-codes";

export type ResultadoBusqueda =
  | { ok: true; sufijo: string; pagos: PagoEncontrado[] }
  | { ok: false; error: string };

const sufijoSchema = z
  .string()
  .trim()
  .regex(/^\d{4,9}$/, "Escribí entre 4 y 9 dígitos de la referencia");

export async function buscar(
  _previo: ResultadoBusqueda | null,
  datos: FormData
): Promise<ResultadoBusqueda> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entra de nuevo." };

  const parsed = sufijoSchema.safeParse(datos.get("referencia"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const pagos = await withSessionTenant(session, () => buscarPorReferencia(parsed.data));
  return { ok: true, sufijo: parsed.data, pagos };
}

export type ResultadoCobro =
  | { ok: true; duplicado: boolean }
  | { ok: false; error: string; yaCobrado?: { caja: string; sucursal: string; cuando: string } };

/**
 * Registra el cobro de un pago.
 *
 * El antifraude lo arbitra la base, no el código: `primaryKey` es único, así
 * que dos cajas que confirmen el mismo pago en el mismo instante no pueden
 * ganar las dos. La que pierde recibe el aviso, no un cobro silencioso.
 *
 * Decisión de producto heredada de la operación real: el doble cobro se
 * **alerta y se permite** con confirmación explícita — a veces es legítimo, y
 * bloquearlo dejaría a la caja trabada con un cliente esperando. El segundo
 * cobro queda marcado como duplicado para que el administrador lo revise.
 */
export async function cobrar(
  _previo: ResultadoCobro | null,
  datos: FormData
): Promise<ResultadoCobro> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entra de nuevo." };

  const pagoId = String(datos.get("pagoId") ?? "");
  const aceptaDuplicado = datos.get("aceptaDuplicado") === "1";
  const motivo = String(datos.get("motivo") ?? "").slice(0, 500) || null;
  if (!pagoId) return { ok: false, error: "Falta el pago a cobrar." };

  return withSessionTenant(session, async () => {
    const turno = await turnoAbierto(session.user.id);
    if (!turno) {
      return { ok: false, error: "No tienes un turno abierto. Abre turno antes de cobrar." };
    }

    const pago = await prisma.bankTransaction.findUnique({ where: { id: pagoId } });
    if (!pago || pago.tipo !== "CREDITO") {
      return { ok: false, error: "No encontramos ese pago." };
    }

    let monto: Prisma.Decimal;
    try {
      monto = new Prisma.Decimal(pago.montoTransaccion);
    } catch {
      return { ok: false, error: "El monto del pago no es válido." };
    }

    const base = {
      organizationId: turno.organizationId,
      shiftId: turno.id,
      userId: session.user.id,
      branchId: turno.branchId,
      source: "LOOKUP" as const,
      bankTransactionId: pago.id,
      reference: pago.referencia,
      amount: monto,
      numeroCuenta: pago.numeroCuenta,
      payerBank: pago.desdeBanco,
      fechaTransaccion: pago.fechaTransaccion,
      horaTransaccion: pago.horaTransaccion,
    };

    const existente = await prisma.paymentClaim.findUnique({
      where: { primaryKey: pago.id },
      select: {
        id: true,
        claimedAt: true,
        user: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });

    if (existente && !aceptaDuplicado) {
      return {
        ok: false,
        error: "Este pago ya fue cobrado.",
        yaCobrado: {
          caja: existente.user?.name ?? "el checkout web",
          sucursal: existente.branch?.name ?? "en línea",
          cuando: existente.claimedAt.toISOString(),
        },
      };
    }

    if (existente) {
      await prisma.paymentClaim.create({
        data: { ...base, isDuplicate: true, primaryKey: null, duplicateOfId: existente.id, ackReason: motivo },
      });
      revalidatePath("/validar");
      return { ok: true, duplicado: true };
    }

    try {
      await prisma.paymentClaim.create({ data: { ...base, isDuplicate: false, primaryKey: pago.id } });
      revalidatePath("/validar");
      return { ok: true, duplicado: false };
    } catch (e) {
      // P2002 = otra caja lo cobró microsegundos antes. La base arbitró.
      if ((e as { code?: string }).code !== "P2002") throw e;
      const ganador = await prisma.paymentClaim.findUnique({
        where: { primaryKey: pago.id },
        select: {
          claimedAt: true,
          user: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });
      return {
        ok: false,
        error: "Otra caja cobró este pago en este mismo momento.",
        yaCobrado: ganador
          ? {
              caja: ganador.user?.name ?? "el checkout web",
              sucursal: ganador.branch?.name ?? "en línea",
              cuando: ganador.claimedAt.toISOString(),
            }
          : undefined,
      };
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Validación online con datos completos (las 4 consultas del gestor
// BDT) + cobro «Botón de Pago» del Tesoro. Portado del /validate del
// panel interno; el árbitro antifraude es el mismo de siempre.
// ─────────────────────────────────────────────────────────────────

/** "2026-08-10" (input date) o "20260810" → "20260810". */
function fechaAYYYYMMDD(v: string): string | null {
  const limpio = v.trim().replace(/-/g, "");
  return /^\d{8}$/.test(limpio) ? limpio : null;
}

/** "1234,56" | "1234.56" | "1234" → "1234.56" (el banco exige 2 decimales). */
function montoNormalizado(v: string): string | null {
  const limpio = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** Deja solo dígitos (la caja tipea teléfonos con espacios y guiones). */
function soloDigitos(v: string): string {
  return v.replace(/[\s.\-]/g, "");
}

/** Fecha de hoy en Venezuela como YYYYMMDD (el reloj del server NO es VE). */
function hoyCaracasYYYYMMDD(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Caracas" })
    .replace(/-/g, "");
}

const TIPOS_CONSULTA = ["VAL_P2P", "VAL_P2P_CC", "VAL_TRANSFER", "VAL_TRANSACTION"] as const;
type TipoConsulta = (typeof TIPOS_CONSULTA)[number];

export type ResultadoValidacion =
  | { ok: false; error: string }
  | {
      ok: true;
      code: string;
      label: string;
      headline: string;
      hint?: string;
      severity: BdtSeverity;
      /** Consulta exitosa de un CRÉDITO → habilita «Confirmar cobro». */
      cobrable: boolean;
      validationRequestId: string;
      durationMs: number;
    };

/**
 * Consulta un pago al banco con los datos completos del comprobante.
 * No exige turno (consultar no es cobrar) y TODO intento queda en la
 * bitácora `ValidationRequest`, responda lo que responda el banco.
 */
export async function validarEnLinea(
  _previo: ResultadoValidacion | null,
  datos: FormData
): Promise<ResultadoValidacion> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entra de nuevo." };
  if (!session.user.organizationId) return { ok: false, error: "Tu usuario no pertenece a un comercio." };
  const organizationId = session.user.organizationId;

  const tipo = String(datos.get("tipo") ?? "") as TipoConsulta;
  if (!TIPOS_CONSULTA.includes(tipo)) return { ok: false, error: "Tipo de consulta desconocido." };

  const fecha = fechaAYYYYMMDD(String(datos.get("fecha") ?? ""));
  if (!fecha) return { ok: false, error: "Falta la fecha del pago." };
  const monto = montoNormalizado(String(datos.get("monto") ?? ""));
  if (!monto) return { ok: false, error: "Escribe el monto exacto del pago (ej. 1250.50)." };
  const referencia = soloDigitos(String(datos.get("referencia") ?? ""));
  if (!/^\d{3,10}$/.test(referencia)) {
    return { ok: false, error: "La referencia son entre 3 y 10 dígitos." };
  }

  const porComercio = tipo === "VAL_P2P_CC";
  const cuentaId = String(datos.get("cuentaId") ?? "");
  const codigoComercio = String(datos.get("codigoComercio") ?? "");
  if (porComercio ? !codigoComercio : !cuentaId) {
    return { ok: false, error: porComercio ? "Elige el código de comercio." : "Elige la cuenta que recibió el pago." };
  }

  const bancoEmisor = String(datos.get("bancoEmisor") ?? "");
  if (tipo !== "VAL_TRANSACTION" && !/^\d{4}$/.test(bancoEmisor)) {
    return { ok: false, error: "Elige el banco desde donde pagó el cliente." };
  }
  const telefono = soloDigitos(String(datos.get("telefono") ?? ""));
  if ((tipo === "VAL_P2P" || porComercio) && !/^\d{10,12}$/.test(telefono)) {
    return { ok: false, error: "Escribe el teléfono del pagador (ej. 04125551234)." };
  }
  const cedula = String(datos.get("cedula") ?? "").trim();
  if (tipo === "VAL_TRANSFER" && (cedula.length < 2 || cedula.length > 15)) {
    return { ok: false, error: "Escribe la cédula del pagador." };
  }

  return withSessionTenant(session, async () => {
    // La cuenta/el comercio tienen que ser de ESTE tenant y del BDT: la
    // consulta online va al gestor BDT con la llave del comercio. (El scope
    // lo pone la extensión de Prisma; acá solo se exige banco y estado.)
    const cuenta = porComercio
      ? await prisma.bankAccount.findFirst({
          where: { merchantCode: codigoComercio, banco: "BDT", isActive: true },
          select: { id: true, accountNumber: true, merchantCode: true },
        })
      : await prisma.bankAccount.findFirst({
          where: { id: cuentaId, banco: "BDT", isActive: true },
          select: { id: true, accountNumber: true, merchantCode: true },
        });
    if (!cuenta) {
      return {
        ok: false as const,
        error: porComercio
          ? "Ese código de comercio no está entre tus cuentas BDT activas."
          : "Esa cuenta no está activa o no es del BDT (solo el BDT permite consultar en línea).",
      };
    }

    let r;
    try {
      r = await execBdtValidar({
        organizationId,
        type: tipo,
        cuenta: porComercio ? undefined : cuenta.accountNumber,
        codigoComercio: porComercio ? codigoComercio : undefined,
        fecha,
        monto,
        referencia,
        bancoEmisor: tipo === "VAL_TRANSACTION" ? undefined : bancoEmisor,
        telefono: tipo === "VAL_P2P" || porComercio ? telefono : undefined,
        cedula: tipo === "VAL_TRANSFER" ? cedula : undefined,
      });
    } catch (e) {
      if (e instanceof ExecError && e.httpStatus === 422) {
        return {
          ok: false as const,
          error: "La Llave de Trabajo del comercio no está operativa. El administrador debe cargarla y verificarla.",
        };
      }
      // Banco caído o ejecutor sin responder: el intento queda en bitácora
      // igual — es la evidencia de que se consultó y no hubo respuesta.
      r = null;
    }

    const vr = await prisma.validationRequest.create({
      data: {
        organizationId,
        userId: session.user.id,
        type: tipo as ValidationType,
        accountId: cuenta.id,
        merchantCode: porComercio ? codigoComercio : cuenta.merchantCode,
        date: fecha,
        amount: monto,
        reference: referencia,
        bankCode: tipo === "VAL_TRANSACTION" ? null : bancoEmisor,
        phone: telefono || null,
        dni: cedula || null,
        trace: r?.trace ?? "0",
        responseCode: r?.code ?? "NETERR",
        responseMsg: (r?.message ?? "El banco no respondió").slice(0, 250),
        rawResponse: r?.raw ?? "{}",
        durationMs: r?.durationMs ?? 0,
      },
    });

    const info = describeBdt(vr.responseCode);
    return {
      ok: true as const,
      code: vr.responseCode,
      label: info.label,
      headline: info.headline,
      hint: info.hint,
      severity: info.severity,
      cobrable: info.severity === "ok" && tipo !== "VAL_TRANSACTION",
      validationRequestId: vr.id,
      durationMs: vr.durationMs,
    };
  });
}

/**
 * Registra el cobro de un pago confirmado por una validación online.
 *
 * Convergencia antifraude con la vía por referencia: si el pago YA está en
 * las notificaciones ingeridas, el claim se ancla al MISMO `tx.id` que usaría
 * la búsqueda por referencia — cobrarlo por las dos vías choca. Si el webhook
 * aún no llegó, clave sintética `online:<cuenta>:<ref>`.
 */
export async function cobrarValidacion(
  _previo: ResultadoCobro | null,
  datos: FormData
): Promise<ResultadoCobro> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entra de nuevo." };

  const vrId = String(datos.get("validationRequestId") ?? "");
  const aceptaDuplicado = datos.get("aceptaDuplicado") === "1";
  const motivo = String(datos.get("motivo") ?? "").slice(0, 500) || null;
  if (!vrId) return { ok: false, error: "Falta la validación que respalda el cobro." };

  return withSessionTenant(session, async () => {
    const turno = await turnoAbierto(session.user.id);
    if (!turno) {
      return { ok: false, error: "No tienes un turno abierto. Abre turno antes de cobrar." };
    }

    const vr = await prisma.validationRequest.findUnique({
      where: { id: vrId },
      include: { account: { select: { accountNumber: true } } },
    });
    // Cobra quien validó: el comprobante está en SU pantalla.
    if (!vr || vr.userId !== session.user.id) {
      return { ok: false, error: "No encontramos esa validación." };
    }
    if (vr.type === "VAL_TRANSACTION" || vr.type === "BT_C2P") {
      return { ok: false, error: "Ese resultado no genera cobro desde aquí." };
    }
    if (describeBdt(vr.responseCode).severity !== "ok") {
      return { ok: false, error: "Solo un resultado aprobado por el banco se puede cobrar." };
    }

    let numeroCuenta = vr.account?.accountNumber ?? null;
    if (!numeroCuenta && vr.merchantCode) {
      const acc = await prisma.bankAccount.findUnique({
        where: { merchantCode: vr.merchantCode },
        select: { accountNumber: true },
      });
      numeroCuenta = acc?.accountNumber ?? null;
    }
    if (!numeroCuenta) {
      return { ok: false, error: "La cuenta de esa validación ya no existe." };
    }

    let monto: Prisma.Decimal;
    try {
      monto = new Prisma.Decimal(vr.amount);
    } catch {
      return { ok: false, error: "El monto de la validación no es válido." };
    }

    // Convergencia: ¿el banco ya notificó este pago? Sufijo + cuenta; ante
    // ambigüedad desempata el monto; ante la duda, clave sintética.
    const candidatos = await prisma.bankTransaction.findMany({
      where: { tipo: "CREDITO", referencia: { endsWith: vr.reference }, numeroCuenta },
      orderBy: { receivedAt: "desc" },
      take: 20,
    });
    let tx = candidatos.length === 1 ? candidatos[0] : null;
    if (!tx && candidatos.length > 1) {
      const porMonto = candidatos.filter((c) => {
        try {
          return new Prisma.Decimal(c.montoTransaccion).equals(monto);
        } catch {
          return false;
        }
      });
      if (porMonto.length === 1) tx = porMonto[0];
    }

    const primaryKey = tx ? tx.id : `online:${numeroCuenta}:${vr.reference}`;
    const base = {
      organizationId: turno.organizationId,
      shiftId: turno.id,
      userId: session.user.id,
      branchId: turno.branchId,
      source: "ONLINE" as const,
      bankTransactionId: tx?.id ?? null,
      validationRequestId: vr.id,
      reference: tx?.referencia ?? vr.reference,
      amount: monto,
      numeroCuenta,
      payerBank: tx?.desdeBanco ?? vr.bankCode,
      fechaTransaccion: tx?.fechaTransaccion ?? vr.date,
      horaTransaccion: tx?.horaTransaccion ?? null,
    };

    const existente = await prisma.paymentClaim.findUnique({
      where: { primaryKey },
      select: {
        id: true,
        claimedAt: true,
        user: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });

    if (existente && !aceptaDuplicado) {
      return {
        ok: false,
        error: "Este pago ya fue cobrado.",
        yaCobrado: {
          caja: existente.user?.name ?? "el checkout web",
          sucursal: existente.branch?.name ?? "en línea",
          cuando: existente.claimedAt.toISOString(),
        },
      };
    }

    if (existente) {
      await prisma.paymentClaim.create({
        // El duplicado no reclama ni el árbitro ni el vínculo @unique de la validación.
        data: { ...base, isDuplicate: true, primaryKey: null, validationRequestId: null, duplicateOfId: existente.id, ackReason: motivo },
      });
      revalidatePath("/validar");
      return { ok: true, duplicado: true };
    }

    try {
      await prisma.paymentClaim.create({ data: { ...base, isDuplicate: false, primaryKey } });
      revalidatePath("/validar");
      return { ok: true, duplicado: false };
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      const ganador = await prisma.paymentClaim.findUnique({
        where: { primaryKey },
        select: {
          claimedAt: true,
          user: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });
      return {
        ok: false,
        error: "Otra caja cobró este pago en este mismo momento.",
        yaCobrado: ganador
          ? {
              caja: ganador.user?.name ?? "el checkout web",
              sucursal: ganador.branch?.name ?? "en línea",
              cuando: ganador.claimedAt.toISOString(),
            }
          : undefined,
      };
    }
  });
}

export type ResultadoBotonDePago =
  | {
      ok: false;
      error: string;
      hint?: string;
      /** true = el banco NO respondió: el débito pudo haberse hecho. */
      desconocido?: boolean;
    }
  | {
      ok: true;
      referencia: string;
      monto: string;
      comision: string | null;
      lote: string | null;
      /** La referencia ya estaba cobrada: quedó registrado como duplicado. */
      duplicado: boolean;
    };

/**
 * Cobro «Botón de Pago» (C2P del Tesoro) desde la caja: el cliente genera su
 * clave dinámica en su banco, la dicta, y el banco DEBITA en la respuesta.
 *
 * Por eso el turno se exige ANTES de llamar al banco (un débito sin turno no
 * tendría dónde caer) y un C2P0000 registra el cobro EN EL ACTO — no hay paso
 * de confirmación: el dinero ya se movió. Mismo árbitro que el checkout:
 * `c2p:<org>:<referencia>`.
 */
export async function cobrarBotonDePago(
  _previo: ResultadoBotonDePago | null,
  datos: FormData
): Promise<ResultadoBotonDePago> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Se cerró tu sesión. Entra de nuevo." };
  if (!session.user.organizationId) return { ok: false, error: "Tu usuario no pertenece a un comercio." };
  const organizationId = session.user.organizationId;

  const celular = soloDigitos(String(datos.get("celular") ?? ""));
  if (!/^\d{10,12}$/.test(celular)) {
    return { ok: false, error: "Escribe el celular afiliado del cliente (ej. 04125551234)." };
  }
  const bancoPagador = String(datos.get("bancoPagador") ?? "");
  if (!/^\d{4}$/.test(bancoPagador)) return { ok: false, error: "Elige el banco del cliente." };
  const cedula = String(datos.get("cedula") ?? "").trim();
  if (cedula.length < 2 || cedula.length > 15) {
    return { ok: false, error: "Escribe la cédula del cliente." };
  }
  const monto = montoNormalizado(String(datos.get("monto") ?? ""));
  if (!monto) return { ok: false, error: "Escribe el monto a cobrar (ej. 1250.50)." };
  const otp = soloDigitos(String(datos.get("otp") ?? ""));
  if (!/^\d{4,12}$/.test(otp)) {
    return { ok: false, error: "Escribe la clave dinámica que el cliente generó en su banco." };
  }
  const concepto = String(datos.get("concepto") ?? "").trim().slice(0, 40) || "Cobro en caja";

  return withSessionTenant(session, async () => {
    const turno = await turnoAbierto(session.user.id);
    if (!turno) {
      return { ok: false as const, error: "No tienes un turno abierto. El Botón de Pago debita al instante: abre turno antes de cobrar." };
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { btC2pEnabled: true, btCodAfiliado: true, btC2pVerifiedAt: true, btC2pUltimoRebote: true },
    });
    if (!org?.btC2pEnabled || !org.btCodAfiliado) {
      return { ok: false as const, error: "Este comercio no tiene el Botón de Pago habilitado." };
    }

    const hoy = hoyCaracasYYYYMMDD();

    let r;
    try {
      r = await execC2pPago({
        organizationId,
        celular,
        bancoPagador,
        cedula,
        monto,
        otp,
        concepto,
      });
    } catch (e) {
      const detalle = e instanceof ExecError ? e.message : (e as Error).message;
      // El banco no respondió: el débito PUDO haberse hecho. Queda la evidencia
      // y la operadora verifica con el cliente antes de reintentar.
      await prisma.validationRequest.create({
        data: {
          organizationId,
          userId: session.user.id,
          type: "BT_C2P",
          date: hoy,
          amount: monto,
          reference: "",
          bankCode: bancoPagador,
          phone: celular,
          dni: cedula,
          trace: "0",
          responseCode: "NETERR",
          responseMsg: detalle.slice(0, 250),
          rawResponse: JSON.stringify({ error: detalle }),
          durationMs: 0,
        },
      });
      return {
        ok: false as const,
        desconocido: true,
        error: "El banco no respondió y el cobro quedó en estado desconocido.",
        hint: "Pídele al cliente que revise si su banco le debitó ANTES de reintentar. Si debitó, valida el pago por referencia.",
      };
    }

    const referencia = r.referencia ?? "";
    const vr = await prisma.validationRequest.create({
      data: {
        organizationId,
        userId: session.user.id,
        type: "BT_C2P",
        date: hoy,
        amount: monto,
        // La referencia la EMITE el banco al aprobar; vacía en rechazo.
        reference: referencia,
        bankCode: bancoPagador,
        phone: celular,
        dni: cedula,
        trace: r.numeroLote ?? "0",
        responseCode: r.codres,
        responseMsg: r.message.slice(0, 250),
        rawResponse: r.raw,
        durationMs: r.durationMs,
      },
    });

    if (!r.aprobado) {
      // Un rebote de la familia afiliación lo resuelve la plataforma con el
      // banco, no la caja reintentando — queda anotado en la ficha (igual
      // que en el checkout).
      if (esReboteDeAfiliacion(r.codres) && org.btC2pUltimoRebote !== r.codres) {
        await prisma.organization.update({
          where: { id: organizationId },
          data: { btC2pUltimoRebote: r.codres },
        });
      }
      const traducido = describeC2p(r.codres, r.message);
      return { ok: false as const, error: traducido.headline, hint: traducido.hint };
    }

    // Aprobado = el dinero YA se movió: el cobro se registra en el acto.
    const base = {
      organizationId: turno.organizationId,
      shiftId: turno.id,
      userId: session.user.id,
      branchId: turno.branchId,
      source: "ONLINE" as const,
      validationRequestId: vr.id,
      reference: referencia,
      amount: new Prisma.Decimal(monto),
      numeroCuenta: "c2p", // no hay cuenta del webhook en este camino
      payerBank: bancoPagador,
      fechaTransaccion: r.fecha ?? hoy,
      horaTransaccion: r.hora ?? null,
    };
    let duplicado = false;
    try {
      await prisma.paymentClaim.create({
        data: { ...base, isDuplicate: false, primaryKey: `c2p:${organizationId}:${referencia}` },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      // Rarísimo (la referencia la emite el banco), pero el débito ocurrió:
      // perderlo descuadraría el cierre. Queda como duplicado para revisión.
      const ganador = await prisma.paymentClaim.findUnique({
        where: { primaryKey: `c2p:${organizationId}:${referencia}` },
        select: { id: true },
      });
      await prisma.paymentClaim.create({
        data: {
          ...base,
          isDuplicate: true,
          primaryKey: null,
          validationRequestId: null,
          duplicateOfId: ganador?.id ?? null,
          ackReason: "El banco aprobó un C2P con una referencia ya cobrada.",
        },
      });
      duplicado = true;
    }

    // El primer C2P0000 real ES la verificación del afiliado; un éxito
    // también limpia cualquier rebote pendiente (misma regla del checkout).
    if (!org.btC2pVerifiedAt || org.btC2pUltimoRebote) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          btC2pUltimoRebote: null,
          ...(org.btC2pVerifiedAt ? {} : { btC2pVerifiedAt: new Date() }),
        },
      });
    }

    revalidatePath("/validar");
    return {
      ok: true as const,
      referencia,
      monto,
      comision: r.montoComision,
      lote: r.numeroLote,
      duplicado,
    };
  });
}
