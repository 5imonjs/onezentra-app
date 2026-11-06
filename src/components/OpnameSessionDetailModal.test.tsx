import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDetailModal, type SessionDetail, type SessionDetailItem } from '@/components/OpnameSessionDetailModal';

const { notifyGlobal, api } = vi.hoisted(() => ({
  notifyGlobal: vi.fn(),
  api: {
    verifyItem: vi.fn(() => Promise.resolve({ data: {} })),
    start: vi.fn(() => Promise.resolve({ data: {} })),
    submit: vi.fn(() => Promise.resolve({ data: {} })),
    approve: vi.fn(() => Promise.resolve({ data: {} })),
    revise: vi.fn(() => Promise.resolve({ data: {} })),
    cancel: vi.fn(() => Promise.resolve({ data: {} })),
    addWaves: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('@/lib/api', () => ({
  opnameSessions: api,
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
  disposition: null,
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

const detail = (items: SessionDetailItem[], status: string = 'IN_PROGRESS'): SessionDetail => ({
  id: 1,
  week_start: '2026-10-05',
  week_end: '2026-10-11',
  kode_depo: '0126',
  nama_depo: 'Depo Pontianak',
  assigned_to: 7,
  status,
  notes: null,
  started_at: '2026-10-09T02:00:00Z',
  completed_at: null,
  submitted_at: null,
  decided_at: null,
  decision_note: null,
  assignee: { id: 7, full_name: 'Budi Petugas', email: 'budi@test.com' },
  items,
});

const renderModal = (items: SessionDetailItem[], opts: { status?: string; canApprove?: boolean } = {}) => {
  const done = items.filter((i) => i.verified_at).length;
  render(
    <SessionDetailModal
      sessionId={1}
      detail={detail(items, opts.status)}
      detailLoading={false}
      progress={{ done, total: items.length }}
      canEdit
      canAdd={false}
      canApprove={opts.canApprove ?? false}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />
  );
};

const openCountingForm = () => {
  fireEvent.click(screen.getAllByRole('button', { name: 'Isi Hitungan' })[0]);
  expect(screen.getByLabelText('Fisik CRT *')).toBeInTheDocument();
};

afterEach(cleanup);

describe('SessionDetailModal — UI sesi opname sesuai praktik WMS', () => {
  it('hitung buta: qty acuan sistem tidak tampil sebelum verifikasi, dan form hitung tertutup sampai item teridentifikasi', () => {
    renderModal([item(1), item(2, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 49, expected_crt: '50' })]);

    // Form hitung tidak di-render untuk baris yang belum diidentifikasi.
    expect(screen.queryByLabelText('Fisik CRT *')).not.toBeInTheDocument();
    // Qty agregat wave tidak bocor sebagai "sistem" sebelum hitung.
    expect(screen.queryByText(/sistem 11 CRT/)).not.toBeInTheDocument();
    // Baris ringkas: CTA isi hitungan (tanpa scan) + scan label.
    expect(screen.getAllByRole('button', { name: 'Scan label' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Isi Hitungan' }).length).toBeGreaterThan(0);
  });

  it('identifikasi manual membuka form; acuan tampil default, bisa disembunyikan (mode hitung buta)', () => {
    renderModal([item(1, { expected_crt: '11' }), item(2)]);

    // Default: acuan tampil langsung di baris (permintaan lapangan).
    // Acuan tampil di baris bahkan sebelum form dibuka (default praktik).
    expect(screen.getAllByText(/Acuan 11 CRT/).length).toBeGreaterThan(0);

    openCountingForm();

    // Form terbuka untuk item yang aktif; acuan juga tampil di dalam form.
    expect(screen.getByText('Acuan sistem: 11 CRT')).toBeInTheDocument();

    // Mode hitung buta: toggle menyembunyikan angka acuan.
    fireEvent.click(screen.getByLabelText('Tampilkan qty acuan sistem'));
    expect(screen.queryByText('Acuan sistem: 11 CRT')).not.toBeInTheDocument();
  });

  it('hanya satu baris yang formnya terbuka; baris teridentifikasi lain ringkas dengan aksi "Isi form"', () => {
    renderModal([item(1), item(2)]);

    // Identifikasi dua baris: form hanya terbuka untuk yang terakhir aktif.
    fireEvent.click(screen.getAllByRole('button', { name: 'Isi Hitungan' })[0]);
    expect(screen.getByLabelText('Fisik CRT *')).toBeInTheDocument();

    // Baris pertama dikembalikan ke antrean sementara baris kedua diidentifikasi.
    // (Tersisa satu tombol "Isi Hitungan" — baris aktif berganti CTA.)
    fireEvent.click(screen.getAllByRole('button', { name: 'Isi Hitungan' })[0]);
    expect(screen.getAllByLabelText('Fisik CRT *')).toHaveLength(1);
    expect(screen.getAllByText(/Teridentifikasi/).length).toBeGreaterThan(1);
  });

  it('baris terverifikasi menampilkan acuan + selisih berwarna (merah bila fisik kurang)', () => {
    renderModal([item(1), item(2, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 49, expected_crt: '50' })]);

    expect(screen.getByText('Acuan 50 CRT')).toBeInTheDocument();
    const diff = screen.getByText('Selisih -1');
    expect(diff).toHaveClass('text-red-600');
  });

  it('tanpa disposisi: simpan langsung terkirim bidang tanpa disposisi (proses dilepas)', async () => {
    renderModal([item(1, { expected_crt: '11' })]);
    openCountingForm();

    fireEvent.input(screen.getByLabelText('Fisik CRT *'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Hitungan' }));

    // Langsung terkirim — frontend tidak lagi menuntut disposisi.
    await vi.waitFor(() => expect(api.verifyItem).toHaveBeenCalledTimes(1));
    const fd = (api.verifyItem.mock.calls as unknown as Array<[number, number, FormData]>)[0][2];
    expect(fd.has('disposition')).toBe(false);
  });

  it('penghitung mengirim sesi (bukan menyelesaikan sendiri): tombol Kirim Sesi terkunci sampai semua baris terhitung', async () => {
    renderModal([
      item(1, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 50, expected_crt: '50', disposition: 'LANJUT' }),
      item(2),
    ]);

    // Progress bar: 1 dari 2 terhitung.
    expect(screen.getByText(/1\/2 terhitung · sisa 1/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /Kirim Sesi \(sisa 1\)/ });
    expect(submit).toBeDisabled();

    // Approve tidak boleh tersedia bagi penghitung saat berjalan.
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument();
  });

  it('submit: konfirmasi kirim memanggil endpoint /submit (koreksi wave menunggu approve)', async () => {
    renderModal([
      item(1, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 50, expected_crt: '50', disposition: 'LANJUT' }),
      item(2, { verified_at: '2026-10-09T02:05:00Z', qty_fisik_crt: 12, expected_crt: '12', disposition: 'DISPOSAL' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Kirim Sesi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ya, kirim' }));

    await vi.waitFor(() => expect(api.submit).toHaveBeenCalledWith(1));
    expect(api.approve).not.toHaveBeenCalled();
  });

  it('PENDING_APPROVAL: approver melihat Setujui/Minta Revisi, penghitung tanpa aksi hitung; alasan revisi wajib', async () => {
    renderModal(
      [item(1, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 50, expected_crt: '50', disposition: 'LANJUT' })],
      { status: 'PENDING_APPROVAL', canApprove: true }
    );

    // Form hitung terkunci setelah dikirim.
    expect(screen.queryByRole('button', { name: 'Scan label' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Setujui' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minta Revisi' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ya, setujui' }));

    await vi.waitFor(() => expect(api.approve).toHaveBeenCalledWith(1));
  });

  it('approver tanpa aksi approve di status selain PENDING_APPROVAL', () => {
    renderModal([item(1)], { status: 'IN_PROGRESS', canApprove: true });

    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Minta Revisi' })).not.toBeInTheDocument();
  });

  it('revise: modal minta alasan, tombol aktif minimal 5 karakter', async () => {
    renderModal(
      [item(1, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 50, expected_crt: '50', disposition: 'LANJUT' })],
      { status: 'PENDING_APPROVAL', canApprove: true }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Minta Revisi' }));
    const reason = await screen.findByLabelText('Alasan revisi *');
    const kirim = screen.getByRole('button', { name: 'Kembalikan untuk Revisi' });

    expect(kirim).toBeDisabled();
    fireEvent.change(reason, { target: { value: 'abc' } });
    expect(kirim).toBeDisabled();
    fireEvent.change(reason, { target: { value: 'Qty PCS baris 2 salah, ulangi hitung.' } });
    expect(kirim).toBeEnabled();

    fireEvent.click(kirim);
    await vi.waitFor(() => expect(api.revise).toHaveBeenCalledWith(1, 'Qty PCS baris 2 salah, ulangi hitung.'));
  });

  it('aksi cepat "Tandai Habis" terkonfirmasi lalu kirim fisik 0 tanpa disposisi (aman BLC-approval)', async () => {
    renderModal([item(1, { expected_crt: '12' }), item(2)]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Tandai Habis' })[0]);

    // Konfirmasi menegaskan: hanya catat di sesi, tidak menghapus data DB.
    expect(await screen.findByText(/tidak ada data yang dihapus dari database/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, tandai habis' }));

    await vi.waitFor(() => expect(api.verifyItem).toHaveBeenCalledTimes(1));
    const [sessionIdArg, itemIdArg, payload] = api.verifyItem.mock.calls[0] as unknown as [number, number, Record<string, unknown>];
    expect(sessionIdArg).toBe(1);
    expect(itemIdArg).toBe(1);
    expect(payload.qty_fisik_crt).toBe(0);
    expect(payload.disposition).toBeUndefined();
  });

  it('baris terhitung punya tombol Edit Hitungan: form terisi dari nilai tersimpan (edit tinggal satu klik)', () => {
    renderModal([
      item(1, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 48, condition: 'FISIK_BAGUS', disposition: 'LANJUT', expected_crt: '50' }),
      item(2),
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Hitungan' })[0]);

    expect(screen.getByLabelText('Fisik CRT *')).toHaveValue(48);
    expect(screen.getByLabelText('Kondisi')).toHaveValue('FISIK_BAGUS');
  });

  it('daftar batch tampil sebagai tabel: 6 kolom, status terhitung/belum per baris', () => {
    renderModal([
      item(1, { verified_at: '2026-10-09T02:00:00Z', qty_fisik_crt: 50, expected_crt: '50', disposition: 'LANJUT' }),
      item(2),
    ]);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Kode Barang',
      'Batch',
      'Produk',
      'Status',
      'Hasil Hitung',
      'Aksi',
    ]);
    expect(screen.getAllByText(/Terhitung: 50/)).toHaveLength(1);
    expect(screen.getAllByText('Belum')).toHaveLength(1);
  });

  it('sesi OPEN belum bisa dihitung: form/scan disembunyikan, ada tombol Mulai + panduan langkah', () => {
    renderModal([item(1)], { status: 'OPEN' });

    // Tombol "Mulai Sesi" jadi langkah wajib pertama.
    expect(screen.getByRole('button', { name: 'Mulai Sesi' })).toBeInTheDocument();
    // Belum ada CTA scan/manual dan tidak ada form hitung.
    expect(screen.queryByRole('button', { name: 'Scan label' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fisik CRT *')).not.toBeInTheDocument();
    // Panduan status + stepper alur (langkah berjalan = Mulai).
    expect(screen.getByText(/klik "Mulai Sesi" dulu/)).toBeInTheDocument();
    expect(screen.getByText('Hitung fisik & disposisi')).toBeInTheDocument();
  });
});
