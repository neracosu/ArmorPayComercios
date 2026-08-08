import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import { RECAUDOS_REQUERIDOS } from "@/lib/recaudos";
import PanelActivacion, { type RecaudoVista } from "./PanelActivacion";

export const dynamic = "force-dynamic";

const PASOS = [
  { estado: "REGISTRADA", titulo: "Registrado" },
  { estado: "RECAUDOS_COMPLETOS", titulo: "Recaudos completos" },
  { estado: "ENVIADA_AL_BANCO", titulo: "Enviada al banco" },
  { estado: "CERTIFICACION", titulo: "Certificación" },
  { estado: "ACTIVA", titulo: "Activo" },
];

/**
 * El paso a paso de activación, del lado del COMERCIO: dónde va su alta, qué
 * le toca a él (documentos, cuentas, llave) y qué está de nuestro lado. La
 * contraparte accionable vive en la ficha de plataforma.
 */
export default async function ActivacionPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio/activacion");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const { comercio, recaudos, cuentas } = await withSessionTenant(session, async () => {
    const [comercio, recaudos, cuentas] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: {
          id: true,
          razonSocial: true,
          status: true,
          authKeyStatus: true,
          authKeyHint: true,
          btCredStatus: true,
          btAppKeyHint: true,
          btCodSocio: true,
          btAppUser: true,
          gestionBanco: true,
          logoMime: true,
          logoUpdatedAt: true,
        },
      }),
      prisma.recaudo.findMany({
        select: { tipo: true, nombre: true, status: true, nota: true },
      }),
      prisma.bankAccount.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, accountNumber: true, banco: true, alias: true, isActive: true },
      }),
    ]);
    return { comercio, recaudos, cuentas };
  });

  // Un comercio activo no tiene nada que hacer acá.
  if (comercio?.status === "ACTIVA") redirect("/comercio/cierres");

  const porTipo = new Map(recaudos.map((r) => [r.tipo, r]));
  const vistaRecaudos: RecaudoVista[] = RECAUDOS_REQUERIDOS.map((req) => {
    const subido = porTipo.get(req.tipo);
    return {
      tipo: req.tipo,
      titulo: req.titulo,
      detalle: req.detalle,
      status: subido ? subido.status : "SIN_SUBIR",
      nombre: subido?.nombre ?? null,
      nota: subido?.nota ?? null,
    };
  });

  const indice = PASOS.findIndex((p) => p.estado === comercio?.status);

  return (
    <>
      <Cabecera
        comercio={comercio?.razonSocial ?? "—"}
        logoUrl={logoUrlDe(comercio)}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
          Activación de tu comercio
        </h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Completa estos pasos y nosotros avanzamos tu aprobación. Acá mismo ves
          el estatus de cada cosa.
        </p>

        {comercio?.status === "RECHAZADA" ? (
          <p className="mt-6 rounded-card border border-error/40 bg-error-suave/50 p-5 text-sm text-error">
            Tu solicitud fue rechazada. Si crees que es un error, escríbenos
            desde la página de propuesta.
          </p>
        ) : (
          <ol className="mt-5 flex flex-wrap items-center gap-1.5 text-xs">
            {PASOS.map((p, i) => (
              <li key={p.estado} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3 w-3 text-tinta-tenue" aria-hidden />}
                <span
                  className={`rounded-control px-2 py-1 font-medium ${
                    i < indice
                      ? "bg-ok-suave text-ok"
                      : i === indice
                        ? "bg-marca-700 text-white"
                        : "bg-tinta-fondo text-tinta-tenue"
                  }`}
                >
                  {p.titulo}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-8">
          <PanelActivacion
            recaudos={vistaRecaudos}
            cuentas={cuentas.map((c) => ({
              id: c.id,
              numero: c.accountNumber,
              banco: c.banco,
              alias: c.alias,
              isActive: c.isActive,
            }))}
            llaveStatus={comercio?.authKeyStatus ?? "SIN_LLAVE"}
            llaveHint={comercio?.authKeyHint ?? null}
            gestionBanco={comercio?.gestionBanco ?? null}
            btStatus={comercio?.btCredStatus ?? "SIN_LLAVE"}
            btHint={comercio?.btAppKeyHint ?? null}
            btCodSocio={comercio?.btCodSocio ?? null}
            btAppUser={comercio?.btAppUser ?? null}
          />
        </div>
      </main>
    </>
  );
}
