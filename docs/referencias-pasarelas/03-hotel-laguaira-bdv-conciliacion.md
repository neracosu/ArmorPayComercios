# Guía Técnica — Replicación de Pasarelas de Pago Venezolanas (Hotel VIP La Guaira)

> Basada en la implementación en producción de Hotel VIP La Guaira (v3.9.18, agosto 2026). Cubre los 3 integradores venezolanos: **BDV Conciliación** (validador de pago móvil por referencia), **BDV C2P** (débito inmediato con OTP) y **MovilPay/BDT** (validador de pago móvil de terceros). Entregada por Neri el 2026-08-06 como guía base para el producto checkout de ArmorPay.
>
> Archivos fuente de referencia en aquel repo: `lib/bdv-conciliation.ts` · `lib/bdv-c2p.ts` · `lib/movilpay.ts` · `lib/pagos.ts` · `app/api/pagos/bdv-manual/validar/route.ts` · `app/api/pagos/bdv/{solicitar-otp,procesar}/route.ts` · `app/api/pagos/movilpay/validar/route.ts` · `app/pagos/[bookingId]/pago-client.tsx`

## 0. Arquitectura general (aplica a los 3 métodos)

Los tres integradores comparten el mismo patrón de orquestación. Esto es lo primero que hay que replicar, porque es lo que hace el sistema seguro contra dobles cobros y referencias recicladas:

```
Cliente (form) ──POST──▶ API route (Next.js)
                           │
                           ├─ 1. Validar campos requeridos (400 si faltan)
                           ├─ 2. IDEMPOTENCIA: ¿ya hay pago 'confirmed' para este booking?
                           │      → sí: responder { success: true, already: true } (NO revalidar)
                           ├─ 3. ANTI-REUSO: ¿la referencia ya se usó en OTRO booking?
                           │      → sí: 409 { code: 'REFERENCE_ALREADY_USED' }
                           ├─ 4. Llamar al validador externo (BDV / MovilPay)
                           │      → falla: notificar admin + 400 con mensaje legible
                           ├─ 5. createPago(status 'pending') → updatePagoStatus('confirmed')
                           ├─ 6. markReferenceUsed(ref, bookingId, method, pagoId)
                           └─ 7. Side-effects FIRE-AND-FORGET (nunca bloquean la respuesta):
                                  · registrar pago en el PMS
                                  · nota en la reserva
                                  · email de confirmación al huésped
                                  · notificación al admin
```

### 0.1 Esquema de base de datos mínimo (Prisma)

```prisma
model Pago {
  id            String    @id @default(cuid())
  bookingId     String
  guestName     String
  guestEmail    String
  amountUSD     Float
  amountVES     Float?
  method        String    // 'bdv_c2p' | 'movilpay' | 'pago_movil_bdv' | ...
  status        String    @default("pending") // pending | pending_review | confirmed | failed | rejected
  reference     String?
  metadata      Json?     // guardar SIEMPRE la respuesta cruda del validador
  confirmedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  screenshotUrl String?   // fallback manual con captura
  reviewNotes   String?   @db.Text
  reviewedAt    DateTime?

  @@index([bookingId])
  @@index([status])
}

model UsedPaymentReference {
  id        String   @id @default(cuid())
  reference String   @unique   // el UNIQUE es la garantía real contra race conditions
  bookingId String
  method    String
  pagoId    String
  createdAt DateTime @default(now())

  @@index([bookingId])
}

model Config {              // credenciales editables sin redeploy
  key       String   @id
  value     String   @db.Text
  updatedAt DateTime @updatedAt
}
```

Notas de diseño:
- `markReferenceUsed()` hace `create().catch(() => {})` — si dos requests concurrentes validan la misma referencia, el constraint UNIQUE gana y el segundo insert falla silenciosamente. El chequeo previo `checkReferenceUsed()` es solo para dar un error amable (409).
- `metadata` guarda la respuesta cruda del validador. Es tu **evidencia forense** si hay disputa.
- La idempotencia por booking (`getConfirmedPagoByBooking`) va ANTES de llamar al validador: ahorra llamadas y evita que un doble submit genere dos pagos.

### 0.2 Credenciales

Todas las claves viven en la tabla `config` (no en `.env`), leídas con un `getConfig(key)` que consulta la BD. Ventaja: se rotan desde el panel admin sin redeploy. Claves usadas:

