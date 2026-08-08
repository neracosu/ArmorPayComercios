=== ArmorPay para WooCommerce ===
Contributors: armorpay
Tags: pago movil, venezuela, bolivares, c2p, woocommerce
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Cobra en bolívares por pago móvil (referencia) y C2P, validado al instante por ArmorPay. El pedido se confirma solo cuando el banco confirma.

== Description ==

ArmorPay es una plataforma de validación de pagos: confirma contra el banco, en segundos, que un pago móvil llegó a la cuenta de tu comercio.

Este plugin conecta tu tienda WooCommerce con ArmorPay:

* Crea el cobro desde tu servidor (tu llave de API nunca toca el navegador del cliente).
* Envía al cliente a la página de pago alojada de ArmorPay, donde paga por referencia o con Botón de Pago (C2P).
* Confirma el pedido por webhook firmado (HMAC-SHA256, anti-replay), con un respaldo por consulta cuando el cliente vuelve a la tienda.
* El pedido se marca pagado únicamente cuando el banco confirma. El plugin no valida nada por su cuenta.

El dinero va directo del cliente a la cuenta bancaria de tu comercio. ArmorPay nunca custodia ni mueve fondos: solo confirma.

Documentación: https://armorpay.net/docs/api

== Installation ==

1. Sube el zip en Plugins → Añadir nuevo → Subir plugin, y actívalo (requiere WooCommerce).
2. En WooCommerce → Ajustes → Pagos, activa «ArmorPay».
3. Pega tu Llave de API (ak_live_…), creada en el panel de ArmorPay → API.
4. Registra en ArmorPay la URL de webhook que muestra la pantalla de ajustes y pega aquí el secreto (whsec_…).
5. La moneda de la tienda debe ser VES (bolívares): el método solo se ofrece en esa moneda.

== Frequently Asked Questions ==

= ¿Necesito cuenta en ArmorPay? =

Sí. El comercio se registra en https://armorpay.net y queda operativo al completar su activación.

= ¿El plugin guarda datos del pago? =

Solo el identificador del cobro en el pedido. La validación bancaria completa vive en ArmorPay.

== Changelog ==

= 1.0.0 =
* Versión inicial: cobro por referencia y C2P, webhook firmado con respaldo por consulta, compatible con HPOS.
* Actualizaciones automáticas servidas desde armorpay.net: las versiones nuevas se instalan solas.
