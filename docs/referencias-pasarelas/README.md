# Referencias de pasarelas — cómo estas guías se traducen al producto checkout de ArmorPay

> Entregadas por Neri el 2026-08-06 junto con la visión de producto: llevar el SaaS al siguiente nivel dándole a cada comercio afiliado la capacidad de **confirmar compras en línea en su propia web** (plugin WordPress, embed, o API para su carrito) usando nuestra validación por referencia (BDT+BT) y el C2P del Tesoro. Las tres guías vienen de proyectos del grupo que están (o estuvieron) cobrando en producción.

## Qué guía enseña qué

| Guía | Proyecto | Enseña |
|---|---|---|
| `01-vipplay-movilpay-bdv-c2p.md` | VIP Play Sport Bar | La arquitectura **payment-first** (pedido después del pago), pagos parciales/sobrepago, tolerancia de tasa por candidatos, deuda conocida honesta |
| `02-terrazas-guia-maestra.md` | Terrazas VIP | Los **clientes HTTP completos** portables, el anti-fraude por colisión de 6 dígitos (el más sofisticado de los tres), idempotencia commit-first |
| `03-hotel-laguaira-bdv-conciliacion.md` | Hotel VIP La Guaira | El pipeline canónico de orquestación (idempotencia → anti-reuso → validar → confirmar → side-effects), BDV Conciliación, el fallback a captura manual, y el C2P del BDV **bloqueado** (code 1030) |

## La inversión de perspectiva (leer esto antes que las guías)

Las tres guías están escritas desde el lado **consumidor**: proyectos que le pagan a MovilPay/BDV para validar. **ArmorPay va a construir el lado proveedor** — nosotros somos al comercio lo que MovilPay es a VIP Play. Eso cambia cómo se leen:

- Cada **fricción documentada** del proveedor es un requisito de diseño de NUESTRA API para no repetirla: `results` vacío que significa «todavía no lo veo» (MovilPay pollea; nosotros tenemos webhook del banco → podemos ofrecer **webhooks al comercio**, cosa que ni MovilPay ni BDV dan — diferenciador real), errores crípticos tipo `1010` con 3 formatos de data (los nuestros van tipificados), formatos de monto distintos por endpoint (el nuestro: uno solo, documentado).
- Cada **protección del lado consumidor** (anti-reuso de referencia, tolerancia de monto, idempotencia) es algo que nuestro plugin/SDK debe traer **de fábrica**, porque el comercio promedio no la va a implementar bien.
- El **catálogo de errores traducidos al usuario** (`translateError`) es oro para el embed: el cliente final ve mensajes accionables, no códigos.

## Mapa de rieles: guías → ArmorPay

| Riel en las guías | Nuestro equivalente | Ventaja nuestra |
|---|---|---|
| MovilPay `validate` (polling de un tercero) | Validación por referencia contra `WebhookTransaction` (BDT+BT vía gateway) | **Push, no poll**: el banco nos notifica; no hay ventana de «todavía no aparece» del validador intermediario |
| BDV Conciliación `/getMovement` (consulta al banco, 5 campos) | Validación online BDT (respaldo) | Ya operativa en el panel interno; en el SaaS es respaldo, igual que allá |
| BDV C2P (débito con OTP — **bloqueado** en Hotel con code 1030) | **BT C2P «Botón de Pago»** — EN PRODUCCIÓN en el panel interno desde 2026-08-03 (`C2P0000`) | El nuestro funciona. El de BDV lleva meses trabado con soporte. Somos de los pocos con un C2P operativo |

## Qué copiar sí o sí (consenso de las tres guías)

1. **Referencia única con `@unique` + captura de `P2002`** — el constraint es el control, el `findFirst` previo es solo cortesía. Y el refinamiento de Terrazas: con 6 dígitos hay colisiones legítimas → desambiguar por monto antes de bloquear.
2. **Éxito = código del banco, nunca HTTP 200.** Ya lo vivimos con BT (`C2P0000` como gate); las guías lo confirman como EL bug clásico (BDV code 1055/1030 con HTTP 200).
3. **El monto lo decide el servidor** y se compara contra lo que devuelve el banco, jamás contra lo que declara el cliente. Tolerancia asimétrica: rechazar subpago, tolerar sobrepago (con seguimiento).
4. **Tolerancia de tasa por candidatos** (monto grabado / total×tasa del pedido / total×tasa vigente) si el comercio precia en USD. Nunca una tasa hardcodeada de respaldo.
5. **Payment-first + vinculación retroactiva** como patrón recomendado para el carrito del comercio (nuestro SDK/docs deben guiarlo), con idempotencia por doble clic.
6. **Bitácora append-only de TODO intento** (incluidos fallidos y fraudes con motivo) + respuesta cruda del banco como evidencia forense.
7. **Fallback cuando el banco está caído**: nunca dejar al cliente final sin camino (Hotel: captura + `pending_review`).
8. **Enmascarado en logs** (teléfono, OTP, referencia) y **cero credenciales hardcodeadas** (Terrazas pagó esa: token en 4 archivos).
9. **Lista de bancos única** (VIP Play pagó la duplicación: 0175 con dos nombres). Nosotros ya tenemos el patrón (`bdt-codes.ts` / `bt-c2p-codes.ts` centralizados) — extenderlo al catálogo público.
10. **Rate limit por IP** en los endpoints públicos (una referencia son 6 dígitos: se adivina por fuerza bruta) — en tabla/Redis, no en memoria.

