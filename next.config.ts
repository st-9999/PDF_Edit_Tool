import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  experimental: {
    proxyClientMaxBodySize: '600mb',
  },
};

export default nextConfig;
