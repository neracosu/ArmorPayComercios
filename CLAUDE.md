# ArmorPay Cloud — Contexto del proyecto

**Plataforma de validación de pagos** multi-tenant. Comercios confirman en segundos que un pago móvil llegó a su cuenta, con control por caja, turnos y cierre. Dominio: `armorpay.net`. Nace el 2026-07-20 derivado de `armorpay` (el sistema interno de Armor Market, en `/home/mardenli/armorpay`).

**Plan maestro del producto**: `~/.claude/plans/moonlit-pondering-parasol.md`. Tiene fases, gates, riesgos y las decisiones ya cerradas. Leerlo antes de empezar cualquier tarea grande.

**Repo**: `git@github.com:neracosu/ArmorPayComercios.git`, remote `origin` vía el alias SSH `github-armorpaycomercios` (clave dedicada `~/.ssh/id_ed25519_armorpaycomercios_github`, patrón del resto de los proyectos). Ojo con el nombre: el repo se llama **ArmorPayComercios** y el directorio local `armorpay-cloud` — es el mismo proyecto.

## Estructura

```
armorpay-cloud/
├── CLAUDE.md            ← este archivo
├── prisma/              ← esquema + migraciones VERSIONADAS
├── scripts/
│   └── test-isolation.ts   ← obligatorio tras tocar el aislamiento
├── src/                 ← el SaaS (puerto 3101, armorpay.net)
│   ├── lib/             ← tenant-context.ts + prisma.ts = el núcleo
│   └── app/
└── gateway/             ← el gateway (puerto 3102) — proceso PM2 aparte
```

**Por qué el gateway vive acá y no en un repo propio**: comparte con el SaaS el contrato del evento bancario, así que un cambio se hace en un solo lugar y el compilador avisa. Son despliegues independientes, no un monolito.

**Por qué el gateway NO vive en el proyecto viejo**: ese repo es el sistema que factura para Armor Market y no se le mete código nuevo.

## Cómo hablan los dos sistemas

Son dos saltos distintos, con acoplamientos distintos:

1. **Gateway → base de `armorpay` (lectura directa, local).** Hace *tail* de `WebhookTransaction` por el índice `receivedAt`. NO se le agrega un endpoint al proyecto viejo: eso sería meter código en el proceso que factura. El acoplamiento de esquema es tolerable porque **la forma de esa tabla la dicta el banco**, no una decisión de producto nuestra: son los campos exactos de la notificación del BDT.
2. **Gateway → `armorpay-cloud` (HTTP firmado con HMAC).** Este sí es un contrato de API versionado, y es la frontera que sobrevive si el SaaS se muda de servidor.

El gateway **tiene que quedarse en este host para siempre**: la IP whitelisteada por el banco es la de este servidor. Por eso su lectura siempre es local, y por eso lo único que puede mudarse es el SaaS.

## Reglas que no se negocian

1. **`armorpay.vipsoft.cloud` (el proyecto viejo, puerto 3100) NO cambia de comportamiento.** Es la operación que factura para Armor Market. Este proyecto se construye al lado; el gateway LEE de su base, nunca modifica su camino crítico.
2. **Nunca custodiar ni mover fondos.** El dinero va del cliente a la cuenta del comercio; nosotros solo confirmamos. Es lo que sostiene la posición regulatoria.
3. **Nos llamamos "plataforma de validación de pagos".** Nunca "pasarela" ni "gateway" de cara al público: el regulador usa esa palabra para una categoría con obligaciones.
4. **Todo modelo con datos de comercio lleva `organizationId`.** Sin esa columna, la extensión de Prisma no tiene qué filtrar y el modelo queda expuesto entre tenants.

## Stack

- Next.js 14.2.35 (App Router) + React 18 + TypeScript
- Prisma 6 (pinneado; Prisma 7 rompe) + MariaDB `mardenli_apcloud` (+ `mardenli_apcloudsh` de shadow)
- NextAuth 4 (Credentials JWT), Tailwind 3, zod (`safeParse`)
- **Migraciones versionadas** (`prisma migrate deploy`), NO `db push`. El proyecto viejo usa `db push` por historia; este no hereda esa deuda: `db push` infiere el diff, puede descartar columnas sin preguntar y no deja historial ni rollback.

