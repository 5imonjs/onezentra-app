import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

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