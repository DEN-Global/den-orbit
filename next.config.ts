import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = { output: "export", basePath: "/orbit", assetPrefix: "/orbit", outputFileTracingRoot: path.resolve(process.cwd()) };

export default nextConfig;
