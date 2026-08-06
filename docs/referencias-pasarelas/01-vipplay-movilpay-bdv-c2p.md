# Pasarelas de pago Venezuela — guía técnica de replicación (VIP Play Sport Bar)

> **Origen**: vipplaysportbar.com, en producción. MovilPay (validador de Pago Móvil) y BDV C2P (débito inmediato con OTP), tal como están corriendo. Escrita leyendo el código que hoy cobra, no de memoria (2026-08). Entregada por Neri el 2026-08-06 como guía base para el producto checkout de ArmorPay.
>
> Reemplaza a cinco guías anteriores de ese repo, borradas el 2026-06-01 (commit `3f40ea6`) porque una tenía credenciales escritas adentro. Acá no van credenciales: los tokens viven en `.env` y en `SystemConfig`.

## 1. Qué es cada una (y por qué no se parecen en nada)

Los dos cobran en bolívares y los dos terminan marcando un pedido como pagado, pero son mecanismos opuestos. Confundirlos es el primer error de diseño.

| | MovilPay | BDV C2P |
|---|---|---|
| Qué hace | Verifica un pago que ya ocurrió | Ejecuta el cobro |
| Quién mueve la plata | El cliente, desde su app bancaria | Tu sistema, contra la cuenta del cliente |
| El dinero llega a | Tu cuenta receptora de Pago Móvil | Tu cuenta de comercio en el BDV |
| Qué le pedís al cliente | Los 6 dígitos de la referencia | Cédula, teléfono, banco y un OTP |
| Pasos | 1 llamada | 2 llamadas (pedir OTP → procesar) |
| Si falla | El cliente ya pagó, vos no lo encontrás | No se debitó nada |
| Reversa | No existe (fue una transferencia normal) | `annulment` |
| Riesgo principal | Referencia reusada / monto que no coincide | OTP vencido, cliente no afiliado |

**MovilPay es pasivo.** El cliente hace un Pago Móvil común y corriente al teléfono/RIF del negocio. MovilPay es un servicio que ve los pagos que entran a esa cuenta y expone una API para buscarlos. Tu backend pregunta «¿entró un pago con referencia 123456?» y decide.

**BDV C2P es activo.** «C2P» es Cliente a Persona: el comercio debita la cuenta del cliente con su autorización, dada mediante un OTP que le manda su propio banco. Es un débito inmediato: cuando la API responde éxito, la plata ya se movió.

**Consecuencia de diseño**: con MovilPay nunca confíes en el cliente sobre si pagó — preguntale al validador. Con C2P nunca confíes en el HTTP 200 — mirá el código de respuesta.

## 2. Lo que hay que conseguir antes de escribir una línea

Esta es la parte que no es programación y la que más tarda.

**MovilPay**
- Cuenta en https://movilpay.app.
- Asociar la cuenta bancaria receptora (teléfono afiliado a Pago Móvil + RIF del negocio).
- Del panel de MovilPay sale un token de API.
- El token es de la cuenta: un token, una cuenta receptora. Si tenés dos negocios con cuentas distintas, son dos tokens.

**BDV C2P**
- Se tramita en agencia con el Banco de Venezuela, no por internet.
- Requiere cuenta jurídica en el BDV, afiliación a Pago Móvil y contrato de comercio C2P.
- El BDV entrega la API key y habilita el teléfono del comercio.
- No hay sandbox público. Se prueba en producción con montos mínimos (ver §11).

Planificá el trámite del BDV con semanas de anticipación. MovilPay se resuelve en un día; el C2P no.

## 3. Contratos HTTP exactos

### 3.1 MovilPay

```
Base URL: https://validator.movilpay.app
Auth:     Authorization: Token <MOVILPAY_TOKEN>
```

| Endpoint | Método | Para qué |
|---|---|---|
| `/api/payments/?search=<referencia>` | GET | Buscar pagos recibidos |
| `/api/payments/banks/` | GET | Lista de bancos |
| `/api/payments/payment_methods/` | GET | Métodos de pago |

Respuesta de la búsqueda:

