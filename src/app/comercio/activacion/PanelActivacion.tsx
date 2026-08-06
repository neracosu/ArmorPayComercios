"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  AlertTriangle,
  Check,
  FileUp,
  KeyRound,
  Landmark,
  Loader2,
  Upload,
} from "lucide-react";
import {
  subirRecaudo,
  registrarCuenta,
  cargarLlave,
  elegirGestionBanco,
  type ResultadoActivacion,
} from "./actions";

export interface RecaudoVista {
  tipo: string;
  titulo: string;
  detalle: string;
  status: "SIN_SUBIR" | "PENDIENTE" | "APROBADO" | "RECHAZADO";
  nombre: string | null;
  nota: string | null;
}

export interface CuentaVista {
  id: string;
  numero: string;
  banco: string;
  alias: string;
  isActive: boolean;
}

const CHIP: Record<string, { texto: string; clase: string }> = {
  SIN_SUBIR: { texto: "sin subir", clase: "bg-tinta-fondo text-tinta-tenue" },
  PENDIENTE: { texto: "en revisión", clase: "bg-alerta-suave text-alerta" },
  APROBADO: { texto: "aprobado", clase: "bg-ok-suave text-ok" },
  RECHAZADO: { texto: "rechazado", clase: "bg-error-suave text-error" },
};

function Aviso({ r }: { r: ResultadoActivacion | null }) {
  if (!r) return null;
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${
        r.ok ? "bg-ok-suave/50 text-ok" : "bg-error-suave text-error"
      }`}
    >
      {r.ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      {r.ok ? r.mensaje : r.error}
    </p>
  );
}

function BotonEnviar({ etiqueta, icono }: { etiqueta: string; icono: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-control bg-marca-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-900 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icono}
      {etiqueta}
    </button>
  );
}

function FilaRecaudo({ recaudo }: { recaudo: RecaudoVista }) {
  const [resultado, accion] = useFormState<ResultadoActivacion | null, FormData>(subirRecaudo, null);
  const chip = CHIP[recaudo.status];

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-tinta">
            {recaudo.titulo}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${chip.clase}`}>
              {chip.texto}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-tinta-tenue">
            {recaudo.nombre ? `Subido: ${recaudo.nombre}` : recaudo.detalle}
          </p>
          {recaudo.status === "RECHAZADO" && recaudo.nota && (
            <p className="mt-1 text-sm text-error">Motivo: {recaudo.nota}</p>
          )}
        </div>
        {recaudo.status !== "APROBADO" && (
          <form action={accion} className="flex items-center gap-2">
            <input type="hidden" name="tipo" value={recaudo.tipo} />
            <input
              name="archivo"
              type="file"
              required
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="block max-w-52 text-sm text-tinta-suave file:mr-2 file:rounded-control file:border-0 file:bg-tinta-fondo file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-tinta-suave"
            />
            <BotonEnviar
              etiqueta={recaudo.status === "SIN_SUBIR" ? "Subir" : "Reemplazar"}
              icono={<FileUp className="h-4 w-4" aria-hidden />}
            />
          </form>
        )}
      </div>
      <Aviso r={resultado} />
    </li>
  );
}

