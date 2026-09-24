import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Nama cookie sesi mengikuti config backend (session.cookie:
// Str::slug(APP_NAME).'-session'). Bisa dioverride via env SESSION_COOKIE_NAME.
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'laravel-session';

const PUBLIC_PATHS = ['/login'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

export const config = {
  // Kecualikan aset statis (public/*) dari guard auth: kalau ikut di-redirect
  // ke /login, image optimizer (_next/image) menerima HTML bukan gambar
  // dan menjawab 400 "The requested resource isn't a valid image."
  matcher: ['/((?!api|_next|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|css|js|map|txt|xml|webmanifest)).*)'],
};
