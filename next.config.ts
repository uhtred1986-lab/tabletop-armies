import type { NextConfig } from "next";

const allowedDevOrigins = ["localhost", "127.0.0.1"];

// MUSTER_DEV_HOSTS: comma-separated extra dev origins, for opening `next dev` from the tablet on the LAN.
for (const host of (process.env.MUSTER_DEV_HOSTS ?? "").split(",")) {
  const trimmed = host.trim();
  if (trimmed && !allowedDevOrigins.includes(trimmed)) allowedDevOrigins.push(trimmed);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  // `npm run gate -- --build` type checks just before the build; Vercel never sets this and still type checks.
  typescript: { ignoreBuildErrors: process.env.MUSTER_BUILD_SKIP_TYPECHECK === "1" },
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
