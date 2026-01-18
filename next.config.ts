import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  // Disable strict mode to prevent double effect invocation that causes WaveSurfer issues
  reactStrictMode: false,
};

export default nextConfig;
