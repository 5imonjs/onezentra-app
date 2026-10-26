import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildContentSecurityPolicy } from './lib/csp';

// Nama cookie sesi mengikuti config backend (session.cookie:
// Str::slug(APP_NAME).'-session'). Bisa dioverride via env SESSION_COOKIE_NAME.
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'laravel-session';

// WAJIB set BACKEND_URL di prod (contoh: BACKEND_URL=https://api.domain-anda.com).
// Fallback http://localhost:8000 hanya untuk dev lokal.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const PUBLIC_PATHS = ['/login'];

/** Batas waktu validasi sesi server-side agar halaman login tidak tertahan. */
const SESSION_CHECK_TIMEOUT_MS = 3000;

// Pola pengcocokan jalur: lewati file statis, favicon.
const SKIP_PATTERNS = [
  '_next',
  'favicon.ico',
  '\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|css|js|map|txt|xml|webmanifest)$',
];

/**
 * Header yang diteruskan ke backend (whitelist). `host`, `connection`, dan
 * `content-length` JANGAN diteruskan (sudah diatur ulang oleh fetch/undici).
 * Referer/Origin dipertahankan agar Sanctum stateful (lihat general.md).
 */
const FORWARDED_HEADERS = [
  'cookie',
  'accept',
  'content-type',
  'x-xsrf-token',
  'x-requested-with',
  'referer',
  'origin',
  'authorization',
] as const;

export function buildForwardHeaders(source: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = source.get(name);
    if (value === null) continue;
    if (name === 'referer') out['Referer'] = value;
    else if (name === 'origin') out['Origin'] = value;
    else out[name] = value;
  }
  return out;
}
// axios memakai baseURL '/api/v1', sehingga request CSRF menjadi
// '/api/v1/sanctum/csrf-cookie'. Rute Sanctum di backend hanya ada di
// '/sanctum/csrf-cookie' — terjemahkan path-nya di sini.
export function resolveBackendPath(pathname: string): string {
  return pathname.endsWith('/sanctum/csrf-cookie')
    ? '/sanctum/csrf-cookie'
    : pathname;
}

/**
 * Respons halaman dengan CSP nonce. Next.js membaca nonce dari header
 * `x-nonce` + `Content-Security-Policy` pada request dan menyisipkannya ke
 * script hydration; header yang sama dikirim ke browser.
 */
function pageResponse(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'production');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

/**
 * Validasi sesi server-side untuk halaman publik. Cookie sesi ber-flag httpOnly
 * sehingga hanya sisi server yang bisa melihatnya — memindahkan probe ke sini
 * membuat tamu tanpa cookie tidak lagi memicu `GET /user` dari browser (dulu
 * menghasilkan 401 di console, walau itu jawaban yang benar).
 *
 * Referer/Origin wajib dikirim: `EnsureFrontendRequestsAreStateful::fromFrontend()`
 * hanya mengaktifkan middleware session kalau domain-nya terdaftar di
 * `sanctum.stateful`. Tanpa itu Sanctum membaca request sebagai stateless →
 * cookie sesi diabaikan → sesi yang valid pun dianggap 401.
 */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/user`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Cookie: request.headers.get('cookie') ?? '',
        Origin: request.nextUrl.origin,
        Referer: `${request.nextUrl.origin}${request.nextUrl.pathname}`,
      },
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    // Fail-open: backend tak bisa dihubungi TIDAK boleh memblokir halaman login.
    return false;
  } finally {
    clearTimeout(timer);
  }
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
      const fetchOptions: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers: buildForwardHeaders(request.headers),
        body: request.body,
        // `duplex` wajib untuk stream body di undici, tapi belum ada di
        // RequestInit DOM standar — karena itu tipe disempitkan di atas.
        duplex: 'half',
      };
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
    } catch (error) {
      // Log akar masalah ke terminal dev agar 502 bisa didiagnosis
      // (fetch hanya throw bila koneksi gagal — respons 4xx/5xx backend
      // diteruskan apa adanya di atas, bukan 502).
      console.error(`[proxy] ${request.method} ${pathname} -> ${targetUrl} gagal:`, error);
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
    // Halaman publik + cookie sesi ada → validasi server-side; sesi yang masih
    // hidup langsung diarahkan ke /dashboard. Tamu tanpa cookie melewati blok
    // ini tanpa request apa pun, jadi tidak ada 401 /user di console browser.
    if (pathname === '/login' && request.cookies.has(SESSION_COOKIE)) {
      if (await hasValidSession(request)) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    return pageResponse(request);
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

  return pageResponse(request);
}
