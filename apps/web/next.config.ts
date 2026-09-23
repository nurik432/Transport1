import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The dev server is reached both as localhost and as 127.0.0.1 (and from a
  // phone on the local network when testing the PWA), so allow those origins.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "10.*.*.*"],
  // Standalone output for Docker: traces only the files this app actually
  // needs (including the workspace packages) into .next/standalone.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
