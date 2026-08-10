"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import BuscadorCobro from "./BuscadorCobro";
import ConsultaOnline from "./ConsultaOnline";
import CobroBotonPago from "./CobroBotonPago";

export interface CuentaCaja {
  id: string;
  alias: string;
  ultimos: string;
  banco: string; // "BDT" | "BT"
  merchantCode: string | null;
}

type Pestana =
  | "LOOKUP_REF"
  | "VAL_P2P"
  | "VAL_P2P_CC"
  | "VAL_TRANSFER"
  | "VAL_TRANSACTION"
  | "BT_C2P";

const PESTANAS: { key: Pestana; label: string; help: string }[] = [
  {
    key: "LOOKUP_REF",
    label: "Por referencia",
    help: "Busca un pago ya recibido por los últimos dígitos de su referencia. Es lo más rápido y muestra los datos reales del banco.",
  },
  {
    key: "VAL_P2P",
    label: "P2P por cuenta",
    help: "Consulta al banco un Pago Móvil recibido en una cuenta afiliada, con los datos completos del comprobante.",
  },
  {
    key: "VAL_P2P_CC",
    label: "P2P por comercio",
    help: "Consulta al banco un Pago Móvil recibido en un código de comercio afiliado.",
  },
  {
    key: "VAL_TRANSFER",
    label: "Transferencia",
    help: "Consulta al banco una transferencia (crédito inmediato) recibida en una cuenta afiliada.",
  },
  {
    key: "VAL_TRANSACTION",
    label: "Movimiento",
    help: "Consulta al banco cualquier movimiento por fecha, monto y referencia. Es una consulta genérica: no genera cobro.",
  },
  {
    key: "BT_C2P",
    label: "Botón de Pago",
    help: "Cobro C2P del Banco del Tesoro: el cliente genera su clave dinámica desde su banco y te la dicta. El banco debita y confirma al instante.",
  },
];

/**
 * Las seis vías de la caja, portadas del /validate del panel interno.
 * Cada pestaña se monta con `key` propio: cambiar de vía limpia el estado.
 */
export default function PanelValidacion({
  hayTurno,
  cuentas,
  llaveOperativa,
  c2pHabilitado,
  bancosC2p,
}: {
  hayTurno: boolean;
  cuentas: CuentaCaja[];
  llaveOperativa: boolean;
  c2pHabilitado: boolean;
  bancosC2p: Array<{ codigo: string; nombre: string }>;
}) {
  const [pestana, setPestana] = useState<Pestana>("LOOKUP_REF");

  // Las consultas online van al gestor BDT: solo tienen sentido con una
  // cuenta BDT activa; la de comercio, solo si alguna tiene código afiliado.
  const cuentasBdt = cuentas.filter((c) => c.banco === "BDT");
  const hayComercioAfiliado = cuentasBdt.some((c) => c.merchantCode);

  const visibles = PESTANAS.filter((t) => {
    if (t.key === "LOOKUP_REF") return true;
    if (t.key === "BT_C2P") return c2pHabilitado;
    if (t.key === "VAL_P2P_CC") return hayComercioAfiliado;
    return cuentasBdt.length > 0;
  });

  const actual = visibles.find((t) => t.key === pestana) ?? visibles[0];
  const esOnlineBdt =
    actual.key !== "LOOKUP_REF" && actual.key !== "BT_C2P";

  return (
    <div>
      {visibles.length > 1 && (
        <div
          role="tablist"
          aria-label="Vía de validación"
          className="flex gap-1 overflow-x-auto border-b border-tinta-borde"
        >
          {visibles.map((t) => {
            const activa = t.key === actual.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={activa}
                onClick={() => setPestana(t.key)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  activa
                    ? "border-marca-700 text-marca-700"
                    : "border-transparent text-tinta-suave hover:text-tinta"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-tinta-tenue">{actual.help}</p>

      <div className="mt-5">
        {actual.key === "LOOKUP_REF" && <BuscadorCobro hayTurno={hayTurno} />}

        {esOnlineBdt &&
          (llaveOperativa ? (
            <ConsultaOnline
              key={actual.key}
              tipo={actual.key as "VAL_P2P" | "VAL_P2P_CC" | "VAL_TRANSFER" | "VAL_TRANSACTION"}
              cuentas={cuentasBdt}
              hayTurno={hayTurno}
            />
          ) : (
            <div className="rounded-card border border-alerta/30 bg-alerta-suave p-5">
              <p className="flex items-center gap-2 font-medium text-alerta">
                <KeyRound className="h-4 w-4" aria-hidden />
                La Llave de Trabajo no está operativa
              </p>
              <p className="mt-1 text-sm leading-relaxed text-alerta">
                Las consultas en línea van directo al banco con la Llave de Trabajo
                del comercio. El administrador debe cargarla y verificarla en el
                perfil antes de usar esta vía.
              </p>
            </div>
          ))}

        {actual.key === "BT_C2P" && (
          <CobroBotonPago bancos={bancosC2p} hayTurno={hayTurno} />
        )}
      </div>
    </div>
  );
}