## El aislamiento entre comercios

Es lo único que, si falla, hace que un comercio vea y cobre el dinero de otro. Vive en dos archivos:

| Archivo | Qué hace |
|---|---|
| `src/lib/tenant-context.ts` | `AsyncLocalStorage` con el tenant de la petición. `runWithTenant(orgId, fn)` acota; `runAsPlatform(motivo, fn)` desactiva el filtro y **exige una razón**. Sin contexto → lanza. |
| `src/lib/prisma.ts` | Extensión sobre `$allModels` que inyecta `organizationId` en `where` (lecturas y escrituras) y en `data` (creaciones). Los modelos protegidos se descubren del DMMF, no de una lista a mano: un modelo nuevo con `organizationId` queda protegido solo. |

**Nunca escribas el `where` de tenant a mano.** Todo el punto es que no se pueda olvidar.

**Entradas SIN sesión** — cada una tiene que abrir su contexto explícitamente, y son las más fáciles de olvidar porque no hay un usuario del cual deducirlo:
- ingesta del gateway (POST firmado, sin usuario)
- workers de cola y crons de reproceso
- páginas públicas de checkout

**Prohibido `$queryRaw` sobre modelos de tenant**: no pasa por la extensión. Si alguna vez hace falta, el filtro va escrito a mano y revisado por otra persona.

**Prueba obligatoria tras tocar el aislamiento:**

```bash
npx tsx --env-file=.env scripts/test-isolation.ts   # 10 casos, incluye barrido de fuerza bruta
```

Es la excepción explícita a la convención de "sin tests" del stack VPS. Cubre: fallo cerrado sin contexto, lectura acotada, referencia exacta ajena, barrido de 2.000 sufijos, acceso directo por id ajeno, escritura cruzada, y el intento de falsificar el dueño al crear.

## Roles

`PLATFORM_ADMIN` (nosotros, sin organización) · `ORG_ADMIN` (dueño del comercio) · `OPERATOR` (caja).

## La Llave de Trabajo del banco

El BDT emite **una AuthKey por RIF**, no por cuenta: un comercio con varias cuentas comparte llave y rotarla las afecta a todas. Por eso vive en `Organization`, no en `BankAccount`.

Es un **campo de solo escritura**: se pega y nunca se vuelve a leer completa desde la interfaz. Para mostrarla se usa `authKeyHint` (`DDF…755`), guardado al grabar para no descifrar al pintar. `authKeyStatus` distingue `CARGADA` de `VERIFICADA` — que estén pegada y que funcione no es lo mismo, y el comercio tiene que ver la diferencia antes de que una caja intente cobrar.

## Despliegue

```bash
cd /home/mardenli/armorpay-cloud
npm ci && npx prisma migrate deploy && npm run build
pm2 reload armorpay-cloud --update-env
```

Puerto 3101, bind a 127.0.0.1. **Verificar que el build pasó ANTES de recargar**: encadenarlos a ciegas dejó el panel viejo caído dos minutos el 2026-06-11.

**Ojo con el corte de servicio**: en `fork_mode` con una instancia, `pm2 reload` es stop+start, no recarga sin corte. Quien tenga un formulario abierto recibe un error. Desplegar en horario de bajo tráfico.

## Notas

- Base de datos y shadow se crean con `uapi Mysql create_database` — en cPanel el usuario no puede crearlas por SQL.
- `APP_SECRET` cifra las AuthKeys (AES-256-GCM). Si se pierde, **ninguna llave se puede descifrar**. Si se restaura un backup en otro servidor, hay que llevar el mismo `APP_SECRET`.
- Vulnerabilidad conocida de `uuid` vía NextAuth 4: el "arreglo" es bajar a NextAuth 3, que es un cambio incompatible. Se acepta, igual que en el proyecto viejo.
