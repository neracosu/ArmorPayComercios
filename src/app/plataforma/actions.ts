"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { PrismaClient, type LeadEstado } from "@prisma/client";
import { getVerifiedSession } from "@/lib/session-guard";
import { generarPassword } from "@/lib/password";
import { normalizeUsername, usernameSchema } from "@/lib/username";
import { normalizarRif, validarRif } from "@/lib/rif";
import { enviarCorreo, URL_APP } from "@/lib/correo";
import { RECAUDO_MAX_BYTES, RECAUDOS_REQUERIDOS, tipoDeDocumento } from "@/lib/recaudos";
import { cifrar, descifrar, pistaDeLlave } from "@/lib/crypto";
import { LOGO_MAX_BYTES, tipoDeImagen } from "@/lib/logo";
import { echoTest } from "../../../gateway/bdt";
import { probarCredencialesBt } from "../../../gateway/bt-idpagos";

/**
 * Acciones del panel de plataforma. Solo `PLATFORM_ADMIN`.
 *
 * Se usa un cliente Prisma sin la extensión de tenant: estas operaciones son
 * intencionalmente multi-comercio (ver la cola de solicitudes de todos, crear
 * un comercio que todavía no existe). El aislamiento acá lo da el rol, no el
 * contexto — y por eso cada acción lo verifica primero, sin excepción.
 */
const db = new PrismaClient();

async function exigirPlataforma() {
  const session = await getVerifiedSession();
  if (!session || session.user.role !== "PLATFORM_ADMIN") {
    throw new Error("No autorizado");
  }
  return session;
}

/**
 * Permiso de REVISIÓN: el trabajo de la revisora de expedientes (y del
 * admin, que puede todo). Alcanza para revisar recaudos, aprobar cuentas y
 * avanzar el ciclo — NUNCA para activar, tocar llaves ni crear usuarios.
 */
async function exigirRevision() {
  const session = await getVerifiedSession();
  const rol = session?.user.role;
  if (!session || (rol !== "PLATFORM_ADMIN" && rol !== "PLATFORM_REVIEWER")) {
    throw new Error("No autorizado");
  }
  return session;
}

/**
 * Deja constancia de una acción administrativa en la bitácora de plataforma
 * (`PlatformEvent`). Fire-and-forget: la bitácora nunca rompe la acción que
 * registra. Antes de esto, activar, borrar o aprobar no dejaba huella de
 * quién lo hizo.
 */
function anotar(
  session: { user: { id: string; username: string } },
  action: string,
  detail: string,
  targetOrgId?: string | null
): void {
  void db.platformEvent
    .create({
      data: {
        actorUserId: session.user.id,
        actor: session.user.username,
        action,
        detail,
        targetOrgId: targetOrgId ?? null,
      },
    })
    .catch(() => {});
}

export type Resultado =
  | { ok: true; mensaje: string; credenciales?: { usuario: string; password: string } }
  | { ok: false; error: string };

/**
 * Correos de los administradores del comercio, para notificarles los hitos
 * del ciclo. Puede venir vacío (los admins creados a mano no llevan email):
 * en ese caso simplemente no se envía nada.
 */
async function correosAdminsComercio(organizationId: string): Promise<string[]> {
  const admins = await db.user.findMany({
    where: { organizationId, role: "ORG_ADMIN", isActive: true, email: { not: null } },
    select: { email: true },
  });
  return admins.flatMap((a) => (a.email ? [a.email] : []));
}



/** Nota interna de una solicitud (seguimiento del contacto). Solo ADMIN. */
export async function guardarNotaLead(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  await exigirPlataforma();

  const leadId = String(datos.get("leadId") ?? "");
  if (!leadId) return { ok: false, error: "Falta la solicitud." };
  const nota = String(datos.get("notaInterna") ?? "").trim().slice(0, 2000);

  await db.lead.update({ where: { id: leadId }, data: { notaInterna: nota || null } });
  revalidatePath("/plataforma/solicitudes");
  return { ok: true, mensaje: "Nota guardada." };
}

export async function cambiarEstadoLead(
  leadId: string,
  estado: LeadEstado
): Promise<Resultado> {
  await exigirPlataforma();
  await db.lead.update({ where: { id: leadId }, data: { estado } });
  revalidatePath("/plataforma/solicitudes");
  return { ok: true, mensaje: `Solicitud marcada como ${estado.toLowerCase()}.` };
}

// ── Llave de Trabajo del banco ──────────────────────────────────────────────

const llaveSchema = z.object({
  organizationId: z.string().min(1),
  authKey: z.string().trim().min(16, "La llave se ve muy corta").max(200),
});

/**
 * Guarda la Llave de Trabajo de un comercio.
 *
 * Campo de SOLO ESCRITURA: se pega y no se vuelve a leer completa desde
 * ninguna pantalla. Para mostrarla se guarda una pista (`DDF…755`) al grabar,
 * así la ficha no necesita descifrar nada para pintarse.
 *
 * Queda en estado CARGADA, no VERIFICADA: que esté bien pegada y que el banco
 * la acepte son dos cosas distintas, y el comercio tiene que ver la diferencia
 * antes de que una caja intente cobrar.
 */
