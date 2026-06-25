/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '*.telegram.org' },
      { protocol: 'https', hostname: 'cdn*.telegram.org' },
      { protocol: 'https', hostname: 'tg-proxy.moxirbekmoxirbek29.workers.dev' },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ['telegram'],
  },
};

module.exports = nextConfig;
