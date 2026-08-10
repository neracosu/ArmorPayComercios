import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ArmorPay — Plataforma de validación de pagos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Imagen Open Graph: lo que se ve al compartir armorpay.net en WhatsApp o
 * redes. Antes no había NADA — el link se compartía pelado.
 */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0F172A",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>
          <span>Armor</span>
          <span style={{ color: "#22D3EE" }}>Pay</span>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 40, color: "#E2E8F0", maxWidth: 900 }}>
          Confirma en segundos que el pago móvil llegó a tu cuenta.
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 28, color: "#94A3B8" }}>
          Plataforma de validación de pagos · Venezuela
        </div>
      </div>
    ),
    size
  );
}
