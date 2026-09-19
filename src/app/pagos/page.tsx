import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia } from "@/lib/operacion";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import {
  TABLA,
  TBODY,
  TD,
  TD_FIJO,
  TD_NUM,
  TD_RELLENO,
  TFOOT,
  TH,
  THEAD,
  TR,
  TR_CAB,
  TR_PIE,
} from "@/components/tabla-reporte";
import {
  BANCO_TEXTO,
  bancoPagadorTexto,
  fechaBanco,
  horaBanco,
  listarPagos,
  parseBanco,
  parseBusqueda,
} from "@/app/comercio/movimientos";
import MovimientosDeCaja from "./MovimientosDeCaja";
import { BarraFiltros, CeldaBanco, Doble, bs, horaVe, urlPagos } from "./partes";

export const dynamic = "force-dynamic";

/**
 * /pagos tiene DOS vistas según el rol, y la frontera es de seguridad:
 *
 * - El dueño (ORG_ADMIN) ve los pagos que el banco notificó HOY a todas sus
 *   cuentas, con todo el detalle, para cruzarlos contra el estado de cuenta.
 * - La caja (OPERATOR) ve SOLO lo suyo — `MovimientosDeCaja`. Se desvía antes
 *   de leer nada del comercio: lo que entra a las cuentas, los totales del
 *   día y lo que cobraron las otras cajas son del dueño. La primera versión
 *   (2026-09-16) se lo mostraba a todas las cajas; corregido el 2026-09-18.
 *
 * Mismo día de operación que el resto de la caja (`inicioDelDia`, hora de
 * Venezuela).
 */

/** Tope de filas de un día; ningún comercio del plan se acerca. */
const TOPE = 1000;

