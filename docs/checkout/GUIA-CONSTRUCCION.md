# Guía de construcción — Checkout ArmorPay (API + embed + plugin)

> **Escrita el 2026-08-06** desde la sesión del panel interno, tras inventariar TODO el código de este repo (rutas, libs, schema, gateway, scripts, env). Es el plan de construcción paso a paso del producto checkout: que un comercio afiliado confirme compras en su propia web usando nuestra validación por referencia (BDT+BT) y el C2P del Tesoro. **A partir de acá, todo lo del SaaS se decide y construye EN ESTE REPO** — el panel interno ya entregó su única pieza (R-17) y no se toca.
>
> Leer antes: `docs/referencias-pasarelas/README.md` (los gates y las 3 guías de pasarelas del grupo). Gates al día: **G0 legal delegado a los dueños (no bloquea construir)**; C2P confirmado 100%; afiliaciones por contactos directos con los bancos; R-17 listo del lado interno.

## Arquitectura objetivo

```
BANCOS ──webhooks──▶ armorpay (interno, :3100) ─┐ WebhookTransaction (con columna banco)
                                                │
                              gateway (:3102) ──┤ ① tail RO + push HMAC ──▶ /api/ingest/bdt (SaaS :3101)
                              MISMO HOST        │
                              (IP whitelisteada)└ ② NUEVO: servidor HTTP loopback
                                                     ▲ ejecuta C2P BT / validación BDT
                                                     │ HMAC, credenciales leídas de la BD del SaaS
      Carrito del comercio ──▶ API v1 del SaaS ──────┘
      (plugin WP / embed / REST)      │
                                      └──▶ webhooks firmados al comercio (diferenciador vs MovilPay)
```

Decisiones ya tomadas (no re-litigar): la ejecución bancaria va **por el gateway** (la IP whitelisteada es la de este host; el SaaS puede mudarse, el gateway no); el gateway **no** llama APIs del panel interno (solo lee su BD con el usuario RO `mardenli_apgwro`); los clientes bancarios se **portan** como código (moldes en el repo interno: `src/lib/bt-client.ts`, `src/lib/bdt-client.ts`, `src/app/api/bank/c2p/route.ts`), nunca dependencia runtime.

## Reglas transversales (aplican a TODAS las fases)

1. **Aislamiento**: nunca escribir `where: {organizationId}` a mano — la extensión de `src/lib/prisma.ts` lo inyecta (descubre modelos protegidos por DMMF: cualquier modelo nuevo con `organizationId` queda protegido solo). Toda entrada SIN sesión abre su contexto explícito (`runAsPlatform` para resolver, `runWithTenant` para operar) — el checkout agrega DOS entradas así: la API con API key y la página pública de pago. **Tras tocar cualquier cosa del aislamiento: `npx tsx --env-file=.env scripts/test-isolation.ts` y AGREGAR casos nuevos** (ver cada fase).
2. **Migraciones versionadas** (`prisma migrate dev` → `migrate deploy`), jamás `db push`.
3. **Éxito = código del banco, jamás HTTP 200** (gate `C2P0000` para C2P; `GES0000` para BDT). El C2P del Tesoro rechaza con `codres:"ERROR"` LITERAL además de la familia `C2P####` — mapear ambos (catálogo molde: `bt-c2p-codes.ts` del repo interno).
4. **El monto lo decide el servidor** y se compara contra lo que registró el banco, nunca contra lo que declara el cliente final. Tolerancia asimétrica: rechazar subpago, aceptar sobrepago (registrándolo).
5. **Logs enmascarados** (teléfono `0412****567`, OTP `***`, cuentas, cédulas) y **cero credenciales hardcodeadas** (ni como fallback — lanzá si falta la env var; Terrazas pagó esa con un token en 4 archivos).
6. **Bitácora append-only de todo intento** (fallidos y fraudes incluidos, con motivo) + respuesta cruda del banco guardada = evidencia forense.
7. De cara al público: **«plataforma de validación de pagos»**, nunca «pasarela». Lanzar a terceros espera el OK de G0 (lo llevan los dueños); construir no.
8. Deploy: `npm run build` ANTES de recargar; `pm2 reload armorpay-cloud` y `pm2 reload armorpay-gateway` son stop+start (fork mode) — ventana de bajo tráfico.

