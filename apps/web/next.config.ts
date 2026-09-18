import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "172.20.10.4",
    "192.168.174.1",
    "192.168.1.4",
    "192.168.15.36",
    "192.168.14.34",
    "192.168.1.6",
    "192.168.1.5",
  ],

  transpilePackages: ["@foodresq/types", "@foodresq/dto"],

  // Disable StrictMode in dev because react-leaflet can crash with
  // React 18+ double-mounting in development mode.
  reactStrictMode: false,
};

export default nextConfig;
