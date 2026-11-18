import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Emits .next/standalone so the Docker image only needs server.js + assets.
  output: "standalone",
};

export default nextConfig;