| Clave | Usada por | Contenido |
|---|---|---|
| `BDV_CONCILIATION_API_KEY` | Validador BDV | API Key del servicio de conciliación |
| `BDV_CONCILIATION_TELEFONO_DESTINO` | Validador BDV | Teléfono receptor del comercio |
| `BDV_C2P_API_KEY` | C2P | API Key del servicio C2P |
| `BDV_C2P_COMMERCE_PHONE` | C2P | Teléfono afiliado del comercio |
| `MOVILPAY_TOKEN` | MovilPay | Token de API del panel MovilPay |

### 0.3 Sanitizadores compartidos (críticos — BDV rechaza formatos incorrectos)

```ts
// Cédula → "V26044810" (prefijo V/E/P + 6-9 dígitos, SIN guiones)
function formatDocumentId(cedula: string): string {
  const cleaned = cedula.toUpperCase().replace(/[^VEP0-9]/g, '')
  if (/^[VEP]\d{6,9}$/.test(cleaned)) return cleaned
  if (/^\d{6,9}$/.test(cleaned)) return `V${cleaned}`   // sin letra → asumir V
  return cleaned
}

// Teléfono → formato nacional "04141234567" (convierte +58414... → 0414...)
function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('58') && digits.length === 12) return '0' + digits.slice(2)
  return digits
}

// Concepto → solo alfanumérico y espacios, sin acentos, máx 40 chars (solo C2P)
function sanitizeConcept(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40)
}
```

### 0.4 Fetch con timeout

Todas las llamadas usan `AbortController` con timeout de **30 segundos** y `clearTimeout` en `finally`. BDV a veces se cae — el timeout evita colgar el request del cliente.

## 1. BDV Conciliación — Validador de Pago Móvil entrante ("el validador con referencias")

**Qué es:** el cliente hace un pago móvil normal desde su banco al teléfono del comercio (cuenta BDV receptora). Luego ingresa los datos del comprobante y el sistema consulta la API de conciliación del BDV para confirmar que ese movimiento realmente entró a la cuenta. **Este es el método automático que SÍ funciona en producción.**

### 1.1 Endpoint

```
POST https://bdvconciliacion.banvenez.com/getMovement
Headers:
  X-API-Key: <BDV_CONCILIATION_API_KEY>
  Content-Type: application/json
  Accept: application/json
```

> La API Key se solicita al BDV como comercio afiliado (banca de empresas — servicio de conciliación en línea). El teléfono destino debe ser el afiliado a pago móvil del comercio.

### 1.2 Payload de request

```json
{
  "cedulaPagador":  "V26044810",
  "telefonoPagador": "04141234567",
  "telefonoDestino": "04128496986",
  "referencia":      "0000123456",
  "fechaPago":       "2026-08-06",
  "importe":         "1250.50",
  "bancoOrigen":     "0102"
}
```

**Gotchas aprendidos en producción (no negociables):**
- El campo se llama **`importe`**, NO `monto`. Con `monto` la API responde error de campo.
- `importe` se envía como **string con 2 decimales exactos**: `(Math.round(amountVES * 100) / 100).toFixed(2)`. El monto debe coincidir AL CÉNTIMO con el movimiento bancario — por eso todo el flujo aguas arriba (checkout, conversión BCV) debe redondear a 2 decimales y mostrar al cliente el monto exacto a transferir.
- La cédula lleva el prefijo (`V26044810`), sin guiones.
- El match es por la **combinación completa**: cédula + teléfono pagador + teléfono destino + referencia + fecha + importe + banco origen. Cualquier campo distinto → no concilia.

### 1.3 Respuestas

| `code` | Significado | Acción |
|---|---|---|
| `1000` | Movimiento encontrado y conciliado | Confirmar pago. `data.monto` trae el monto real |
| `1010` | Datos no coinciden / error de campo | Ver decodificación abajo |
| otro | Pago no encontrado | Mostrar `message` |
| (sin respuesta / `{}`) | Servicio caído | **Fallback a captura manual** (`requiresScreenshot`) |

`code` puede llegar como number o string — comparar ambos: `data?.code === 1000 || String(data?.code) === '1000'`.

**Decodificación del error `1010`** (la API es críptica, hay 3 formatos de `data`):

1. **`data` es un string** con el nombre del campo inválido → mapear a mensaje humano:
   ```ts
   { cedulaPagador: 'La cédula ingresada no es válida',
     telefonoPagador: 'El teléfono ingresado no es válido',
     referencia: 'La referencia no coincide con ningún pago',
     fechaPago: 'La fecha del pago no es válida',
     importe: 'El monto no coincide con el pago registrado',
     bancoOrigen: 'El banco de origen no es válido' }
   ```
