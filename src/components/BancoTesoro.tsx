/**
 * Marca del Banco del Tesoro — requisito del convenio con el BT (2026-08-13):
 * su logo debe verse en cada superficie donde el flujo toque al Tesoro (la
 * caja al validar una referencia BT, el Botón de Pago, las ventas del
 * comercio y la página pública de pago). Sin hooks a propósito: usable igual
 * en server components y client components.
 *
 * `bt-marca.png` es la marca a color, legible sobre nuestros fondos claros.
 * Para fondos oscuros existe `/bancos/bt-blanco.png` (marca + wordmark en
 * blanco, la misma que usa el panel interno).
 */
export function MarcaBt({ className = "h-4 w-auto" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset propio, tamaño fijo
    <img
      src="/bancos/bt-marca.png"
      alt="Banco del Tesoro"
      className={`shrink-0 ${className}`}
    />
  );
}
