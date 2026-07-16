import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.20.10.4'],
  transpilePackages: ['@foodresq/types', '@foodresq/dto'],
};

export default nextConfig;
