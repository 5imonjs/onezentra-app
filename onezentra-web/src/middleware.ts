import { proxy } from './proxy';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return proxy(request);
}

export const config = {
  matcher: ['/api/v1/:path*', '/sanctum/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
