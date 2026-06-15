/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client'],
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
