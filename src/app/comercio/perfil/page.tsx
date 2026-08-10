import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, KeyRound, Landmark, FileText, Zap } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import GestionLogo from "./GestionLogo";
import GestionContacto from "./GestionContacto";

export const dynamic = "force-dynamic";

/**
 * El perfil es la ficha del comercio VISTA POR SU DUEÑO: marca, datos
 * certificados, cuentas, credenciales y expediente. Después de la activación
 * es el único lugar donde el comercio ve todo esto (la página de activación
 * redirige a cierres una vez ACTIVA). Todo en solo lectura: cambiar una
 * credencial o una cuenta es un trámite con la plataforma, no un formulario.
 */

const LLAVE: Record<string, { texto: string; clase: string }> = {
  SIN_LLAVE: { texto: "Sin cargar", clase: "text-tinta-tenue" },
  CARGADA: { texto: "Cargada, sin probar", clase: "text-alerta" },
  VERIFICADA: { texto: "Verificada", clase: "text-ok" },
  INVALIDA: { texto: "Rechazada por el banco", clase: "text-error" },
};

const RECAUDO: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: "en revisión", clase: "bg-alerta-suave text-alerta" },
  APROBADO: { texto: "aprobado", clase: "bg-ok-suave text-ok" },
  RECHAZADO: { texto: "rechazado", clase: "bg-error-suave text-error" },
};

