/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export faqat standalone rejimda
  // Capacitor uchun alohida build script ishlatamiz
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        'node:fs': false,
        'node:net': false,
        'node:tls': false,
        'node:dns': false,
        'node:crypto': false,
        'node:stream': false,
        'node:buffer': false,
        'node:path': false,
        'node:util': false,
        'node:events': false,
        'node:os': false,
      };
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['telegram', 'node-localstorage'],
  },
};

module.exports = nextConfig;