## Qué NO copiar (deuda declarada por las propias guías)

- `results[0]` como fallback cuando ninguna referencia matchea (valida contra pago ajeno).
- Ventana temporal de vinculación (5 min) en lugar de vincular por id.
- Rate limit en memoria de proceso.
- `console.log` de respuestas completas del gateway.
- FastDebit (legacy, sin reversa).

## Los gates de ArmorPay (estado al 2026-08-06)

1. **G0 — opinión legal (plan maestro). ÚNICO GATE ABIERTO.** Un checkout embebible para carritos de terceros es *exactamente* la actividad que el Artículo 16 de la Resolución SUDEBAN 001-21 asocia a constituirse como ITFB. Nuestra carta fuerte es real: **nunca custodiamos ni movemos fondos por cuenta propia** — el dinero va directo del pagador a la cuenta del comercio; solo validamos/confirmamos. Pero el propio plan maestro (revisión adversarial) advierte que el regulador clasifica **por actividad, no por nombre ni por custodia**, y que las fuentes profesionales no fueron corroboradas contra el texto primario. La pregunta al abogado ya está redactada en el plan; al retomarla, **extenderla con el C2P**: ejecutar el débito a nombre del comercio (aunque el abono vaya directo a su cuenta) es una actividad más «de pasarela» que la validación pasiva. **Asignación (Neri, 2026-08-06): G0 lo llevan los dueños/jefes con sus abogados, en paralelo — incluido, si hiciera falta, el registro ante la institución que corresponda.** Para el equipo técnico NO es un bloqueo: se diseña y construye todo; solo condiciona el LANZAMIENTO a terceros.
2. ✅ **Verificación del débito C2P — RESUELTO.** Neri confirmó el 2026-08-06 que el C2P quedó **confirmado y funcionando al 100%** (débito exacto de 12,00 Bs al pagador, sin comisión de su lado, verificado desde el 08-03).
3. ✅ **Afiliación por comercio — RESUELTO operativamente.** Hay **contactos directos con ambos bancos** para gestionar las aprobaciones (codAfiliado/AuthKey por RIF). Sigue siendo el paso más lento del onboarding de cada comercio → tratarlo como pipeline dentro del producto (estado de trámite visible), no como bloqueo.
4. ✅ **Arquitectura — DECIDIDO (Neri, 2026-08-06).** La ejecución C2P del checkout va **por el gateway**: dominio distinto, mismo servidor whitelisteado por los bancos. El checkout del SaaS nunca llama al banco directo. Queda el diseño fino de esa pata saliente del gateway — sin tocar el camino crítico del panel que factura.
5. ✅ **R-17 (webhook por afiliación) — LISTO del lado interno** (2026-08-06, commit `f36f07b` de armorpay): el panel interno ya soporta **una URL/token de webhook BT por afiliación** (`resolveBtAffiliation()`; alta desde su `/settings` sin deploy) — la atribución multi-comercio del lado entrante está resuelta. Vigente: los **límites de ráfaga del banco** — el modelo webhook-first absorbe la carga de validación (es local), pero el C2P es una llamada al banco por transacción; dimensionar con la mesa de operación antes de abrir el grifo.

## Primeros trabajos en este repo (orden sugerido)

1. ✅ **Contrato v2 del gateway con campo `banco` — HECHO (2026-08-06, Fase 0, commit `5ff48dc`)**: `banco` viaja end-to-end (source → contrato aditivo `version: 1` → ingesta con default → columnas en `BankTransaction`/`BankAccount` → chip en caja). Migración `20260806162641_banco_receptor`, test-isolation 11/11, desplegado y verificado en producción el mismo día.
2. **Diseño de la pata saliente del gateway** (decisión ya tomada: C2P y validación online para comercios se ejecutan desde el gateway, mismo servidor whitelisteado). Los moldes de clientes bancarios están en el repo interno: `src/lib/bdt-client.ts` (undici + TLS específico), `src/lib/bt-client.ts` y `src/app/api/bank/c2p/route.ts` — leerlos como referencia y portarlos; NO crear dependencia runtime hacia armorpay.
3. **Contrato de la API de checkout** (API keys por comercio, idempotency keys, webhooks de confirmación al comercio, y las superficies embed/plugin) — con las guías de esta carpeta como base.

## Superficies de producto previstas

- **API REST** para carritos custom (API key por comercio, HMAC opcional, idempotency keys, webhooks de confirmación al comercio).
- **Embed/iframe** para web genérica (la máquina de estados `form → otp → validating → success | error | overpayment` de VIP Play es el molde).
- **Plugin WordPress/WooCommerce** (empaqueta el embed + el payment-first del lado del carrito).
