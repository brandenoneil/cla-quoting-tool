/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['puppeteer', '@prisma/client', 'prisma', 'pdf-parse', 'mammoth'],
  },
}

export default nextConfig