## Limpieza barata antes de empezar (detectada en el inventario)

- **`Lead` — doc vs comportamiento**: el comentario del schema dice que NO lleva `organizationId`, pero el modelo SÍ lo declara (`organizationId String?`, trazabilidad de conversión) → `Lead` ENTRA en `TENANT_MODELS` y exige contexto. Funciona porque el código usa clientes crudos/`runAsPlatform`, pero corregí el comentario del schema para que el próximo que lea no se confíe.
- `consumoDelMes()` (`src/lib/limites.ts`) está escrita y no la consume ninguna pantalla; falta el medidor del `ORG_ADMIN`. No es parte del checkout — anotado para no perderlo.
- `sonner` y `clsx` están en package.json sin uso: usalos o sacalos.

---

## FASE 0 — Contrato v2 del gateway: el campo `banco` ✅ HECHA (2026-08-06, commit `5ff48dc`)

> Ejecutada tal como estaba escrita, mismo día. Migración `20260806162641_banco_receptor` (backfill por default: las 447 filas preexistentes eran BDT), test-isolation 11/11, desplegada con 0 turnos abiertos y verificada: 5 ciclos del gateway sin error, eventos BT siguen cayendo en `sinComercio`. Extra: comentario de `Lead` en el schema corregido (limpieza barata №1).

**Por qué primero**: `WebhookTransaction` del interno tiene columna `banco` ("BDT"|"BT") desde 2026-07-29 y el webhook BT escribe `tipo:"CREDITO"` → el gateway YA lee y reenvía filas BT, pero ni el SELECT ni el contrato llevan `banco`: si hoy se afilia un comercio BT, sus pagos se escribirían indistinguibles de BDT. El checkout valida en ambos bancos, así que esto va antes que todo.

**Cambios** (todos en este repo; el interno no se toca — su columna e índice `[banco, receivedAt]` ya existen):

1. `gateway/source.ts`: agregar `banco` al SELECT y a la interface `Row`; mapearlo al evento. NO filtrar por banco (el checkout quiere los dos); mantener `tipo = 'CREDITO'`.
2. `gateway/contract.ts`: `BankCreditEvent` gana `banco: string`. **Mantener `version: 1`** — es aditivo.
3. `prisma/schema.prisma`: migración que agrega `banco String @default("BDT")` a **`BankTransaction`** y a **`BankAccount`**, con índice `[organizationId, banco]` en la primera. El default cubre el backfill (todo lo existente es BDT — las filas BT nunca se insertaron: caían en `sinComercio`).
4. `src/app/api/ingest/bdt/route.ts`: en `eventSchema`, `banco: z.string().min(1).default("BDT")` (default = sin acople de orden de deploy) y escribirlo en el `createMany`.
5. `src/lib/operacion.ts` (`buscarPorReferencia`) y la pantalla de caja: mostrar el banco del pago (ya viaja en la fila). El filtro por tenant no cambia.

**Verificación**: `migrate dev` + build → deploy SaaS → deploy gateway → `pm2 logs armorpay-gateway` un ciclo completo sin error → una fila nueva en `BankTransaction` debe traer `banco` correcto. Los eventos BT de cuentas no registradas siguen cayendo en `sinComercio` (correcto hasta que exista un comercio BT).

---

## FASE 1 — Pata saliente del gateway: el ejecutor bancario ✅ HECHA (2026-08-06)

> Ejecutada según lo escrito: `gateway/server.ts` (node:http en 127.0.0.1:3102, HMAC con `GATEWAY_EXEC_HMAC_SECRET` propio, timeout 35 s, body ≤32 KB), `gateway/bt-c2p.ts` + `bt-c2p-codes.ts` portados (identidad C2P por parámetro, no settings — diferencia clave con el molde del interno), migración `bt_c2p_afiliacion` (`Organization.btCodAfiliado` + `btC2pEnabled`). E2E verificado en producción: health 200, HMAC inválida/faltante/replay → 401, ruta desconocida → 404, y `/exec/c2p/bancos` REAL → catálogo de 23 bancos del Tesoro (confirma base prod + IP whitelisteada). Pendiente por diseño: `/exec/c2p/pago` con dinero real se prueba en Fase 3 (monto mínimo).

