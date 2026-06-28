import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output a static export of the application for easy deployment (e.g. Cloudflare Pages)
  output: "export",
  // Disable image optimization since static export does not support default loader
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