export async function guardarLlave(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();
  const parsed = llaveSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { organizationId, authKey } = parsed.data;
  await db.organization.update({
    where: { id: organizationId },
    data: {
      authKeyEnc: cifrar(authKey),
      authKeyHint: pistaDeLlave(authKey),
      authKeyStatus: "CARGADA",
      lastVerifiedAt: null,
    },
  });
  await db.authKeyEvent.create({
    data: {
      organizationId,
      action: "cargada",
      actorUserId: session.user.id,
      detail: `Cargada por ${session.user.username}`,
    },
  });

  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return { ok: true, mensaje: "Llave guardada. Verifícala contra el banco para confirmar que sirve." };
}

/**
 * Prueba la llave contra el banco y deja el veredicto en la ficha.
 *
 * Es la certificación que el banco pide por empresa, convertida en un botón.
 */
export async function verificarLlave(organizationId: string): Promise<Resultado> {
  const session = await exigirPlataforma();

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { authKeyEnc: true, razonSocial: true },
  });
  if (!org?.authKeyEnc) return { ok: false, error: "Ese comercio todavía no tiene llave cargada." };

  let veredicto: string;
  let sirve = false;
  try {
    const r = await echoTest(descifrar(org.authKeyEnc));
    const p2p = r.datos.services_stat?.p2p_stat ?? "?";
    const simf = r.datos.services_stat?.simf_stat ?? "?";
    sirve = r.code === "GES0000";
    veredicto = `${r.code} · ${r.message} · p2p=${p2p} simf=${simf} · ${r.http.duracionMs}ms`;
  } catch (e) {
    veredicto = `No se pudo consultar al banco: ${e instanceof Error ? e.message : String(e)}`;
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      authKeyStatus: sirve ? "VERIFICADA" : "INVALIDA",
      lastVerifiedAt: sirve ? new Date() : null,
    },
  });
  await db.authKeyEvent.create({
    data: {
      organizationId,
      action: sirve ? "verificada" : "invalidada",
      actorUserId: session.user.id,
      detail: veredicto,
    },
  });

  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return sirve
    ? { ok: true, mensaje: `La llave funciona. ${veredicto}` }
    : { ok: false, error: `El banco no aceptó la llave. ${veredicto}` };
}

const credencialesBtSchema = z.object({
  organizationId: z.string().min(1),
  codSocio: z.string().trim().min(1, "Falta el Cod_Socio").max(20),
  appUser: z.string().trim().min(2, "Falta el app_user").max(80),
  appKey: z.string().trim().min(4, "La app_key se ve muy corta").max(200),
});

/**
 * Carga las credenciales BT del comercio (escenario GESTIONAMOS: el banco
 * nos las entrega a nosotros). Mismo trato que la Llave BDT: la app_key se
 * cifra, queda CARGADA y la vinculación se confirma aparte.
 */
export async function guardarCredencialesBt(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();
  const parsed = credencialesBtSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { organizationId, codSocio, appUser, appKey } = parsed.data;
  await db.organization.update({
    where: { id: organizationId },
    data: {
      btCodSocio: codSocio,
      btAppUser: appUser,
      btAppKeyEnc: cifrar(appKey),
      btAppKeyHint: pistaDeLlave(appKey),
      btCredStatus: "CARGADA",
      btCredVerifiedAt: null,
    },
  });
  await db.authKeyEvent.create({
    data: {
      organizationId,
      action: "bt_cargada",
      actorUserId: session.user.id,
      detail: `Credenciales BT cargadas por ${session.user.username}`,
    },
  });

  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return { ok: true, mensaje: "Credenciales BT guardadas. Pruébalas contra el banco para dejar el veredicto." };
}

/**
 * Prueba las credenciales BT contra el banco y deja el veredicto.
 *
 * El login del Identificador de Pagos ES el echo-test del Tesoro: si entrega
 * token, las credenciales sirven — el equivalente exacto del GES0000 del BDT.
 */
export async function probarVinculacionBt(organizationId: string): Promise<Resultado> {
  const session = await exigirPlataforma();

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { btCodSocio: true, btAppUser: true, btAppKeyEnc: true },
  });
  if (!org) return { ok: false, error: "Ese comercio no existe." };
  if (!org.btAppKeyEnc || !org.btCodSocio || !org.btAppUser) {
    return { ok: false, error: "Ese comercio todavía no tiene credenciales BT cargadas." };
  }

  let veredicto: string;
  let sirve = false;
  try {
    const r = await probarCredencialesBt({
      codSocio: org.btCodSocio,
      appUser: org.btAppUser,
      appKey: descifrar(org.btAppKeyEnc),
    });
    sirve = r.ok;
    veredicto = `${r.status}${r.mensaje ? ` · ${r.mensaje}` : ""} · HTTP ${r._http.status} · ${r._http.durationMs}ms`;
  } catch (e) {
    veredicto = `No se pudo consultar al banco: ${e instanceof Error ? e.message : String(e)}`;
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      btCredStatus: sirve ? "VERIFICADA" : "INVALIDA",
      btCredVerifiedAt: sirve ? new Date() : null,
    },
  });
  await db.authKeyEvent.create({
    data: {
      organizationId,
      action: sirve ? "bt_verificada" : "bt_invalidada",
      actorUserId: session.user.id,
      detail: veredicto,
    },
  });

  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return sirve
    ? { ok: true, mensaje: `Las credenciales funcionan: el banco entregó sesión. ${veredicto}` }
    : { ok: false, error: `El banco no las aceptó. ${veredicto}` };
}

