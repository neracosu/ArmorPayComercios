import { PrismaClient, Prisma } from "@prisma/client";
import { requireTenantContext } from "./tenant-context";

/**
 * Cliente Prisma con aislamiento por tenant FORZADO.
 *
 * El aislamiento no puede depender de que nadie olvide un `where`: en el
 * proyecto anterior esa suposición produjo R-16, una fuga real en producción
 * donde una caja podía ver y cobrar el pago de otra empresa. Acá el filtro se
 * inyecta en una sola capa, y el desarrollador nunca lo escribe a mano.
 *
 * Cómo funciona:
 *  · Los modelos con columna `organizationId` se descubren del DMMF, no de una
 *    lista escrita a mano — un modelo nuevo queda protegido automáticamente.
 *  · Lecturas y escrituras reciben `where.organizationId` inyectado.
 *  · Las creaciones reciben `data.organizationId`.
 *  · Sin contexto de tenant, se LANZA (fallo cerrado). Ver `tenant-context.ts`.
 *
 * Apoyado en `extendedWhereUnique`, GA desde Prisma 5: `findUnique`, `update` y
 * `delete` aceptan campos no únicos en el `where` además del único, así que el
 * filtro de organización también protege el acceso por id.
 *
 * Límite conocido: `$queryRaw` NO pasa por acá. En este proyecto está prohibido
 * sobre modelos de tenant; si alguna vez hace falta, el filtro va escrito a
 * mano y revisado.
 */

/** Modelos con `organizationId`, derivados del esquema. */
const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "organizationId"))
    .map((m) => m.name)
);

/** Operaciones cuyo filtro va en `where`. */
const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

type AnyArgs = Record<string, unknown>;

/**
 * Tope del pool por proceso. Sin él, Prisma abre hasta 2×núcleos+1 = 25
 * conexiones POR CLIENTE y las deja dormidas. El 2026-09-15 teníamos 8 clientes
 * sueltos (uno por archivo) y 54 conexiones dormidas en un MariaDB con tope de
 * 151 que comparten ~15 apps del servidor, entre ellas el interno que factura:
 * el servidor llegó a 149/151 y un comercio recién registrado no pudo entrar
 * (`1040 Too many connections`). Un `connection_limit` explícito en
 * DATABASE_URL tiene prioridad sobre este valor.
 */
const CONNECTION_LIMIT = 10;

function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(CONNECTION_LIMIT));
  }
  return url.toString();
}

function buildBaseClient() {
  return new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function buildClient(base: PrismaClient) {
  return base.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const ctx = requireTenantContext(model);
          if (ctx.platformScope) return query(args);

          const organizationId = ctx.organizationId;
          if (!organizationId) {
            throw new Error(`Contexto de tenant sin organizationId para "${model}".`);
          }

          const a = (args ?? {}) as AnyArgs;

          if (WHERE_OPS.has(operation)) {
            a.where = { ...((a.where as AnyArgs) ?? {}), organizationId };
            return query(a);
          }

          if (operation === "create") {
            a.data = { ...((a.data as AnyArgs) ?? {}), organizationId };
            return query(a);
          }

          if (operation === "createMany") {
            const data = a.data;
            a.data = Array.isArray(data)
              ? data.map((d) => ({ ...(d as AnyArgs), organizationId }))
              : { ...((data as AnyArgs) ?? {}), organizationId };
            return query(a);
          }

          if (operation === "upsert") {
            a.where = { ...((a.where as AnyArgs) ?? {}), organizationId };
            a.create = { ...((a.create as AnyArgs) ?? {}), organizationId };
            return query(a);
          }

          // Operación no contemplada sobre un modelo de tenant: se rechaza en
          // vez de dejarla pasar sin filtro. Si aparece una nueva, se agrega
          // arriba de forma consciente.
          throw new Error(
            `Operación "${operation}" no contemplada por el aislamiento en "${model}".`
          );
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof buildClient>;

// Next evalúa este módulo (y `tenant-context.ts`) más de una vez en el mismo
// proceso: las server actions viven en otra capa del build que las páginas y
// los route handlers. Por eso se comparte en `globalThis` SOLO el cliente base
// (el pool) y NUNCA el extendido: la extensión lee el AsyncLocalStorage de SU
// copia de `tenant-context`. Si se reusara la de otra capa, `runWithTenant`
// abriría el contexto en un storage y la extensión lo buscaría en otro →
// «sin contexto de tenant» en cada acción (pasó el 2026-09-15 al registrar una
// cuenta bancaria). `$extends` no abre conexiones: una por capa es gratis.
const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

const base = (globalForPrisma.prismaBase ??= buildBaseClient());

export const prisma: ExtendedClient = buildClient(base);

/**
 * Cliente SIN aislamiento, sobre el mismo pool. Solo para las entradas que
 * legítimamente operan antes o por encima de un tenant (login, registro,
 * panel de plataforma) y verifican el rol por su cuenta. Nunca `new
 * PrismaClient()` suelto: cada instancia es un pool propio.
 */
export const prismaSinTenant: PrismaClient = base;

/** Solo para diagnóstico y tests de aislamiento. */
export const tenantModels = TENANT_MODELS;
