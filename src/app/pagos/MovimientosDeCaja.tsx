import { redirect } from "next/navigation";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia, turnoAbierto } from "@/lib/operacion";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import ListaConsultas, { SELECT_CONSULTA } from "@/components/ListaConsultas";
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
import { BANCO_TEXTO, bancoPagadorTexto, listarCobros, type Banco } from "@/app/comercio/movimientos";
import { BarraFiltros, CeldaBanco, Doble, bs, horaVe } from "./partes";

type Sesion = NonNullable<Awaited<ReturnType<typeof getVerifiedSession>>>;

/** Tope de filas; ninguna caja se acerca en un día. */
const TOPE = 500;

function fechaCortaVe(d: Date): string {
  return d.toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit" });
}

/**
 * Lo que ve una CAJA en /pagos: solo lo suyo — los cobros que ella validó y
 * las consultas que ella le hizo al banco. Nunca lo que entró a las cuentas
 * del comercio ni lo que cobraron las demás cajas: eso es del dueño
 * (2026-09-18: la primera versión de /pagos le mostraba a cada caja la
 * facturación del día completa, con totales y CSV).
 *
 * Las dos lecturas van SIEMPRE acotadas por `userId` de la sesión. No hay
 * lista de pagos sin cobrar a propósito: con la referencia completa a la
 * vista, una caja podría cobrar un pago ajeno. Para el «ya pagué y no
 * aparece» está el buscador de /validar, que exige el final de la referencia.
 */
