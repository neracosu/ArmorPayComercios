# Guía Maestra de Replicación — Pasarelas de Pago Venezolanas (Terrazas VIP)

> **Propósito**: documento AUTO-CONTENIDO para replicar en OTRO proyecto las dos pasarelas de pago que Terrazas VIP (terrazasvip.com) tiene en producción:
>
> 1. **MovilPay / BDT** — validación de referencias de Pago Móvil (el cliente paga por su banco, nosotros verificamos que el pago existe contra un validador).
> 2. **BDV C2P / Débito Inmediato** — cobro push con OTP (nosotros iniciamos el débito en la cuenta del cliente; él autoriza con una clave temporal que le llega por SMS).
>
> Incluye clientes HTTP completos, endpoints, modelo de datos Prisma, anti-fraude, manejo de errores, checklist de replicación y los "gotchas" pagados en producción.
>
> Fecha: 2026-08-06 · Fuente: código en producción terrazasvip.com · En su repo: `documentacion/integraciones/GUIA-MAESTRA-REPLICACION-PASARELAS-PAGO-VENEZUELA.md`
> Entregada por Neri el 2026-08-06 como guía base para el producto checkout de ArmorPay. (Las URLs venían envueltas en redirects de Gmail; acá están restauradas.)

## 0. Modelo mental — dos filosofías opuestas

Lo primero: NO son la misma tecnología. Son dos paradigmas distintos y no intercambiables:

| | MovilPay / BDT | BDV C2P / Débito Inmediato |
|---|---|---|
| Paradigma | PULL / verificación | PUSH / cobro iniciado |
| ¿Quién mueve el dinero? | El cliente, por su app bancaria | Nosotros, iniciando el débito |
| ¿Qué hacemos nosotros? | Confirmar que un pago ya existe | Ejecutar el cobro y esperar autorización |
| Dato del cliente | Una referencia (últimos dígitos) | Cédula + teléfono + banco + OTP |
| Momento del dinero | El dinero YA se movió | El dinero se mueve en el `process` |
| ¿Reversible? | No (el pago ya ocurrió) | Sí — hay endpoint `annulment` |
| Riesgo principal | Fraude de referencia (reuso) | OTP inválido / expirado, fondos |
| Proveedor real | validator.movilpay.app (intermediario) | bdvconciliacion.banvenez.com (banco) |

**Consecuencia de diseño**: MovilPay necesita una capa anti-fraude propia (porque solo verificamos, alguien puede intentar reusar una referencia). BDV C2P no la necesita porque el banco valida el OTP y mueve el dinero en tiempo real — pero necesita manejo cuidadoso de estados OTP y de idempotencia para no doble-debitar.

Hay además un tercer riel legacy (FastDebit, fastdebit.movilpay.app) y un modo de conciliación (`/getMovement`) que se cubren brevemente en §7. El foco es MovilPay + BDV C2P.

## 1. Prerrequisitos y credenciales

### 1.1 Variables de entorno (nombres EXACTOS)

```
# MovilPay / BDT (validación de Pago Móvil)
MOVILPAY_BASE_URL=https://validator.movilpay.app
MOVILPAY_TOKEN=<token-secreto-por-comercio>          # header: Authorization: Token <token>

# BDV C2P / Débito Inmediato (cobro con OTP)
BDV_C2P_BASE_URL=https://bdvconciliacion.banvenez.com
BDV_C2P_API_KEY=<api-key-secreto>                    # header: X-API-Key
BDV_C2P_COMMERCE_PHONE=04XXXXXXXXX                   # teléfono del comercio (recibe el abono)
BDV_CONCILIACION_TELEFONO_DESTINO=04XXXXXXXXX        # solo para /getMovement (conciliación)

# FastDebit (LEGACY, opcional — ver §7)
FASTDEBIT_BASE_URL=https://fastdebit.movilpay.app
FASTDEBIT_API_KEY_MPS=<api-key-secreto>              # header: X-Api-Key-MPS
```

🔴 **GOTCHA CRÍTICO DE SEGURIDAD** — En el código original de Terrazas hay un token MovilPay hardcodeado como fallback (`this.token = ... || 'e7f2009b...'`) en 4 archivos. Es una fuga de credencial y NO debe replicarse. En el proyecto nuevo: eliminá cualquier fallback literal (lanzá error si falta la env var); cada comercio tiene su propio token/API-key; tratá `.env` como secreto rotable fuera de git.

### 1.2 Cómo obtener las credenciales
- **MovilPay**: se contrata con el proveedor MovilPay. Te entregan un Token por comercio y dan de alta el banco destino (a dónde llegan los Pago Móvil que vas a validar).
- **BDV C2P**: se contrata con Banco de Venezuela (convenio C2P — débito inmediato). Te entregan API-Key + registran tu `commercePhone` (número afiliado del comercio).