```json
{
  "results": [
    {
      "id": 12345,
      "reference": "001234560000",
      "amount": "1500.00",
      "amount_usd": "40.54",
      "mobile": "04121234567",
      "date": "2026-04-19",
      "bank_origin_name": "Banesco",
      "bank_origin_code": "0134",
      "description": "Pago movil"
    }
  ]
}
```

Detalles que importan:

- `results` puede venir vacío aunque el cliente haya pagado: los pagos tardan en aparecer. Vacío significa «todavía no lo veo», no «no existe».
- La referencia del validador es más larga que la que teclea el cliente. El cliente da 6 dígitos; `reference` viene con relleno (`001234560000`). Por eso el match es `p.reference.includes(referenciaDelCliente)`, no `===`.
- La búsqueda por 6 dígitos puede devolver varios pagos. El código toma el que contiene la referencia y, si ninguno, el primero. Ver §12: esto es deuda.
- **No hay webhook.** Es polling disparado por el cliente cuando aprieta «ya pagué».

### 3.2 BDV C2P

```
Base URL: https://bdvconciliacion.banvenez.com
Auth:     X-API-Key: <BDV_C2P_API_KEY>
Headers:  Accept: application/json · Content-Type: application/json
```

| Endpoint | Método | Para qué |
|---|---|---|
| `/BankMobilePaymentC2P/paymentkey` | POST | Paso 1: pedir OTP |
| `/BankMobilePaymentC2P/process` | POST | Paso 2: cobrar |
| `/BankMobilePaymentC2P/annulment` | POST | Anular |

Paso 1 — pedir OTP:

```json
{
  "customerDocumentId": "V12345678",
  "customerNumberInstrument": "04121234567",
  "customerBankCode": "0102"
}
```
→ `{ "code": "1000", "message": "OTP enviado exitosamente" }`

El OTP lo manda el banco del cliente por SMS. Vale ~300 segundos.

Paso 2 — procesar:

```json
{
  "customerDocumentId": "V12345678",
  "customerNumberInstrument": "04121234567",
  "customerBankCode": "0102",
  "otp": "123456",
  "amount": "1500.0",
  "concept": "Pago Mi Negocio",
  "coinType": "VES",
  "commerceNumberInstrument": "04241234567",
  "operationType": "CELE"
}
```
→

```json
{
  "code": "1000",
  "message": "Transaccion exitosa",
  "data": {
    "referencia": "REF123456",
    "endToEndId": "01020172980J12345678904121234567202604192051030700158630090",
    "fecha": "2026-04-19",
    "hora": "20:51:03",
    "monto": "1500.0",
    "concepto": "Pago Mi Negocio"
  }
}
```

**Las dos reglas que rompen todo si las ignorás:**

1. **El éxito es `code === "1000"`, no el HTTP status.** El BDV responde HTTP 200 con `code: "1055"` (OTP vencido). Si tratás 200 como éxito, marcás como pagados pedidos que nunca se cobraron. Pasó acá.
2. **Los datos están en `response.data`, no en la raíz.** Leer `response.endToEndId` devuelve `undefined` y el pedido queda sin referencia bancaria. También pasó acá.

Las dos juntas son el bug histórico de esta integración.

`operationType: "CELE"` es el tipo de operación C2P; es constante. `commerceNumberInstrument` es el teléfono del comercio (el tuyo), no el del cliente.

### 3.3 El endToEndId, y por qué conviene desglosarlo

Es la referencia interbancaria (~58 dígitos) y es la prueba del pago. Guardala siempre. Su estructura:

```
[BcoReceptor 4][BcoEmisor 4][TipoOp 3][RIF ~10][TelComercio 11][Fecha 8][Hora 6][Secuencial ~12]

0102 0172 980 J123456789 04121234567 20260321 205103 070015863009
```

Cuando un cliente reclama, poder leer banco, fecha, hora y secuencial de la referencia resuelve la discusión sin llamar al banco. Ojo con el parser: ubicar la fecha por regex de año `202X|203X` en vez de por posición fija, porque el RIF tiene largo variable.

## 4. Modelo de datos mínimo

