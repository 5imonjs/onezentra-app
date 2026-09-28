import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Nama cookie sesi mengikuti config backend (session.cookie:
// Str::slug(APP_NAME).'-session'). Bisa dioverride via env SESSION_COOKIE_NAME.
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'laravel-session';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const PUBLIC_PATHS = ['/login'];

// Pola pengcocokan jalur: lewati file statis, favicon.
const SKIP_PATTERNS = [
  '_next',
  'favicon.ico',
  '\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|css|js|map|txt|xml|webmanifest)$',
];

// axios memakai baseURL '/api/v1', sehingga request CSRF menjadi
// '/api/v1/sanctum/csrf-cookie'. Rute Sanctum di backend hanya ada di
// '/sanctum/csrf-cookie' — terjemahkan path-nya di sini.
export function resolveBackendPath(pathname: string): string {
  return pathname.endsWith('/sanctum/csrf-cookie')
    ? '/sanctum/csrf-cookie'
    : pathname;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Forward API requests and Sanctum CSRF to Laravel backend.
  if (pathname.startsWith('/api/') || pathname.startsWith('/sanctum/')) {
    const targetUrl = new URL(resolveBackendPath(pathname) + request.nextUrl.search, BACKEND_URL);
    try {
      // Gunakan fetch langsung dengan opsi duplex agar Edge Runtime
      // mengizinkan body dikirim. Ini memastikan cookie sesi
      // dan CSRF ditetapkan di domain frontend (localhost:3000).
      const fetchOptions: Record<string, unknown> = {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.body,
        duplex: 'half',
      };
      // @ts-ignore — duplex adalah opsi Node.js undici yang tidak ada di RequestInit TypeScript
      const resp = await fetch(targetUrl.toString(), fetchOptions);
      // Copy Set-Cookie headers dari backend ke response
      const responseHeaders = new Headers(resp.headers);
      // Hapus header yang tidak boleh diteruskan
      responseHeaders.delete('x-powered-by');
      const nextResp = new NextResponse(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
      });
      return nextResp;
    } catch (err) {
      return NextResponse.json(
        { message: 'Backend tidak dapat dihubungi.' },
        { status: 502 }
      );
    }
  }

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
