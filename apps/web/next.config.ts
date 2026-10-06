import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nola/auth", "@nola/calc-core", "@nola/design-tokens"],
};

export default nextConfig;
