import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';
const disableHmr = process.env.DISABLE_HMR === 'true' || process.env.TUNNEL_MODE === 'true';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // wss: required for HTTPS tunnels; dev HMR uses ws when not DISABLE_HMR
      "connect-src 'self' https: wss: ws:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && disableHmr && !isServer) {
      config.plugins = config.plugins?.filter(
        (plugin) => plugin?.constructor?.name !== 'HotModuleReplacementPlugin',
      );
    }
    return config;
  },
};

export default nextConfig;
