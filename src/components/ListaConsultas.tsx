import { describeBdt } from "@/lib/bdt-codes";
import { describeC2p } from "../../gateway/bt-c2p-codes";

/**
 * Lista de consultas al banco y cobros C2P (`ValidationRequest`), con la
 * respuesta del banco traducida. La usan el dueño (todas las de sus cajas, con
 * el nombre de la caja) y la caja (solo las suyas): un solo lugar las pinta
 * para que las dos pantallas no se desalineen.
 */

const TIPO: Record<string, string> = {
  VAL_P2P: "P2P por cuenta",
  VAL_P2P_CC: "P2P por comercio",
  VAL_TRANSFER: "Transferencia",
  VAL_TRANSACTION: "Movimiento",
  BT_C2P: "Botón de Pago",
};

/** Lo que hay que leer de `ValidationRequest` para pintar la lista. */
export const SELECT_CONSULTA = {
  id: true,
  type: true,
  reference: true,
  amount: true,
  bankCode: true,
  responseCode: true,
  durationMs: true,
  createdAt: true,
  user: { select: { name: true } },
  account: { select: { alias: true, accountNumber: true } },
  claim: { select: { id: true } },
} as const;

export interface Consulta {
  id: string;
  type: string;
  reference: string;
  amount: string;
  responseCode: string;
  durationMs: number;
  createdAt: Date;
  user: { name: string };
  account: { alias: string | null; accountNumber: string } | null;
  claim: { id: string } | null;
}

export default function ListaConsultas({
  consultas,
  mostrarCaja,
}: {
  consultas: Consulta[];
  /** El dueño ve qué caja consultó; en la vista de la caja sobra: es ella. */
  mostrarCaja: boolean;
}) {
  return (
    <ul className="divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
      {consultas.map((v) => {
        const info =
          v.type === "BT_C2P" ? describeC2p(v.responseCode, "") : describeBdt(v.responseCode);
        const exito = v.type === "BT_C2P" ? v.responseCode === "C2P0000" : info.severity === "ok";
        return (
          <li key={v.id} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-control bg-tinta-fondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                {TIPO[v.type] ?? v.type}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  exito
                    ? "bg-ok-suave text-ok"
                    : info.severity === "warn"
                      ? "bg-alerta-suave text-alerta"
                      : "bg-error-suave text-error"
                }`}
              >
                {info.headline}
              </span>
              {v.claim && (
                <span className="rounded-full bg-ok-suave px-2 py-0.5 text-xs font-medium text-ok">
                  cobrado
                </span>
              )}
              <span className="ml-auto text-xs text-tinta-tenue">
                {new Date(v.createdAt).toLocaleString("es-VE", { timeZone: "America/Caracas" })}
              </span>
            </div>
            <p className="mt-1 text-tinta-tenue">
              Bs {v.amount}
              {v.reference && <> · ref …{v.reference.slice(-6)}</>}
              {v.account && <> · {v.account.alias} (…{v.account.accountNumber.slice(-4)})</>}
              {" · "}
              {mostrarCaja && <>{v.user.name} · </>}
              <span className="font-mono text-xs">{v.responseCode}</span> · {v.durationMs}ms
            </p>
          </li>
        );
      })}
    </ul>
  );
}
