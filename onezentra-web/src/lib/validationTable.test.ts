import { describe, expect, it } from 'vitest';
import { batchCell, canEditItems, fmtDate, fmtDateTime, fmtDuration, validationDuration } from './validationTable';

describe('fmtDate', () => {
  it('memformat tanggal id-ID', () => {
    expect(fmtDate('2026-09-29T15:42:26+07:00')).toBe('29/09/2026');
  });

  it('returns placeholder for null/undefined', () => {
    expect(fmtDate(null)).toBe('-');
    expect(fmtDate(undefined)).toBe('-');
  });

  it('mengembalikan string mentah bila tanggal tidak valid', () => {
    expect(fmtDate('bukan-tanggal')).toBe('bukan-tanggal');
  });
});

describe('fmtDateTime', () => {
  it('memuat jam agar dua sesi pada tanggal sama bisa dibedakan', () => {
    // Dua sesi PO yang sama, dibatalkan lalu di-scan ulang.
    const a = fmtDateTime('2026-09-29T15:42:26+07:00');
    const b = fmtDateTime('2026-09-29T16:16:11+07:00');

    expect(a).not.toBe(b);
    expect(a).toMatch(/29\/09\/2026/);
    expect(a).toMatch(/\d{2}\.\d{2}$/);
  });

  it('mempertahankan bagian tanggal dari fmtDate', () => {
    expect(fmtDateTime('2026-09-29T15:42:26+07:00').startsWith(fmtDate('2026-09-29T15:42:26+07:00'))).toBe(true);
  });

  it('returns placeholder for null/undefined', () => {
    expect(fmtDateTime(null)).toBe('-');
    expect(fmtDateTime(undefined)).toBe('-');
  });

  it('mengembalikan string mentah bila tanggal tidak valid', () => {
    expect(fmtDateTime('bukan-tanggal')).toBe('bukan-tanggal');
  });
});

describe('batchCell', () => {
  it('menampilkan nomor batch dan barcode label untuk batch aktif', () => {
    expect(batchCell({ batch_number: 'BATCH-ABC12345', barcode_label: 'LBL-XYZ98765' })).toEqual({
      kind: 'active',
      number: 'BATCH-ABC12345',
      barcode: 'LBL-XYZ98765',
    });
  });

  it('kosong untuk item yang belum divalidasi (batch belum dibuat server)', () => {
    expect(batchCell(null)).toEqual({ kind: 'none' });
    expect(batchCell(undefined)).toEqual({ kind: 'none' });
    expect(batchCell({ batch_number: null, barcode_label: null })).toEqual({ kind: 'none' });
    expect(batchCell({ batch_number: '   ' })).toEqual({ kind: 'none' });
  });

  it('batch CANCELLED tetap membawa nomornya supaya label fisik bisa dilacak', () => {
    expect(batchCell({ batch_number: 'BATCH-KILL1', barcode_label: 'LBL-KILL1', status: 'CANCELLED' })).toEqual({
      kind: 'cancelled',
      number: 'BATCH-KILL1',
    });
  });

  it('barcode kosong tidak undermine nomor batch', () => {
    expect(batchCell({ batch_number: 'BATCH-NOBAR', barcode_label: '   ' })).toEqual({
      kind: 'active',
      number: 'BATCH-NOBAR',
      barcode: null,
    });
  });
});

describe('fmtDuration', () => {
  it('memformat hari, jam, dan menit sekaligus', () => {
    // 2 hari 16 jam 38 menit — angka yang persis muncul di data TES1.
    expect(fmtDuration(232691)).toBe('2h 16j 38m');
  });

  it('memformat durasi di bawah satu hari tanpa satuan hari', () => {
    expect(fmtDuration(3600)).toBe('1j');
    expect(fmtDuration(3660)).toBe('1j 1m');
    expect(fmtDuration(2700)).toBe('45m');
    expect(fmtDuration(162000)).toBe('1h 21j');
  });

  it('bulatkan durasi di bawah satu menit jadi 0m, bukan dash', () => {
    // 0m = validasi selesai dalam hitungan detik. "–" akan disalahbaca sebagai
    // "data tidak ada".
    expect(fmtDuration(0)).toBe('0m');
    expect(fmtDuration(45)).toBe('0m');
  });

  it('hilangkan satuan yang nol agar tidak membingungkan', () => {
    expect(fmtDuration(86400)).toBe('1h');
    expect(fmtDuration(86460)).toBe('1h 1m');
  });

  it('tampilkan dash untuk nilai yang tidak ada atau tidak masuk akal', () => {
    expect(fmtDuration(null)).toBe('-');
    expect(fmtDuration(undefined)).toBe('-');
    expect(fmtDuration(-5)).toBe('-');
    expect(fmtDuration(NaN)).toBe('-');
  });
});