2. **`data` es un array** de strings `"CAMPO - mensaje"` → tomar `split(' - ').pop()`.
3. **Solo `message`** → clasificar por keywords: contiene "importe"/"monto" → `AMOUNT_MISMATCH` (el front muestra el monto exacto esperado en Bs y USD); contiene "conciliad" → `ALREADY_CONCILIATED` (esa transacción ya se usó — también protege contra reuso a nivel del banco, además de la tabla local); resto → `INVALID_FIELD`.

### 1.4 Fallback cuando BDV está caído

Si la respuesta es vacía o el fetch falla, la route devuelve `{ requiresScreenshot: true }` y el frontend cambia al formulario de **subir captura del comprobante** → crea un `Pago` con `status: 'pending_review'` que un humano aprueba/rechaza desde el panel. **Nunca dejes al cliente sin camino de pago porque el banco esté caído.**

### 1.5 Formulario del cliente (campos)

Cédula · Teléfono con el que pagó · Banco de origen (select con los 26 códigos, ver §4) · Fecha del pago (`<input type="date">`, `max` = hoy) · N° de referencia. El sistema muestra antes los datos para pagar: banco receptor, teléfono, RIF y **monto exacto en Bs**.

## 2. BDV C2P — Débito inmediato con OTP (Commerce-to-Person)

**Qué es:** el flujo inverso. El comercio DEBITA la cuenta del cliente. El cliente genera un código C2P (OTP) desde su app bancaria (o lo recibe por SMS), lo ingresa en el checkout, y el banco ejecuta el débito inmediato hacia el teléfono afiliado del comercio.

> ⚠️ **ESTADO REAL EN ESE PROYECTO: NO FUNCIONAL.** El paso 1 (solicitar OTP) funciona; el paso 2 (procesar) responde `code: 1030 "Formato inválido"` en todos los intentos (0 pagos exitosos históricos). Hipótesis principal: BDV no retorna cookie ni `sessionId` en `/paymentkey`, por lo que no hay manera de vincular la sesión entre las dos llamadas; está pendiente respuesta del soporte API del BDV. Se documenta completo porque la estructura es correcta y replicable — pero **no lanzar este método a producción sin resolver eso con BDV**.

### 2.1 Endpoints (misma base y auth que conciliación, API Key distinta)

```
POST https://bdvconciliacion.banvenez.com/BankMobilePaymentC2P/paymentkey   ← solicita OTP
POST https://bdvconciliacion.banvenez.com/BankMobilePaymentC2P/process      ← ejecuta débito
Headers: X-API-Key: <BDV_C2P_API_KEY> · Content-Type: application/json
```

### 2.2 Paso 1 — Solicitar OTP (`/paymentkey`)

```json
{
  "customerDocumentId":       "V26044810",
  "customerNumberInstrument": "04141234567",
  "customerBankCode":         "0102"
}
```

Respuesta esperada: `code: 1000` → el cliente recibe el OTP. Capturar defensivamente `sessionId`/`session_id` del body y cualquier `Set-Cookie` de los headers (con `res.headers.getSetCookie()` en Node 20; concatenar `nombre=valor` de cada cookie) y devolverlos al frontend para reenviarlos en el paso 2. *(En la práctica BDV no envía ninguno — ese es el bug abierto.)*

El frontend arranca un contador de **300 segundos** de validez del OTP con barra de progreso; al expirar bloquea el input y ofrece pedir código nuevo.

### 2.3 Paso 2 — Procesar débito (`/process`)

```json
{
  "customerDocumentId":       "V26044810",
  "customerNumberInstrument": "04141234567",
  "customerBankCode":         "0102",
  "otp":                      123456,
  "amount":                   "1250.5",
  "concept":                  "Reserva Hotel VIP 12345",
  "coinType":                 "VES",
  "commerceNumberInstrument": "04128496986",
  "operationType":            "CELE"
}
```

**Reglas de formato descubiertas a fuerza de errores:**
- `otp` va como **integer**: `parseInt(otp.replace(/\D/g, '').slice(0, 6), 10)`. Como string → rechazo.
- `amount` con **`.toFixed(1)`** (un decimal, ej. `"1250.0"`) — distinto del `importe` de conciliación que lleva 2.
- **`sessionId` se OMITE del payload** — incluirlo provoca error.
- `operationType: 'CELE'` fijo (débito a celular).
- BDV responde **siempre HTTP 200** — el resultado real está en `body.code`. Nunca uses `res.ok` como criterio.