export default async function PagosPage({
  searchParams,
}: {
  searchParams: { banco?: string; q?: string };
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/pagos");
  if (session.user.role === "PLATFORM_ADMIN") redirect("/plataforma/solicitudes");
  if (session.user.role === "PLATFORM_REVIEWER") redirect("/plataforma/comercios");

  const banco = parseBanco(searchParams.banco);
  const q = parseBusqueda(searchParams.q);

  // Todo lo que sigue es del dueño. Cualquier otro rol con comercio es una
  // caja y ve solo lo suyo: comparar contra ORG_ADMIN (y no contra OPERATOR)
  // hace que un rol nuevo nazca del lado seguro.
  if (session.user.role !== "ORG_ADMIN") {
    return <MovimientosDeCaja session={session} banco={banco} q={q} />;
  }

  const { comercio, pagos, cuentas } = await withSessionTenant(session, async () => {
    const [comercio, pagos, cuentas] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { id: true, razonSocial: true, status: true, logoMime: true, logoUpdatedAt: true },
      }),
      listarPagos({ banco, q, desde: inicioDelDia(), take: TOPE }),
      // El alias de la cuenta ("Caja principal") dice más que 20 dígitos.
      prisma.bankAccount.findMany({ select: { accountNumber: true, alias: true } }),
    ]);
    return { comercio, pagos, cuentas };
  });

  // Comercio sin activar: mismo destino que el resto del panel del dueño.
  if (comercio?.status !== "ACTIVA") redirect("/comercio/activacion");

  const aliasDe = new Map(cuentas.map((c) => [c.accountNumber, c.alias?.trim() ?? ""]));
  const hoyIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const sinCobrar = pagos.filter((p) => !p.cobrado);
  const montoSinCobrar = sinCobrar.reduce((s, p) => s + p.monto, 0);
  const hoyTexto = new Date().toLocaleDateString("es-VE", {
    timeZone: "America/Caracas",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <Cabecera
        comercio={comercio.razonSocial}
        logoUrl={logoUrlDe(comercio)}
        usuario={session.user.name}
        turnoAbierto={false}
        esAdminComercio
        ancho
      />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
              Pagos recibidos hoy
            </h1>
            <p className="mt-1 text-sm text-tinta-tenue">
              Todo lo que el banco notificó a tus cuentas el {hoyTexto}, con el detalle
              completo de cada pago.
            </p>
          </div>
          <a
            href={urlPagos(banco, "/pagos/export", q)}
            className="rounded-control border border-tinta-borde bg-white px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
          >
            Descargar CSV (hoy)
          </a>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Recibido hoy</p>
            <p className="monto mt-1">Bs {bs(total)}</p>
            <p className="mt-1 text-sm text-tinta-tenue">{pagos.length} pago(s)</p>
          </div>
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Sin cobrar todavía</p>
            <p className="monto mt-1">Bs {bs(montoSinCobrar)}</p>
            <p className="mt-1 text-sm text-tinta-tenue">
              {sinCobrar.length} pago(s) que ninguna caja ha tomado
            </p>
          </div>
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Ya cobrados</p>
            <p className="monto mt-1">Bs {bs(total - montoSinCobrar)}</p>
            <p className="mt-1 text-sm text-tinta-tenue">
              {pagos.length - sinCobrar.length} pago(s) entregados en caja o tienda
            </p>
          </div>
        </div>

        <BarraFiltros
          banco={banco}
          q={q}
          etiqueta="Buscar en los pagos de hoy"
          placeholder="Referencia, cédula, teléfono, concepto o monto"
        />

        {pagos.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-tinta-borde bg-white p-8 text-center text-sm text-tinta-tenue">
            {q
              ? `Ningún pago de hoy coincide con «${q}»${banco ? ` en ${BANCO_TEXTO[banco]}` : ""}.`
              : banco
                ? `El ${BANCO_TEXTO[banco]} no ha notificado pagos hoy.`
                : "El banco no ha notificado pagos hoy. En cuanto entre uno, aparece acá."}
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-card border border-tinta-borde bg-white">
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr className={TR_CAB}>
                  <th className={TH}>Hora</th>
                  <th className={TH}>Banco</th>
                  <th className={TH}>Cuenta</th>
                  <th className={TH}>Referencia</th>
                  <th className={`${TH} text-right`}>Monto Bs</th>
                  <th className={TH}>Pagador</th>
                  <th className={TH}>Banco pagador</th>
                  <th className={TH}>Descripción</th>
                  <th className={TH}>Cobrado</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {pagos.map((p) => {
                  const alias = aliasDe.get(p.cuenta) ?? "";
                  return (
                    <tr key={p.id} className={TR}>
                      {/* Hora que reporta el banco; debajo, cuándo nos llegó (y
                          la fecha, si el banco notificó hoy un pago de otro día). */}
                      <td className={`${TD_FIJO} text-tinta-suave`} data-label="Hora">
                        <Doble
                          arriba={horaBanco(p.horaBanco)}
                          abajo={`${p.fechaBanco !== hoyIso ? `${fechaBanco(p.fechaBanco)} · ` : ""}llegó ${horaVe(p.recibidoAt)}${
                            p.origen !== "Notificación" ? ` · ${p.origen.toLowerCase()}` : ""
                          }`}
                        />
                      </td>
                      <td className={`${TD} text-tinta`} data-label="Banco">
                        <CeldaBanco banco={p.banco} />
                      </td>
                      <td className={`${TD_FIJO} text-tinta-suave`} data-label="Cuenta">
                        <Doble arriba={alias || `…${p.cuenta.slice(-4)}`} abajo={p.cuenta} />
                      </td>
                      <td className={`${TD_FIJO} font-medium text-tinta`} data-label="Referencia">
                        {p.referencia}
                      </td>
                      <td className={`${TD_NUM} font-medium text-tinta`} data-label="Monto Bs">
                        {bs(p.monto)}
                      </td>
                      <td className={`${TD} text-tinta-suave`} data-label="Pagador">
                        <Doble arriba={p.pagador} abajo={p.cedula || undefined} />
                      </td>
                      <td className={`${TD} text-tinta-suave`} data-label="Banco pagador">
                        <span className="block break-words">
                          {bancoPagadorTexto(p.bancoPagador) || "—"}
                        </span>
                      </td>
                      <td className={`${TD} text-tinta-suave`} data-label="Descripción">
                        <span className="block break-words">{p.descripcion || "—"}</span>
                      </td>
                      <td className={TD} data-label="Cobrado">
                        {p.cobrado ? (
                          <Doble arriba="sí" abajo={p.cobradoPor} />
                        ) : (
                          <span className="rounded-control bg-alerta-suave px-2 py-0.5 text-xs font-medium text-alerta">
                            sin cobrar
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className={TFOOT}>
                <tr className={TR_PIE}>
                  <td className={TD} colSpan={4} data-label="">
                    Total ({pagos.length} pago{pagos.length === 1 ? "" : "s"})
                  </td>
                  <td className={TD_NUM} data-label="Monto Bs">
                    {bs(total)}
                  </td>
                  <td className={TD_RELLENO} colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
