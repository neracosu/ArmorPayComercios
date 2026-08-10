import Link from "next/link";
import { notFound } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { getVerifiedSession } from "@/lib/session-guard";
import { AlertTriangle, ArrowLeft, KeyRound, Zap } from "lucide-react";
import { logoUrlDe } from "@/lib/logo";
import { describeC2p } from "../../../../../gateway/bt-c2p-codes";
import CrearAdmin from "./CrearAdmin";
import { FormularioLlave, FormularioCredencialesBt, FormularioCuenta } from "./LlaveYCuentas";
import { FormularioC2p, FormularioLogo } from "./AfiliacionYLogo";
import CicloActivacion from "./CicloActivacion";
import { ZonaPeligro } from "./ZonaPeligro";
import { FilaRecaudoRevision, FilaCuentaPorAprobar } from "./RevisionExpediente";

export const dynamic = "force-dynamic";

const db = new PrismaClient();

const ROL: Record<string, string> = {
  PLATFORM_ADMIN: "Plataforma",
  ORG_ADMIN: "Administrador",
  OPERATOR: "Caja",
};

const LLAVE: Record<string, { texto: string; clase: string }> = {
  SIN_LLAVE: { texto: "Sin llave cargada", clase: "text-tinta-tenue" },
  CARGADA: { texto: "Cargada, sin probar contra el banco", clase: "text-alerta" },
  VERIFICADA: { texto: "Verificada", clase: "text-ok" },
  INVALIDA: { texto: "Rechazada por el banco", clase: "text-error" },
};

const CRED_BT: Record<string, { texto: string; clase: string }> = {
  SIN_LLAVE: { texto: "Sin credenciales cargadas", clase: "text-tinta-tenue" },
  CARGADA: { texto: "Cargadas, vinculación sin confirmar", clase: "text-alerta" },
  VERIFICADA: { texto: "Vinculación confirmada", clase: "text-ok" },
  INVALIDA: { texto: "Marcadas inválidas", clase: "text-error" },
};