## 2. Modelo de datos (Prisma / MySQL)

No hace falta una tabla dedicada por pasarela. Se usan 3 piezas:
1. Campos de pago en la entidad cobrada (`Booking`, `ShowTicket`, `Order`, etc.).
2. `MobilePaymentReference` — libro de referencias usadas (núcleo del anti-fraude MovilPay).
3. `PaymentLog` — auditoría append-only de cada intento/movimiento.

### 2.1 Campos de pago en la entidad cobrada

```prisma
model Booking {
  total                 Float                 // monto en USD (moneda base)
  paymentMethod         PaymentMethod?        @default(MANUAL) // PAGO_MOVIL | DEBIT_IMMEDIATE | ...
  paymentReference      String?               // ref MovilPay (6 díg) o ref BDV
  paymentGatewayId      String?               // "movilpay" | "bdv" | "fastdebit"
  gatewayStatus         GatewayPaymentStatus? @default(PENDING) // SUCCEEDED cuando cobra
  gatewayResponse       String?               @db.Text // ⚠️ TEXT, no VARCHAR — JSON crudo
  amountPaidVES         Float?                // monto EXACTO en Bs cobrado
  exchangeRateAtPayment Float?                // tasa USD→VES capturada al cobrar
  status                BookingStatus         @default(PENDING) // CONFIRMED al confirmar
  confirmedAt           DateTime?
  paymentLogs           PaymentLog[]
}
```

⚠️ `gatewayResponse` DEBE ser `@db.Text`, no VARCHAR(255). Se guarda el JSON crudo del banco/validador (puede superar 255 chars). En producción esto rompió inserts silenciosamente.

### 2.2 MobilePaymentReference — el libro anti-fraude

```prisma
model MobilePaymentReference {
  id              String   @id @default(cuid())
  referenceCode   String   @unique   // ⚠️ ver nota de colisiones en §5
  transactionType MobilePaymentTransactionType // BOOKING | EVENT_BOOKING | ORDER | ...
  entityId        String
  entityType      String
  amount          Float    // monto en USD (moneda base)
  amountVES       Float?
  exchangeRate    Float?
  customerName    String
  customerEmail   String
  customerPhone   String?
  paymentBank     String?
  paymentPhone    String?
  gatewayResponse String?  @db.Text
  ipAddress       String?
  userAgent       String?
  metadata        String?  @db.Text
  usedAt          DateTime @default(now())
  createdAt       DateTime @default(now())
  @@index([referenceCode]) @@index([customerEmail]) @@index([transactionType]) @@index([usedAt])
  @@map("mobile_payment_references")
}

enum MobilePaymentTransactionType { BOOKING EVENT_BOOKING ORDER SHOW_TICKET GAME_WATCH ADMIN_LOOKUP }
```

### 2.3 PaymentLog — auditoría

```prisma
model PaymentLog {
  id                   String   @id @default(cuid())
  bookingId            String
  action               PaymentLogAction // PAYMENT_SUCCEEDED | PAYMENT_FAILED | MANUAL_VERIFICATION
  status               GatewayPaymentStatus
  amount               Float?
  currency             String   @default("VES")
  gatewayProvider      String?  // "movilpay" | "bdv" | "fastdebit"
  gatewayTransactionId String?
  gatewayResponse      String?  @db.Text
  metadata             String?  @db.Text
  triggeredBy          String?
  ipAddress            String?
  userAgent            String?
  notes                String?
  createdAt            DateTime @default(now())
  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  @@index([bookingId]) @@map("payment_logs")
}

enum GatewayPaymentStatus { PENDING PROCESSING REQUIRES_ACTION SUCCEEDED FAILED CANCELLED EXPIRED REFUNDED PARTIALLY_REFUNDED }
```

⚠️ `gatewayStatus` usa **SUCCEEDED** para "pagado", NO CONFIRMED. CONFIRMED es el estado de la reserva (`status`), no del gateway.

---

# RIEL A — MovilPay / BDT (validación de Pago Móvil)

## 3. Cómo funciona MovilPay

MovilPay NO es el banco: es un validador intermediario. El comercio da de alta su cuenta BDT destino en MovilPay; cuando un cliente le hace un Pago Móvil, MovilPay lo "ve" y expone una API que responde "¿existe un pago con esta referencia/monto?".