Respuesta OK: `code: 1000` con `endToEndId` (o `end_to_end_id`) = referencia interbancaria del débito → se usa como `reference` del pago y para `markReferenceUsed`.

### 2.4 Códigos observados

| `code` | Significado |
|---|---|
| `1000` | Operación exitosa |
| `1030` | "Formato inválido" — en la práctica, sesión OTP no vinculada (bug abierto con BDV) |
| otros | Mostrar `message` del body |

## 3. MovilPay — Validador de pago móvil a cuenta BDT ("los últimos 6 dígitos")

**Qué es:** servicio de terceros (movilpay.app) que expone por API los movimientos de pago móvil recibidos en la cuenta del comercio (en su caso una cuenta **BDT — Banco Digital 0175**). El cliente paga por pago móvil al teléfono BDT del comercio e ingresa **los últimos 6 dígitos de la referencia**; MovilPay confirma si ese movimiento existe.

**Ventaja clave sobre BDV Conciliación:** funciona con cualquier banco receptor soportado por MovilPay y el matching es solo por referencia (+ filtros opcionales) — mucho menos fricción para el cliente (1 campo obligatorio vs 5).

### 3.1 Endpoint

```
POST https://validator.movilpay.app/api/payments/validate/
Headers:
  Authorization: Token <MOVILPAY_TOKEN>       // esquema "Token", NO "Bearer"
  Content-Type: application/json
  User-Agent: <TuApp>/1.0
```

> El token se genera en el panel de MovilPay del comercio. La barra final del path importa.

### 3.2 Payload

```json
{
  "amount":    "",
  "reference": "123456",
  "mobile":    "04141234567",
  "sender":    null,
  "method":    null,
  "date":      "2026-08-06"
}
```

**Nota sobre `amount`:** se envía **vacío** deliberadamente y el monto se valida **localmente** contra la respuesta. Si enviás el monto, MovilPay lo usa como filtro exacto y cualquier diferencia de céntimos (redondeo de tasa BCV) haría fallar pagos legítimos. La validación local permite tolerancia controlada.

### 3.3 Respuesta y validación local

- **HTTP 200/201** = la referencia existe. Pero revisar:
  - `data.status === false` → el pago fue **anulado/rechazado** → rechazar.
  - `data.amount` (monto real recibido) → validación de monto local con tolerancia:
    ```ts
    const tolerance = Math.max(amountVES * 0.02, 5)   // 2% o mínimo 5 Bs
    if (confirmedAmount < amountVES - tolerance) → rechazar con mensaje
    // esperado X Bs / recibido Y Bs
    ```
    Solo se valida si `confirmedAmount > 0` (a veces la API no retorna monto). Pagos por EXCESO se aceptan; solo se rechaza el déficit.
- **HTTP 4xx** = referencia no encontrada → mensaje de `data.message ?? data.error ?? data.detail`.
- Timeout 30 s con mensaje específico ("Tiempo de espera agotado al verificar con MovilPay").

### 3.4 Formulario del cliente

Obligatorio: últimos 6 dígitos de la referencia. Opcionales: teléfono emisor y fecha del pago (pedirlos reduce falsos positivos si dos clientes coinciden en 6 dígitos, pero en la práctica el anti-reuso local + monto cubren ese riesgo). Mostrar antes: banco destino (BDT 0175), teléfono receptor, RIF y monto exacto.

## 4. Catálogo de bancos venezolanos (select del frontend)

Los códigos son los 4 dígitos estándar interbancarios — los mismos para C2P (`customerBankCode`) y conciliación (`bancoOrigen`):

```
0102 Banco de Venezuela        0104 Venezolano de Crédito     0105 Mercantil
0108 Provincial (BBVA)         0114 Bancaribe                 0115 Exterior
0116 Occidental de Descuento   0128 Banco Caroní              0134 Banesco
0137 Sofitasa                  0138 Corp Banca                0146 Bangente
0151 BFC Fondo Común           0156 100% Banco                0157 DelSur
0163 Banco del Tesoro          0166 Banco Agrícola            0168 Bancrecer
0169 Mi Banco                  0171 Activo                    0172 Bancamiga
0173 Internacional de Desarrollo  0174 Banplus                0175 Bicentenario/BDT
0176 Novo                      0191 BNC Nacional de Crédito
```

## 5. El monto en Bs: tasa BCV y precisión (prerequisito de todo lo anterior)

