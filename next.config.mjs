import path from "node:path";
import { fileURLToPath } from "node:url";

// Config ditulis sebagai .mjs (bukan .ts) supaya Next.js TIDAK perlu
// meng-compile-nya dengan SWC. Di server build dengan glibc lama (SWC native
// gagal, fallback WASM), kompilasi `next.config.ts` rusak dan build gagal.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// WAJIB set BACKEND_URL di prod (contoh: https://api.domain-anda.com).
// Fallback localhost hanya untuk dev lokal.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const backendHost = (() => {
  try {
    return new URL(BACKEND_URL).hostname;
  } catch {
    return "localhost";
  }
})();
const backendProtocol = (() => {
  try {
    return new URL(BACKEND_URL).protocol.replace(":", "");
  } catch {
    return "http";
  }
})();

// CSP dikirim per-request oleh src/proxy.ts dengan nonce (bukan header statis
// di sini) supaya script-src produksi tidak perlu 'unsafe-inline'.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // HSTS hanya di prod — di dev (http://localhost) header ini diabaikan browser.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" },
      { protocol: "http", hostname: "127.0.0.1", port: "8000" },
      // Host backend dari env (prod) agar <Image> tetap bisa memuat dari sana.
      ...(backendHost !== "localhost" && backendHost !== "127.0.0.1"
        ? [{ protocol: backendProtocol, hostname: backendHost }]
        : []),
    ],
    contentDispositionType: "inline",
    contentSecurityPolicy: "default-src 'self'; base-uri 'self'; sandbox allow-same-origin allow-scripts allow-popups; img-src 'self' data: blob:;",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
      {
        source: "/sanctum/:path*",
        destination: `${BACKEND_URL}/sanctum/:path*`,
      },
    ];
  },
};

export default nextConfig;
