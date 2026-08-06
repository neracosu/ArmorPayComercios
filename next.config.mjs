/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Los recaudos suben por server action: PDF/imagen hasta 2 MB + margen
      // del encoding. El default (1 MB) rechazaría un RIF escaneado normal.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