Flujo de negocio:
1. Cliente reserva → creamos `Booking` en PENDING con un "hold" (`expiresAt = now + 10 min`).
2. Cliente hace Pago Móvil DESDE SU BANCO al número/cuenta del comercio. → Su banco le da una REFERENCIA (BDT: 9 dígitos; el cliente suele tipear los últimos 6).
3. Cliente ingresa esa referencia (+ opcional: monto, teléfono, fecha) en el checkout.
4. Backend valida la referencia contra MovilPay + corre ANTI-FRAUDE.
5. Si OK → Booking pasa a CONFIRMED / `gatewayStatus=SUCCEEDED`, se registra la referencia.

**Clave**: nosotros nunca movemos dinero. Solo confirmamos que el cliente ya lo movió. Por eso el riesgo es el reuso de referencia — de ahí toda la capa anti-fraude.

## 4. Cliente HTTP MovilPay (completo)

Endpoints (host `validator.movilpay.app`), todos con `Authorization: Token <MOVILPAY_TOKEN>`:
- `POST /api/payments/validate/` → Validar una referencia (principal)
- `GET /api/payments/banks/` → Lista de bancos
- `GET /api/payments/payment_methods/` → Métodos de pago
- `GET /api/payments/` → Listado filtrado (`bank_origin`, `since`, `status`, `page`, …)

```ts
// lib/movilpay-client.ts (portable — solo 'https' nativo de Node)
import https from 'https'

export interface MovilPayValidationRequest {
  amount: string          // monto VES esperado — o null (ver anti-fraude §5)
  reference: string       // últimos dígitos de la referencia BDT
  mobile?: string | null
  sender?: string | null
  method?: number | null
  date?: string | null    // YYYY-MM-DD
}
export interface MovilPayValidationResponse {
  success: boolean; message?: string; data?: any; error?: string
}

export class MovilPayClient {
  private baseUrl: string
  private token: string
  constructor(token?: string) {
    this.baseUrl = process.env.MOVILPAY_BASE_URL || 'https://validator.movilpay.app'
    // 🔴 NO fallback literal. Lanzá si falta.
    this.token = token || process.env.MOVILPAY_TOKEN || (() => { throw new Error('MOVILPAY_TOKEN no configurado') })()
  }
  async validatePayment(v: MovilPayValidationRequest): Promise<MovilPayValidationResponse> {
    const postData = JSON.stringify({
      amount: v.amount, reference: v.reference, mobile: v.mobile || null,
      sender: v.sender || null, method: v.method || null, date: v.date || null,
    })
    const options = {
      method: 'POST', hostname: 'validator.movilpay.app', path: '/api/payments/validate/',
      headers: {
        'Authorization': `Token ${this.token}`, 'User-Agent': 'MiApp/1.0',
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData).toString(),
      }, maxRedirects: 20,
    }
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString()
            if (res.statusCode === 200 || res.statusCode === 201)
              resolve({ success: true, data: JSON.parse(body), message: 'Pago validado correctamente' })
            else {
              const err = JSON.parse(body)
              resolve({ success: false, error: err.message, message: `Error ${res.statusCode}: ${err.message}` })
            }
          } catch { reject({ success: false, error: 'parse', message: 'Error procesando respuesta de MovilPay' }) }
        })
      })
      req.on('error', (e) => reject({ success: false, error: e.message, message: 'Error en request a MovilPay' }))
      req.write(postData); req.end()
    })
  }
}
export const createMovilPayClient = () => new MovilPayClient()
```

Request (`POST /api/payments/validate/`):
```json
{ "amount": "5000.00", "reference": "123456", "mobile": null, "sender": null, "method": null, "date": null }
```
Response éxito (HTTP 200/201):
```json
{ "amount": "5000.00", "reference": "123456", "...": "otros campos del banco (fecha, origen)" }
```

**`data.amount` es el monto REAL en Bs que el banco registró. NUNCA confíes en el monto que manda el cliente — validá siempre contra este `data.amount`.**

## 5. Anti-fraude MovilPay (el corazón del riel A)

**Problema estructural**: las referencias BDT son numéricas de 9 dígitos, pero se almacena/valida por los últimos 6. Con el tiempo, dos pagos distintos pueden tener los mismos 6 dígitos → **colisión inevitable**. Por eso `referenceCode @unique` NO alcanza como anti-fraude, y está PROHIBIDO hacer `findUnique` crudo para "ver si ya se usó".

La solución distingue **reuso fraudulento** de **colisión legítima** usando el monto en USD:
- Si la ref ya existe y el monto USD histórico ≈ esperado (±$1) → reuso/doble-click → BLOQUEAR.
- Si la ref ya existe pero los montos difieren → colisión legítima → desambiguar pidiéndole a MovilPay el pago con el `amount` VES específico.
- Si no existe → validar normal (sin filtro de monto, para evitar redondeos).
- Y al final: validar el monto devuelto vs esperado con tolerancia `max(2% del monto, 5 Bs)`.