El gateway hoy es un poller puro (`gateway/index.ts` lo dice: ":3102 conceptual; no expone HTTP"). Acá gana un **servidor HTTP en `127.0.0.1:3102`** (loopback estricto, Apache NO lo proxya — solo el SaaS local le habla; si el SaaS se muda algún día, ahí se expone vía Apache+TLS con la misma HMAC).

**Estructura nueva**:

- `gateway/server.ts` — `node:http` (sin framework), verificación HMAC con `verify()` del MISMO `gateway/contract.ts` (esquema timestamp.body ya probado) pero con **secreto propio** `GATEWAY_EXEC_HMAC_SECRET` (dirección SaaS→gateway; no reusar el de la ingesta — direcciones distintas, secretos distintos). Timeout de request 35 s.
- `gateway/bt-c2p.ts` — cliente C2P del Tesoro, **portado** de `armorpay/src/lib/bt-client.ts` (funciones `c2pBancos`, `c2pPago`) y su catálogo de códigos de `armorpay/src/lib/bt-c2p-codes.ts`. Puntos duros verificados en producción por el interno: base prod `https://tpmovil.bt.gob.ve/RestTesoro_C2P/com/services` (env `BT_C2P_BASE_URL`); **sin auth** — identidad = `codAfiliado` + `RIF`; canal `"06"` fijo en `/botonDePago/pago`; monto con **punto y 2 decimales**; `concepto` ≤ 40 sin acentos; aprobación ⇔ `codres === "C2P0000"`; rechazos con familia `C2P####` **o el literal `"ERROR"`**; la respuesta trae `referencia`, `montoComision` (~1,75% mín ≈2 Bs — la absorbe el receptor, no el pagador), `numeroLote`, `autorizacionISO`. El OTP en producción **lo genera el cliente pagador desde su banco** (app/SMS/web según banco — tabla por banco en la guía Fospuca citada en docs del interno) y vence en minutos.
- `gateway/bdt.ts` — **ya existe** con lo difícil resuelto (undici + TLS + header `TmSt` de 26 chars con microsegundos de `hrtime`): `echoTest`, `cuentasDeLaLlave`, `movimientosDelDia`. Agregarle lo que la validación online necesite (consulta de movimientos por cuenta+fecha ya está — alcanza para v1).

**Endpoints del ejecutor** (POST JSON, HMAC):

| Ruta | Qué hace |
|---|---|
| `/exec/c2p/pago` | `{organizationId, celular, bancoPagador, cedula, monto, otp, concepto, intentId}` → carga `codAfiliado`+`rif` de la `Organization` (ver credenciales abajo) → `/botonDePago/pago` → respuesta cruda + veredicto (`aprobado: codres==="C2P0000"`) |
| `/exec/c2p/bancos` | catálogo de bancos del servicio C2P (cachear 1 h en memoria del gateway) |
| `/exec/bdt/movimientos` | `{organizationId, cuenta, fecha}` → descifra la AuthKey de esa org → `movimientosDelDia` (respaldo online de validación) |
| `/exec/health` | sin HMAC, para monitoreo local |

**Credenciales: NUNCA viajan por HTTP.** El gateway ya importa `prisma` del SaaS (lo hace para el cursor) y tiene `APP_SECRET` en su `.env`: carga `authKeyEnc` con `descifrar()` de `src/lib/crypto.ts` y los datos BT de la org **él mismo**, dentro de `runAsPlatform("exec: credenciales de <org>")`. El SaaS solo manda `organizationId`.

**Migración de esta fase** — campos BT en `Organization`: `btCodAfiliado String?`, `btC2pEnabled Boolean @default(false)` (el RIF ya existe: `Organization.rif`). El estado de afiliación BT por comercio se maneja con los mismos `OrgStatus` + estos campos.

**`gateway/index.ts`**: levantar el server junto al loop (mismo proceso PM2 `armorpay-gateway`); apagarlo en `shutdown()`.

**Verificación**: unit local con HMAC inválida → 401; `/exec/c2p/bancos` E2E real (es de solo lectura, sin costo); el `/exec/c2p/pago` real se prueba recién en Fase 3 con monto mínimo (no hay sandbox — precedente interno: cobro real de 12 Bs).

---

## FASE 2 — Modelo de datos del checkout ✅ HECHA (2026-08-06)