const cuentaSchema = z.object({
  organizationId: z.string().min(1),
  accountNumber: z.string().trim().regex(/^\d{20}$/, "La cuenta son 20 dígitos, sin espacios"),
  alias: z.string().trim().min(2, "Pon un alias").max(120),
  banco: z.enum(["BDT", "BT"]),
  // Código de comercio BDT (P2C): habilita la consulta «P2P por comercio».
  merchantCode: z.string().trim().regex(/^\d{1,20}$/).optional().or(z.literal("")),
});

/** Da de alta una cuenta afiliada. Sin cuenta, las cajas del comercio no ven pagos. */
export async function agregarCuenta(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();
  const parsed = cuentaSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { organizationId, accountNumber, alias, banco } = parsed.data;
  const merchantCode = parsed.data.merchantCode || null;
  if (merchantCode && banco !== "BDT") {
    return { ok: false, error: "El código de comercio es un concepto BDT." };
  }
  if (merchantCode) {
    const dueño = await db.bankAccount.findUnique({ where: { merchantCode } });
    if (dueño) return { ok: false, error: "Ese código de comercio ya pertenece a otra cuenta." };
  }
  const existente = await db.bankAccount.findUnique({ where: { accountNumber } });
  if (existente) {
    return {
      ok: false,
      error:
        existente.organizationId === organizationId
          ? "Esa cuenta ya está cargada en este comercio."
          : "Esa cuenta ya pertenece a OTRO comercio. Revisa el número.",
    };
  }

  await db.bankAccount.create({
    data: { organizationId, accountNumber, alias, banco, merchantCode },
  });
  anotar(session, "cuenta_agregada", `${banco} …${accountNumber.slice(-4)}`, organizationId);
  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return { ok: true, mensaje: "Cuenta agregada. Los pagos que entren a ella ya van a llegarle." };
}

const usuarioComercioSchema = z.object({
  organizationId: z.string().min(1),
  usuario: usernameSchema,
  nombre: z.string().trim().min(2, "Falta el nombre").max(120),
  // Con email, el admin recibe los correos del ciclo de activación.
  email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Revisa el correo")
    .optional(),
});

/**
 * Crea el usuario administrador de un comercio.
 *
 * Es la única vía para que exista un `ORG_ADMIN`: el dueño del negocio no se
 * autocrea. Desde ahí, él arma sus propias cajas sin que nosotros
 * intervengamos.
 */
export async function crearAdminComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const parsed = usuarioComercioSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const usuario = normalizeUsername(parsed.data.usuario);
  if (await db.user.findUnique({ where: { username: usuario } })) {
    return { ok: false, error: `El usuario "${usuario}" ya existe.` };
  }

  const branch = await db.branch.findFirst({
    where: { organizationId: parsed.data.organizationId },
  });
  const password = generarPassword();

  const email = parsed.data.email || null;
  await db.user.create({
    data: {
      username: usuario,
      name: parsed.data.nombre,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ORG_ADMIN",
      organizationId: parsed.data.organizationId,
      branchId: branch?.id ?? null,
      email,
    },
  });

  // Si la ficha no tenía a quién contactar, este admin lo es.
  if (email) {
    await db.organization.updateMany({
      where: { id: parsed.data.organizationId, contactoEmail: null },
      data: { contactoNombre: parsed.data.nombre, contactoEmail: email },
    });
  }

  anotar(session, "admin_creado", `${usuario} (${parsed.data.nombre})`, parsed.data.organizationId);
  revalidatePath(`/plataforma/comercios/${parsed.data.organizationId}`);
  return {
    ok: true,
    mensaje: "Administrador creado.",
    credenciales: { usuario, password },
  };
}

/** Suspende o reactiva un comercio. Suspendido, ninguno de sus usuarios entra. */
export async function cambiarEstadoComercio(
  organizationId: string,
  suspender: boolean
): Promise<Resultado> {
  const session = await exigirPlataforma();
  await db.organization.update({
    where: { id: organizationId },
    data: { status: suspender ? "SUSPENDIDA" : "ACTIVA" },
  });
  anotar(session, suspender ? "comercio_suspendido" : "comercio_reactivado", "", organizationId);
  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return {
    ok: true,
    mensaje: suspender ? "Comercio suspendido." : "Comercio reactivado.",
  };
}

const convertirSchema = z.object({
  leadId: z.string().min(1),
  razonSocial: z.string().trim().min(2, "Falta la razón social").max(160),
  rif: z.string().trim().min(6, "Falta el RIF").max(20),
  slug: usernameSchema,
  usuario: usernameSchema,
  nombreUsuario: z.string().trim().min(2, "Falta el nombre del responsable").max(120),
});

/**
 * Convierte una solicitud en comercio operativo.
 *
 * Crea la `Organization`, su sucursal por defecto —sin ella una caja no puede
 * abrir turno— y el usuario administrador del comercio, con una contraseña
 * temporal que se muestra una sola vez.
 *
 * NO carga la Llave de Trabajo del banco: eso pasa después, cuando el banco
 * afilia la cuenta. El comercio nace en estado REGISTRADA justamente para que
 * quede claro que todavía no puede validar.
 */
