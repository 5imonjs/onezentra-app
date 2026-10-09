import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDetailModal, type SessionDetail, type SessionDetailItem } from '@/components/OpnameSessionDetailModal';

const { notifyGlobal } = vi.hoisted(() => ({
  notifyGlobal: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  opnameSessions: {
    verifyItem: vi.fn(() => Promise.resolve({ data: {} })),
    start: vi.fn(() => Promise.resolve({ data: {} })),
    complete: vi.fn(() => Promise.resolve({ data: {} })),
    cancel: vi.fn(() => Promise.resolve({ data: {} })),
    addWaves: vi.fn(() => Promise.resolve({ data: {} })),
  },
  opnameExpired: { list: vi.fn(() => Promise.resolve({ data: { data: { data: [] } } })) },
  getErrorMessage: (_e: unknown, fallback?: string) => fallback ?? 'error',
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

const item = (id: number, patch: Partial<SessionDetailItem> = {}): SessionDetailItem => ({
  id,
  wave_id: 900 + id,
  batch_id: 1,
  batch: { batch_number: `BATCH-${id}`, barcode_label: `LBL-${id}` },
  qty_fisik_crt: null,
  qty_fisik_pcs: null,
  condition: null,
  photo: null,
  notes: null,
  verified_at: null,
  verified_by: null,
  expected_crt: null,
  expected_pcs: null,
  wave: {
    id: 900 + id,
    kode_barang: `KB-${id}`,
    nama_barang: `Produk ${id}`,
    kode_depo: '0126',
    nama_depo: 'Depo Pontianak',
    expired_date_ini: '2026-12-01',
    qty_ini_crt: 10 + id,
    qty_ini_pcs: 0,
    status_ini: 'AMAN',
  },
  ...patch,
});

const detail = (items: SessionDetailItem[]): SessionDetail => ({
  id: 1,
  week_start: '2026-10-05',
  week_end: '2026-10-11',
  kode_depo: '0126',
  nama_depo: 'Depo Pontianak',
  assigned_to: 7,
  status: 'OPEN',
  notes: null,
  started_at: null,
  completed_at: null,
  assignee: { id: 7, full_name: 'Budi Petugas', email: 'budi@test.com' },
  items,
});

const renderModal = (items: SessionDetailItem[]) => {
  const done = items.filter((i) => i.verified_at).length;
  render(
    <SessionDetailModal
      sessionId={1}
      detail={detail(items)}
      detailLoading={false}
      progress={{ done, total: items.length }}
      canEdit
      canAdd={false}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />
  );
};

afterEach(cleanup);

describe('SessionDetailModal — UI sesi opname sesuai praktik WMS', () => {
  it('hitung buta: qty acuan sistem tidak tampil sebelum verifikasi, dan form hitung tertutup sampai item teridentifikasi', () => {
    renderModal([item(1), item(2, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 49, expected_crt: '50' })]);

    // Form hitung tidak di-render untuk baris yang belum diidentifikasi.
    expect(screen.queryByLabelText('Fisik CRT *')).not.toBeInTheDocument();
    // Qty agregat wave tidak bocor sebagai "sistem" sebelum hitung.
    expect(screen.queryByText(/sistem 11 CRT/)).not.toBeInTheDocument();
    // Baris ringkas: CTA scan + opsi manual sebagai link kecil.
    expect(screen.getAllByRole('button', { name: 'Scan label' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Label rusak — identifikasi manual/ }).length).toBeGreaterThan(0);
  });

  it('identifikasi manual membuka form; acuan sistem hanya tampil saat toggle dinyalakan (pola Show Expected Quantity)', () => {
    renderModal([item(1, { expected_crt: '11' }), item(2)]);

    fireEvent.click(screen.getAllByRole('button', { name: /Label rusak — identifikasi manual/ })[0]);

    // Form terbuka untuk item yang aktif.
    expect(screen.getByLabelText('Fisik CRT *')).toBeInTheDocument();
    // Default toggle mati → tidak ada angka acuan.
    expect(screen.queryByText(/Acuan sistem:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Tampilkan qty acuan sistem'));

    expect(screen.getByText('Acuan sistem: 11 CRT')).toBeInTheDocument();
  });

  it('hanya satu baris yang formnya terbuka; baris teridentifikasi lain ringkas dengan aksi "Isi form"', () => {
    renderModal([item(1), item(2)]);

    // Identifikasi dua baris: form hanya terbuka untuk yang terakhir aktif.
    fireEvent.click(screen.getAllByRole('button', { name: /Label rusak — identifikasi manual/ })[0]);
    expect(screen.getByLabelText('Fisik CRT *')).toBeInTheDocument();

    // Baris pertama dikembalikan ke antrean sementara baris kedua diidentifikasi.
    fireEvent.click(screen.getAllByRole('button', { name: /Label rusak — identifikasi manual/ })[0]);
    expect(screen.getAllByLabelText('Fisik CRT *')).toHaveLength(1);
    expect(screen.getAllByText(/Teridentifikasi/).length).toBeGreaterThan(1);
  });

  it('baris terverifikasi menampilkan acuan + selisih berwarna (merah bila fisik kurang)', () => {
    renderModal([item(1), item(2, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 49, expected_crt: '50' })]);

    expect(screen.getByText('Acuan 50 CRT')).toBeInTheDocument();
    const diff = screen.getByText('Selisih -1');
    expect(diff).toHaveClass('text-red-600');
  });

  it('progress bar + tombol selesaikan menandakan sisa yang belum terverifikasi', () => {
    renderModal([item(1), item(2, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 50, expected_crt: '50' })]);

    expect(screen.getByText(/1\/2 terverifikasi · sisa 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Selesaikan \(sisa 1\)/ })).toBeDisabled();
  });
});