> Migración `checkout_modelo_datos` tal como estaba diseñada (ApiKey, CheckoutIntent + enums, WebhookEndpoint, WebhookDelivery, ApiEvent; PaymentClaim con caja nullable + `CHECKOUT` + `checkoutIntentId @unique`). Desviaciones deliberadas: índice extra `[status, expiresAt]` en CheckoutIntent (housekeeping del worker) y FKs reales en CheckoutIntent↔BankTransaction/PaymentClaim (integridad; WebhookDelivery y ApiEvent sin FK como estaba escrito). test-isolation extendido a 15 casos (11-13 nuevos, ambos sentidos del árbitro) — 15/15. Fallout resuelto: el código de caja ahora muestra «cobrado por el checkout web» cuando el cobro no tiene caja.

Todos con `organizationId` → protegidos solos por la extensión DMMF.

```prisma
model ApiKey {
  id             String    @id @default(cuid())
  organizationId String
  name           String                    // "producción tienda web"
  prefix         String    @unique         // "ak_live_" + 8 chars visibles — lookup
  hashedKey      String                    // sha256 del key completo; el key se muestra UNA vez al crearlo
  isActive       Boolean   @default(true)
  lastUsedAt     DateTime?
  createdAt      DateTime  @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])
}

enum IntentStatus { PENDING CONFIRMED FAILED EXPIRED }
enum IntentMethod { REFERENCIA C2P }

model CheckoutIntent {
  id             String       @id @default(cuid())
  organizationId String
  apiKeyId       String
  externalRef    String                    // id del pedido en el carrito del comercio
  amountVES      Decimal      @db.Decimal(18, 2)
  concepto       String                    // ≤40, saneado — viaja al C2P
  method         IntentMethod?
  status         IntentStatus @default(PENDING)
  idempotencyKey String
  // resultado
  bankTransactionId String?                // camino REFERENCIA
  c2pReferencia     String?                // camino C2P (referencia bancaria)
  c2pCodres         String?
  gatewayResponse   String?  @db.Text      // crudo del banco — evidencia forense
  overpaidVES       Decimal? @db.Decimal(18, 2)
  expiresAt      DateTime
  confirmedAt    DateTime?
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  @@unique([organizationId, idempotencyKey])
  @@index([organizationId, status, createdAt])
}

model WebhookEndpoint {
  id             String  @id @default(cuid())
  organizationId String
  url            String
  secretEnc      String  @db.Text          // AES-256-GCM con APP_SECRET (crypto.ts)
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])
}

enum DeliveryStatus { PENDING DELIVERED FAILED_RETRYING DEAD }

model WebhookDelivery {
  id          String  @id @default(cuid())
  organizationId String
  endpointId  String
  intentId    String
  payload     String  @db.Text
  status      DeliveryStatus @default(PENDING)
  attempts    Int     @default(0)
  nextRetryAt DateTime @default(now())
  lastError   String? @db.Text
  createdAt   DateTime @default(now())
  @@index([status, nextRetryAt])
  @@index([organizationId, createdAt])
}

model ApiEvent {                            // bitácora append-only + base del rate limit
  id             String   @id @default(cuid())
  organizationId String
  apiKeyId       String?
  intentId       String?
  action         String                    // intent_created | ref_validated | ref_rejected | c2p_ok | c2p_fail | ...
  detail         String?  @db.Text         // SIEMPRE enmascarado
  clientIp       String?
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
  @@index([clientIp, createdAt])            // rate limit persistido, patrón Lead
  @@index([apiKeyId, createdAt])
}
```

**El árbitro antifraude NO se duplica** (lección madre del panel interno: "no crear antifraude paralelo"). `PaymentClaim.primaryKey @unique` ya arbitra los cobros de caja race-safe. El checkout **comparte ese árbitro**:

- Migración: `shiftId`, `userId`, `branchId` de `PaymentClaim` pasan a **nullable** (un cobro de checkout no tiene caja); `ClaimSource` gana `CHECKOUT`; columna nueva `checkoutIntentId String? @unique`.
- Camino REFERENCIA: al confirmar, `create` de `PaymentClaim` con `primaryKey = bankTransaction.id` — **la misma clave que usa la caja** → la BD garantiza que un pago cobrado en caja no confirma un checkout ni al revés (`P2002` = ya cobrado: responder 409 tipificado con quién lo tiene).
- Camino C2P: no hay `BankTransaction` — `primaryKey = "c2p:" + organizationId + ":" + c2pReferencia` (clave sintética, mismo patrón que el interno usa para cobros online).
- `buscarPorReferencia()` ya anota `cobrado` — la caja verá "cobrado por checkout" gratis.

