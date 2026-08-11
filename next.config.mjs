/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse is a CommonJS lib that must run on the Node.js server, not be bundled
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

export default nextConfig;