```prisma
model PaymentLog {
  id                   String   @id @default(cuid())
  orderId              String?          // NULL al crearse: la orden todavía no existe (§6)
  tableSessionId       String?

  action               PaymentAction
  status               PaymentLogStatus
  amount               Decimal?         // USD
  amountVES            Decimal?         // Bolívares
  currency             String?

  gatewayProvider      String?          // 'movilpay' | 'bdv_c2p'
  gatewayTransactionId String?          // endToEndId (C2P) | id de MovilPay
  gatewayResponse      String?  @db.Text

  customerPhone        String?
  customerBankCode     String?
  paymentReference     String?

  triggeredBy          String?          // 'customer' | 'staff' | 'system'
  notes                String?
  createdAt            DateTime @default(now())

  @@index([orderId]) @@index([tableSessionId]) @@index([action])
  @@index([status])  @@index([createdAt])
}

// Anti-fraude: una referencia = un pago. El @unique ES el control.
model MobilePaymentReference {
  id             String    @id @default(cuid())
  reference      String    @unique
  amount         Decimal
  orderId        String?
  tableSessionId String?
  usedAt         DateTime  @default(now())
  validatedAt    DateTime?

  @@index([usedAt])
}

enum PaymentAction {
  PAYMENT_CREATED  OTP_REQUESTED  OTP_SENT
  PAYMENT_PROCESSING  PAYMENT_SUCCEEDED  PAYMENT_FAILED
  PAYMENT_CANCELLED   PAYMENT_REFUNDED
  VALIDATION_ATTEMPTED  VALIDATION_SUCCEEDED  VALIDATION_FAILED
  OVERPAYMENT_DETECTED  OVERPAYMENT_REFUNDED  OVERPAYMENT_CREDITED
}

enum PaymentLogStatus { PENDING PROCESSING SUCCEEDED FAILED CANCELLED }
```

Campos que hay que agregarle al pedido:

```prisma
  paymentGateway       String?   // 'movilpay' | 'bdv_c2p' | null (manual)
  paymentReference     String?   // los 6 dígitos (MovilPay)
  gatewayTransactionId String?   // endToEndId (C2P)
  gatewayStatus        String?   // PENDING | VALIDATED | FAILED
  customerBankCode     String?
  gatewayResponse      String?   @db.Text

  idempotencyKey       String?   @unique   // evita el pedido duplicado por doble clic

  exchangeRateUsed     Float?    // tasa con la que se calculó el monto en Bs
  exchangeRateId       String?
  amountUSD            Decimal?
  amountVES            Decimal?
```

**Regla de moneda que evita un dolor de cabeza contable**: para MovilPay y C2P, el monto va siempre en `amountVES` y `amount` queda en NULL. `amount + currency: 'USD'` es solo para pagos manuales. Mezclarlos hace que el panel de auditoría sume bolívares con dólares. Ya pasó.

`exchangeRateUsed` y `exchangeRateId` no son decorativos: son lo que permite explicar, tres meses después, por qué un pedido de $10 cobró Bs. 1.480 y no Bs. 1.510.

## 5. Los clientes

Ambos usan el módulo `https` de Node directamente (no fetch, no axios) con **timeout de 30 s**. Es una elección deliberada: estas APIs a veces se quedan colgadas y sin timeout explícito el request de Next.js se cae solo, dejando el `PaymentLog` en PROCESSING para siempre.

### 5.1 MovilPay — `lib/payment-gateways/movilpay-client.ts`

Lo esencial de `validatePayment()`:

```ts
const searchUrl = `/api/payments/?search=${validationData.reference}`
// GET con Authorization: Token <token>

const results = data.results || []
if (results.length === 0) return { success: false, error: 'Pago no encontrado' }

// La referencia del validador trae relleno: match por inclusión, no por igualdad
const payment = results.find(p => p.reference?.includes(validationData.reference)) || results[0]

// Tolerancia de 1 Bs por redondeo
const difference = Math.abs(parseFloat(payment.amount) - parseFloat(validationData.amount))
if (difference > 1.00) {
  // distinguir subpago (el cliente puede completar) de sobrepago (hay que devolverle)
}
```

### 5.2 BDV C2P — `lib/payment-gateways/bdv-c2p-client.ts`

Los cuatro helpers de formato son obligatorios; el BDV rechaza sin explicar:

```ts
formatDocumentId('12345678')      // → 'V12345678'   (solo números ⇒ asume V)
formatAmount('1500,50')           // → '1500.5'      (punto, UN decimal)
sanitizeText('Pizza Napolitaña')  // → 'Pizza Napolitana' (sin acentos ni símbolos, máx 100)
isValidPhone('04141234567')       // → /^04(12|14|16|24|26)\d{7}$/
```

- **Monto**: punto decimal y UN solo decimal (`toFixed(1)`). Con dos decimales o con coma, falla.
- **Concepto**: sin acentos, sin caracteres especiales, máximo 100 caracteres.
- **Teléfono**: 0412/0414 (Movistar), 0416/0426 (Movilnet), 0424 (Digitel). Cualquier otro prefijo no es un celular venezolano válido.

Y el manejo de respuesta, que es donde estuvo el bug:

```ts
if (response.code && response.code !== '1000') {
  return { success: false, code: response.code, message: translateError(response) }
}
const responseData = response.data || response   // los datos viven en .data
```

**Enmascarado en logs.** El cliente loguea el teléfono como `0412****567` y el OTP como `***`. Si copiás el código, copiá también esto: los logs de PM2 los lee cualquiera con acceso al servidor.

### 5.3 Códigos de banco

Códigos ISO de 4 dígitos. La lista es **única** y vive en `lib/venezuelan-banks.ts`; ni el cliente C2P, ni el panel, ni la página de pago escriben nombres de banco. `getBanks()` la lee de ahí.

```
0102 Banco de Venezuela · 0104 Venezolano de Crédito · 0105 Mercantil · 0108 BBVA Provincial
0114 Bancaribe · 0115 Exterior · 0116 BOD · 0128 Caroní · 0134 Banesco · 0137 Sofitasa
0138 Plaza · 0151 BFC · 0156 100% Banco · 0157 DelSur · 0163 Banco del Tesoro · 0166 Agrícola
0168 Bancrecer · 0169 Mi Banco · 0171 Activo · 0172 Bancamiga · 0173 BID · 0174 Banplus
0175 BDT · 0177 Banfanb · 0178 N58 · 0191 BNC
```

Dos bancos que se confunden todo el tiempo, y con razón:

- **0175 = BDT** — Banco Digital de los Trabajadores. Es el que antes se llamaba Banco Bicentenario. Cambió de nombre, no de código.
- **0163 = Banco del Tesoro (BT).** Otro banco, otro código.

Las siglas se parecen y el cambio de nombre es reciente, así que mucha gente todavía busca «Bicentenario». Por eso el desplegable dice «BDT - Banco Digital de los Trabajadores (antes Bicentenario)»: si solo dice BDT, el cliente no encuentra su banco y abandona el pago.

Ese proyecto tuvo las dos nomenclaturas mezcladas en tres archivos distintos hasta que se unificaron el 2026-08-06. Es exactamente el motivo por el que la lista tiene que ser una sola.

## 6. La arquitectura: payment-first

**El pedido se crea después de que el pago está confirmado.** Es la decisión estructural de la que cuelga todo lo demás.

```
1. El cliente completa el pago en PaymentFlow
   POST /api/payments/{gateway}/{validate|process}
   → crea PaymentLog con orderId: NULL     ← la orden todavía NO existe
   → status: PROCESSING

2. La pasarela responde OK al checkout

3. El checkout hace POST /api/orders con los datos del pago
   → crea Order + Transaction
   → vincula los PaymentLog huérfanos: gatewayProvider + (gatewayTransactionId | paymentReference)
     dentro de una ventana de 5 minutos
   → actualiza los logs intermedios a SUCCEEDED
```

**Por qué así**: si creás el pedido primero y el pago falla, la cocina ya vio un pedido que nadie pagó. Invertirlo mueve el problema a un lugar más barato: quedan `PaymentLog` sin pedido, y esos se reconcilian.

La vinculación retroactiva (`app/api/orders/route.ts`, al final del POST):

