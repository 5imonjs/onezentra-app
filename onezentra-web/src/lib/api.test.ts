import axios, { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getErrorMessage, isSessionLossStatus, registerResponseInterceptors } from './api';

/** Bangun AxiosError dengan payload `data` tertentu, untuk uji getErrorMessage. */
function apiError(data: Record<string, unknown>, status = 422) {
  const config = { headers: {} } as never;
  return new AxiosError(
    'Request failed',
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    { data, status, statusText: '', headers: {}, config } as AxiosResponse,
  );
}

describe('isSessionLossStatus', () => {
  it('hanya 401 yang dianggap kehilangan sesi; 419 bukan sesi hilang (CSRF mismatch)', () => {
    expect(isSessionLossStatus(401)).toBe(true);
    expect(isSessionLossStatus(419)).toBe(false);
    expect(isSessionLossStatus(403)).toBe(false);
    expect(isSessionLossStatus(422)).toBe(false);
    expect(isSessionLossStatus(undefined)).toBe(false);
  });
});

describe('getErrorMessage — payload import per-baris', () => {
  // Payload ini SALINAN dari ReceivingImportFailed (backend). Kalau bentuknya
  // berubah, test ini gagal dan wajib diperbarui di sini.
  //
  // Diverifikasi langsung terhadap instance asli:
  //   (new ReceivingImportFailed([['row'=>3,...],['row'=>5,...]])) → JSON di bawah.
  const payloadImport = {
    message: 'Import gagal: 2 baris tidak valid. Tidak ada data yang disimpan.',
    errors: [
      { row: 3, errors: "PO Transporter 'PO-B-MIX' tidak ditemukan." },
      { row: 5, errors: 'PO Transporter wajib diisi' },
    ],
  };

  it('menampilkan daftar baris, bukan "[object Object]"', () => {
    const msg = getErrorMessage(apiError(payloadImport));

    // Regression guard: bentuk `[{ row, errors }]` adalah ARRAY OF OBJECT.
    // Kalau diproses Object.values().join(), hasilnya literal
    // "[object Object]" karena join() memanggil toString() objek.
    expect(msg).not.toContain('[object Object]');
    expect(msg).toContain('Baris 3');
    expect(msg).toContain('Baris 5');
    expect(msg).toContain("PO Transporter 'PO-B-MIX' tidak ditemukan.");
    expect(msg).toContain('PO Transporter wajib diisi');
  });

  it('mempertahankan ringkasan backend bahwa tidak ada data yang disimpan', () => {
    const msg = getErrorMessage(apiError(payloadImport));

    // Ringkasan ini yang memberi tahu user hasil import di-rollback.
    // Tanpa itu user bisa mengira sebagian baris tetap masuk.
    expect(msg).toContain('Tidak ada data yang disimpan');
    expect(msg).toContain('Import gagal');
  });

  it('setiap baris pada baris terpisah agar mudah dibaca', () => {
    const msg = getErrorMessage(apiError(payloadImport));
    const lines = msg.split('\n');

    expect(lines.length).toBe(3); // ringkasan + 2 baris
    expect(lines[0]).toContain('Import gagal');
    expect(lines[1]).toMatch(/^Baris 3:/);
    expect(lines[2]).toMatch(/^Baris 5:/);
  });

  it('menangani errors tanpa row (bentuk sederhana) tanpa merusak informasi', () => {
    const msg = getErrorMessage(apiError({
      message: 'Gagal',
      errors: [{ errors: 'Kesalahan umum' }],
    }));

    expect(msg).not.toContain('[object Object]');
    expect(msg).toContain('Kesalahan umum');
  });
});

describe('getErrorMessage — validasi Laravel (tidak boleh regresi)', () => {
  it('tetap menangani bentuk { field: [pesan] }', () => {
    const msg = getErrorMessage(apiError({
      message: 'Validasi gagal',
      errors: { product_sku: ['Product SKU wajib diisi', 'Sudah dipakai'] },
    }, 422));

    expect(msg).toContain('Product SKU wajib diisi');
    expect(msg).toContain('Sudah dipakai');
  });

  it('tetap menangani errors berupa string tunggal', () => {
    const msg = getErrorMessage(apiError({ errors: { email: 'Email tidak valid' } }, 422));

    expect(msg).toContain('Email tidak valid');
  });

  it('403 tetap memakai pesan dari backend', () => {
    const msg = getErrorMessage(apiError({ message: 'Anda tidak memiliki izin.' }, 403));

    expect(msg).toBe('Anda tidak memiliki izin.');
  });

  it('fallback dipakai saat tidak ada apa pun yang bisa dibaca', () => {
    const msg = getErrorMessage(apiError({}, 500), 'Import gagal');

    expect(msg).toBeTruthy();
  });

  it('timeout upload (ECONNABORTED) memakai pesan yang jelas', () => {
    const err = new AxiosError(
      'timeout of 15000ms exceeded',
      AxiosError.ECONNABORTED,
      { headers: {} } as never,
    );
    const msg = getErrorMessage(err, 'Simpan gagal');

    expect(msg).toContain('timeout');
    expect(msg).not.toContain('timeout of 15000ms exceeded');
  });

  it('tidak membocorkan pesan internal JavaScript — pakai fallback pemanggil', () => {
    const msg = getErrorMessage(
      new Error("Cannot read properties of undefined (reading 'email')"),
      'Simpan gagal',
    );

    expect(msg).toBe('Simpan gagal');
    expect(msg).not.toContain('Cannot read');
  });

  it('kegagalan koneksi (axios tanpa response) memakai pesan yang bisa ditindaklanjuti', () => {
    const err = new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never);
    const msg = getErrorMessage(err, 'Simpan gagal');

    expect(msg).toContain('Tidak dapat terhubung ke server');
  });
});

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
  it('hanya 401 yang dianggap kehilangan sesi; 419 bukan sesi hilang (CSRF mismatch)', () => {
    expect(isSessionLossStatus(401)).toBe(true);
    expect(isSessionLossStatus(419)).toBe(false);
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