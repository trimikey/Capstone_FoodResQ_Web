import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.20.10.4", "192.168.174.1"],
  transpilePackages: ["@foodresq/types", "@foodresq/dto"],
  // Disable StrictMode in dev because react-leaflet does not handle
  // React 18+ double-mounting and can crash with
  // "Map container is being reused by another instance".
  reactStrictMode: false,
};

export default nextConfig;