```ts
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
const linkWhere: any = { orderId: null, gatewayProvider: data.paymentGateway, createdAt: { gte: fiveMinutesAgo } }
if (data.gatewayTransactionId)  linkWhere.gatewayTransactionId = data.gatewayTransactionId
else if (data.paymentReference) linkWhere.paymentReference = data.paymentReference

await prisma.paymentLog.updateMany({ where: linkWhere, data: { orderId: order.id } })

// y los intermedios pasan a estado final
await prisma.paymentLog.updateMany({
  where: { orderId: order.id, status: "PROCESSING", action: { in: ["VALIDATION_ATTEMPTED", "PAYMENT_PROCESSING"] } },
  data: { status: "SUCCEEDED", action: data.paymentGateway === 'movilpay' ? "VALIDATION_SUCCEEDED" : "PAYMENT_SUCCEEDED" },
})
```

**El precio final lo calcula el servidor, no el navegador.** El cuerpo del pedido trae producto y cantidad; el total sale del catálogo (`lib/order-pricing.ts`). Si replicás payment-first sin esto, tenés un agujero: el cliente paga lo que él mismo declaró que costaba.

**Corolario que costó caro**: en payment-first, la pantalla y el servidor tienen que calcular el mismo total. Si la pantalla lo calcula con datos viejos, el cliente paga por la pasarela un monto y el pedido registra otro, y nadie se entera porque el servidor no compara: recalcula y sigue. Les pasó con el costo de envío (v1.15.0). Si un número lo decide el servidor, la pantalla lo pide por la misma API.

**Auditoría de doble fuente.** El panel (`/api/admin/payments`) combina `PaymentLog` con los `Order` que tienen `paymentGateway` pero ningún log vinculado (registros sintéticos). Así, si la vinculación falla, el pago igual se ve. Sin esto, un pago cobrado queda invisible.

## 7. Las protecciones (esto es lo que hay que copiar sí o sí)

### 7.1 Referencia única — anti-fraude de MovilPay

Sin esto, un cliente paga Bs. 500 una vez y usa la misma referencia en cinco pedidos.

```ts
const existing = await prisma.mobilePaymentReference.findFirst({ where: { reference: ref } })
if (existing) {
  const mismoPedido = orderId && existing.orderId === orderId
  const mismaSesion = tableSessionId && existing.tableSessionId === tableSessionId
  if (!mismoPedido && !mismaSesion) return 400 // duplicateReference: true
  // mismo pedido ⇒ es un reintento legítimo, se permite
}
```

Tres sutilezas que no son obvias:

1. **La referencia se registra aunque el monto no coincida.** Si el pago existe en MovilPay pero pagó de menos, igual se guarda: el pago es real y no puede reciclarse en otro pedido.
2. **La carrera TOCTOU se cierra con el `@unique`, no con el `findFirst`.** Dos requests simultáneos pasan los dos el chequeo; el segundo revienta con `P2002` al insertar, y ese error se traduce a 400, no se ignora:
   ```ts
   catch (refError) {
     if (refError?.code === "P2002") return 400 // "referencia ya está siendo utilizada"
   }
   ```
3. **Rate limit por IP**: 15 intentos / 5 min en MovilPay, 10 / 5 min en C2P. Una referencia son 6 dígitos: sin límite, se adivina a fuerza bruta.

### 7.2 Validación de monto contra el pedido, tolerante a la tasa

El cliente no decide cuánto paga. El servidor compara contra el pedido — pero la tasa Bs/USD se mueve, así que comparar contra un solo número rechaza pagos legítimos.

```ts
// Candidatos válidos: el monto grabado, el total×tasa del pedido, y el total×tasa vigente
const cands = [order.amountVES, order.total * order.exchangeRateUsed, order.total * tasaVigente]
const floor = Math.min(...cands.filter(n => n > 0))
const tolerance = Math.max(1, floor * 0.05)      // 5%, mínimo 1 Bs

if (paidAmount < floor - tolerance) → rechazar   // subpago grave
// el sobrepago NO se rechaza: pagar a una tasa más alta es legítimo
```

La asimetría es intencional: se rechaza el que paga de menos, no el que paga de más. El sobrepago se detecta y se ofrece resolver (§8), pero no se le tira el pago abajo a alguien que pagó con la tasa de hoy cuando el pedido se creó con la de ayer.

### 7.3 Bitácora de todo

Cada intento deja `PaymentLog`, incluidos los fallidos y los fraudes detectados (con el motivo en `notes`). Cuando el cliente dice «yo pagué», la bitácora es la única respuesta posible.

