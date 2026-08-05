import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // Standalone output so the production Docker image only needs
  // .next/standalone + .next/static + public/ copied in, not the full
  // node_modules tree.
  output: "standalone",
  // Proxy the API through Next so the browser sees it as same-origin. That keeps
  // the httpOnly refresh cookie first-party — no CORS, no SameSite handling.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
