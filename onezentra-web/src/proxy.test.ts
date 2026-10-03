import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tamu tanpa cookie sesi diarahkan ke /login polos (tanpa ?expired=1)', async () => {
    const req = new NextRequest('http://localhost:3000/dashboard');

    const res = await proxy(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('regresi: tamu di /login tidak memicu request apa pun (dulu GET /user → 401 di console)', async () => {
    const res = await proxy(new NextRequest('http://localhost:3000/login'));

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sesi valid di /login diarahkan ke /dashboard lewat validasi server-side', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const res = await proxy(new NextRequest('http://localhost:3000/login', {
      headers: { cookie: 'laravel-session=ada' },
    }));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/api\/v1\/user$/);
    const headers = init.headers as Record<string, string>;
    expect(headers.Cookie).toBe('laravel-session=ada');
    // Referer/Origin wajib dikirim: Sanctum hanya stateful untuk domain terdaftar,
    // tanpa itu sesi yang valid pun dijawab 401 (lihat .ai/rules/general.md).
    expect(headers.Referer).toBe('http://localhost:3000/login');
    expect(headers.Origin).toBe('http://localhost:3000');
  });

  it('sesi tidak valid di /login membiarkan halaman login dirender', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const res = await proxy(new NextRequest('http://localhost:3000/login', {
      headers: { cookie: 'laravel-session=mati' },
    }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('backend tak terjangkau tidak memblokir halaman login (fail-open)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await proxy(new NextRequest('http://localhost:3000/login', {
      headers: { cookie: 'laravel-session=ada' },
    }));

    expect(res.status).toBe(200);
  });
});