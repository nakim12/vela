import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vela/shared-types"],
};

export default nextConfig;
