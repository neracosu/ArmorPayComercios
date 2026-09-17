import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, Search, TriangleAlert, Webhook, X } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia } from "@/lib/operacion";
import { consumoDelMes } from "@/lib/limites";
import { SOPORTE_EMAIL } from "@/lib/soporte";
import Cabecera from "@/components/Cabecera";
import { logoUrlDe } from "@/lib/logo";
import { MarcaBt } from "@/components/BancoTesoro";
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
  BANCOS,
  BANCO_TEXTO,
  bancoPagadorTexto,
  fechaBanco,
  horaBanco,
  listarCobros,
  listarPagos,
  parseBanco,
  parseBusqueda,
  parseVista,
  urlMovimientos,
  type Banco,
  type FilaCobro,
  type FilaPago,
  type Vista,
} from "./movimientos";

export const dynamic = "force-dynamic";

/**
 * El inicio del comercio (P3.1 del plan UI/UX): el dueño entra a VER cómo va
 * el negocio, no a una pantalla de trabajo. Un vistazo de hoy, los avisos que
 * piden acción, el pulso del plan y los movimientos — cobros y pagos
 * recibidos — como reporte plano: filtrable por banco y descargable, porque
 * es lo que el dueño termina cruzando contra el estado de cuenta.
 */

/** Filas que se muestran en pantalla; el CSV trae hasta 30 días completos. */
const FILAS_EN_PANTALLA = 50;

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaHora(d: Date): string {
  return d.toLocaleString("es-VE", {
    timeZone: "America/Caracas",
    dateStyle: "short",
    timeStyle: "short",
  });
}

const LLAVE_TEXTO: Record<string, string> = {
  SIN_LLAVE: "Tu Llave de Trabajo no está cargada",
  CARGADA: "Tu Llave de Trabajo está cargada pero sin verificar",
  INVALIDA: "El banco rechazó tu Llave de Trabajo",
};

const VISTA_TEXTO: Record<Vista, string> = {
  cobros: "Cobros",
  pagos: "Pagos recibidos",
};

function chipClase(activo: boolean): string {
  return `rounded-control px-3 py-1.5 text-sm font-medium ${
    activo ? "bg-tinta text-white" : "text-tinta-suave hover:bg-tinta-fondo"
  }`;
}

function CeldaBanco({ banco }: { banco: Banco }) {
  if (banco === "BT") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <MarcaBt className="h-3.5 w-auto" /> Tesoro
      </span>
    );
  }
  return <>BDT</>;
}

/** Dos líneas en una celda: el dato y, debajo, su complemento en gris. */
function Doble({ arriba, abajo }: { arriba: string; abajo?: string }) {
  return (
    <span className="block break-words">
      {arriba || "—"}
      {abajo && <span className="block text-xs text-tinta-tenue">{abajo}</span>}
    </span>
  );
}

