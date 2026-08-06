# Plan UI/UX — ArmorPay Cloud

> **2026-08-06.** Neri definió el UI/UX como frente a atacar: panel admin, panel del comercio/cajas y vistas finales. Este plan sale de una auditoría honesta de lo que hay + investigación de referencias (checkout de pago y POS de alta frecuencia — fuentes al pie). Regla de la casa: el sistema de tokens existente (`tinta`/`marca`, `.monto` tabular, `font-display`, `rounded-card/control`) es la BASE — disciplina sobre novedad; los cambios se hacen por superficie, con el skill `frontend-design` cargado, y se despliegan chicos.

## Lo que ya está bien (no tocar por tocar)

- **Sistema de tokens coherente**: un acento de marca, estados separados (ok/alerta/error) con la nota explícita de «un pago confirmado no se pinta del color de la marca». Eso es más disciplina de la que trae la mayoría de los SaaS chicos.
- **`.monto` con números tabulares** — los montos no «bailan» entre filas. Decisión correcta para caja.
- **La caja (/validar) ya es payment-first**: autofocus en la referencia, `inputMode` numérico, alarma de doble cobro ANTES de confirmar, y el flujo entero es un solo input + un botón.
- **/pay (2026-08-06)** nació con diseño intencional: ticket con monto exacto como héroe, borde perforado, countdown del OTP, `postMessage`. Los logos de comercio (mismo día) le dieron la marca del que cobra.

## Auditoría por superficie y backlog priorizado

### P1 — La caja `/validar` (la pantalla más usada, cientos de veces al día)

Los POS viven o mueren por velocidad percibida y por fricción por operación (ver fuentes: feedback instantáneo, atajos de teclado, solo lo necesario en pantalla).

1. **Estado de resultado sin salto de layout**: hoy los resultados aparecen debajo y empujan el formulario. Reservar el espacio o anclar el formulario arriba.
2. **Atajos de teclado**: `Enter` ya busca; falta poder **cobrar sin mouse** (ej. `Enter` sobre el primer resultado único, `Esc` limpia). Una cajera con cola no debería tocar el mouse.
3. **Feedback de éxito más fuerte**: el cobro confirmado merece un instante visual/sonoro inequívoco (verde grande, medio segundo) — es el «cha-ching» del negocio y hoy es una fila que cambia de color.
4. **El turno visible siempre**: el chip «Sin turno» de la cabecera es fácil de no ver; si no hay turno, el formulario debería decirlo grande ANTES de buscar, no al cobrar.

### P2 — `/pay` (la cara ante el cliente final; convierte o espanta)

De las guías de checkout: señales de confianza pegadas al punto de pago (+18% de completación), CTA fijo al fondo en móvil, divulgación progresiva.

1. **CTA pegajoso en móvil**: «Confirmar mi pago» fijo al fondo del viewport en pantallas cortas.
2. **Señal de confianza junto al formulario**: hoy el sello ArmorPay está al pie de página; subir una versión mínima junto al botón de pagar («Validación bancaria directa · no guardamos tus datos»).
3. **Estados de espera con narrativa**: «Verificando con el banco…» ya existe; agregar el caso «el banco tarda» (>8 s) con copy que calme, y reintento claro en NETERR.
4. **Página de vencido con salida**: hoy dice «vuelve a la tienda»; si el intent trae iframe padre, avisar por postMessage también el vencimiento.

### P3 — Panel del comercio (dueño: cierres, cajas, sucursales, API, perfil)

1. **Un «hoy» de un vistazo**: Cierres ya muestra «cobrado hoy», pero el dueño entra a VER cómo va el negocio — un encabezado con cobrado hoy / cobros / cajas abiertas en TODAS las páginas del comercio (o una página de inicio del comercio).
2. **El medidor de consumo del plan** (`consumoDelMes()` ya existe y nada la consume — deuda anotada en la guía): pintarla en el panel del dueño.
3. **Vacíos que enseñan**: los estados vacíos de API/webhooks ya orientan; replicar el patrón en cierres/cajas para el comercio recién creado (onboarding implícito: qué falta para cobrar la primera vez).

### P4 — Panel de plataforma (nosotros; funcional manda)

1. La ficha del comercio creció hoy (llave, C2P, logo, cuentas, usuarios) — ya pide **navegación por secciones** (anclas o tabs) antes de que crezca más.
2. **Checklist de alta visible**: el flujo real es razón social → cuentas → llave → C2P → logo → admin; la ficha debería mostrar qué pasos faltan (hoy lo dice suelto en mensajes).

### P5 — Portada pública

1. La portada es honesta y clara (bien); le falta **mostrar el producto**: una captura/mock del panel de caja y de /pay valen más que dos párrafos.
2. Los logos de los primeros comercios del grupo (cuando estén de alta y autoricen) como prueba social.

## Método de trabajo

- Una superficie por sesión, con `frontend-design` cargado y una pasada de crítica antes de desplegar.
- Todo cambio de caja se valida con la pregunta: **¿le quita segundos o se los agrega a una cola de clientes?**
- Móvil primero en /pay y portada; la caja es desktop-first (PCs fijas).
- Nada de librerías de componentes nuevas: los tokens existentes alcanzan.

## Fuentes de la investigación (2026-08-06)

- [BigCommerce — Checkout Optimization Best Practices for 2026](https://www.bigcommerce.com/articles/ecommerce/checkout-optimization/)
- [Salesforce — Ecommerce Checkout: 10 Best Practices](https://www.salesforce.com/commerce/online-payment-solution/checkout-guide/)
- [Carty Labs — 30 principios de UX de checkout](https://cartylabs.com/blog/shopify-checkout-ux-best-practices/) (señales de confianza junto al pago, +18% completación)
- [Stripe — Mobile checkout UI best practices](https://stripe.com/resources/more/mobile-checkout-ui) (CTA fijo al fondo)
- [Digital Applied — Checkout UX Guide 2026](https://www.digitalapplied.com/blog/ecommerce-checkout-optimization-2026-ux-guide)
- [Dev.pro — 10 tácticas de UX para POS](https://dev.pro/insights/designing-a-pos-system-ten-user-experience-tactics-that-improve-usability/) (atajos, feedback instantáneo)
- [Hashmato — Principles for Designing a POS](https://hashmato.com/point-of-sale-system-design-principles-tactics/)
- [Agente Studio — POS design principles](https://agentestudio.com/blog/design-principles-pos-interface)