```ts
// lib/movilpay-validation.ts (helper canónico — usar SIEMPRE, nunca findUnique crudo)
import type { PrismaClient } from '@prisma/client'
import { createMovilPayClient } from './movilpay-client'

const AMOUNT_USD_DUPLICATE_TOLERANCE = 1.0 // $1 — bajo esto, se considera reuso

export type ValidationResult =
  | { success: true; data: any; amountPaidVES: number; isCollisionResolved: boolean }
  | { success: false; code: 'DUPLICATE_REFERENCE' | 'PAYMENT_NOT_FOUND' | 'INSUFFICIENT_AMOUNT' | 'MOVILPAY_ERROR'; message: string; details?: any }

export async function validateMovilPayPaymentWithAntiFraud(args: {
  reference: string; expectedAmountUSD: number; expectedAmountVES: number; prisma: PrismaClient
}): Promise<ValidationResult> {
  const { reference, expectedAmountUSD, expectedAmountVES, prisma } = args
  // PASO 1 — ¿existe la ref? (anti-fraude)
  const existing = await prisma.mobilePaymentReference.findUnique({ where: { referenceCode: reference } })
  let isCollisionDetected = false
  if (existing) {
    const histUSD = existing.amount || 0
    if (Math.abs(histUSD - expectedAmountUSD) <= AMOUNT_USD_DUPLICATE_TOLERANCE) {
      return { success: false, code: 'DUPLICATE_REFERENCE',
        message: `Esta referencia ya fue usada por un monto similar ($${histUSD.toFixed(2)} vs $${expectedAmountUSD.toFixed(2)}). Hacé un nuevo pago con otra referencia.`,
        details: { existingEntityType: existing.entityType, existingAmount: histUSD, existingUsedAt: existing.usedAt } }
    }
    isCollisionDetected = true // montos distintos → colisión legítima
  }
  // PASO 2 — validar contra MovilPay. Si hubo colisión, pasar amount VES para desambiguar.
  const client = createMovilPayClient()
  const r = await client.validatePayment({
    reference, amount: isCollisionDetected ? expectedAmountVES.toFixed(2) : (null as any), mobile: null, sender: null,
  })
  if (!r.success || !r.data) {
    return { success: false, code: 'PAYMENT_NOT_FOUND',
      message: 'No se encontró un pago con esa referencia. Verificá los últimos 6 dígitos. Si acabás de pagar, esperá 2-3 minutos.' }
  }
  // PASO 3 — validar monto devuelto vs esperado
  const actualVES = parseFloat(r.data.amount || '0')
  const tolerance = Math.max(expectedAmountVES * 0.02, 5) // 2% o 5 Bs, el mayor
  if (actualVES < expectedAmountVES - tolerance) {
    return { success: false, code: 'INSUFFICIENT_AMOUNT',
      message: `El monto pagado (${actualVES.toFixed(2)} Bs) es menor al requerido (${expectedAmountVES.toFixed(2)} Bs). Faltan ${(expectedAmountVES - actualVES).toFixed(2)} Bs.` }
  }
  return { success: true, data: r.data, amountPaidVES: actualVES, isCollisionResolved: isCollisionDetected }
}

// Registro tolerante a colisión (el anti-fraude estructural es por MONTO, no por unicidad)
export async function registerMovilPayReferenceTolerant(prisma: PrismaClient, data: any): Promise<boolean> {
  try { await prisma.mobilePaymentReference.create({ data }); return true }
  catch (err: any) { if (err?.code === 'P2002') return false; throw err }
}
```

🔴 **ORDEN CORRECTO (bug pagado en prod)**: primero buscar duplicado, DESPUÉS validar monto. Al revés, un cliente que pagó $50 podía hacer 5 reservas de $10 con la MISMA referencia. Fix 2025-11-04.
⚠️ Overpayment se tolera. Solo se rechaza el pago insuficiente.

**Pagos parciales / múltiples referencias**: se soporta cubrir el total con varias referencias. La suma de los `data.amount` de todas las refs debe alcanzar el total (misma tolerancia). Cada ref se valida y registra individualmente. Si la suma no llega → `PARTIAL_PAYMENT` con el faltante.

## 6. Endpoints MovilPay (rutas Next.js) e idempotencia

- `POST /api/validate-payment` → Validación pública ANTES de crear booking. ⚠️ NO registra la ref.
- `POST /api/bookings/[id]/confirm-movilpay` → Confirmación transaccional (valida + registra + confirma + audita).
- `POST /api/admin/validate-payment` → Lookup admin. Registra `ADMIN_LOOKUP` para avisar a otra caja.

