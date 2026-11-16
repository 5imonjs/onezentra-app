import { beforeEach, describe, expect, it } from 'vitest';
import { notifyGlobal, notifyPermissionDenied, useGlobalToastStore } from './globalToast';

const state = () => useGlobalToastStore.getState();

beforeEach(() => {
  useGlobalToastStore.setState({ toasts: [] });
});

describe('useGlobalToastStore', () => {
  it('notify menambah toast dengan id unik dan type default error', () => {
    notifyGlobal('Gagal memuat data');
    notifyGlobal('Berhasil disimpan', 'success');

    expect(state().toasts).toHaveLength(2);
    const [pertama, kedua] = state().toasts;
    expect(pertama).toMatchObject({ message: 'Gagal memuat data', type: 'error' });
    expect(kedua).toMatchObject({ message: 'Berhasil disimpan', type: 'success' });
    expect(kedua.id).toBeGreaterThan(pertama.id);
  });

  it('dismiss hanya menghapus toast dengan id yang sesuai', () => {
    notifyGlobal('pertama');
    notifyGlobal('kedua');

    const idPertama = state().toasts[0].id;
    state().dismiss(idPertama);

    expect(state().toasts.map((t) => t.message)).toEqual(['kedua']);
  });

  it('notifyPermissionDenied memakai pesan default bila pesan tidak diberikan', () => {
    notifyPermissionDenied();

    expect(state().toasts[0].message).toBe('Anda tidak memiliki izin untuk melakukan aksi ini.');
    expect(state().toasts[0].type).toBe('error');
  });

  it('notifyPermissionDenied memakai pesan dari respons API bila ada', () => {
    notifyPermissionDenied('Akses ditolak untuk depo ini.');

    expect(state().toasts[0].message).toBe('Akses ditolak untuk depo ini.');
  });

  it('dedupe: pesan identik yang masih tampil tidak ditumpuk (mis. 403 paralel)', () => {
    notifyGlobal('Anda tidak memiliki izin.', 'error');
    notifyGlobal('Anda tidak memiliki izin.', 'error');

    expect(state().toasts).toHaveLength(1);
  });

  it('pesan identik bisa muncul lagi setelah toast sebelumnya ditutup', () => {
    notifyGlobal('Akses ditolak');
    state().dismiss(state().toasts[0].id);
    notifyGlobal('Akses ditolak');

    expect(state().toasts).toHaveLength(1);
  });

  it('membatasi antrean maksimal 5 toast terbaru', () => {
    for (let i = 1; i <= 7; i += 1) {
      notifyGlobal(`Pesan ${i}`, 'info');
    }

    expect(state().toasts.map((t) => t.message)).toEqual([
      'Pesan 3', 'Pesan 4', 'Pesan 5', 'Pesan 6', 'Pesan 7',
    ]);
  });

  it('menyimpan opsi judul, deskripsi, dan durasi kustom', () => {
    notifyGlobal('Ekspor selesai', 'success', {
      title: 'Ekspor XLSX',
      description: 'Klik untuk mengunduh.',
      duration: 2500,
    });

    expect(state().toasts[0]).toMatchObject({
      message: 'Ekspor selesai',
      type: 'success',
      title: 'Ekspor XLSX',
      description: 'Klik untuk mengunduh.',
      duration: 2500,
    });
  });
});
