import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true" || process.env.OUTPUT_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || (isGithubPages ? "/rahul-ai-playground" : "");

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