Idempotencia natural en la confirmación (patrón commit-first):

```ts
// 1) Guard idempotente: si ya está confirmado, devolver éxito sin re-procesar
if (booking.status === 'CONFIRMED' && booking.gatewayStatus === 'SUCCEEDED') {
  return NextResponse.json({ success: true, message: 'Pago ya confirmado previamente',
    data: { bookingNumber: booking.bookingNumber, status: 'CONFIRMED', alreadyConfirmed: true } })
}
// 2) Guard de hold expirado → 410 GONE
const holdExpired = booking.status === 'CANCELLED' ||
  (booking.status === 'PENDING' && booking.expiresAt && booking.expiresAt < new Date())
if (holdExpired) {
  return NextResponse.json({ success: false, code: 'BOOKING_EXPIRED',
    message: 'El tiempo para completar el pago de esta reserva expiró.' }, { status: 410 })
}
// 3) tasa BCV → 4) validateMovilPayPaymentWithAntiFraud → 5) update booking (CONFIRMED/SUCCEEDED)
// 6) registerMovilPayReferenceTolerant 7) PaymentLog 8) emails (best-effort)
```

**El update del booking es lo crítico.** El registro de la ref, el log y los emails son best-effort (si fallan, el cliente ya pagó y el booking ya está confirmado → se loguea, no se revierte). Para POST duplicados por red, envolver con `withIdempotency` (tabla `idempotency_keys`, TTL 24h).

---

# RIEL B — BDV C2P / Débito Inmediato (cobro con OTP)

## 7-B. Cómo funciona BDV C2P

Es un cobro que NOSOTROS iniciamos. El cliente da su cédula, teléfono y banco; el banco le manda un OTP por SMS; el cliente lo ingresa; nosotros ejecutamos el débito. El dinero sale de su cuenta y entra a la del comercio en tiempo real.

Auth: header `X-API-Key`. Host `bdvconciliacion.banvenez.com`, puerto 443, JSON.
⚠️ **HTTP 200 NO garantiza éxito** — hay que chequear `response.code === '1000'`.

- `POST /BankMobilePaymentC2P/paymentkey` → Paso 1: solicitar OTP
- `POST /BankMobilePaymentC2P/process` → Paso 2: procesar pago con OTP
- `POST /BankMobilePaymentC2P/annulment` → Anular/reembolsar (por endToEndId)
- `POST /getMovement` → Conciliación (verificar un Pago Móvil recibido)

Flujo:
1. Cliente elige banco, ingresa cédula + teléfono + monto.
2. `POST /paymentkey` → banco envía OTP por SMS. Guardamos transactionData + timeout (300 s).
3. Cliente ingresa el OTP.
4. `POST /process` (con OTP) → banco debita y responde referencia + endToEndId.
5. Persistimos: `paymentMethod=DEBIT_IMMEDIATE`, `paymentReference=referencia`, `gatewayStatus=SUCCEEDED`.

## 8. Cliente HTTP BDV C2P (completo)

