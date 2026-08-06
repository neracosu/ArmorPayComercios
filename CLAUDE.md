# ArmorPay Cloud — Contexto del proyecto

**Plataforma de validación de pagos** multi-tenant. Comercios confirman en segundos que un pago móvil llegó a su cuenta, con control por caja, turnos y cierre. Dominio: `armorpay.net`. Nace el 2026-07-20 derivado de `armorpay` (el sistema interno de Armor Market, en `/home/mardenli/armorpay`).

**Plan maestro del producto**: `~/.claude/plans/moonlit-pondering-parasol.md`. Tiene fases, gates, riesgos y las decisiones ya cerradas. Leerlo antes de empezar cualquier tarea grande.

**Repo**: `git@github.com:neracosu/ArmorPayComercios.git`, rama `main`, remote `origin` vía el alias SSH `github-armorpaycomercios`. Reusa `~/.ssh/id_ed25519_armorpay_github`, que está registrada **a nivel de cuenta** en GitHub y por eso sirve para todos los repos de `neracosu` (no es una deploy key). Ojo con el nombre: el repo se llama **ArmorPayComercios** y el directorio local `armorpay-cloud` — es el mismo proyecto.

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

## El segundo banco del interno y lo que cambia acá (2026-08-06)

Desde 2026-07-29 el proyecto interno está afiliado a un **segundo banco: Banco del Tesoro (BT, 0163)**, en producción completa desde el 08-03. Consecuencias verificadas leyendo el código de ambos lados:

- `WebhookTransaction` (la tabla que el gateway tailea) ya no es solo BDT: tiene columna **`banco` ("BDT"|"BT")** con índice `[banco, receivedAt]`. El webhook BT del interno escribe `tipo = "CREDITO"`, así que el gateway lee y reenvía también las filas BT. Las cuentas BT que no existen como `BankAccount` de ningún comercio caen en `sinComercio` y se descartan — correcto hasta que se afilie un comercio BT.
- **Gate BT: RESUELTO el 2026-08-06 (Fase 0 del checkout)** por la vía del contrato: `banco` viaja end-to-end — `gateway/source.ts` (SELECT, sin filtrar: el checkout valida en ambos bancos) → `BankCreditEvent.banco` (aditivo, `version: 1` se mantiene) → ingesta con `default("BDT")` en zod (cero acople de orden de deploy) → columnas `banco` en `BankTransaction` (índice `[organizationId, banco]`) y `BankAccount` → chip visible en la caja. Migración `20260806162641_banco_receptor`; backfill por default (todo lo preexistente era BDT).
- El **C2P/«Botón de Pago» del Tesoro NO pasa por `WebhookTransaction`** (en el interno vive en `ValidationRequest`) → el gateway nunca lo ve. La ejecución C2P del SaaS es la Fase 1 de la guía del checkout: integración nueva por el ejecutor del gateway, no por esta vía.

**Regla de trabajo entre proyectos**: cada repo se administra en SU propia sesión de Claude Code (`/home/mardenli/armorpay` y `/home/mardenli/armorpay-cloud`), cada uno con su memoria — nunca editar ambos desde una misma sesión. Todo cambio del interno que toque `WebhookTransaction` (columnas, valores de `tipo`, bancos nuevos) se contrasta con `gateway/source.ts` + `gateway/contract.ts` antes de desplegar; esa regla también está escrita en el CLAUDE.md del interno.

## Visión de producto: checkout para e-commerce (2026-08-06)

Próxima evolución definida por Neri: que el comercio afiliado confirme compras **en su propia web** (plugin WordPress, embed, o API para su carrito) usando la validación por referencia y el BT C2P (**confirmado 100% operativo**, 2026-08-06). Las guías base — 3 pasarelas del grupo en producción (VIP Play, Terrazas, Hotel La Guaira) — están en `docs/referencias-pasarelas/`, con un README que las mapea a este producto y lleva el **estado de los gates**: el único abierto es **G0 (opinión legal del plan maestro)**; ya decidido que la ejecución C2P va **por el gateway** (dominio distinto, mismo servidor whitelisteado) y que las afiliaciones por comercio se gestionan vía contactos directos con los bancos. **El plan de construcción completo, paso a paso y por fases, está en `docs/checkout/GUIA-CONSTRUCCION.md`** (escrito 2026-08-06 tras inventariar todo este repo): Fase 0 contrato v2 con `banco` → Fase 1 ejecutor bancario en el gateway (HTTP loopback :3102, C2P + BDT online) → Fase 2 modelo de datos (árbitro antifraude COMPARTIDO con `PaymentClaim.primaryKey`, no paralelo) → Fase 3 API v1 → Fase 4 worker de webhooks salientes → Fase 5 página `/pay` + plugin WooCommerce. **Empezar por ahí** — el README de referencias-pasarelas queda como material de fondo. **R-17 ya quedó implementado del lado interno** (2026-08-06) y el panel interno NO se toca más: todo el checkout se construye en este repo. De cara al público sigue rigiendo la regla: «plataforma de validación de pagos», nunca «pasarela».

## Reglas que no se negocian

1. **`armorpay.vipsoft.cloud` (el proyecto viejo, puerto 3100) NO cambia de comportamiento.** Es la operación que factura para Armor Market. Este proyecto se construye al lado; el gateway LEE de su base, nunca modifica su camino crítico.
2. **Nunca custodiar ni mover fondos.** El dinero va del cliente a la cuenta del comercio; nosotros solo confirmamos. Es lo que sostiene la posición regulatoria.
3. **Nos llamamos "plataforma de validación de pagos".** Nunca "pasarela" ni "gateway" de cara al público: el regulador usa esa palabra para una categoría con obligaciones.
4. **Todo modelo con datos de comercio lleva `organizationId`.** Sin esa columna, la extensión de Prisma no tiene qué filtrar y el modelo queda expuesto entre tenants.

## Stack

- Next.js 14.2.35 (App Router) + React 18 + TypeScript
- Prisma 6 (pinneado; Prisma 7 rompe) + MariaDB `mardenli_armorpaycomercios` (+ `mardenli_apcshadow` de shadow, solo para `migrate dev`)
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