function TablaCobros({ filas }: { filas: FilaCobro[] }) {
  const total = filas.reduce((s, f) => s + f.monto, 0);
  return (
    <table className={TABLA}>
      <thead className={THEAD}>
        <tr className={TR_CAB}>
          <th className={TH}>Fecha y hora</th>
          <th className={TH}>Banco</th>
          <th className={TH}>Referencia</th>
          <th className={`${TH} text-right`}>Monto Bs</th>
          <th className={TH}>Pagador</th>
          <th className={TH}>Banco pagador</th>
          <th className={TH}>Caja</th>
          <th className={TH}>Estado</th>
        </tr>
      </thead>
      <tbody className={TBODY}>
        {filas.map((c) => (
          <tr key={c.id} className={TR}>
            <td className={`${TD_FIJO} text-tinta-suave`} data-label="Fecha y hora">
              {fechaHora(c.fecha)}
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
              <span className="block break-words">{bancoPagadorTexto(c.bancoPagador) || "—"}</span>
            </td>
            <td className={`${TD} text-tinta-suave`} data-label="Caja">
              <Doble arriba={c.caja} abajo={c.origen !== "Caja" ? c.origen : undefined} />
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
            Total ({filas.length} cobro{filas.length === 1 ? "" : "s"})
          </td>
          <td className={TD_NUM} data-label="Monto Bs">
            {bs(total)}
          </td>
          <td className={TD_RELLENO} colSpan={4} />
        </tr>
      </tfoot>
    </table>
  );
}

function TablaPagos({ filas }: { filas: FilaPago[] }) {
  const total = filas.reduce((s, f) => s + f.monto, 0);
  return (
    <table className={TABLA}>
      <thead className={THEAD}>
        <tr className={TR_CAB}>
          <th className={TH}>Fecha y hora banco</th>
          <th className={TH}>Banco</th>
          <th className={TH}>Cuenta</th>
          <th className={TH}>Referencia</th>
          <th className={`${TH} text-right`}>Monto Bs</th>
          <th className={TH}>Pagador</th>
          <th className={TH}>Banco pagador</th>
          <th className={TH}>Cobrado</th>
        </tr>
      </thead>
      <tbody className={TBODY}>
        {filas.map((p) => (
          <tr key={p.id} className={TR}>
            <td className={`${TD_FIJO} text-tinta-suave`} data-label="Fecha y hora banco">
              {fechaBanco(p.fechaBanco)} {horaBanco(p.horaBanco)}
            </td>
            <td className={`${TD} text-tinta`} data-label="Banco">
              <CeldaBanco banco={p.banco} />
            </td>
            <td className={`${TD_FIJO} text-tinta-suave`} data-label="Cuenta" title={p.cuenta}>
              …{p.cuenta.slice(-4)}
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
              <span className="block break-words">{bancoPagadorTexto(p.bancoPagador) || "—"}</span>
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
        ))}
      </tbody>
      <tfoot className={TFOOT}>
        <tr className={TR_PIE}>
          <td className={TD} colSpan={4} data-label="">
            Total ({filas.length} pago{filas.length === 1 ? "" : "s"})
          </td>
          <td className={TD_NUM} data-label="Monto Bs">
            {bs(total)}
          </td>
          <td className={TD_RELLENO} colSpan={3} />
        </tr>
      </tfoot>
    </table>
  );
}

export default async function ComercioInicioPage({
  searchParams,
}: {
  searchParams: { vista?: string; banco?: string; q?: string };
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login?callbackUrl=/comercio");
  if (session.user.role !== "ORG_ADMIN") redirect("/validar");

  const vista = parseVista(searchParams.vista);
  const banco = parseBanco(searchParams.banco);
  const q = parseBusqueda(searchParams.q);

  const datos = await withSessionTenant(session, async () => {
    const desde = inicioDelDia();
    const [comercio, hoy, abiertos, checkoutHoy, duplicados, muertas, cobros, pagos, consumo] =
      await Promise.all([
        prisma.organization.findUnique({
          where: { id: session.user.organizationId! },
          select: {
            id: true,
            razonSocial: true,
            status: true,
            authKeyStatus: true,
            logoMime: true,
            logoUpdatedAt: true,
          },
        }),
        prisma.paymentClaim.aggregate({
          where: { claimedAt: { gte: desde } },
          _count: true,
          _sum: { amount: true },
        }),
        prisma.shift.count({ where: { status: "OPEN" } }),
        prisma.paymentClaim.aggregate({
          where: { source: "CHECKOUT", claimedAt: { gte: desde } },
          _count: true,
          _sum: { amount: true },
        }),
        prisma.paymentClaim.count({ where: { isDuplicate: true } }),
        prisma.webhookDelivery.count({ where: { status: "DEAD" } }),
        vista === "cobros" ? listarCobros({ banco, q, take: FILAS_EN_PANTALLA }) : Promise.resolve([]),
        vista === "pagos" ? listarPagos({ banco, q, take: FILAS_EN_PANTALLA }) : Promise.resolve([]),
        consumoDelMes(session.user.organizationId!),
      ]);
    return { comercio, hoy, abiertos, checkoutHoy, duplicados, muertas, cobros, pagos, consumo };
  });

  const { comercio, hoy, abiertos, checkoutHoy, duplicados, muertas, cobros, pagos, consumo } = datos;

  // Mismo criterio que /validar: el comercio sin activar va a su paso a paso.
  if (comercio?.status !== "ACTIVA") redirect("/comercio/activacion");

  const avisoLlave =
    comercio.authKeyStatus !== "VERIFICADA" ? LLAVE_TEXTO[comercio.authKeyStatus] : null;

  const tarjetas = [
    {
      href: "/comercio/cierres",
      titulo: "Cobrado hoy",
      valor: `Bs ${bs(Number(hoy._sum.amount ?? 0))}`,
      detalle: `${hoy._count} cobro(s)`,
    },
    {
      href: "/comercio/cierres",
      titulo: "Cajas trabajando ahora",
      valor: String(abiertos),
      detalle: "turno(s) abierto(s)",
    },
    {
      href: "/comercio/ventas",
      titulo: "Ventas en línea hoy",
      valor: `Bs ${bs(Number(checkoutHoy._sum.amount ?? 0))}`,
      detalle: `${checkoutHoy._count} cobro(s) por checkout`,
    },
  ];

  const filas = vista === "cobros" ? cobros.length : pagos.length;
  const vacio = q
    ? `Nada coincide con «${q}»${banco ? ` en ${BANCO_TEXTO[banco]}` : ""}. Prueba con menos dígitos o quita el filtro.`
    : vista === "cobros"
      ? banco
        ? `No hay cobros ${banco === "BT" ? "del Banco del Tesoro" : "del BDT"} todavía.`
        : "Todavía no hay cobros. Cuando una caja o tu tienda en línea cobre el primero, aparece acá."
      : banco
        ? `El ${BANCO_TEXTO[banco]} no ha notificado pagos todavía.`
        : "Todavía no hay pagos notificados por el banco. En cuanto entre el primero, aparece acá.";

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
        <h1 className="font-display text-2xl font-bold tracking-tight text-tinta">Inicio</h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Cómo va {comercio.razonSocial}, de un vistazo.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {tarjetas.map((t) => (
            <Link
              key={t.titulo}
              href={t.href}
              className="rounded-card border border-tinta-borde bg-white p-5 transition-colors hover:border-marca-600"
            >
              <p className="text-sm text-tinta-tenue">{t.titulo}</p>
              <p className="monto mt-1">{t.valor}</p>
              <p className="mt-1 text-sm text-tinta-tenue">{t.detalle}</p>
            </Link>
          ))}
        </div>

        {/* Avisos: solo lo que pide una acción del dueño. Sin novedades, no hay ruido. */}
        {(avisoLlave || duplicados > 0 || muertas > 0) && (
          <div className="mt-4 space-y-2">
            {avisoLlave && (
              <p className="flex items-start gap-2 rounded-card border border-error/30 bg-error-suave px-4 py-3 text-sm text-error">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {avisoLlave} — las cajas no pueden cobrar hasta resolverlo.{" "}
                <a href={`mailto:${SOPORTE_EMAIL}`} className="font-medium underline underline-offset-2">
                  Escríbenos
                </a>{" "}
                si el banco te la cambió.
              </p>
            )}
            {duplicados > 0 && (
              <Link
                href="/comercio/cierres"
                className="flex items-start gap-2 rounded-card border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta transition-colors hover:border-alerta"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {duplicados} cobro(s) duplicado(s) esperan tu revisión en Cierres.
              </Link>
            )}
            {muertas > 0 && (
              <Link
                href="/comercio/api"
                className="flex items-start gap-2 rounded-card border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta transition-colors hover:border-alerta"
              >
                <Webhook className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {muertas} aviso(s) a tu tienda se agotaron sin llegar — revísalos
                y reenvíalos desde API.
              </Link>
            )}
          </div>
        )}

        {/* El plan, en una línea: el detalle con excedentes vive en Cierres. */}
        <div className="mt-4 rounded-card border border-tinta-borde bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-tinta-tenue">
              Plan <strong className="font-medium text-tinta">{consumo.plan.nombre}</strong>
            </p>
            <p className="text-sm tabular-nums text-tinta-suave">
              <strong className="text-tinta">{consumo.cobros.toLocaleString("es-VE")}</strong> de{" "}
              {consumo.incluidos.toLocaleString("es-VE")} cobros este mes
            </p>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-tinta-fondo"
            role="progressbar"
            aria-valuenow={Math.min(consumo.porcentaje, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Consumo del plan"
          >
            <div
              className={`h-full rounded-full transition-all ${
                consumo.excedidos > 0
                  ? "bg-error"
                  : consumo.porcentaje >= 80
                    ? "bg-alerta"
                    : "bg-marca-700"
              }`}
              style={{ width: `${Math.min(consumo.porcentaje, 100)}%` }}
            />
          </div>
        </div>

        {/* Movimientos: cobros (lo que cobraron cajas y tienda) y pagos
            recibidos (lo que el banco notificó), como reporte plano. Los
            filtros son enlaces: la URL queda compartible y el CSV baja
            exactamente lo que se ve. */}
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display font-bold tracking-tight text-tinta">Movimientos</h2>
              <p className="mt-1 text-sm text-tinta-tenue">
                Lo que cobraron tus cajas y tu tienda, y lo que el banco te notificó.
              </p>
            </div>
            <a
              href={urlMovimientos(vista, banco, "/comercio/export", q)}
              className="rounded-control border border-tinta-borde bg-white px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-tinta-fondo"
            >
              Descargar CSV (30 días)
            </a>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de movimiento">
              {(Object.keys(VISTA_TEXTO) as Vista[]).map((v) => (
                <Link
                  key={v}
                  href={urlMovimientos(v, banco, "/comercio", q)}
                  role="tab"
                  aria-selected={vista === v}
                  className={chipClase(vista === v)}
                >
                  {VISTA_TEXTO[v]}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-tinta-tenue">Banco:</span>
              <Link href={urlMovimientos(vista, undefined, "/comercio", q)} className={chipClase(!banco)}>
                Todos
              </Link>
              {BANCOS.map((b) => (
                <Link key={b} href={urlMovimientos(vista, b, "/comercio", q)} className={chipClase(banco === b)}>
                  {b === "BT" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MarcaBt className="h-3.5 w-auto" /> {BANCO_TEXTO[b]}
                    </span>
                  ) : (
                    BANCO_TEXTO[b]
                  )}
                </Link>
              ))}
            </div>
            {/* Buscador: referencia, cédula, teléfono/cuenta, caja o monto.
                Es un GET: la URL con la búsqueda se comparte y el CSV la respeta. */}
            <form method="get" action="/comercio" className="flex items-center gap-2">
              {vista !== "cobros" && <input type="hidden" name="vista" value={vista} />}
              {banco && <input type="hidden" name="banco" value={banco} />}
              <label htmlFor="q" className="sr-only">
                Buscar en movimientos
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-tenue"
                  aria-hidden
                />
                <input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={q}
                  maxLength={60}
                  placeholder="Referencia, cédula, teléfono, caja o monto"
                  className="w-72 rounded-control border border-tinta-borde bg-white py-1.5 pl-9 pr-3 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-control bg-tinta px-3 py-1.5 text-sm font-medium text-white hover:bg-tinta/90"
              >
                Buscar
              </button>
              {q && (
                <Link
                  href={urlMovimientos(vista, banco)}
                  className="flex items-center gap-1 rounded-control px-2 py-1.5 text-sm text-tinta-suave hover:bg-tinta-fondo"
                  aria-label="Quitar búsqueda"
                >
                  <X className="h-4 w-4" aria-hidden /> Limpiar
                </Link>
              )}
            </form>
          </div>

          {filas === 0 ? (
            <p className="mt-4 rounded-card border border-dashed border-tinta-borde bg-white p-8 text-center text-sm text-tinta-tenue">
              {vacio}
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-card border border-tinta-borde bg-white">
              {vista === "cobros" ? <TablaCobros filas={cobros} /> : <TablaPagos filas={pagos} />}
            </div>
          )}

          {filas === FILAS_EN_PANTALLA && (
            <p className="mt-3 text-sm text-tinta-tenue">
              Se muestran los últimos {FILAS_EN_PANTALLA}. Afina con el buscador o baja el CSV, que
              trae los últimos 30 días completos.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
