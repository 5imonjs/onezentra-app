import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Nama cookie sesi mengikuti config backend (session.cookie:
// Str::slug(APP_NAME).'-session'). Bisa dioverride via env SESSION_COOKIE_NAME.
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'laravel-session';

const PUBLIC_PATHS = ['/login'];

// Pola pengcocokan jalur: lewati file statis, API, favicon.
// Ini digantikan oleh Next.js default ketika middleware/ditinggali proxy tanpa matcher,
// namun kita tetap cek di dalam function untuk keamanan.
const SKIP_PATTERNS = [
  '/api',
  '_next',
  'favicon.ico',
  '\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|css|js|map|txt|xml|webmanifest)$',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets - these don't carry session cookies and should load without auth
  const isStaticAsset = SKIP_PATTERNS.some((pattern) => {
    const regex = new RegExp(pattern);
    return regex.test(pathname);
  });

  if (isStaticAsset) {
    return NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Heuristik server-side: cookie sesi Sanctum tidak ada berarti belum login.
  // Validitas sesi tetap ditegakkan backend (401) + guard client.
  if (!request.cookies.has(SESSION_COOKIE)) {
    // Arahkan ke /login polos. Label "sesi berakhir" (?expired=1) HANYA untuk
    // sesi yang benar-benar mati di tengah pemakaian — ditandai interceptor API
    // (lib/api.ts). Pengunjung baru/mantan tanpa cookie jangan dibilang
    // sesinya "berakhir".
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}