export async function convertirLead(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const parsed = convertirSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const d = parsed.data;
  // Acá NO se exige J/G: la conversión manual es donde nosotros decidimos las
  // excepciones (una firma personal V que orientamos desde la propuesta).
  const rifCheck = validarRif(d.rif);
  if (!rifCheck.ok) return { ok: false, error: rifCheck.error };
  const rif = rifCheck.rif;
  const usuario = normalizeUsername(d.usuario);
  const slug = normalizeUsername(d.slug);

  if (await db.organization.findUnique({ where: { rif } })) {
    return { ok: false, error: `Ya existe un comercio con el RIF ${rif}.` };
  }
  if (await db.organization.findUnique({ where: { slug } })) {
    return { ok: false, error: `El identificador "${slug}" ya está usado.` };
  }
  if (await db.user.findUnique({ where: { username: usuario } })) {
    return { ok: false, error: `El usuario "${usuario}" ya existe.` };
  }

  // El lead trae el contacto que el propio comercio nos dio: se hereda al
  // comercio para que la ficha nazca con a quién llamar.
  const lead = await db.lead.findUnique({ where: { id: d.leadId } });

  const password = generarPassword();

  const org = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        rif,
        razonSocial: d.razonSocial,
        slug,
        contactoNombre: lead?.contacto ?? null,
        contactoTelefono: lead?.telefono ?? null,
        contactoEmail: lead?.email ?? null,
      },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Principal", code: "PRIN" },
    });
    await tx.user.create({
      data: {
        username: usuario,
        name: d.nombreUsuario,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ORG_ADMIN",
        organizationId: org.id,
        branchId: branch.id,
        // Con el email del lead, este admin sí recibe los correos del ciclo
        // de activación (sin email, el comercio quedaba mudo).
        email: lead?.email ?? null,
      },
    });
    await tx.lead.update({
      where: { id: d.leadId },
      data: {
        estado: "CONVERTIDO",
        organizationId: org.id,
        convertidoPor: session.user.username,
        convertidoAt: new Date(),
      },
    });
    return org;
  });

  anotar(session, "comercio_creado", `${org.razonSocial} (${rif}) · admin ${usuario}`, org.id);
  revalidatePath("/plataforma/solicitudes");
  return {
    ok: true,
    mensaje: `${org.razonSocial} quedó creado. Falta afiliar su cuenta ante el banco y cargarle la Llave de Trabajo.`,
    credenciales: { usuario, password },
  };
}

// ── Afiliación C2P del Tesoro (Botón de Pago) ───────────────────────────────

/**
 * Guarda la identidad C2P de un comercio: su código de afiliado ante el
 * Tesoro. El código NO es un secreto (la identidad es codAfiliado + RIF y el
 * servicio no usa auth), pero SÍ es el gate operativo: `btC2pEnabled` solo se
 * prende cuando el banco confirmó la afiliación — y sin él, ni la API ni la
 * página de pago ofrecen C2P.
 *
 * Los códigos llevan ceros a la izquierda ("009635"): se guardan como texto,
 * tal cual los emite el banco.
 */
export async function guardarAfiliacionC2p(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const organizationId = String(datos.get("organizationId") ?? "");
  const codAfiliado = String(datos.get("codAfiliado") ?? "").trim();
  const habilitado = datos.get("habilitado") === "1";
  if (!organizationId) return { ok: false, error: "Falta el comercio." };
  if (codAfiliado && !/^\d{4,12}$/.test(codAfiliado)) {
    return { ok: false, error: "El código de afiliado son solo dígitos (4 a 12)." };
  }
  if (habilitado && !codAfiliado) {
    return { ok: false, error: "No se puede habilitar C2P sin el código de afiliado." };
  }

  const actual = await db.organization.findUnique({
    where: { id: organizationId },
    select: { btCodAfiliado: true },
  });
  if (!actual) return { ok: false, error: "Comercio no encontrado." };

  // La verificación (primer C2P0000 real) es DE un código concreto: cambiarlo
  // la resetea, junto con cualquier rebote anotado del código anterior.
  const codigoCambio = (codAfiliado || null) !== actual.btCodAfiliado;
  await db.organization.update({
    where: { id: organizationId },
    data: {
      btCodAfiliado: codAfiliado || null,
      btC2pEnabled: habilitado,
      ...(codigoCambio ? { btC2pVerifiedAt: null, btC2pUltimoRebote: null } : {}),
    },
  });

  anotar(
    session,
    "c2p_configurado",
    `afiliado ${codAfiliado || "—"} · ${habilitado ? "habilitado" : "apagado"}`,
    organizationId
  );
  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return {
    ok: true,
    mensaje: habilitado
      ? "C2P habilitado. El comercio ya puede cobrar con Botón de Pago."
      : "Afiliación guardada. C2P queda apagado hasta habilitarlo.",
  };
}

// ── Recaudos en nombre del comercio (modo GESTIONAMOS) ──────────────────────

/**
 * Sube un documento del expediente EN NOMBRE del comercio. En el modo
 * GESTIONAMOS el cliente nos hace llegar sus PDF por fuera (correo, WhatsApp)
 * y no había forma de meterlos al expediente: la subida del comercio vive en
 * su panel de activación, que redirige a cierres al quedar ACTIVA. Nace
 * PENDIENTE igual que la subida del comercio — el dictamen lo da el botón de
 * revisión de siempre, y el rastro queda honesto (subir ≠ aprobar).
 */