function Cuentas({ cuentas }: { cuentas: CuentaVista[] }) {
  const [resultado, accion] = useFormState<ResultadoActivacion | null, FormData>(registrarCuenta, null);

  return (
    <div>
      {cuentas.length > 0 && (
        <ul className="divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {cuentas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="font-mono text-tinta">{c.numero}</span>
              <span className="text-tinta-tenue">
                {c.banco} · {c.alias}
              </span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.isActive ? "bg-ok-suave text-ok" : "bg-alerta-suave text-alerta"
                }`}
              >
                {c.isActive ? "aprobada" : "por aprobar"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        action={accion}
        className="mt-3 flex flex-wrap items-end gap-3 rounded-control border border-tinta-borde bg-tinta-fondo p-4"
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="numero" className="mb-1 block text-sm text-tinta-suave">
            Número de cuenta (20 dígitos)
          </label>
          <input
            id="numero"
            name="numero"
            inputMode="numeric"
            pattern="\d{20}"
            required
            placeholder="01750000000000000000"
            className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 font-mono text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="banco" className="mb-1 block text-sm text-tinta-suave">
            Banco
          </label>
          <select
            id="banco"
            name="banco"
            required
            className="rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-600 focus:outline-none"
          >
            <option value="BDT">BDT (antes Bicentenario)</option>
            <option value="BT">Banco del Tesoro</option>
          </select>
        </div>
        <div>
          <label htmlFor="alias" className="mb-1 block text-sm text-tinta-suave">
            Alias
          </label>
          <input
            id="alias"
            name="alias"
            required
            maxLength={60}
            placeholder="Cuenta principal"
            className="rounded-control border border-tinta-borde bg-white px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca-600 focus:outline-none"
          />
        </div>
        <BotonEnviar etiqueta="Registrar" icono={<Landmark className="h-4 w-4" aria-hidden />} />
      </form>
      <Aviso r={resultado} />
    </div>
  );
}

/**
 * Los DOS escenarios de llegada: trae su afiliación bancaria, o se la
 * gestionamos nosotros. Es la primera pregunta de la sección bancaria —
 * define qué le pedimos y qué hacemos por él.
 */
function EscenarioBanco({ escenario }: { escenario: string | null }) {
  const [resultado, accion] = useFormState<ResultadoActivacion | null, FormData>(
    elegirGestionBanco,
    null
  );

  return (
    <div className="mb-4 rounded-control border border-tinta-borde bg-tinta-fondo p-4">
      <p className="text-sm font-medium text-tinta">
        ¿Ya tienes tu afiliación de pago móvil empresarial con el banco?
      </p>
      <form action={accion} className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="submit"
          name="escenario"
          value="TRAE_AFILIACION"
          className={`rounded-control border px-3 py-2.5 text-left text-sm transition-colors ${
            escenario === "TRAE_AFILIACION"
              ? "border-marca-700 bg-marca-700/10 text-marca-700"
              : "border-tinta-borde bg-white text-tinta-suave hover:bg-tinta-fondo"
          }`}
        >
          <span className="font-medium">Sí, ya la tengo</span>
          <span className="mt-0.5 block text-xs text-tinta-tenue">
            Pega tu llave abajo. Coordinamos con el banco la vinculación con
            nuestra plataforma.
          </span>
        </button>
        <button
          type="submit"
          name="escenario"
          value="GESTIONAMOS"
          className={`rounded-control border px-3 py-2.5 text-left text-sm transition-colors ${
            escenario === "GESTIONAMOS"
              ? "border-marca-700 bg-marca-700/10 text-marca-700"
              : "border-tinta-borde bg-white text-tinta-suave hover:bg-tinta-fondo"
          }`}
        >
          <span className="font-medium">No — gestiónenla por mí</span>
          <span className="mt-0.5 block text-xs text-tinta-tenue">
            Nosotros hacemos el trámite completo con el banco por ti.
          </span>
        </button>
      </form>
      <Aviso r={resultado} />
    </div>
  );
}

function Llave({ status, hint }: { status: string; hint: string | null }) {
  const [resultado, accion] = useFormState<ResultadoActivacion | null, FormData>(cargarLlave, null);

  const texto: Record<string, string> = {
    SIN_LLAVE: "Sin llave cargada",
    CARGADA: "Cargada — la verificamos contra el banco en tu certificación",
    VERIFICADA: "Verificada contra el banco",
    INVALIDA: "El banco la rechazó — pega la llave correcta",
  };

  return (
    <div>
      <p
        className={`text-sm font-medium ${
          status === "VERIFICADA" ? "text-ok" : status === "INVALIDA" ? "text-error" : "text-tinta-suave"
        }`}
      >
        {texto[status] ?? status}
        {hint && <span className="ml-2 font-mono text-tinta-tenue">{hint}</span>}
      </p>
      {status !== "VERIFICADA" && (
        <form action={accion} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="authKey" className="mb-1 block text-sm text-tinta-suave">
              Pega la Llave de Trabajo que te entregó el banco
            </label>
            <input
              id="authKey"
              name="authKey"
              type="password"
              required
              autoComplete="off"
              className="w-full rounded-control border border-tinta-borde bg-white px-3 py-2 font-mono text-sm text-tinta focus:border-marca-600 focus:outline-none"
            />
          </div>
          <BotonEnviar etiqueta="Guardar llave" icono={<KeyRound className="h-4 w-4" aria-hidden />} />
        </form>
      )}
      <p className="mt-2 text-xs text-tinta-tenue">
        Es tu credencial: se guarda cifrada y nunca se vuelve a mostrar completa.
      </p>
      <Aviso r={resultado} />
    </div>
  );
}

export default function PanelActivacion({
  recaudos,
  cuentas,
  llaveStatus,
  llaveHint,
  gestionBanco,
}: {
  recaudos: RecaudoVista[];
  cuentas: CuentaVista[];
  llaveStatus: string;
  llaveHint: string | null;
  gestionBanco: string | null;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-tinta">
          <Upload className="h-4 w-4 text-marca-700" aria-hidden />
          1. Tus documentos
        </h2>
        <p className="mb-3 mt-1 text-sm text-tinta-tenue">
          PDF o foto legible, hasta 2 MB. Si rechazamos alguno, acá ves el
          motivo y lo vuelves a subir.
        </p>
        <ul className="divide-y divide-tinta-borde overflow-hidden rounded-card border border-tinta-borde bg-white">
          {recaudos.map((r) => (
            <FilaRecaudo key={r.tipo} recaudo={r} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-tinta">
          <Landmark className="h-4 w-4 text-marca-700" aria-hidden />
          2. Tus cuentas bancarias
        </h2>
        <p className="mb-3 mt-1 text-sm text-tinta-tenue">
          Las cuentas de la empresa donde recibes pagos. Las aprobamos nosotros
          antes de que empiecen a ver pagos.
        </p>
        <Cuentas cuentas={cuentas} />
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-display font-bold tracking-tight text-tinta">
          <KeyRound className="h-4 w-4 text-marca-700" aria-hidden />
          3. Tu afiliación con el banco
        </h2>
        <p className="mb-3 mt-1 text-sm text-tinta-tenue">
          Con afiliación o sin ella, te damos la solución completa desde el
          inicio.
        </p>
        <EscenarioBanco escenario={gestionBanco} />
        {gestionBanco === "GESTIONAMOS" && llaveStatus === "SIN_LLAVE" ? (
          <div className="rounded-control bg-ok-suave/50 px-4 py-3 text-sm leading-relaxed text-ok">
            <p className="font-medium">Estamos gestionando tu afiliación con el banco.</p>
            <p className="mt-1">
              Nosotros tramitamos las credenciales y tu Llave de Trabajo. Cada
              avance lo ves reflejado aquí — no tienes que hacer nada más en
              este paso.
            </p>
          </div>
        ) : (
          <Llave status={llaveStatus} hint={llaveHint} />
        )}
      </section>
    </div>
  );
}