describe('validationDuration', () => {
  // Sesi terminal memakai angka yang disimpan server supaya durasi yang tampil
  // tidak bergeser-bergeser tiap render.
  it('memakai duration_seconds untuk sesi yang sudah terminal', () => {
    expect(
      validationDuration(
        { status: 'COMPLETED', started_at: '2026-09-29T16:16:00+07:00', duration_seconds: 232691 },
        '2026-10-02T08:54:00+07:00',
      ),
    ).toBe('2h 16j 38m');
  });

  it('memakai duration_seconds untuk sesi CANCELLED juga', () => {
    // Pembatalan tetap punya durasi walau `completed_at`-nya NULL.
    expect(
      validationDuration({ status: 'CANCELLED', started_at: '2026-09-29T16:16:00+07:00', duration_seconds: 3600 }, '2026-10-02T08:54:00+07:00'),
    ).toBe('1j');
  });

  // Sesi IN_PROGRESS belum punya angka final, jadi harus dihitung dari jam.
  it('menghitung elapsed untuk sesi IN_PROGRESS', () => {
    expect(
      validationDuration(
        { status: 'IN_PROGRESS', started_at: '2026-10-02T08:00:00+07:00', duration_seconds: null },
        '2026-10-02T09:30:00+07:00',
      ),
    ).toBe('1j 30m');
  });

  // Nilai server yang basi harus dikalahkan clock: sesi IN_PROGRESS bisa saja
  // sudah selesai di server sementara klien masih memegang respons lama.
  it('menghitung elapsed dan mengabaikan angka basi, saat IN_PROGRESS', () => {
    expect(
      validationDuration(
        { status: 'IN_PROGRESS', started_at: '2026-10-02T08:00:00+07:00', duration_seconds: 999999 },
        '2026-10-02T08:10:00+07:00',
      ),
    ).toBe('10m');
  });

  it('menampilkan dash saat tidak ada sesi atau tanggal mulai', () => {
    expect(validationDuration(null, '2026-10-02T08:54:00+07:00')).toBe('-');
    expect(validationDuration({ status: 'COMPLETED' }, '2026-10-02T08:54:00+07:00')).toBe('-');
    expect(
      validationDuration({ status: 'IN_PROGRESS', started_at: 'bukan tanggal' }, '2026-10-02T08:54:00+07:00'),
    ).toBe('-');
  });

  // Jam server bisa sedikit meleset ke depan; hasil negatif tidak boleh tampil.
  it('menjaga nilai negatif tidak muncul saat jam meleset ke depan', () => {
    expect(
      validationDuration(
        { status: 'IN_PROGRESS', started_at: '2026-10-02T09:00:00+07:00' },
        '2026-10-02T08:00:00+07:00',
      ),
    ).toBe('0m');
  });
});

describe('canEditItems', () => {
  it('hanya mengizinkan ubah saat validasi sedang berjalan', () => {
    expect(canEditItems({ status: 'IN_PROGRESS' })).toBe(true);
    // Presence of the "correct completed" permission must not loosen an
    // in-progress session check — that path is already open to everyone.
    expect(canEditItems({ status: 'IN_PROGRESS' }, { canCorrectCompleted: true })).toBe(true);
  });

  // Inilah yang membuat tombol "Ubah" dulu tetap hidup pada dokumen yang sudah
  // selesai. Backend menolak dengan 422, jadi UI tidak boleh menawarkan aksi
  // yang pasti ditolak.
  it('menolak ubah setelah selesai bila backend tidak mengizinkan koreksi', () => {
    expect(canEditItems({ status: 'COMPLETED' })).toBe(false);
    // Flag absent means the server never sent it — default to locked.
    expect(canEditItems({ status: 'COMPLETED' }, {})).toBe(false);
  });

  // Supervisor dengan Receiving yang belum tutup: boleh. `can_correct_completed`
  // dihitung server karena hanya server yang tahu status Receiving.
  it('mengizinkan koreksi setelah selesai bila backend menyalakan flag-nya', () => {
    expect(canEditItems({ status: 'COMPLETED' }, { canCorrectCompleted: true })).toBe(true);
  });

  // CANCELLED tidak pernah bisa dihidupkan kembali, meski flag-nya true.
  it('menolak CANCELLED meskipun flag koreksi menyala', () => {
    expect(canEditItems({ status: 'CANCELLED' }, { canCorrectCompleted: true })).toBe(false);
  });

  it('menolak saat belum ada sesi termuat', () => {
    // `active` masih null selagi detail belum dibuka — bukan berarti boleh ubah.
    expect(canEditItems(null)).toBe(false);
    expect(canEditItems(undefined)).toBe(false);
  });

  // Status tak dikenal harus menutup, bukan membuka: gagal DEFAULT ke aman
  // supaya nilai baru di masa depan tidak diam-diam mendapat akses edit.
  it('gagal ke aman untuk status yang tidak dikenal', () => {
    expect(canEditItems({ status: 'APPROVED' })).toBe(false);
    expect(canEditItems({ status: '' })).toBe(false);
    expect(canEditItems({ status: 'APPROVED' }, { canCorrectCompleted: true })).toBe(false);
  });
});