export async function subirRecaudoComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  await exigirPlataforma();

  const organizationId = String(datos.get("organizationId") ?? "");
  const tipo = String(datos.get("tipo") ?? "");
  if (!organizationId) return { ok: false, error: "Falta el comercio." };
  if (!RECAUDOS_REQUERIDOS.some((r) => r.tipo === tipo)) {
    return { ok: false, error: "Tipo de documento desconocido." };
  }

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige el archivo primero." };
  }
  if (archivo.size > RECAUDO_MAX_BYTES) {
    return { ok: false, error: "El archivo pesa más de 2 MB. Comprímelo y vuelve a intentar." };
  }
  const buf = Buffer.from(await archivo.arrayBuffer());
  const mime = tipoDeDocumento(buf);
  if (!mime) return { ok: false, error: "Solo aceptamos PDF, PNG, JPG o WebP." };

  await db.recaudo.upsert({
    // Volver a subir REEMPLAZA y vuelve a PENDIENTE, igual que del lado del
    // comercio: un documento corregido se dictamina de nuevo.
    where: { organizationId_tipo: { organizationId, tipo } },
    create: { organizationId, tipo, nombre: archivo.name.slice(0, 120), archivo: buf, mime },
    update: {
      nombre: archivo.name.slice(0, 120),
      archivo: buf,
      mime,
      status: "PENDIENTE",
      nota: null,
    },
  });

  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return { ok: true, mensaje: "Documento cargado al expediente. Dictamínalo en la lista." };
}

// ── Eliminación total de un comercio (zona de peligro) ──────────────────────

/**
 * Borra un comercio y TODO su rastro: usuarios, cuentas, pagos recibidos,
 * cobros, turnos, intents, API keys, webhooks, bitácora y expediente. Existe
 * para los registros de prueba y las altas abandonadas: el RIF y el slug son
 * únicos, así que mientras el registro viva la misma empresa no puede volver
 * a darse de alta. Irreversible a propósito — exige reescribir el RIF y es
 * exclusivo del PLATFORM_ADMIN (la revisora ni lo ve en la ficha).
 */
export async function eliminarComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const organizationId = String(datos.get("organizationId") ?? "");
  const confirmacion = normalizarRif(String(datos.get("rifConfirmacion") ?? ""));
  if (!organizationId) return { ok: false, error: "Falta el comercio." };

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { rif: true, razonSocial: true },
  });
  if (!org) return { ok: false, error: "Comercio no encontrado." };
  if (confirmacion !== org.rif) {
    return { ok: false, error: "El RIF no coincide. Escríbelo tal cual aparece en la ficha." };
  }

  // Purga en orden inverso a las FKs Restrict, en UNA transacción: o
  // desaparece todo, o no desaparece nada. Los Leads no se borran — son la
  // solicitud original, anterior al comercio: solo se les suelta el vínculo.
  const where = { organizationId };
  await db.$transaction([
    // La constancia va EN la transacción: si el borrado ocurre, la huella
    // queda sí o sí (sin FK a la org — le sobrevive; el detail dice quién era).
    db.platformEvent.create({
      data: {
        actorUserId: session.user.id,
        actor: session.user.username,
        action: "comercio_eliminado",
        detail: `${org.razonSocial} (${org.rif})`,
        targetOrgId: organizationId,
      },
    }),
    db.webhookDelivery.deleteMany({ where }),
    db.paymentClaim.deleteMany({ where }),
    db.validationRequest.deleteMany({ where }),
    db.checkoutIntent.deleteMany({ where }),
    db.apiEvent.deleteMany({ where }),
    db.apiKey.deleteMany({ where }),
    db.shift.deleteMany({ where }),
    db.bankTransaction.deleteMany({ where }),
    db.recaudo.deleteMany({ where }),
    db.authKeyEvent.deleteMany({ where }),
    db.webhookEndpoint.deleteMany({ where }),
    db.bankAccount.deleteMany({ where }),
    db.user.deleteMany({ where }),
    db.branch.deleteMany({ where }),
    db.lead.updateMany({ where, data: { organizationId: null } }),
    db.organization.delete({ where: { id: organizationId } }),
  ]);

  revalidatePath("/plataforma/comercios");
  redirect("/plataforma/comercios");
}

// ── Logo del comercio (subida en su nombre durante el alta) ─────────────────

export async function subirLogoComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  await exigirPlataforma();

  const organizationId = String(datos.get("organizationId") ?? "");
  if (!organizationId) return { ok: false, error: "Falta el comercio." };

  const archivo = datos.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige una imagen primero." };
  }
  if (archivo.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "La imagen pesa más de 512 KB." };
  }
  const buf = Buffer.from(await archivo.arrayBuffer());
  const mime = tipoDeImagen(buf);
  if (!mime) return { ok: false, error: "Solo aceptamos PNG, JPG o WebP." };

  await db.organization.update({
    where: { id: organizationId },
    data: { logo: buf, logoMime: mime, logoUpdatedAt: new Date() },
  });

  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return { ok: true, mensaje: "Logo guardado. Ya se ve en sus cajas y en su página de pago." };
}

// ── Ciclo de activación del comercio ────────────────────────────────────────

/**
 * El orden del ciclo es fijo; avanzar es SIEMPRE al paso siguiente. Los
 * estados terminales laterales (RECHAZADA, SUSPENDIDA) tienen sus acciones
 * aparte. Sin saltos: si un comercio "ya está listo", igual pasa por cada
 * paso — cada uno deja constancia de una verificación real.
 */
const CICLO: Array<{ de: string; a: string; etiqueta: string }> = [
  { de: "REGISTRADA", a: "RECAUDOS_COMPLETOS", etiqueta: "Marcar recaudos completos" },
  { de: "RECAUDOS_COMPLETOS", a: "ENVIADA_AL_BANCO", etiqueta: "Marcar solicitud enviada al banco" },
  { de: "ENVIADA_AL_BANCO", a: "CERTIFICACION", etiqueta: "El banco afilió — pasar a certificación" },
  { de: "CERTIFICACION", a: "ACTIVA", etiqueta: "Activar el comercio" },
];