export default async function ComercioPage({ params }: { params: { id: string } }) {
  const session = await getVerifiedSession();
  const comercio = await db.organization.findUnique({
    where: { id: params.id },
    include: {
      users: { orderBy: { username: "asc" } },
      accounts: { orderBy: { accountNumber: "asc" } },
      branches: { orderBy: { name: "asc" } },
      keyEvents: { orderBy: { createdAt: "desc" }, take: 10 },
      recaudos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!comercio) notFound();

  const [pagos, cobros] = await Promise.all([
    db.bankTransaction.count({ where: { organizationId: comercio.id } }),
    db.paymentClaim.count({ where: { organizationId: comercio.id } }),
  ]);

  const llave = LLAVE[comercio.authKeyStatus] ?? {
    texto: comercio.authKeyStatus,
    clase: "text-tinta-tenue",
  };
  const credBt = CRED_BT[comercio.btCredStatus] ?? {
    texto: comercio.btCredStatus,
    clase: "text-tinta-tenue",
  };
  // Qué credencial le aplica: se deduce del banco de sus cuentas. Si no tiene
  // cuentas todavía, ambas aparecen como opcionales en el checklist.
  const tieneCuentaBdt = comercio.accounts.some((a) => a.banco === "BDT");
  const tieneCuentaBt = comercio.accounts.some((a) => a.banco === "BT");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/plataforma/comercios"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue hover:text-tinta"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Comercios
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-tinta">
        {comercio.razonSocial}
      </h1>
      <p className="mt-1 text-sm text-tinta-tenue">
        {comercio.rif} · {pagos} pago(s) recibido(s) · {cobros} cobro(s)
      </p>

      {/* La ficha creció: anclas para no bucear. */}
      <nav className="mt-4 flex flex-wrap gap-1.5 text-sm" aria-label="Secciones de la ficha">
        {[
          ["#activacion", "Activación"],
          ["#recaudos", "Recaudos"],
          ["#cuentas", "Cuentas"],
          ["#llave", "Llave BDT"],
          ["#credbt", "Credenciales BT"],
          ["#c2p", "C2P"],
          ["#logo", "Logo"],
          ["#usuarios", "Usuarios"],
          ["#sucursales", "Sucursales"],
        ].map(([href, texto]) => (
          <a
            key={href}
            href={href}
            className="rounded-control border border-tinta-borde bg-white px-2.5 py-1 text-tinta-suave hover:bg-tinta-fondo"
          >
            {texto}
          </a>
        ))}
      </nav>

      {/* El ciclo de activación: dónde va el alta y qué falta */}
      <section id="activacion" className="mt-6 scroll-mt-4 rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="font-display font-bold tracking-tight text-tinta">Activación</h2>
        <p className="mt-1 text-sm font-medium">
          {comercio.gestionBanco === "GESTIONAMOS" ? (
            <span className="text-alerta">
              ⚑ El comercio pidió que NOSOTROS gestionemos su afiliación bancaria
              (credenciales y llave) — el paso «enviada al banco» es trabajo nuestro.
            </span>
          ) : comercio.gestionBanco === "TRAE_AFILIACION" ? (
            <span className="text-ok">
              El comercio trae su afiliación — falta coordinar con el banco la
              vinculación con nuestra plataforma (paso «enviada al banco»).
            </span>
          ) : (
            <span className="text-tinta-tenue">
              El comercio aún no indicó si trae su afiliación bancaria.
            </span>
          )}
        </p>
        <CicloActivacion
          organizationId={comercio.id}
          status={comercio.status}
          puedeActivar={session?.user.role === "PLATFORM_ADMIN"}
          checklist={[
            {
              etiqueta: `Cuenta bancaria activa (${comercio.accounts.filter((a) => a.isActive).length})`,
              listo: comercio.accounts.some((a) => a.isActive),
              requerido: true,
            },
            {
              etiqueta:
                comercio.authKeyStatus === "VERIFICADA"
                  ? "Llave de Trabajo BDT verificada"
                  : `Llave de Trabajo BDT (${comercio.authKeyStatus.toLowerCase().replace(/_/g, " ")})`,
              listo: comercio.authKeyStatus === "VERIFICADA",
              requerido: tieneCuentaBdt,
            },
            {
              etiqueta:
                comercio.btCredStatus === "VERIFICADA"
                  ? "Credenciales BT vinculadas"
                  : `Credenciales BT (${comercio.btCredStatus === "SIN_LLAVE" ? "sin cargar" : comercio.btCredStatus.toLowerCase()})`,
              listo: comercio.btCredStatus === "VERIFICADA",
              requerido: tieneCuentaBt,
            },
            {
              etiqueta: "Usuario administrador creado",
              listo: comercio.users.length > 0,
              requerido: true,
            },
            {
              etiqueta: comercio.btC2pEnabled
                ? "C2P habilitado"
                : comercio.btCodAfiliado
                  ? "C2P: afiliación cargada, sin habilitar"
                  : "C2P del Tesoro",
              listo: comercio.btC2pEnabled,
              requerido: false,
            },
            { etiqueta: "Logo cargado", listo: Boolean(comercio.logoMime), requerido: false },
          ]}
        />
      </section>

      {/* Llave de Trabajo: es lo que hace que su validador funcione */}
      <section id="llave" className="mt-6 scroll-mt-4 rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-tinta">
          <KeyRound className="h-4 w-4 text-marca-700" aria-hidden />
          Llave de Trabajo del BDT
          {!tieneCuentaBdt && (
            <span className="rounded-full bg-tinta-fondo px-2 py-0.5 text-xs font-medium text-tinta-tenue">
              sin cuentas BDT — no aplica
            </span>
          )}
        </h2>
        <p className={`mt-2 text-sm font-medium ${llave.clase}`}>{llave.texto}</p>
        {comercio.authKeyHint && (
          <p className="mt-1 font-mono text-sm text-tinta-tenue">{comercio.authKeyHint}</p>
        )}
        {comercio.lastVerifiedAt && (
          <p className="mt-1 text-sm text-tinta-tenue">
            Última verificación: {new Date(comercio.lastVerifiedAt).toLocaleString("es-VE")}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-tinta-tenue">
          El banco emite una llave por RIF, no por cuenta: este comercio usa la
          misma para todas sus cuentas, y rotarla las afecta a todas.
        </p>
        <FormularioLlave
          organizationId={comercio.id}
          tieneLlave={comercio.authKeyStatus !== "SIN_LLAVE"}
        />

        {comercio.keyEvents.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-tinta-suave">
              Historial de la llave ({comercio.keyEvents.length})
            </summary>
            <ul className="mt-2 space-y-1.5 text-sm text-tinta-tenue">
              {comercio.keyEvents.map((e) => (
                <li key={e.id}>
                  <span className="text-tinta">{e.action}</span> ·{" "}
                  {new Date(e.createdAt).toLocaleString("es-VE")}
                  {e.detail ? ` · ${e.detail}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Credenciales BT: la contraparte de la llave para cuentas del Tesoro */}
      <section id="credbt" className="mt-6 scroll-mt-4 rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-tinta">
          <KeyRound className="h-4 w-4 text-marca-700" aria-hidden />
          Credenciales BT (Cod_Socio · app_user · app_key)
          {!tieneCuentaBt && (
            <span className="rounded-full bg-tinta-fondo px-2 py-0.5 text-xs font-medium text-tinta-tenue">
              sin cuentas BT — no aplica
            </span>
          )}
        </h2>
        <p className={`mt-2 text-sm font-medium ${credBt.clase}`}>{credBt.texto}</p>
        {(comercio.btCodSocio || comercio.btAppUser || comercio.btAppKeyHint) && (
          <p className="mt-1 font-mono text-sm text-tinta-tenue">
            {[
              comercio.btCodSocio && `Cod_Socio ${comercio.btCodSocio}`,
              comercio.btAppUser && `app_user ${comercio.btAppUser}`,
              comercio.btAppKeyHint && `app_key ${comercio.btAppKeyHint}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {comercio.btCredVerifiedAt && (
          <p className="mt-1 text-sm text-tinta-tenue">
            Vinculación confirmada: {new Date(comercio.btCredVerifiedAt).toLocaleString("es-VE")}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-tinta-tenue">
          Si el banco ya se las entregó al comercio, él las pega en su panel de
          activación; si gestionamos nosotros la afiliación, se cargan acá.
          Probar contra el banco hace el login del Identificador de Pagos: si
          el Tesoro entrega sesión, las credenciales sirven.
        </p>
        <FormularioCredencialesBt
          organizationId={comercio.id}
          tieneCredenciales={comercio.btCredStatus !== "SIN_LLAVE"}
        />
      </section>

      {/* Afiliación C2P: el segundo método de cobro del checkout */}
      <section id="c2p" className="mt-6 scroll-mt-4 rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-tinta">
          <Zap className="h-4 w-4 text-marca-700" aria-hidden />
          C2P del Tesoro (Botón de Pago)
        </h2>
        <p
          className={`mt-2 text-sm font-medium ${
            !comercio.btC2pEnabled
              ? "text-tinta-tenue"
              : comercio.btC2pVerifiedAt
                ? "text-ok"
                : "text-alerta"
          }`}
        >
          {comercio.btC2pEnabled
            ? comercio.btC2pVerifiedAt
              ? `Verificado en producción · afiliado ${comercio.btCodAfiliado}`
              : `Habilitado, sin probar · afiliado ${comercio.btCodAfiliado}`
            : comercio.btCodAfiliado
              ? `Afiliado ${comercio.btCodAfiliado} · apagado`
              : "Sin afiliación cargada"}
        </p>
        {comercio.btC2pEnabled &&
          (comercio.btC2pVerifiedAt ? (
            <p className="mt-1 text-xs text-tinta-tenue">
              Primer cobro aprobado: {new Date(comercio.btC2pVerifiedAt).toLocaleString("es-VE")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-tinta-tenue">
              El banco no da cómo probar un afiliado sin cobrar: pasará a verificado solo con el
              primer cobro real aprobado.
            </p>
          ))}
        {comercio.btC2pUltimoRebote && (
          <p className="mt-2 flex items-start gap-2 rounded-control bg-error-suave px-3 py-2.5 text-sm text-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              El banco rebotó el último cobro por la afiliación —{" "}
              {describeC2p(comercio.btC2pUltimoRebote).headline} ({comercio.btC2pUltimoRebote}).
              Revisa el código y el estado del afiliado con el banco; un cobro aprobado limpia esta
              alerta.
            </span>
          </p>
        )}
        <FormularioC2p
          organizationId={comercio.id}
          codAfiliado={comercio.btCodAfiliado}
          habilitado={comercio.btC2pEnabled}
        />
      </section>

      {/* Logo: su marca en las cajas y en la página de pago */}
      <section id="logo" className="mt-6 scroll-mt-4 rounded-card border border-tinta-borde bg-white p-5">
        <h2 className="font-display font-bold tracking-tight text-tinta">Logo</h2>
        <FormularioLogo organizationId={comercio.id} logoUrl={logoUrlDe(comercio)} />
      </section>

      {/* Expediente subido por el comercio */}
      <section id="recaudos" className="mt-6 scroll-mt-4">
        <h2 className="font-display font-bold tracking-tight text-tinta">Recaudos</h2>
        {comercio.recaudos.length === 0 ? (
          <p className="mt-2 text-sm text-tinta-tenue">
            El comercio no ha subido documentos todavía.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {comercio.recaudos.map((r) => (
              <FilaRecaudoRevision
                key={r.id}
                recaudo={{ id: r.id, tipo: r.tipo, nombre: r.nombre, status: r.status, nota: r.nota }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Cuentas */}
      <section id="cuentas" className="mt-6 scroll-mt-4">
        <h2 className="font-display font-bold tracking-tight text-tinta">Cuentas afiliadas</h2>
        {comercio.accounts.length === 0 ? (
          <p className="mt-2 text-sm text-tinta-tenue">
            Ninguna todavía. Sin cuenta afiliada, sus cajas no ven pagos.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {comercio.accounts.map((a) =>
              a.isActive ? (
                <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-mono text-tinta">{a.accountNumber}</span>
                  <span className="text-tinta-tenue">
                    {a.banco} · {a.alias}
                  </span>
                </li>
              ) : (
                <FilaCuentaPorAprobar
                  key={a.id}
                  cuenta={{
                    id: a.id,
                    accountNumber: a.accountNumber,
                    banco: a.banco,
                    alias: a.alias,
                  }}
                />
              )
            )}
          </ul>
        )}
        <FormularioCuenta organizationId={comercio.id} />
      </section>

      {/* Usuarios */}
      <section id="usuarios" className="mt-8 scroll-mt-4">
        <h2 className="font-display font-bold tracking-tight text-tinta">Usuarios</h2>
        <p className="mb-3 mt-1 text-sm text-tinta-tenue">
          El administrador del comercio crea sus propias cajas. Nosotros solo
          creamos al administrador.
        </p>

        {comercio.users.length > 0 && (
          <ul className="mb-4 divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
            {comercio.users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-tinta">{u.username}</span>
                  <span className="text-tinta-tenue"> · {u.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  {!u.isActive && (
                    <span className="rounded-control bg-error-suave px-2 py-0.5 text-xs text-error">
                      inactivo
                    </span>
                  )}
                  <span className="text-tinta-tenue">{ROL[u.role] ?? u.role}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <CrearAdmin organizationId={comercio.id} slug={comercio.slug} />
      </section>

      <section id="sucursales" className="mt-8 scroll-mt-4">
        <h2 className="font-display font-bold tracking-tight text-tinta">Sucursales</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {comercio.branches.map((b) => (
            <li
              key={b.id}
              className="rounded-control border border-tinta-borde bg-white px-3 py-1.5 text-sm text-tinta-suave"
            >
              {b.name} <span className="text-tinta-tenue">({b.code})</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Borrado total: solo el PLATFORM_ADMIN — la revisora ni lo ve */}
      {session?.user.role === "PLATFORM_ADMIN" && (
        <ZonaPeligro
          organizationId={comercio.id}
          rif={comercio.rif}
          razonSocial={comercio.razonSocial}
        />
      )}
    </main>
  );
}