Los validadores comparan montos al céntimo, así que la conversión USD→VES tiene que ser determinística en todo el flujo:

1. Una única fuente de tasa (en ese proyecto `BCVCurrencyConverter`, caché 15 min, con override manual y fallbacks: scraping bcv.org.ve → ve.dolarapi.com → exchangerate-api).
2. El servidor calcula `amountVES = round(amountUSD * tasa, 2)` **una sola vez** (en el server component del checkout) y ese valor exacto: se muestra al cliente como "monto a transferir" (formato `es-VE`, siempre 2 decimales), viaja al backend en el POST de validación, y se envía a BDV como `importe` / se compara contra MovilPay.
3. **Nunca recalcular en el cliente ni en la route** — cualquier doble conversión produce diferencias de céntimos y `AMOUNT_MISMATCH`.

## 6. Checklist de replicación en un proyecto nuevo

**Trámites (lo lento — empezar por aquí):**
- BDV: afiliación de comercio a pago móvil + solicitar acceso al API de conciliación (y C2P si se quiere) → entregan API Key(s) y registran el teléfono receptor.
- MovilPay: cuenta de comercio vinculada a la cuenta receptora (BDT u otro banco soportado) → token de API del panel.
- RIF, teléfono afiliado y datos bancarios del comercio para mostrar en el checkout.

**Backend:**
- Tablas `Pago` + `UsedPaymentReference` (UNIQUE en `reference`) + `Config`.
- Helpers: `formatDocumentId`, `sanitizePhone`, `sanitizeConcept`, fetch con timeout 30 s.
- `lib/bdv-conciliation.ts` — copiar tal cual, cambiar solo teléfono destino por config.
- `lib/movilpay.ts` — copiar tal cual; ajustar `User-Agent`.
- (Opcional) `lib/bdv-c2p.ts` — solo si BDV resuelve la vinculación de sesión.
- Routes con el pipeline de §0: idempotencia → anti-reuso → validar → confirmar → marcar referencia → side-effects fire-and-forget.
- Fallback a captura + revisión manual (`pending_review`) cuando el validador esté caído.
- Notificación al admin en cada intento (confirmado Y fallido) con la metadata cruda.

**Frontend:**
- Select de bancos (§4), inputs con `inputMode="numeric"` y límites (`maxLength 6` para OTP/referencia MovilPay), fecha con `max` = hoy.
- Mostrar datos de pago con botón copiar (teléfono, RIF, monto exacto).
- Manejo de errores tipificados: `AMOUNT_MISMATCH` (mostrar monto esperado), `ALREADY_CONCILIATED`, `REFERENCE_ALREADY_USED`, `requiresScreenshot` (cambiar a upload).
- Contador de expiración de OTP (300 s) si se usa C2P.

**Pruebas en producción (no hay sandbox en ninguna de las dos APIs):**
- Pago móvil real de monto pequeño → validar por BDV conciliación con datos exactos.
- Repetir la misma referencia → debe dar 409 / ALREADY_CONCILIATED.
- Monto alterado → AMOUNT_MISMATCH con mensaje claro.
- MovilPay con referencia real de 6 dígitos.
- Simular BDV caído (API key inválida temporal) → debe ofrecer captura manual.

## 7. Resumen comparativo

| | BDV Conciliación | BDV C2P | MovilPay |
|---|---|---|---|
| Dirección | Cliente paga → se verifica | Comercio debita | Cliente paga → se verifica |
| Estado en prod (en ese proyecto) | ✅ Funcional | ❌ Bloqueado (code 1030, soporte BDV) | ✅ Funcional |
| Auth | `X-API-Key` | `X-API-Key` | `Authorization: Token` |
| Endpoint | `bdvconciliacion.banvenez.com/getMovement` | `.../BankMobilePaymentC2P/{paymentkey,process}` | `validator.movilpay.app/api/payments/validate/` |
| Campos cliente | 5 (cédula, tel, banco, fecha, ref) | 3 + OTP | 1 (ref 6 díg.) + 2 opcionales |
| Formato monto | string 2 decimales, campo `importe` | string 1 decimal (`toFixed(1)`) | vacío en request; validación local 2%/5 Bs |
| Éxito | `code === 1000` | `code === 1000` + `endToEndId` | HTTP 200/201 + `status !== false` |
| HTTP status útil | No (siempre 200) | No (siempre 200) | Sí (200/201 vs 4xx) |
| Banco receptor | Solo BDV | Solo BDV (afiliado) | BDT u otros soportados |
