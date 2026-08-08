<?php
/**
 * Plugin Name: ArmorPay para WooCommerce
 * Plugin URI: https://armorpay.net/docs/api
 * Description: Cobra en bolívares por pago móvil (referencia) y C2P, validado al instante por ArmorPay. El pedido se confirma solo cuando el banco confirma.
 * Version: 1.0.0
 * Author: ArmorPay — Plataforma de validación de pagos
 * Author URI: https://armorpay.net
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: armorpay-woocommerce
 * Update URI: https://armorpay.net/descargas/armorpay-woocommerce.json
 *
 * Copyright (c) 2026 ArmorPay (armorpay.net). Soporte: info@armorpay.net.
 *
 * El plugin es deliberadamente TONTO: no valida nada él mismo. Crea el cobro
 * por la API de ArmorPay (server-side, la llave nunca toca el navegador),
 * manda al cliente a la página de pago alojada, y confirma el pedido por
 * webhook firmado — con un respaldo por consulta cuando el cliente vuelve.
 */

if (!defined('ABSPATH')) {
    exit;
}

// HPOS (almacén de pedidos de alto rendimiento): todo el acceso a pedidos va
// por el CRUD de WooCommerce, así que se declara compatible — sin esto, los
// WooCommerce nuevos (HPOS por defecto) marcan el plugin como incompatible.
add_action('before_woocommerce_init', function () {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

// Actualizaciones desde armorpay.net (no desde wordpress.org): el header
// `Update URI` hace que WP pregunte por este filtro; se compara contra el
// manifiesto publicado y, si hay versión nueva, WP la ofrece en el dashboard.
// La URL del manifiesto es fija a propósito: las actualizaciones vienen de
// nosotros aunque el comercio cambie el servidor de API en los ajustes.
define('ARMORPAY_WC_MANIFEST_URL', 'https://armorpay.net/descargas/armorpay-woocommerce.json');

function armorpay_wc_manifest()
{
    $res = wp_remote_get(ARMORPAY_WC_MANIFEST_URL, ['timeout' => 10]);
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
        return null; // sin manifiesto no hay actualización: nunca romper el chequeo
    }
    $m = json_decode(wp_remote_retrieve_body($res), true);
    return (!empty($m['version']) && !empty($m['package'])) ? $m : null;
}

add_filter('update_plugins_armorpay.net', function ($update, $plugin_data, $plugin_file) {
    if ($plugin_file !== plugin_basename(__FILE__)) {
        return $update;
    }
    $manifest = armorpay_wc_manifest();
    if (!$manifest || !version_compare($manifest['version'], $plugin_data['Version'], '>')) {
        return $update;
    }
    return $manifest;
}, 10, 3);

// Ficha de «Ver detalles de la versión X» — sin esto, ese enlace da error
// porque WP intenta buscar el plugin en wordpress.org.
add_filter('plugins_api', function ($result, $action, $args) {
    if ($action !== 'plugin_information' || empty($args->slug) || $args->slug !== 'armorpay-woocommerce') {
        return $result;
    }
    $m = armorpay_wc_manifest();
    if (!$m) {
        return $result;
    }
    return (object) [
        'name'          => 'ArmorPay para WooCommerce',
        'slug'          => 'armorpay-woocommerce',
        'version'       => $m['version'],
        'author'        => '<a href="https://armorpay.net">ArmorPay</a>',
        'homepage'      => 'https://armorpay.net/docs/api',
        'download_link' => $m['package'],
        'requires'      => isset($m['requires']) ? $m['requires'] : '6.0',
        'requires_php'  => isset($m['requires_php']) ? $m['requires_php'] : '7.4',
        'tested'        => isset($m['tested']) ? $m['tested'] : '',
        'sections'      => [
            'description' => 'Cobra en bolívares por pago móvil (referencia) y C2P, validado '
                . 'al instante por ArmorPay. Documentación: https://armorpay.net/docs/api',
        ],
    ];
}, 10, 3);

// Auto-update activado por defecto: el comercio no tiene que hacer nada para
// recibir versiones nuevas (WP las aplica en su cron, ~2 chequeos al día).
add_filter('auto_update_plugin', function ($update, $item) {
    if (isset($item->slug) && 'armorpay-woocommerce' === $item->slug) {
        return true;
    }
    return $update;
}, 10, 2);

add_action('plugins_loaded', 'armorpay_init_gateway', 11);
add_filter('woocommerce_payment_gateways', function ($gateways) {
    $gateways[] = 'WC_Gateway_ArmorPay';
    return $gateways;
});

function armorpay_init_gateway()
{
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    class WC_Gateway_ArmorPay extends WC_Payment_Gateway
    {
        /** @var string */
        private $api_base;
        /** @var string */
        private $api_key;
        /** @var string */
        private $webhook_secret;

        public function __construct()
        {
            $this->id                 = 'armorpay';
            $this->method_title       = 'ArmorPay';
            $this->method_description = 'Pago móvil validado al instante (referencia y C2P). '
                . 'Crea tu llave de API y tu webhook en el panel de ArmorPay → API. '
                . 'Documentación: https://armorpay.net/docs/api · Soporte: info@armorpay.net';
            $this->has_fields         = false;

            $this->init_form_fields();
            $this->init_settings();

            $this->title          = $this->get_option('title');
            $this->description    = $this->get_option('description');
            $this->api_base       = rtrim($this->get_option('api_base'), '/');
            $this->api_key        = $this->get_option('api_key');
            $this->webhook_secret = $this->get_option('webhook_secret');

            add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'process_admin_options']);
            // Webhook: https://mitienda.com/?wc-api=armorpay
            add_action('woocommerce_api_armorpay', [$this, 'handle_webhook']);
            // Respaldo por consulta cuando el cliente vuelve a la tienda.
            add_action('woocommerce_thankyou_armorpay', [$this, 'poll_on_return']);
        }

        public function init_form_fields()
        {
            $this->form_fields = [
                'enabled' => [
                    'title'   => 'Activar',
                    'type'    => 'checkbox',
                    'label'   => 'Activar ArmorPay',
                    'default' => 'no',
                ],
                'title' => [
                    'title'   => 'Título en el checkout',
                    'type'    => 'text',
                    'default' => 'Pago móvil (validación instantánea)',
                ],
                'description' => [
                    'title'   => 'Descripción',
                    'type'    => 'textarea',
                    'default' => 'Paga por pago móvil y confirma al instante. Tu pedido arranca apenas el banco confirma.',
                ],
                'api_base' => [
                    'title'       => 'Servidor de ArmorPay',
                    'type'        => 'text',
                    'default'     => 'https://armorpay.net',
                    'description' => 'Déjalo como está salvo que ArmorPay te indique otro.',
                ],
                'api_key' => [
                    'title'       => 'Llave de API',
                    'type'        => 'password',
                    'description' => 'Empieza con ak_live_. Se crea en el panel de ArmorPay → API.',
                ],
                'webhook_secret' => [
                    'title'       => 'Secreto del webhook',
                    'type'        => 'password',
                    'description' => 'Empieza con whsec_. Registra en ArmorPay la URL '
                        . esc_html(home_url('/?wc-api=armorpay')) . ' y pega aquí el secreto.',
                ],
            ];
        }

        /** Solo cobra en bolívares: el monto del intent es VES puro (v1). */
        public function is_available()
        {
            return parent::is_available()
                && get_woocommerce_currency() === 'VES'
                && !empty($this->api_key);
        }

        /**
         * Crea el intent en ArmorPay y manda al cliente a la página de pago.
         * Idempotency-Key = la order key: reintentar el checkout no duplica.
         */
        public function process_payment($order_id)
        {
            $order = wc_get_order($order_id);

            $response = wp_remote_post($this->api_base . '/api/v1/intents', [
                'timeout' => 20,
                'headers' => [
                    'Content-Type'    => 'application/json',
                    'Authorization'   => 'Bearer ' . $this->api_key,
                    'Idempotency-Key' => 'wc-' . $order->get_order_key(),
                ],
                'body' => wp_json_encode([
                    'externalRef' => (string) $order->get_id(),
                    'amountVES'   => number_format((float) $order->get_total(), 2, '.', ''),
                    'concepto'    => get_bloginfo('name') . ' pedido ' . $order->get_id(),
                ]),
            ]);

            if (is_wp_error($response)) {
                wc_add_notice('No pudimos conectar con el validador de pagos. Intenta de nuevo.', 'error');
                return ['result' => 'failure'];
            }

            $code = wp_remote_retrieve_response_code($response);
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (($code !== 200 && $code !== 201) || empty($body['intent']['id'])) {
                $motivo = isset($body['message']) ? $body['message'] : ('HTTP ' . $code);
                $order->add_order_note('ArmorPay: no se pudo crear el cobro — ' . $motivo);
                wc_add_notice('No pudimos iniciar el cobro. Intenta de nuevo o elige otro método.', 'error');
                return ['result' => 'failure'];
            }

            $intent_id = sanitize_text_field($body['intent']['id']);
            $order->update_meta_data('_armorpay_intent_id', $intent_id);
            $order->update_status('pending', 'ArmorPay: esperando confirmación del pago.');
            $order->save();

            return [
                'result'   => 'success',
                'redirect' => $this->api_base . '/pay/' . rawurlencode($intent_id),
            ];
        }

        /**
         * Webhook firmado de ArmorPay. La firma es HMAC-SHA256 de
         * "timestamp.body" — la MISMA que ArmorPay usa en toda su casa.
         */
        public function handle_webhook()
        {
            $body      = file_get_contents('php://input');
            $timestamp = isset($_SERVER['HTTP_X_ARMORPAY_TIMESTAMP']) ? $_SERVER['HTTP_X_ARMORPAY_TIMESTAMP'] : '';
            $signature = isset($_SERVER['HTTP_X_ARMORPAY_SIGNATURE']) ? $_SERVER['HTTP_X_ARMORPAY_SIGNATURE'] : '';

            if (empty($this->webhook_secret) || $timestamp === '' || $signature === '') {
                status_header(401);
                exit;
            }
            if (abs(time() - (int) $timestamp) > 300) {
                status_header(401); // anti-replay
                exit;
            }
            $esperada = hash_hmac('sha256', $timestamp . '.' . $body, $this->webhook_secret);
            if (!hash_equals($esperada, $signature)) {
                status_header(401);
                exit;
            }

            $payload = json_decode($body, true);
            if (empty($payload['event']) || empty($payload['intent']['id'])) {
                status_header(400);
                exit;
            }

            $orders = wc_get_orders([
                'meta_key'   => '_armorpay_intent_id',
                'meta_value' => sanitize_text_field($payload['intent']['id']),
                'limit'      => 1,
            ]);
            if (empty($orders)) {
                status_header(200); // no es nuestro: 200 para no reintentar eterno
                exit;
            }
            $order = $orders[0];

            if ($payload['event'] === 'intent.confirmed') {
                $this->confirmar_pedido($order, $payload['intent']);
            } elseif ($payload['event'] === 'intent.expired' && $order->has_status('pending')) {
                $order->update_status('cancelled', 'ArmorPay: el cobro venció sin pagarse.');
            }

            status_header(200);
            echo '{}';
            exit;
        }

        /** Respaldo: al volver el cliente, se consulta el estado por la API. */
        public function poll_on_return($order_id)
        {
            $order = wc_get_order($order_id);
            if (!$order || !$order->has_status('pending')) {
                return;
            }
            $intent_id = $order->get_meta('_armorpay_intent_id');
            if (!$intent_id) {
                return;
            }

            $response = wp_remote_get(
                $this->api_base . '/api/v1/intents/' . rawurlencode($intent_id),
                ['timeout' => 15, 'headers' => ['Authorization' => 'Bearer ' . $this->api_key]]
            );
            if (is_wp_error($response)) {
                return;
            }
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (!empty($body['intent']['status']) && $body['intent']['status'] === 'CONFIRMED') {
                $this->confirmar_pedido($order, $body['intent']);
            }
        }

        /** Un solo lugar marca pagado (webhook o polling): idempotente. */
        private function confirmar_pedido($order, $intent)
        {
            if ($order->is_paid()) {
                return;
            }
            $metodo = isset($intent['method']) ? $intent['method'] : '';
            $nota   = 'ArmorPay confirmó el pago (' . ($metodo === 'C2P' ? 'C2P' : 'referencia') . ').';
            if (!empty($intent['overpaidVES'])) {
                $nota .= ' El cliente pagó Bs ' . $intent['overpaidVES'] . ' de más.';
            }
            $order->add_order_note($nota);
            $order->payment_complete(isset($intent['referencia']) ? (string) $intent['referencia'] : '');
        }
    }
}