export async function avanzarEstadoComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirRevision();
  const organizationId = String(datos.get("organizationId") ?? "");
  if (!organizationId) return { ok: false, error: "Falta el comercio." };

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      status: true,
      razonSocial: true,
      authKeyStatus: true,
      btCredStatus: true,
      accounts: { where: { isActive: true }, select: { banco: true } },
      _count: { select: { users: true } },
    },
  });
  if (!org) return { ok: false, error: "Ese comercio no existe." };

  const paso = CICLO.find((p) => p.de === org.status);
  if (!paso) {
    return { ok: false, error: `Desde ${org.status.toLowerCase()} no hay paso siguiente.` };
  }

  // La activación es el único paso con requisitos duros: sin cuenta activa no
  // ve pagos, y sin credencial verificada su validación en vivo no funciona.
  // La credencial exigida depende del BANCO de sus cuentas: la Llave de
  // Trabajo es un concepto BDT; el Tesoro usa Cod_Socio/app_user/app_key. Un
  // comercio solo-BT no tiene llave BDT que verificar — no se le puede pedir.
  if (paso.a === "ACTIVA") {
    // La revisora prepara; ACTIVAR es decisión de un administrador.
    if (session.user.role !== "PLATFORM_ADMIN") {
      return { ok: false, error: "Activar un comercio es decisión de un administrador de plataforma." };
    }
    const bancos = new Set(org.accounts.map((a) => a.banco));
    const faltas: string[] = [];
    if (org.accounts.length === 0) faltas.push("una cuenta bancaria activa");
    if (bancos.has("BDT") && org.authKeyStatus !== "VERIFICADA") {
      faltas.push("la Llave de Trabajo BDT verificada (echo-test)");
    }
    if (bancos.has("BT") && org.btCredStatus !== "VERIFICADA") {
      faltas.push("las credenciales BT con la vinculación confirmada");
    }
    if (org._count.users === 0) faltas.push("el usuario administrador");
    if (faltas.length > 0) {
      return { ok: false, error: `Para activar falta: ${faltas.join(", ")}.` };
    }
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { status: paso.a as never },
  });
  anotar(session, "ciclo_avanzado", `${org.razonSocial}: ${org.status} → ${paso.a}`, organizationId);
  revalidatePath(`/plataforma/comercios/${organizationId}`);
  revalidatePath("/plataforma/comercios");

  const destinos = await correosAdminsComercio(organizationId);
  if (destinos.length > 0) {
    const AVANCE: Record<string, { asunto: string; titulo: string; detalle: string }> = {
      RECAUDOS_COMPLETOS: {
        asunto: "Tu expediente está completo",
        titulo: "Expediente completo",
        detalle: "Revisamos tus documentos y el expediente quedó completo. El siguiente paso es enviar tu afiliación al banco.",
      },
      ENVIADA_AL_BANCO: {
        asunto: "Tu afiliación va camino al banco",
        titulo: "Solicitud enviada al banco",
        detalle: "Enviamos tu solicitud de afiliación al banco. Te avisamos apenas la procese; este paso depende de sus tiempos.",
      },
      CERTIFICACION: {
        asunto: "El banco te afilió — falta la certificación",
        titulo: "En certificación",
        detalle: "El banco procesó tu afiliación y estamos certificando que todo funcione de punta a punta antes de activarte.",
      },
      ACTIVA: {
        asunto: "Tu comercio está ACTIVO en ArmorPay",
        titulo: "¡Listo para cobrar!",
        detalle: "Tu comercio quedó activo: tus cajas ya pueden validar pagos y tu API ya responde. Entra y abre tu primer turno.",
      },
    };
    const correo = AVANCE[paso.a];
    if (correo) {
      void enviarCorreo({
        para: destinos,
        asunto: correo.asunto,
        titulo: correo.titulo,
        parrafos: [`Novedades de ${org.razonSocial}:`, correo.detalle],
        boton: { texto: "Entrar a ArmorPay", url: `${URL_APP}/login` },
      });
    }
  }

  return {
    ok: true,
    mensaje:
      paso.a === "ACTIVA"
        ? "Comercio ACTIVO: sus cajas ya pueden cobrar y su API ya responde."
        : `Estado: ${paso.a.toLowerCase().replace(/_/g, " ")}.`,
  };
}

/** Rechazo antes de activar (el banco negó la afiliación, o no califica). */
export async function rechazarComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();
  const organizationId = String(datos.get("organizationId") ?? "");
  if (!organizationId) return { ok: false, error: "Falta el comercio." };

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!org) return { ok: false, error: "Ese comercio no existe." };
  if (org.status === "ACTIVA" || org.status === "SUSPENDIDA") {
    return { ok: false, error: "Un comercio activo se suspende, no se rechaza." };
  }

  await db.organization.update({ where: { id: organizationId }, data: { status: "RECHAZADA" } });
  anotar(session, "comercio_rechazado", "", organizationId);
  revalidatePath(`/plataforma/comercios/${organizationId}`);
  revalidatePath("/plataforma/comercios");

  const destinos = await correosAdminsComercio(organizationId);
  if (destinos.length > 0) {
    void enviarCorreo({
      para: destinos,
      asunto: "No pudimos aprobar tu solicitud",
      titulo: "Solicitud rechazada",
      parrafos: [
        "Tu solicitud de afiliación no pudo aprobarse en esta oportunidad.",
        "Si crees que es un error o quieres saber el motivo, respóndenos a este correo y lo revisamos contigo.",
      ],
    });
  }
  return { ok: true, mensaje: "Comercio rechazado." };
}

