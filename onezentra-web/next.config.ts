import type { NextConfig } from "next";
import path from "path";

// WAJIB set BACKEND_URL di prod (contoh: https://api.domain-anda.com).
// Fallback localhost hanya untuk dev lokal.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const backendHost = (() => {
  try {
    return new URL(BACKEND_URL).hostname;
  } catch {
    return 'localhost';
  }
})();
const backendProtocol = (() => {
  try {
    return new URL(BACKEND_URL).protocol.replace(':', '') as 'http' | 'https';
  } catch {
    return 'http';
  }
})();

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self'",
    ].join('; '),
  },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  // HSTS hanya di prod — di dev (http://localhost) header ini diabaikan browser.
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8000' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8000' },
      // Host backend dari env (prod) agar <Image> tetap bisa memuat dari sana.
      ...(backendHost !== 'localhost' && backendHost !== '127.0.0.1'
        ? [{ protocol: backendProtocol, hostname: backendHost } as const]
        : []),
    ],
    contentDispositionType: 'inline',
    contentSecurityPolicy: "default-src 'self'; base-uri 'self'; sandbox allow-same-origin allow-scripts allow-popups; img-src 'self' data: blob:;",
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
      {
        source: '/sanctum/:path*',
        destination: `${BACKEND_URL}/sanctum/:path*`,
      },
    ];
  },
};

export default nextConfig;
