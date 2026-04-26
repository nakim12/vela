import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@romus/shared-types"],
};

export default nextConfig;