```ts
// lib/bdv-c2p-client.ts (portable — 'https' nativo)
import https from 'https'
export interface BdvC2PBank { id: string; name: string; code: string }

export class BdvC2PClient {
  private baseUrl: string; private apiKey: string; private commercePhone: string; private destinationPhone: string
  constructor() {
    this.baseUrl = process.env.BDV_C2P_BASE_URL || 'https://bdvconciliacion.banvenez.com'
    this.apiKey = process.env.BDV_C2P_API_KEY || ''
    this.commercePhone = process.env.BDV_C2P_COMMERCE_PHONE || ''
    this.destinationPhone = process.env.BDV_CONCILIACION_TELEFONO_DESTINO || ''
    if (!this.apiKey) throw new Error('BDV_C2P_API_KEY no configurado') // 🔴 sin fallback literal
  }
  private makeRequest<T>(path: string, method: 'GET' | 'POST' = 'POST', body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : null
      const url = new URL(this.baseUrl)
      const options = {
        method, hostname: url.hostname, path, port: 443,
        headers: {
          'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': this.apiKey,
          ...(postData && { 'Content-Length': Buffer.byteLength(postData).toString() }),
        },
      }
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString())
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data as T)
            else reject({ success: false, status: res.statusCode, code: data.code || 'ERROR', message: data.message, data })
          } catch (error) { reject({ success: false, status: res.statusCode, code: 'PARSE_ERROR', message: 'Error parsing response', error }) }
        })
      })
      req.on('error', (error) => reject({ success: false, code: 'CONNECTION_ERROR', message: error.message, error }))
      req.setTimeout(30000, () => { req.destroy(); reject({ success: false, code: 'TIMEOUT', message: 'Request timed out after 30 seconds' }) })
      if (postData) req.write(postData)
      req.end()
    })
  }
  // Paso 1: solicitar OTP
  async requestOTP(data: { customerDocumentId: string; customerPhone: string; customerBankCode: string }) {
    const documentId = this.formatDocumentId(data.customerDocumentId)
    if (!this.isValidPhone(data.customerPhone)) return { success: false, code: 'INVALID_PHONE', message: 'Use 04XX1234567' }
    if (!this.isValidBankCode(data.customerBankCode)) return { success: false, code: 'INVALID_BANK', message: 'Código de banco inválido' }
    const request = {
      customerDocumentId: documentId,
      customerNumberInstrument: data.customerPhone, // ⚠️ el banco espera "customerNumberInstrument"
      customerBankCode: data.customerBankCode,
    }
    try {
      const res = await this.makeRequest<any>('/BankMobilePaymentC2P/paymentkey', 'POST', request)
      if (res.code && res.code !== '1000') return { success: false, code: res.code, message: this.translateError({ code: res.code, message: res.message }) }
      return { success: true, code: res.code || 'OK', message: res.message || 'OTP enviado', timeout: res.timeout || 300 }
    } catch (e: any) { return { success: false, code: e.code || 'OTP_REQUEST_FAILED', message: this.translateError(e) } }
  }
  // Paso 2: procesar pago con OTP
  async processPayment(data: { customerDocumentId: string; customerPhone: string; customerBankCode: string; otp: string; amountVES: string; concept: string }) {
    const documentId = this.formatDocumentId(data.customerDocumentId)
    const request = {
      customerDocumentId: documentId,
      customerNumberInstrument: data.customerPhone,
      customerBankCode: data.customerBankCode,
      otp: data.otp,
      amount: this.formatAmount(data.amountVES),    // ⚠️ un decimal: "300.0"
      concept: this.sanitizeText(data.concept),     // sin tildes/símbolos, máx 100
      coinType: 'VES',
      commerceNumberInstrument: this.commercePhone, // teléfono afiliado del comercio
      operationType: 'CELE',                        // constante del convenio C2P
    }
    try {
      const res = await this.makeRequest<any>('/BankMobilePaymentC2P/process', 'POST', request)
      if (res.code && res.code !== '1000') return { success: false, code: res.code, message: this.translateError({ code: res.code, message: res.message }) }
      const d = res.data || res
      return { success: true, code: res.code || 'OK', message: res.message || 'Pago procesado',
        data: { referencia: d.referencia || d.endToEndId || '', endToEndId: d.endToEndId || '',
          fecha: d.date || d.fecha || new Date().toISOString().split('T')[0],
          hora: d.hora || new Date().toTimeString().split(' ')[0], monto: data.amountVES, concepto: data.concept } }
    } catch (e: any) { return { success: false, code: e.code || 'PAYMENT_FAILED', message: this.translateError(e) } }
  }
  // Anulación / reembolso (BDV C2P lo permite; FastDebit no)
  async annulPayment(data: { endToEndId: string; referenceOrigin?: string }) {
    try {
      const res = await this.makeRequest<any>('/BankMobilePaymentC2P/annulment', 'POST', { endToEndId: data.endToEndId, referenceOrigin: data.referenceOrigin || '' })
      return { success: true, code: res.code || 'OK', message: res.message || 'Pago anulado' }
    } catch (e: any) { return { success: false, code: e.code || 'ANNULMENT_FAILED', message: this.translateError(e) } }
  }
  // Helpers de formato/validación venezolanos
  private isValidPhone(p: string) { return /^04(12|14|16|24|26)\d{7}$/.test(p) }
  private isValidBankCode(c: string) { return /^\d{4}$/.test(c) }
  private formatDocumentId(id: string) {
    const cleaned = id.toUpperCase().replace(/[^VEP0-9]/g, '')
    if (/^[VEP]\d{6,9}$/.test(cleaned)) return cleaned
    if (/^\d{6,9}$/.test(cleaned)) return `V${cleaned}`
    return cleaned
  }
  private formatAmount(a: string) { const n = parseFloat(a.replace(',', '.')); return isNaN(n) ? '0.0' : n.toFixed(1) } // ⚠️ BDV: UN decimal
  private sanitizeText(t: string) { return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().substring(0, 100) }
  private translateError(error: any): string {
    const map: Record<string,string> = {
      INVALID_OTP: 'Código OTP incorrecto. Verificá e intentá de nuevo.',
      OTP_EXPIRED: 'El código OTP expiró. Solicitá uno nuevo.',
      INSUFFICIENT_FUNDS: 'Fondos insuficientes en tu cuenta.',
      NOT_AFFILIATED: 'Tu número no está afiliado a pago móvil en este banco.',
      BANK_UNAVAILABLE: 'El banco seleccionado no está disponible. Intentá más tarde.',
      CONNECTION_ERROR: 'Error de conexión con el banco. Intentá de nuevo.',
      TIMEOUT: 'Tiempo de espera agotado. Intentá de nuevo.',
      DAILY_LIMIT_EXCEEDED: 'Excediste el límite diario de transacciones.',
      ACCOUNT_BLOCKED: 'Tu cuenta está bloqueada. Contactá a tu banco.',
      '1050': 'Error en la transacción. Intentá de nuevo.',
      '1055': 'Clave OTP no existe o expiró. Solicitá una nueva.',
    }
    return map[error.code || ''] || error.message || 'Error desconocido. Intentá de nuevo.'
  }
  getBanks(): BdvC2PBank[] { return BDV_BANKS } // lista fija — §8.1
}
export const createBdvC2PClient = () => new BdvC2PClient()
```