// ── Revisión del expediente y aprobación de cuentas ─────────────────────────

export async function revisarRecaudo(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirRevision();

  const id = String(datos.get("id") ?? "");
  const veredicto = String(datos.get("veredicto") ?? "");
  const nota = String(datos.get("nota") ?? "").trim().slice(0, 500);
  if (!id || (veredicto !== "aprobar" && veredicto !== "rechazar")) {
    return { ok: false, error: "Falta el documento o el veredicto." };
  }
  if (veredicto === "rechazar" && !nota) {
    return { ok: false, error: "Un rechazo lleva SIEMPRE el motivo: el comercio tiene que saber qué corregir." };
  }

  const r = await db.recaudo.update({
    where: { id },
    data: { status: veredicto === "aprobar" ? "APROBADO" : "RECHAZADO", nota: nota || null },
    select: { organizationId: true, tipo: true },
  });

  anotar(
    session,
    veredicto === "aprobar" ? "recaudo_aprobado" : "recaudo_rechazado",
    `${r.tipo}${nota ? ` · ${nota}` : ""}`,
    r.organizationId
  );
  revalidatePath(`/plataforma/comercios/${r.organizationId}`);

  // Solo el rechazo notifica: exige una acción del comercio. La aprobación
  // silenciosa evita ruido — el hito que sí se celebra es el avance de ciclo.
  if (veredicto === "rechazar") {
    const destinos = await correosAdminsComercio(r.organizationId);
    if (destinos.length > 0) {
      const titulo = RECAUDOS_REQUERIDOS.find((x) => x.tipo === r.tipo)?.titulo ?? r.tipo;
      void enviarCorreo({
        para: destinos,
        asunto: "Un documento necesita corrección",
        titulo: "Documento por corregir",
        parrafos: [
          `El documento "${titulo}" fue revisado y necesita corrección.`,
          `Motivo: ${nota}`,
          "Entra al panel de activación y súbelo de nuevo corregido; la revisión sigue apenas llegue.",
        ],
        boton: { texto: "Ir a la activación", url: `${URL_APP}/comercio/activacion` },
      });
    }
  }
  return { ok: true, mensaje: veredicto === "aprobar" ? "Documento aprobado." : "Documento rechazado con motivo." };
}

/** Aprueba una cuenta registrada por el comercio: desde acá ve pagos. */
export async function aprobarCuenta(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirRevision();

  const id = String(datos.get("id") ?? "");
  if (!id) return { ok: false, error: "Falta la cuenta." };

  const r = await db.bankAccount.update({
    where: { id },
    data: { isActive: true },
    select: { organizationId: true, accountNumber: true },
  });

  anotar(session, "cuenta_aprobada", `…${r.accountNumber.slice(-4)}`, r.organizationId);
  revalidatePath(`/plataforma/comercios/${r.organizationId}`);

  const destinos = await correosAdminsComercio(r.organizationId);
  if (destinos.length > 0) {
    void enviarCorreo({
      para: destinos,
      asunto: `Tu cuenta …${r.accountNumber.slice(-4)} fue aprobada`,
      titulo: "Cuenta bancaria aprobada",
      parrafos: [
        `La cuenta terminada en ${r.accountNumber.slice(-4)} quedó aprobada: desde ahora los pagos que reciba se atribuyen a tu comercio.`,
      ],
      boton: { texto: "Ver mi activación", url: `${URL_APP}/comercio/activacion` },
    });
  }
  return {
    ok: true,
    mensaje: `Cuenta …${r.accountNumber.slice(-4)} aprobada: la ingesta ya le atribuye pagos.`,
  };
}

// ── Usuarios internos de la plataforma (empleados nuestros) ─────────────────

const usuarioInternoSchema = z.object({
  nombre: z.string().trim().min(2, "Falta el nombre").max(120),
  usuario: usernameSchema,
  rol: z.enum(["PLATFORM_ADMIN", "PLATFORM_REVIEWER"]),
});

/**
 * Crea un empleado de la plataforma. Solo un administrador puede: crear
 * usuarios internos ES el poder de la plataforma. La contraseña se genera
 * larga (no es una caja: es alguien con acceso a datos de todos los
 * comercios) y se muestra UNA vez.
 */
