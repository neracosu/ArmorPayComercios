/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `.next` es el directorio que PM2 está SIRVIENDO: un `next build` directo
  // lo pisa y borra los chunks del proceso vivo → ChunkLoadError para todo el
  // que tenga la página abierta (pasó el 2026-08-08). Para verificar que el
  // código compila sin tocar producción: `npm run build:check` (usa
  // `.next-check`). Para desplegar: `npm run deploy` (build + reload juntos).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      // Los recaudos suben por server action: PDF/imagen hasta 2 MB + margen
      // del encoding. El default (1 MB) rechazaría un RIF escaneado normal.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