### 8.1 Lista de bancos (fija, no viene del banco) — 24 bancos con código BCV de 4 dígitos

```
0102 Banco de Venezuela · 0104 Venezolano de Crédito · 0105 Mercantil · 0108 BBVA Provincial
0114 Banco del Caribe · 0115 Banco Exterior · 0116 BOD · 0128 Banco Caroní · 0134 Banesco
0137 Sofitasa · 0138 Banco Plaza · 0151 BFC · 0156 100% Banco · 0157 DelSur · 0163 Banco del Tesoro
0168 Bancrecer · 0171 Banco Activo · 0172 Bancamiga · 0173 BID · 0174 Banplus · 0175 BDT
0177 BANFANB · 0178 N58 Banco Digital · 0191 BNC
```

### 8.2 Payloads literales contra el banco

Paso 1 — `POST /BankMobilePaymentC2P/paymentkey`:
```json
{ "customerDocumentId": "V12345678", "customerNumberInstrument": "04121234567", "customerBankCode": "0102" }
```
→ `{ "code": "1000", "message": "...", "timeout": 300 }` (`code ≠ "1000"` = error)

Paso 2 — `POST /BankMobilePaymentC2P/process`:
```json
{ "customerDocumentId": "V12345678", "customerNumberInstrument": "04121234567", "customerBankCode": "0102",
  "otp": "123456", "amount": "300.0", "concept": "Reserva Terrazas VIP", "coinType": "VES",
  "commerceNumberInstrument": "04XXXXXXXXX", "operationType": "CELE" }
```
→ `{ "code": "1000", "message": "...", "data": { "referencia": "...", "endToEndId": "...", "fecha": "...", "hora": "..." } }`

## 9. Endpoints BDV C2P (rutas Next.js)

- `GET /api/bdv-c2p/banks` → Devuelve `client.getBanks()`
- `POST /api/bdv-c2p/request-otp` → Valida cédula/teléfono/banco → `client.requestOTP()`
- `POST /api/bdv-c2p/confirm-payment` → Valida OTP/monto → `client.processPayment()` → persiste

Validaciones en el endpoint (antes de llamar al banco):
- Cédula: `/^[VEP]-?\d{6,9}$/i` · Teléfono: `/^04(12|14|16|24|26)\d{7}$/` · Banco: `/^\d{4}$/` · OTP: `/^\d{4,10}$/` · Monto: `parseFloat(...) > 0`
- En error, responder `alternativeMethods: ['PAGO_MOVIL','MANUAL']` y `retryable`. HTTP: CONNECTION_ERROR→503, TIMEOUT→504.

Persistencia post-pago (ejemplo real de show ticket):
```ts
await prisma.showTicket.update({ where: { id: ticketId }, data: {
  status: 'CONFIRMED', gatewayStatus: 'SUCCEEDED', confirmedAt: new Date(),
  paymentMethod: 'DEBIT_IMMEDIATE', paymentReference: result.data.referencia,
  amountPaidVES: amountVES, exchangeRateAtPayment: ticket.exchangeRateAtPayment,
  gatewayResponse: JSON.stringify({ method: 'BDV_C2P', data: result.data, confirmedAt: new Date().toISOString() }) } })
```

## 10. Idempotencia / doble-débito en C2P

- El OTP tiene TTL (300 s) — el front corre un countdown; expirado, se pide otro.
- Cada `process` exitoso devuelve `endToEndId` único → persistilo y usalo como clave de idempotencia. Antes de reintentar un `process`, verificá que la entidad no esté ya SUCCEEDED.
- Como el débito es real e inmediato, envolvé el POST `confirm-payment` con `withIdempotency`.
- Para reembolsos usá `annulPayment(endToEndId)` (BDV C2P sí lo soporta).