**test-isolation.ts — casos nuevos obligatorios**: (11) `ApiKey` de la org A no resuelve intents de B; (12) `CheckoutIntent` con `idempotencyKey` repetida entre orgs distintas NO colisiona (el unique es compuesto); (13) confirmación de checkout sobre una `BankTransaction` ya cobrada en caja → `P2002`, y viceversa.

---

## FASE 3 — API pública v1 ✅ HECHA (2026-08-06) — pendiente SOLO la E2E con dinero real

> Código completo y desplegado: `api-auth.ts` (Bearer + prefix + timingSafeEqual + `withApiAuth` que abre el tenant), `api-rate-limit.ts` (persistido sobre ApiEvent: 60/min por key, 15/5min por IP cross-tenant en validación), `checkout.ts` (intentPublico/encolarWebhooks/saneos), `exec-client.ts` (SaaS→ejecutor firmado), `bancos-ve.ts` portado (0175 = «BDT (antes Bicentenario)»), los 5 endpoints, y pantalla `/comercio/api` de llaves para el ORG_ADMIN (se muestra UNA vez, máx. 5 activas). E2E sintética contra el servidor vivo: **20/20** (auth, idempotencia, saneo de concepto, sobrepago registrado, 409 con `cobradoPor`, subpago con faltante, C2P 422 sin habilitación, 400 por formato antes de llamar al banco, webhook encolado, bitácora enmascarada). **Falta la verificación de la guía con dinero real** (pago móvil Bs 1 → CONFIRMED → 409 al repetir; C2P monto mínimo → C2P0000; OTP vencido → error traducido): requiere comercio piloto con `btC2pEnabled` y a Neri del lado pagador.

**Auth**: `src/lib/api-auth.ts` — `Authorization: Bearer ak_live_xxxxxxxx...`: lookup por `prefix` (con cliente crudo + `runAsPlatform("api: resolver key")`), `timingSafeEqual` del sha256, chequear `isActive` + `Organization.status === "ACTIVA"`, actualizar `lastUsedAt` best-effort, y devolver el `organizationId` para envolver TODO el handler en `runWithTenant`. Es la tercera entrada sin sesión (junto a ingesta y — Fase 5 — la página pública): el comentario de `tenant-context.ts` ya la anticipa.

**Rate limit persistido** (patrón `Lead`, multi-instancia-safe): contar `ApiEvent` por `apiKeyId` y por `clientIp` en ventana (ej. 60/min por key, 15/5min por IP en validación de referencia — 6 dígitos se adivinan por fuerza bruta). Responder 429 con `Retry-After`.

**Endpoints** (todos zod `safeParse`, errores tipificados con `code` accionable — aprender del error `1010` críptico del BDV que documenta la guía 3):