export async function crearUsuarioInterno(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const parsed = usuarioInternoSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const usuario = normalizeUsername(parsed.data.usuario);
  const password = generarPassword(12);

  try {
    await db.user.create({
      data: {
        organizationId: null, // interno: no pertenece a ningún comercio
        username: usuario,
        passwordHash: await bcrypt.hash(password, 10),
        name: parsed.data.nombre,
        role: parsed.data.rol,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, error: "Ese nombre de usuario ya existe." };
    }
    throw e;
  }

  anotar(session, "interno_creado", `${usuario} (${parsed.data.rol})`);
  revalidatePath("/plataforma/usuarios");
  return {
    ok: true,
    mensaje:
      parsed.data.rol === "PLATFORM_REVIEWER"
        ? `${parsed.data.nombre} creada como revisora de expedientes.`
        : `${parsed.data.nombre} creado como administrador de plataforma.`,
    credenciales: { usuario, password },
  };
}

/** Activa/desactiva un usuario INTERNO. Nadie se desactiva a sí mismo. */
export async function alternarUsuarioInterno(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const id = String(datos.get("id") ?? "");
  if (!id) return { ok: false, error: "Falta el usuario." };
  if (id === session.user.id) {
    return { ok: false, error: "No puedes desactivarte a ti mismo." };
  }

  const objetivo = await db.user.findUnique({
    where: { id },
    select: { organizationId: true, isActive: true, tokenVersion: true },
  });
  if (!objetivo || objetivo.organizationId !== null) {
    return { ok: false, error: "Ese usuario no es interno de la plataforma." };
  }

  await db.user.update({
    where: { id },
    data: {
      isActive: !objetivo.isActive,
      // Desactivar mata las sesiones YA, no en la próxima expiración del JWT.
      ...(objetivo.isActive ? { tokenVersion: objetivo.tokenVersion + 1 } : {}),
    },
  });

  anotar(session, objetivo.isActive ? "interno_desactivado" : "interno_reactivado", id);
  revalidatePath("/plataforma/usuarios");
  return { ok: true, mensaje: objetivo.isActive ? "Usuario desactivado y sesiones cerradas." : "Usuario reactivado." };
}

// ── Contacto y notas del comercio (el CRM mínimo) ───────────────────────────

const contactoSchema = z.object({
  organizationId: z.string().min(1),
  contactoNombre: z.string().trim().max(120).optional(),
  contactoTelefono: z.string().trim().max(30).optional(),
  contactoEmail: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Revisa el correo")
    .optional(),
});

/** Guarda a quién llamar cuando algo pasa con el comercio. Revisora incluida. */
export async function guardarContactoComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  await exigirRevision();

  const parsed = contactoSchema.safeParse(Object.fromEntries(datos));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  await db.organization.update({
    where: { id: d.organizationId },
    data: {
      contactoNombre: d.contactoNombre || null,
      contactoTelefono: d.contactoTelefono || null,
      contactoEmail: d.contactoEmail || null,
    },
  });

  revalidatePath(`/plataforma/comercios/${d.organizationId}`);
  return { ok: true, mensaje: "Contacto guardado." };
}

/** Notas internas de la relación con el comercio. El comercio nunca las ve. */
export async function guardarNotasComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  await exigirRevision();

  const organizationId = String(datos.get("organizationId") ?? "");
  if (!organizationId) return { ok: false, error: "Falta el comercio." };
  const notas = String(datos.get("notasInternas") ?? "").trim().slice(0, 5000);

  await db.organization.update({
    where: { id: organizationId },
    data: { notasInternas: notas || null },
  });

  revalidatePath(`/plataforma/comercios/${organizationId}`);
  return { ok: true, mensaje: "Notas guardadas." };
}

/**
 * Cambia el plan de un comercio. Antes no existía UI para esto: todo comercio
 * nacía y MORÍA en PRUEBA (2 cajas, 1 sucursal) salvo UPDATE a mano — un
 * límite que muerde justo cuando el cliente quiere crecer. Solo ADMIN.
 */
export async function cambiarPlanComercio(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const organizationId = String(datos.get("organizationId") ?? "");
  const plan = String(datos.get("plan") ?? "");
  if (!organizationId) return { ok: false, error: "Falta el comercio." };
  if (!["PRUEBA", "COMERCIO", "CADENA"].includes(plan)) {
    return { ok: false, error: "Ese plan no existe." };
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { plan: plan as "PRUEBA" | "COMERCIO" | "CADENA" },
  });

  anotar(session, "plan_cambiado", plan, organizationId);
  revalidatePath(`/plataforma/comercios/${organizationId}`);
  revalidatePath("/plataforma/comercios");
  return { ok: true, mensaje: `Plan cambiado a ${plan}. Sus límites aplican ya.` };
}

/**
 * Resetea la contraseña de CUALQUIER usuario (admin de comercio, caja o
 * interno) y cierra sus sesiones. Es la salida cuando alguien pierde la clave:
 * antes de esto, un ORG_ADMIN sin clave era un UPDATE a mano en la base.
 * Exclusivo del PLATFORM_ADMIN; la nueva se muestra UNA vez.
 */
export async function resetearClaveDeUsuario(
  _previo: Resultado | null,
  datos: FormData
): Promise<Resultado> {
  const session = await exigirPlataforma();

  const userId = String(datos.get("userId") ?? "");
  if (!userId) return { ok: false, error: "Falta el usuario." };

  const objetivo = await db.user.findUnique({ where: { id: userId } });
  if (!objetivo) return { ok: false, error: "Ese usuario no existe." };
  if (objetivo.id === session.user.id) {
    return { ok: false, error: "Tu propia contraseña cámbiala desde Mi cuenta." };
  }

  // Cajas: clave corta dictable (la sostiene el freno del login). Resto: 12.
  const password = generarPassword(objetivo.role === "OPERATOR" ? undefined : 12);

  await db.user.update({
    where: { id: objetivo.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      tokenVersion: { increment: 1 },
    },
  });

  anotar(session, "clave_reseteada", objetivo.username, objetivo.organizationId);
  if (objetivo.organizationId) revalidatePath(`/plataforma/comercios/${objetivo.organizationId}`);
  revalidatePath("/plataforma/usuarios");
  return {
    ok: true,
    mensaje: `Contraseña de ${objetivo.username} reseteada. Tiene que entrar de nuevo.`,
    credenciales: { usuario: objetivo.username, password },
  };
}