## 8. El frontend — `components/payments/payment-flow.tsx`

Máquina de estados: `form → otp → validating → success | error | overpayment`.

- **C2P**: formulario (cédula, teléfono, banco) → OTP → resultado. La lista de bancos viene de `GET /api/payments/banks`.
- **MovilPay**: se le muestran al cliente los datos de la cuenta receptora (banco, teléfono, RIF) y un campo de 6 dígitos. Esos datos salen de la base, no del código: `GET /api/payments/config?sede=<slug>`.

**Pagos parciales — la parte que nadie prevé.** En Venezuela hay límites diarios por transacción. Un pedido de Bs. 3.000 puede requerir dos Pago Móvil de bancos distintos. El componente lo soporta:

- `validatedPayments[]` acumula los pagos confirmados.
- El monto que se manda a validar es el **restante**, no el total: `remainingAmount`.
- `usedReferences` (un Set) evita que el cliente reingrese la misma referencia.
- Cuando `acumulado >= total - 1 Bs`, el pago se da por completo.
- Un pago que llega con monto menor no es un error: se registra como parcial y se pide otro.

**Sobrepago.** Si `acumulado - total > 1 Bs`, el flujo va a `overpayment` en vez de `success`: se le muestra al cliente cuánto pagó de más y se ofrece contacto por WhatsApp. El enum tiene `OVERPAYMENT_DETECTED/REFUNDED/CREDITED` para el seguimiento.

## 9. Configuración: qué va en .env y qué va en la base

En `.env` (secretos, cambian casi nunca):

```
MOVILPAY_BASE_URL=https://validator.movilpay.app
MOVILPAY_TOKEN=<token>

BDV_C2P_BASE_URL=https://bdvconciliacion.banvenez.com
BDV_C2P_API_KEY=<api key>
BDV_C2P_COMMERCE_PHONE=<teléfono del comercio>
```

En `SystemConfig` (lo edita el negocio desde el panel, sin desplegar): `movilpay_token` (pisa al de .env), `movilpay_payment_phone/_bank/_bank_code/_rif` (datos receptores que ve el cliente), `bdv_c2p_base_url/_api_key/_commerce_phone` (pisan a .env), `sede_payments_<slug>` (cuentas para transferencia, Zelle, USDT).

Los factories leen primero la base y caen a `.env`:

```ts
export async function createMovilPayClient() {
  const token = await getSystemConfig('movilpay_token', process.env.MOVILPAY_TOKEN)
  return new MovilPayClient(token, await getSystemConfig('movilpay_base_url', process.env.MOVILPAY_BASE_URL))
}
```

`getSystemConfig` cachea 60 s en memoria; después de cambiar una clave, el efecto tarda hasta un minuto (o reiniciás el proceso).

## 10. Tasa de cambio: el pedido es en USD, el cobro es en Bs

Las dos pasarelas cobran en bolívares. Si tu catálogo está en dólares, **la tasa es parte de la pasarela**, no un accesorio.

- `lib/bcv-exchange-rate.ts` — `BCVCurrencyConverter.getCurrentRate()`, con 5 niveles de fallback: override manual → caché de servidor → API → base de datos → **error explícito**.
- Fuente: la tasa BCV oficial (vía DolarApi VE). Cron cada 15 minutos.
- Cada cambio deja auditoría en `ExchangeRateLog`, y el pedido guarda `exchangeRateUsed` + `exchangeRateId`.
- **Nunca hardcodees una tasa de respaldo.** Si todas las fuentes fallan, que truene: cobrar con una tasa inventada es peor que no cobrar.

El drift de tasa entre que se arma el carrito y que se paga es la causa de la validación por candidatos de §7.2. Sin eso, cada movimiento del BCV rechaza pagos buenos.

## 11. Cómo probar sin quemar plata

No hay sandbox en ninguna de las dos.