## 7. (Anexo) Rieles legacy: FastDebit y conciliación /getMovement

**FastDebit** (fastdebit.movilpay.app) es el predecesor de BDV C2P — mismo concepto OTP, distinto contrato:

| | BDV C2P | FastDebit |
|---|---|---|
| Host | bdvconciliacion.banvenez.com | fastdebit.movilpay.app |
| Auth | `X-API-Key` | `X-Api-Key-MPS` |
| OTP request | `/BankMobilePaymentC2P/paymentkey` | `/api/v1/otp-request` (action "ROTP") |
| OTP confirm | `/BankMobilePaymentC2P/process` | `/api/v1/otp-response` (action "REQU") |
| Monto | `"300.0"` (punto, 1 decimal) | `"300,00"` (coma) |
| Reembolso | Sí (`annulment`) | No |

Para un proyecto nuevo: usá solo BDV C2P, ignorá FastDebit.

**`/getMovement` (conciliación)** es lo inverso de MovilPay: en vez de un validador tercero, le preguntás al propio BDV si recibió un Pago Móvil, enviando `cedulaPagador, telefonoPagador, telefonoDestino, referencia, fechaPago, importe, bancoOrigen, reqCed:false`. Responde `code 1000` si concilió; errores típicos: "ya conciliado", "variación de monto", "no encontrado".

## 11. Checklist de replicación (paso a paso)

**Backend:**
- Env vars (§1.1), sin fallback literal de credenciales.
- `lib/movilpay-client.ts` + `lib/movilpay-validation.ts` (riel A).
- `lib/bdv-c2p-client.ts` (riel B).
- Modelos Prisma: campos de pago en la entidad + `MobilePaymentReference` + `PaymentLog`. `gatewayResponse @db.Text`. Migrar.
- Endpoints MovilPay: validate-payment, [id]/confirm-movilpay, admin/validate-payment.
- Endpoints BDV C2P: banks, request-otp, confirm-payment.
- `withIdempotency` en los POST de confirmación.
- Fuente de tasa BCV (USD→VES) para convertir a Bs y capturarla al cobrar.

**Frontend:**
- MovilPay: input de referencia (+ opcional monto/teléfono/fecha) → validar → confirmar.
- BDV C2P: selector de banco (`/banks`) → cédula (V/E/P) + teléfono (04XX) + monto Bs → "Solicitar OTP" → input OTP + countdown 300 s → "Confirmar" → mostrar referencia.
- Inputs venezolanos: cédula y teléfono con máscara/validación.
- Selector de método manual obligatorio si ofrecés transferencia/Zelle/efectivo.

**Seguridad / operación:**
- Nunca exponer tokens/api-keys al cliente. Toda llamada al banco/validador va por el backend.
- Recalcular el monto server-side (nunca confiar en el monto del cliente).
- Cron que cancele bookings PENDING con hold expirado y libere disponibilidad.
- Logs con datos sensibles enmascarados (OTP, teléfono, api-key).

## 12. Gotchas — lecciones pagadas en producción

1. 🔴 Token/API-key hardcodeado como fallback → fuga de credencial. Solo env, lanzá si falta.
2. 🔴 Anti-fraude en orden inverso: buscar duplicado ANTES de validar monto.
3. 🔴 Refs BDT colisionan (9 díg reales, 6 guardados). `findUnique` crudo NO es anti-fraude; desambiguá por monto USD.
4. ⚠️ HTTP 200 ≠ éxito en BDV — chequeá siempre `response.code === '1000'`.
5. ⚠️ `amount` BDV con UN decimal (`"300.0"`), punto. MovilPay usa 2 (`"5000.00"`). FastDebit usaba coma (`"300,00"`).
6. ⚠️ `gatewayResponse` debe ser TEXT, no VARCHAR(255).
7. ⚠️ `gatewayStatus=SUCCEEDED` (no CONFIRMED) para "pagado". CONFIRMED es el estado de la reserva.
8. ⚠️ Monto real = el que devuelve el banco/validador, jamás el del cliente. Tolerancia MovilPay: `max(2%, 5 Bs)`; overpayment OK.
9. ⚠️ `validate-payment` público NO registra la ref (el booking aún no existe). El registro va en `confirm-movilpay`.
10. ⚠️ OTP expira a los 300 s — countdown en el front, y regenerar si expira. No reuses OTP.
11. ⚠️ Idempotencia por estado: si la entidad ya está SUCCEEDED, devolvé éxito sin re-procesar.
12. ⚠️ Teléfono venezolano: `04(12|14|16|24|26)\d{7}`. Cédula: `[VEP]\d{6,9}`. Validá antes de pegarle al banco.
