import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy, resolveBackendPath } from './proxy';

describe('resolveBackendPath', () => {
  it('menerjemahkan path CSRF dari axios (/api/v1/sanctum/csrf-cookie) ke rute backend', () => {
    expect(resolveBackendPath('/api/v1/sanctum/csrf-cookie')).toBe('/sanctum/csrf-cookie');
    expect(resolveBackendPath('/sanctum/csrf-cookie')).toBe('/sanctum/csrf-cookie');
  });

  it('path API biasa diteruskan apa adanya', () => {
    expect(resolveBackendPath('/api/v1/login')).toBe('/api/v1/login');
    expect(resolveBackendPath('/api/v1/user')).toBe('/api/v1/user');
    expect(resolveBackendPath('/sanctum/other')).toBe('/sanctum/other');
  });
});

describe('proxy', () => {
  it('tamu tanpa cookie sesi diarahkan ke /login polos (tanpa ?expired=1)', async () => {
    const req = new NextRequest('http://localhost:3000/dashboard');

    const res = await proxy(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('pengguna berkunjung ke /login lolos tanpa redirect', async () => {
    const req = new NextRequest('http://localhost:3000/login', {
      headers: { cookie: 'laravel-session=ada' },
    });

    const res = await proxy(req);

    expect(res.status).toBe(200);
  });
});