- **MovilPay**: hacé un Pago Móvil real de Bs. 1 al teléfono receptor. Meté los 6 dígitos en el checkout. Verificá 200 con `data.transactionId`. Como beneficio, comprobás la demora real entre el pago y su aparición en el validador — que es lo que después vas a tener que explicarle al cliente.
- **BDV C2P**: hace falta un teléfono real afiliado a Pago Móvil.
  - Paso 1 correcto ⇒ llega el SMS. Si no llega, el problema es afiliación o código de banco.
  - Paso 2 con monto mínimo ⇒ revisá el saldo. Si el saldo bajó, funcionó de verdad.
  - Probá a propósito el OTP vencido (esperá 6 minutos): tenés que ver `code: "1055"` con HTTP 200. Si tu código lo da por bueno, encontraste el bug antes que el cliente.

Advertencia con curl: en ese servidor Apache filtra por User-Agent en `/api`. Sin un UA de navegador, las rutas devuelven HTML y parece un error de ruteo que no existe.

## 12. Deuda conocida — qué NO copiar tal cual

| # | Qué | Riesgo | Qué hacer en un proyecto nuevo |
|---|---|---|---|
| 1 | Listas de bancos duplicadas en tres archivos (resuelto 2026-08-06) | El 0175 aparecía como «BDT» en un lado y «Bicentenario» en otro | Lista única desde el día uno |
| 2 | Rate limit en memoria | Se reinicia con PM2 y no sirve con varias instancias | Redis o tabla, si vas a escalar horizontal |
| 3 | `results[0]` como fallback cuando ninguna referencia coincide | Puede validar contra un pago ajeno si la búsqueda devuelve varios | Si no hay match exacto por inclusión, fallar |
| 4 | La ventana de 5 min de vinculación | Un pago lento queda huérfano | Guardar el id del PaymentLog y vincular por id |
| 5 | `annulment` implementado pero sin usar en ningún flujo | No hay reversa operativa | Exponerlo en el panel con permiso de admin y auditoría |
| 6 | Sin webhooks (ninguna de las dos los ofrece) | Un pago que aparece tarde no se entera nadie | Un cron de reconciliación que busque pagos sin pedido |
| 7 | `console.log` de las respuestas completas del gateway | Datos personales en los logs de PM2 | Loguear solo lo necesario; extender el enmascarado |

## 13. Checklist de replicación

- Credenciales tramitadas (§2). El BDV tarda semanas.
- `.env` con las 5 variables.
- `PaymentLog` + `MobilePaymentReference` (con el `@unique`) + campos en el pedido.
- Los dos clientes, con los helpers de formato y el enmascarado de logs.
- `code === "1000"` y lectura desde `response.data`.
- `amountVES` para pasarelas; `amount` solo para pagos manuales.
- Las 5 rutas: movilpay/validate, c2p/request-otp, c2p/process, payments/banks, payments/config.
- Anti-fraude: chequeo previo + captura de `P2002` + rate limit por IP.
- Validación de monto contra el pedido, con candidatos de tasa y tolerancia.
- Precio calculado en el servidor; la pantalla lee la misma fuente.
- Payment-first + vinculación retroactiva + auditoría de doble fuente.
- Tasa de cambio con fallback y auditoría; sin tasa hardcodeada.
- Idempotencia en la creación del pedido.
- Probado en producción con montos mínimos, incluido el caso de OTP vencido.

## 14. Archivos de referencia (en el proyecto VIP Play)

| Qué | Dónde |
|---|---|
| Cliente MovilPay | `lib/payment-gateways/movilpay-client.ts` |
| Cliente BDV C2P | `lib/payment-gateways/bdv-c2p-client.ts` |
| Validar Pago Móvil | `app/api/payments/movilpay/validate/route.ts` |
| Pedir OTP | `app/api/payments/c2p/request-otp/route.ts` |
| Procesar C2P | `app/api/payments/c2p/process/route.ts` |
| Bancos / config pública | `app/api/payments/banks/route.ts` · `app/api/payments/config/route.ts` |
| UI del pago | `components/payments/payment-flow.tsx` |
| Payment-first y vinculación | `app/api/orders/route.ts` (final del POST) |
| Desglose del endToEndId | `app/admin/[sede]/pagos/page.tsx` |
| Tasa de cambio | `lib/bcv-exchange-rate.ts` |
| Rate limit | `lib/rate-limit.ts` |
| Precio del lado del servidor | `lib/order-pricing.ts` |
| Auditoría de pagos | `app/api/admin/payments/route.ts` |
