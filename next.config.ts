import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["mongodb", "mongodb-memory-server", "pdf-parse", "mammoth"],
};

export default nextConfig;
