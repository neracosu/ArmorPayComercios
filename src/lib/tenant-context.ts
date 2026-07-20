import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto de tenant de la petición en curso.
 *
 * Todo acceso a datos de un comercio pasa por acá: la extensión de Prisma
 * (`src/lib/prisma.ts`) lee este contexto para inyectar el filtro de
 * organización en cada consulta. El desarrollador nunca escribe el `where` de
 * tenant a mano — justamente para que no pueda olvidarlo.
 *
 * REGLA: sin contexto, se falla CERRADO. Una consulta sin tenant lanza en vez
 * de devolver datos de todos. Esto importa sobre todo en las entradas SIN
 * sesión, que son las que manejan dinero y las más fáciles de olvidar:
 *   · ingesta del gateway (POST firmado, sin usuario)
 *   · workers de cola y crons de reproceso
 *   · páginas públicas de checkout
 * Cada una tiene que abrir su contexto explícitamente con `runWithTenant()`
 * o, si de verdad opera sobre varios comercios, con `runAsPlatform()`.
 */

export interface TenantContext {
  /** Organización dueña de los datos, o null si se corre como plataforma. */
  organizationId: string | null;
  /** Solo true vía `runAsPlatform`. Desactiva el filtro. */
  platformScope: boolean;
  /** Para auditoría: por qué se corrió sin filtro. */
  reason?: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Corre `fn` con los datos acotados a una organización.
 *
 * El `await` va DENTRO del contexto a propósito. Las promesas de Prisma son
 * perezosas: `prisma.x.create()` no ejecuta nada hasta que se la espera, así
 * que si el `await` quedara afuera, la extensión correría fuera del contexto y
 * no encontraría el tenant. Falla cerrado —lanza, no filtra— pero rompe algo
 * que debería funcionar. Absorbiendo el await acá, da igual cómo lo escriba
 * quien llame: `() => prisma.x.create(...)` y `async () => { await ... }`
 * funcionan los dos.
 */
export async function runWithTenant<T>(
  organizationId: string,
  fn: () => T | Promise<T>
): Promise<T> {
  return storage.run({ organizationId, platformScope: false }, async () => await fn());
}

/**
 * Corre `fn` SIN filtro de organización. Es la única forma de leer datos de
 * varios comercios, y exige una razón explícita porque cada uso es una
 * excepción al aislamiento que alguien va a tener que justificar en una
 * revisión. Usos legítimos: panel de plataforma, ingesta del gateway que
 * resuelve a qué comercio pertenece una cuenta, migraciones.
 */
export async function runAsPlatform<T>(reason: string, fn: () => T | Promise<T>): Promise<T> {
  return storage.run(
    { organizationId: null, platformScope: true, reason },
    async () => await fn()
  );
}

/** Contexto actual, o undefined si no se abrió ninguno. */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/**
 * Contexto actual, fallando cerrado si no hay.
 * El mensaje nombra el modelo para que el error diga qué hay que instrumentar.
 */
export function requireTenantContext(model: string): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      `Acceso a "${model}" sin contexto de tenant. Envolvé la operación en ` +
        `runWithTenant(orgId, ...) o, si es intencionalmente multi-comercio, ` +
        `en runAsPlatform("motivo", ...).`
    );
  }
  return ctx;
}