export default async function MovimientosDeCaja({
  session,
  banco,
  q,
}: {
  session: Sesion;
  banco: Banco | undefined;
  q: string;
}) {
  const userId = session.user.id;

  const { comercio, turno, hoy, desde, cobros, consultas } = await withSessionTenant(
    session,
    async () => {
      const [comercio, turno] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: session.user.organizationId! },
          select: { id: true, razonSocial: true, status: true, logoMime: true, logoUpdatedAt: true },
        }),
        turnoAbierto(userId),
      ]);
      // Un turno que cruza la medianoche no pierde de vista lo cobrado antes
      // de las 12: la ventana arranca donde abrió el turno si fue ayer.
      const hoy = inicioDelDia();
      const desde = turno && turno.openedAt < hoy ? turno.openedAt : hoy;
      const [cobros, consultas] = await Promise.all([
        listarCobros({ banco, q, desde, userId, take: TOPE }),
        prisma.validationRequest.findMany({
          where: { userId, createdAt: { gte: desde } },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: SELECT_CONSULTA,
        }),
      ]);
      return { comercio, turno, hoy, desde, cobros, consultas };
    }
  );

  // Comercio sin activar: mismo destino que /validar para la caja.
  if (comercio?.status !== "ACTIVA") redirect("/validar");

  const total = cobros.reduce((s, c) => s + c.monto, 0);
  const consultasCobradas = consultas.filter((c) => c.claim).length;
  const desdeAyer = desde < hoy;
  const ventana = desdeAyer
    ? `desde que abriste el turno (${fechaCortaVe(desde)}, ${horaVe(desde)})`
    : `hoy, ${new Date().toLocaleDateString("es-VE", {
        timeZone: "America/Caracas",
        weekday: "long",
        day: "numeric",
        month: "long",
      })}`;

  return (
    <>
      <Cabecera
        comercio={comercio.razonSocial}
        logoUrl={logoUrlDe(comercio)}
        usuario={session.user.name}
        turnoAbierto={Boolean(turno)}
        ancho
      />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">
          Tus movimientos
        </h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Lo que cobraste y lo que le consultaste al banco {ventana}. Solo lo de tu caja.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Cobrado por ti</p>
            <p className="monto mt-1">Bs {bs(total)}</p>
            <p className="mt-1 text-sm text-tinta-tenue">
              {cobros.length} cobro(s){q || banco ? " con este filtro" : ""}
            </p>
          </div>
          <div className="rounded-card border border-tinta-borde bg-white p-5">
            <p className="text-sm text-tinta-tenue">Consultas al banco</p>
            <p className="monto mt-1">{consultas.length}</p>
            <p className="mt-1 text-sm text-tinta-tenue">
              {consultasCobradas} terminaron en cobro
            </p>
          </div>
        </div>

        <BarraFiltros
          banco={banco}
          q={q}
          etiqueta="Buscar en tus cobros"
          placeholder="Referencia, cédula, teléfono o monto"
        />

        {cobros.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-tinta-borde bg-white p-8 text-center text-sm text-tinta-tenue">
            {q
              ? `Ningún cobro tuyo coincide con «${q}»${banco ? ` en ${BANCO_TEXTO[banco]}` : ""}.`
              : banco
                ? `No has cobrado pagos del ${BANCO_TEXTO[banco]} en este período.`
                : "Todavía no has cobrado nada. Cada pago que valides aparece acá."}
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-card border border-tinta-borde bg-white">
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr className={TR_CAB}>
                  <th className={TH}>Hora</th>
                  <th className={TH}>Banco</th>
                  <th className={TH}>Referencia</th>
                  <th className={`${TH} text-right`}>Monto Bs</th>
                  <th className={TH}>Pagador</th>
                  <th className={TH}>Banco pagador</th>
                  <th className={TH}>Vía</th>
                  <th className={TH}>Estado</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {cobros.map((c) => (
                  <tr key={c.id} className={TR}>
                    <td className={`${TD_FIJO} text-tinta-suave`} data-label="Hora">
                      <Doble
                        arriba={horaVe(c.fecha)}
                        abajo={c.fecha < hoy ? fechaCortaVe(c.fecha) : undefined}
                      />
                    </td>
                    <td className={`${TD} text-tinta`} data-label="Banco">
                      <CeldaBanco banco={c.banco} />
                    </td>
                    <td className={`${TD_FIJO} font-medium text-tinta`} data-label="Referencia">
                      {c.referencia}
                    </td>
                    <td className={`${TD_NUM} font-medium text-tinta`} data-label="Monto Bs">
                      {bs(c.monto)}
                    </td>
                    <td className={`${TD} text-tinta-suave`} data-label="Pagador">
                      <Doble arriba={c.pagador} abajo={c.cedula || undefined} />
                    </td>
                    <td className={`${TD} text-tinta-suave`} data-label="Banco pagador">
                      <span className="block break-words">
                        {bancoPagadorTexto(c.bancoPagador) || "—"}
                      </span>
                    </td>
                    <td className={`${TD} text-tinta-suave`} data-label="Vía">
                      {c.origen}
                    </td>
                    <td className={TD} data-label="Estado">
                      {c.duplicado ? (
                        <span className="rounded-control bg-alerta-suave px-2 py-0.5 text-xs font-medium text-alerta">
                          duplicado
                        </span>
                      ) : (
                        <span className="rounded-control bg-ok-suave px-2 py-0.5 text-xs font-medium text-ok">
                          cobrado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className={TFOOT}>
                <tr className={TR_PIE}>
                  <td className={TD} colSpan={3} data-label="">
                    Total ({cobros.length} cobro{cobros.length === 1 ? "" : "s"})
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

        <h2 className="mt-10 font-display text-lg font-bold tracking-tight text-tinta">
          Tus consultas al banco
        </h2>
        <p className="mt-1 text-sm text-tinta-tenue">
          Cada consulta en línea y cada cobro con Botón de Pago que hiciste, con lo que
          respondió el banco.
        </p>
        {consultas.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-tinta-borde bg-white p-8 text-center text-sm text-tinta-tenue">
            No has hecho consultas al banco en este período.
          </p>
        ) : (
          <div className="mt-4">
            <ListaConsultas consultas={consultas} mostrarCaja={false} />
          </div>
        )}
        {consultas.length >= 100 && (
          <p className="mt-3 text-xs text-tinta-tenue">Se muestran las últimas 100.</p>
        )}
      </main>
    </>
  );
}
