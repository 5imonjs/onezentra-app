import axios, { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isSessionLossStatus, registerResponseInterceptors } from './api';

/** Konstruksi `error.response` yang cukup untuk dibaca interceptor. */
function errorResponse(config: Record<string, unknown>, status: number): AxiosResponse {
  return {
    data: {},
    status,
    statusText: status === 419 ? 'CSRF token mismatch' : status === 200 ? 'OK' : '',
    headers: {},
    config: config as never,
  };
}

function rejectStatus(config: Record<string, unknown>, status: number) {
  return new AxiosError(
    status === 401 ? 'Unauthenticated' : 'CSRF token mismatch',
    AxiosError.ERR_BAD_REQUEST,
    config as never,
    undefined,
    errorResponse(config, status),
  );
}

describe('isSessionLossStatus', () => {
  it('401 dan 419 dianggap kehilangan sesi; status lain tidak', () => {
    expect(isSessionLossStatus(401)).toBe(true);
    expect(isSessionLossStatus(419)).toBe(true);
    expect(isSessionLossStatus(403)).toBe(false);
    expect(isSessionLossStatus(422)).toBe(false);
    expect(isSessionLossStatus(undefined)).toBe(false);
  });
});

describe('registerResponseInterceptors — penanganan 419', () => {
  beforeEach(() => {
    // pathname /login agar redirectToLogin (bila terpicu) tidak melakukan
    // navigasi sungguhan di jsdom.
    window.history.replaceState({}, '', '/login');
  });

  it('419 sekali: refresh CSRF lalu retry, pemanggil tetap menerima respons sukses', async () => {
    const calls = { n: 0 };
    const client = axios.create({
      adapter: (config) => {
        calls.n += 1;
        if (calls.n === 1) {
          return Promise.reject(rejectStatus(config as never, 419));
        }
        return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
      },
    });
    const refreshCsrf = vi.fn().mockResolvedValue(undefined);
    registerResponseInterceptors(client, refreshCsrf);

    const res = await client.get('/x');

    expect(res.data).toEqual({ ok: true });
    expect(calls.n).toBe(2);
    expect(refreshCsrf).toHaveBeenCalledTimes(1);
  });

  it('419 + refresh CSRF gagal: tidak retry, pemanggil menerima error refresh', async () => {
    const calls = { n: 0 };
    const client = axios.create({
      adapter: (config) => {
        calls.n += 1;
        return Promise.reject(rejectStatus(config as never, 419));
      },
    });
    const refreshCsrf = vi.fn().mockRejectedValue(new Error('jaringan putus'));
    registerResponseInterceptors(client, refreshCsrf);

    await expect(client.get('/x')).rejects.toThrow('jaringan putus');
    expect(calls.n).toBe(1);
  });

  it('419 berulang: retry hanya SEKALI (bounded), lalu gagal 419', async () => {
    const calls = { n: 0 };
    const selalu419 = axios.create({
      adapter: (config) => {
        calls.n += 1;
        return Promise.reject(rejectStatus(config as never, 419));
      },
    });
    const refreshCsrf = vi.fn().mockResolvedValue(undefined);
    registerResponseInterceptors(selalu419, refreshCsrf);

    await expect(selalu419.get('/x')).rejects.toMatchObject({ response: { status: 419 } });

    expect(calls.n).toBe(2); // request asli + 1 retry — tidak lebih
    expect(refreshCsrf).toHaveBeenCalledTimes(1);
  });

  it('401 tetap dianggap kehilangan sesi tanpa retry CSRF', async () => {
    const calls = { n: 0 };
    const client = axios.create({
      adapter: (config) => {
        calls.n += 1;
        return Promise.reject(rejectStatus(config as never, 401));
      },
    });
    const refreshCsrf = vi.fn();
    registerResponseInterceptors(client, refreshCsrf);

    await expect(client.get('/x')).rejects.toMatchObject({ response: { status: 401 } });

    expect(calls.n).toBe(1);
    expect(refreshCsrf).not.toHaveBeenCalled();
  });
});