| Endpoint | Contrato |
|---|---|
| `POST /api/v1/intents` | Headers: `Idempotency-Key` obligatorio. Body: `{externalRef, amountVES, concepto}`. Crea `CheckoutIntent` PENDING con `expiresAt = now + 30 min`. Repetido (unique compuesto) → devolver el existente, 200. |
| `GET /api/v1/intents/{id}` | Estado (para polling del carrito). |
| `POST /api/v1/intents/{id}/validate-reference` | Body: `{referencia (≥6 díg), bancoPagador?, telefonoPagador?}`. Flujo: intent PENDING y no vencido → buscar `BankTransaction` tenant-scoped `{tipo:"CREDITO", referencia:{endsWith}}` (cuentas activas del comercio, ambos bancos) → si 0 resultados: `PAYMENT_NOT_FOUND` («si acabás de pagar, esperá 1-2 min» — con webhook el lag es corto pero existe) → match por inclusión; si varios, desambiguar por monto, **si ninguno matchea exacto FALLAR** (nunca `results[0]` — deuda #3 de VIP Play) → monto: `paid >= amountVES - max(1, 0.5%)` (subpago → `INSUFFICIENT_AMOUNT` con faltante; sobrepago → confirmar y registrar `overpaidVES`) → **cobro**: `PaymentClaim` con `primaryKey = tx.id` (P2002 → `REFERENCE_ALREADY_USED`, 409) → intent CONFIRMED + `ApiEvent` + encolar webhook. |
| `POST /api/v1/intents/{id}/c2p` | Body: `{celular, bancoPagador, cedula, otp}` (validar formatos venezolanos ANTES de llamar: `04(12|14|16|24|26)\d{7}`, `[VEP]\d{6,9}`, banco 4 díg). → gateway `/exec/c2p/pago` → gate `C2P0000` → `PaymentClaim` sintético → CONFIRMED. `codres` ≠ C2P0000 (o `"ERROR"`) → FAILED parcial (el intent admite reintento con OTP nuevo mientras no venza), mensaje traducido por catálogo. Requiere `Organization.btC2pEnabled`. |
| `GET /api/v1/banks` | Catálogo unificado (portar `bancos-ve.ts` del interno como lib propia — lista ÚNICA, la duplicación fue la deuda #1 de VIP Play; incluir «BDT (antes Bicentenario)» 0175 vs Tesoro 0163). |

**Vencimiento**: los intents PENDING vencidos pasan a EXPIRED — lo hace el worker (Fase 4).

**Verificación E2E real** (sin sandbox, precedente interno): pago móvil real de Bs 1 a una cuenta del comercio piloto → `validate-reference` → CONFIRMED; repetir la misma referencia → 409; C2P real de monto mínimo → `C2P0000`; OTP vencido a propósito → error traducido, sin confirmar.

---

## FASE 4 — Worker: webhooks salientes + housekeeping ✅ HECHA (2026-08-06)

> `worker/index.ts` corriendo como `armorpay-worker` en PM2 (tsx, patrón del gateway con alertas sendmail `-f`). Entregas con la firma del contrato (`x-armorpay-*`), backoff 1m/5m/30m/2h/12h → DEAD, endpoint inactivo → DEAD sin ruido; housekeeping con `updateMany` condicionado (no pisa lo confirmado) + webhook `intent.expired`. UI de webhooks agregada a `/comercio/api` (secreto `whsec_` mostrado UNA vez, cifrado en reposo, URL https pública obligatoria, máx. 3 activos). E2E contra el proceso vivo: 6/6 (DELIVERED con firma válida verificada por un receptor real, FAILED_RETRYING con backoff, EXPIRED sin tocar CONFIRMED).

Proceso PM2 nuevo `armorpay-worker` (tsx, mismo patrón que el gateway: loop + try/catch + sendmail con `-f` tras N fallos — copiar el esquema de alertas de `gateway/index.ts`, incluida la lección SPF).

- **Entregas**: `WebhookDelivery` PENDING/FAILED_RETRYING con `nextRetryAt <= now` → POST a `WebhookEndpoint.url` con firma `sign(secret, timestamp, body)` del MISMO esquema `gateway/contract.ts` (headers `x-armorpay-signature`/`x-armorpay-timestamp` — el comercio verifica igual que nosotros verificamos la ingesta; documentarlo con ejemplo de código en las docs públicas). Backoff exponencial (1m, 5m, 30m, 2h, 12h → DEAD), payload = intent completo sin datos sensibles del pagador.
- **Housekeeping**: intents vencidos → EXPIRED (+ webhook `intent.expired` opcional).
- Todo dentro de `runAsPlatform("worker: <motivo>")` para leer cross-tenant, y `runWithTenant` para escribir.

Este es el **diferenciador**: ni MovilPay ni el BDV avisan — nosotros sí, porque el banco NOS avisa (webhook-first).

## FASE 5 — Embed + plugin WordPress ✅ HECHA (2026-08-06) — plugin pendiente de probar en un WP real

> **Refactor previo**: los dos flujos de cobro se extrajeron a `src/lib/checkout-flows.ts`, COMPARTIDOS por la API v1 y `/pay` — un solo camino antifraude, dos puertas. **`/pay/{intentId}`** desplegada: máquina de estados completa (referencia | c2p-datos → otp con countdown 300s → validating → success/error/sobrepago/vencido), razonSocial + monto exacto con copiar, cuentas enmascaradas, `postMessage` al iframe padre al confirmar, degrada a solo-referencia si el catálogo C2P no responde; render verificado con intent vivo (9/9). **Plugin WooCommerce** en `integrations/woocommerce/armorpay-gateway/` (php -l limpio): crea el intent server-side (Idempotency-Key = order key), redirige a `/pay`, confirma por webhook firmado (HMAC verificada con `hash_equals` + anti-replay 300s) con polling de respaldo en el thankyou; solo moneda VES; el plugin no valida nada él mismo. **Falta**: instalarlo en un WordPress real y correr el circuito completo.

- **Página pública `/pay/{intentId}`** (checkout alojado, la vía más rápida a producción): sin sesión — abre contexto resolviendo el intent con `runAsPlatform` y operando con `runWithTenant(intent.organizationId)`. Máquina de estados del molde VIP Play: `elegir método → (referencia | c2p-form → otp con countdown 300s) → validating → success | error | overpayment`. Muestra `Organization.razonSocial` (el schema ya lo dice: «el checkout muestra ESTA»), datos de pago (cuenta/teléfono receptor + monto EXACTO con botón copiar) e inputs con `inputMode="numeric"`. El comercio integra con un redirect o un `<iframe>` + `postMessage` del resultado.
- **Plugin WooCommerce**: clase `WC_Payment_Gateway` que crea el intent por API v1 (server-side, el API key nunca al navegador), redirige a `/pay/{id}` y confirma el pedido por webhook (con verificación de firma) o polling de respaldo. El plugin NO valida nada él mismo — toda la lógica queda de nuestro lado.
- SDK JS liviano después, si hace falta para carritos custom (el REST ya alcanza).

## FASE 6 — Módulo USD/BCV ✅ HECHA (2026-08-06)

> Ejecutada según su diseño (guías 1 §7.2/§10 y 3 §5): `ExchangeRate` como historial-auditoría (cada lectura persiste; la más nueva es el caché, TTL 30 min), `src/lib/bcv.ts` con dos fuentes en cascada (dolarapi → pydolarve) + última conocida hasta 24 h + `TasaNoDisponible` explícito — jamás hardcodeada. `POST /intents` acepta `amountUSD` XOR `amountVES` (congela VES con la tasa y guarda `exchangeRateUsed`/`exchangeRateId`; sin tasa → 503 `RATE_UNAVAILABLE`); validación por **candidatos** (VES congelado y USD×tasa vigente, tolerancia por candidato, sobrepago medido contra el candidato más alto cubierto; la caída de la fuente jamás frena una validación). `/pay` muestra el USD y la tasa; el worker mantiene la tasa tibia; **`GET /api/v1/exchange-rate`** expone la tasa al integrador (valor agregado definido por Neri: preciar con la misma tasa que valida). E2E real: tasa 755.9001 leída de la fuente, intent de $25 congelado en Bs 18.897,50 y confirmado exacto. Docs públicas actualizadas.

Solo si los comercios precian en USD: fuente única de tasa con fallbacks y **error explícito** (jamás tasa hardcodeada), `exchangeRateUsed`+`exchangeRateId` en el intent, y validación de monto por **candidatos** (monto grabado / total×tasa del intent / total×tasa vigente) con tolerancia — el diseño completo está en las guías 1 (§7.2, §10) y 3 (§5). El checkout v1 opera en **VES puros** (el carrito manda `amountVES`): menos piezas, cero drift.

## Orden de commits sugerido

1. `feat(gateway): contrato v2 — campo banco end-to-end` (Fase 0 completa, chica y verificable)
2. `feat(gateway): ejecutor bancario en loopback (C2P Tesoro + BDT online)` (Fase 1)
3. `feat(checkout): modelo de datos + árbitro compartido con PaymentClaim` (Fase 2 + test-isolation extendido)
4. `feat(api): v1 de checkout (intents, referencia, c2p, banks)` (Fase 3)
5. `feat(worker): webhooks firmados al comercio + vencimientos` (Fase 4)
6. `feat(pay): página pública de pago` / `feat(plugin): WooCommerce` (Fase 5)

Cada commit: código + docs juntos, build verde antes de reload, y entrada de changelog solo cuando algo sea visible al negocio.
