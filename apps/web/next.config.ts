import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@foodresq/types', '@foodresq/dto'],
  // Tắt StrictMode ở dev vì react-leaflet (Leaflet) không tương thích
  // với double-mount trong dev mode của React 18+ — sẽ crash với
  // "Map container is being reused by another instance".
  reactStrictMode: false,
};

export default nextConfig;
