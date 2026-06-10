import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@foodresq/types', '@foodresq/dto'],
};

export default nextConfig;
