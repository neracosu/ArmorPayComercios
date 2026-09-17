import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, X } from "lucide-react";
import { getVerifiedSession, withSessionTenant } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import { inicioDelDia, turnoAbierto } from "@/lib/operacion";
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
  listarPagos,
  parseBanco,
  parseBusqueda,
  type Banco,
} from "@/app/comercio/movimientos";

export const dynamic = "force-dynamic";

/**
 * Los pagos que el banco notificó HOY, con todo su detalle, para la caja y
 * para el dueño por igual. La caja lo necesita cuando un cliente dice «ya
 * pagué» y la búsqueda por referencia no lo encuentra: acá ve todo lo que
 * entró, de qué número, con qué concepto y si alguien ya lo cobró. El dueño
 * lo cruza contra el estado de cuenta. Mismo día de operación que el resto
 * de la caja (`inicioDelDia`, hora de Venezuela).
 */

/** Tope de filas de un día; ningún comercio del plan se acerca. */
const TOPE = 1000;

function bs(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function horaVe(d: Date): string {
  return d.toLocaleTimeString("es-VE", { timeZone: "America/Caracas", timeStyle: "short" });
}

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

function urlPagos(banco: Banco | undefined, base = "/pagos", q = ""): string {
  const params = new URLSearchParams();
  if (banco) params.set("banco", banco);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

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
  const esAdmin = session.user.role === "ORG_ADMIN";

  const { comercio, turno, pagos, cuentas } = await withSessionTenant(session, async () => {
    const [comercio, turno, pagos, cuentas] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.user.organizationId! },
        select: { id: true, razonSocial: true, status: true, logoMime: true, logoUpdatedAt: true },
      }),
      esAdmin ? null : turnoAbierto(session.user.id),
      listarPagos({ banco, q, desde: inicioDelDia(), take: TOPE }),
      // El alias de la cuenta ("Caja principal") dice más que 20 dígitos.
      prisma.bankAccount.findMany({ select: { accountNumber: true, alias: true } }),
    ]);
    return { comercio, turno, pagos, cuentas };
  });

  // Comercio sin activar: mismo destino que /validar para cada rol.
  if (comercio?.status !== "ACTIVA") redirect(esAdmin ? "/comercio/activacion" : "/validar");

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
        turnoAbierto={Boolean(turno)}
        esAdminComercio={esAdmin}
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

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-tinta-tenue">Banco:</span>
          <Link href={urlPagos(undefined, "/pagos", q)} className={chipClase(!banco)}>
            Todos
          </Link>
          {BANCOS.map((b) => (
            <Link key={b} href={urlPagos(b, "/pagos", q)} className={chipClase(banco === b)}>
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
          {/* Buscador de la caja: «el cliente dice que pagó 350 desde el 0414…». */}
          <form method="get" action="/pagos" className="flex items-center gap-2">
            {banco && <input type="hidden" name="banco" value={banco} />}
            <label htmlFor="q" className="sr-only">
              Buscar en los pagos de hoy
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
                placeholder="Referencia, cédula, teléfono, concepto o monto"
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
                href={urlPagos(banco)}
                className="flex items-center gap-1 rounded-control px-2 py-1.5 text-sm text-tinta-suave hover:bg-tinta-fondo"
                aria-label="Quitar búsqueda"
              >
                <X className="h-4 w-4" aria-hidden /> Limpiar
              </Link>
            )}
          </form>
        </div>

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
