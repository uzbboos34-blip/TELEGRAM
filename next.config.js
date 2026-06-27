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
        path: require.resolve('./src/lib/polyfills/path-mock.js'),
        'node:path': require.resolve('./src/lib/polyfills/path-mock.js'),
        dns: require.resolve('./src/lib/polyfills/dns-mock.js'),
        'node:dns': require.resolve('./src/lib/polyfills/dns-mock.js'),
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        'node:fs': false,
        'node:net': false,
        'node:tls': false,
        'node:crypto': false,
        'node:stream': false,
        'node:buffer': false,
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