export default async function PerfilPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/perfil");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const datos = await withSessionTenant(session, async () => {
    const [comercio, cuentas, recaudos] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: {
          id: true,
          razonSocial: true,
          rif: true,
          contactoNombre: true,
          contactoTelefono: true,
          contactoEmail: true,
          logoMime: true,
          logoUpdatedAt: true,
          authKeyStatus: true,
          authKeyHint: true,
          lastVerifiedAt: true,
          btCredStatus: true,
          btCredVerifiedAt: true,
          btCodSocio: true,
          btAppUser: true,
          btAppKeyHint: true,
          btCodAfiliado: true,
          btC2pEnabled: true,
          btC2pVerifiedAt: true,
        },
      }),
      prisma.bankAccount.findMany({ orderBy: { accountNumber: "asc" } }),
      prisma.recaudo.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, tipo: true, nombre: true, status: true, nota: true },
      }),
    ]);
    return { comercio, cuentas, recaudos };
  });

  const { comercio, cuentas, recaudos } = datos;
  const logoUrl = logoUrlDe(comercio);
  const llave = LLAVE[comercio?.authKeyStatus ?? "SIN_LLAVE"] ?? LLAVE.SIN_LLAVE;
  const credBt = LLAVE[comercio?.btCredStatus ?? "SIN_LLAVE"] ?? LLAVE.SIN_LLAVE;
  const tieneBdt = cuentas.some((c) => c.banco === "BDT");
  const tieneBt = cuentas.some((c) => c.banco === "BT");

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        logoUrl={logoUrl}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Perfil</h1>
        <p className="mb-6 mt-1 text-sm text-tinta-tenue">
          La ficha de tu comercio: tu marca, tus datos certificados, tus cuentas,
          el estado de tus credenciales bancarias y los documentos de tu
          expediente.
        </p>

        <div className="mb-6 rounded-card border border-tinta-borde bg-white p-6">
          <p className="text-sm text-tinta-tenue">Razón social certificada</p>
          <p className="mt-0.5 font-medium text-tinta">{comercio?.razonSocial}</p>
          <p className="mt-2 text-sm text-tinta-tenue">RIF</p>
          <p className="mt-0.5 font-mono text-sm text-tinta">{comercio?.rif}</p>
        </div>

        <GestionLogo logoUrl={logoUrl} />

        <GestionContacto
          contactoNombre={comercio?.contactoNombre ?? null}
          contactoTelefono={comercio?.contactoTelefono ?? null}
          contactoEmail={comercio?.contactoEmail ?? null}
        />

        {/* Cuentas afiliadas */}
        <section className="mt-6 rounded-card border border-tinta-borde bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
            <Landmark className="h-4 w-4 text-marca-700" aria-hidden />
            Cuentas afiliadas
          </h2>
          {cuentas.length === 0 ? (
            <p className="mt-2 text-sm text-tinta-tenue">Ninguna todavía.</p>
          ) : (
            <ul className="mt-3 divide-y divide-tinta-borde">
              {cuentas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="rounded-control bg-tinta-fondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                    {c.banco}
                  </span>
                  <span className="font-mono text-tinta">{c.accountNumber}</span>
                  <span className="text-tinta-tenue">{c.alias}</span>
                  <span className={`ml-auto text-xs font-medium ${c.isActive ? "text-ok" : "text-alerta"}`}>
                    {c.isActive ? "aprobada" : "por aprobar"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Credenciales: estados y pistas — nunca los valores */}
        <section className="mt-6 rounded-card border border-tinta-borde bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
            <KeyRound className="h-4 w-4 text-marca-700" aria-hidden />
            Credenciales bancarias
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            {tieneBdt && (
              <li>
                <p className="text-tinta-suave">Llave de Trabajo (BDT)</p>
                <p className={`font-medium ${llave.clase}`}>
                  {llave.texto}
                  {comercio?.authKeyHint && (
                    <span className="ml-2 font-mono text-xs text-tinta-tenue">{comercio.authKeyHint}</span>
                  )}
                </p>
                {comercio?.lastVerifiedAt && (
                  <p className="text-xs text-tinta-tenue">
                    Última verificación: {new Date(comercio.lastVerifiedAt).toLocaleString("es-VE")}
                  </p>
                )}
              </li>
            )}
            {tieneBt && (
              <li>
                <p className="text-tinta-suave">Identificador de Pagos (Tesoro)</p>
                <p className={`font-medium ${credBt.clase}`}>
                  {credBt.texto}
                  {comercio?.btAppKeyHint && (
                    <span className="ml-2 font-mono text-xs text-tinta-tenue">{comercio.btAppKeyHint}</span>
                  )}
                </p>
                {(comercio?.btCodSocio || comercio?.btAppUser) && (
                  <p className="text-xs text-tinta-tenue">
                    {comercio?.btCodSocio && <>Cod. Socio {comercio.btCodSocio}</>}
                    {comercio?.btCodSocio && comercio?.btAppUser && " · "}
                    {comercio?.btAppUser && <>usuario {comercio.btAppUser}</>}
                  </p>
                )}
              </li>
            )}
            {comercio?.btCodAfiliado && (
              <li>
                <p className="flex items-center gap-1.5 text-tinta-suave">
                  <Zap className="h-3.5 w-3.5 text-marca-700" aria-hidden />
                  C2P del Tesoro (Botón de Pago)
                </p>
                <p
                  className={`font-medium ${
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
                    : `Afiliado ${comercio.btCodAfiliado} · apagado`}
                </p>
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-tinta-tenue">
            Por seguridad las credenciales nunca se muestran completas. Para
            rotar o corregir una, escríbenos.
          </p>
        </section>

        {/* Expediente */}
        <section className="mt-6 rounded-card border border-tinta-borde bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
            <FileText className="h-4 w-4 text-marca-700" aria-hidden />
            Documentos de tu expediente
          </h2>
          {recaudos.length === 0 ? (
            <p className="mt-2 text-sm text-tinta-tenue">No has subido documentos.</p>
          ) : (
            <ul className="mt-3 divide-y divide-tinta-borde">
              {recaudos.map((r) => {
                const chip = RECAUDO[r.status] ?? RECAUDO.PENDIENTE;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="font-medium text-tinta">{r.tipo.replace(/_/g, " ")}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.clase}`}>
                      {chip.texto}
                    </span>
                    <a
                      href={`/api/recaudo/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-tinta-tenue hover:text-tinta"
                    >
                      {r.nombre}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="mt-6 text-sm text-tinta-tenue">
          ¿Buscas tus llaves de API y webhooks? Están en{" "}
          <Link href="/comercio/api" className="font-medium text-marca-700 hover:underline">
            la sección API
          </Link>
          .
        </p>
      </main>
    </>
  );
}
