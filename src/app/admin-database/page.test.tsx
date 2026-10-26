import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDatabasePage from './page';

const { hasPermission, summary, documents, purge, purgeItems, purgeMaster, backfillDepot, notifyGlobal } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  summary: vi.fn(),
  documents: vi.fn(),
  purge: vi.fn(),
  purgeItems: vi.fn(),
  purgeMaster: vi.fn(),
  backfillDepot: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ user: { kode_depo: '0127' }, hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  adminDatabase: { summary, documents, purge, purgeItems, purgeMaster, backfillDepot },
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

const depots = [
  { kode_depo: '0127', nama_depo: 'Singkawang' },
  { kode_depo: '0126', nama_depo: 'Pontianak' },
];

const countsFor = (kodeDepo?: string): Record<string, number> => ({
  rencana_kirim: kodeDepo === '0126' ? 4 : 2,
  gate: 1,
  'validasi-sj': 1,
  receiving: 1,
  penerimaan: 0,
  'opname-session': 0,
  'opname-wave': 3,
  standarisasi: 0,
  'biaya-thl': 0,
  'biaya-retribusi': 0,
});

const summaryImplementation = (kodeDepo?: string) => Promise.resolve({
  data: {
    data: countsFor(kodeDepo),
    master: { npn: 12 },
    depots,
    kode_depo: kodeDepo ?? '0127',
  },
});

const emptyBackfill = { dry_run: true, candidates: {}, applied: {} };

const legacyPreview = {
  dry_run: true,
  candidates: {
    receiving_items: {
      total: 3,
      resolved: 2,
      unresolved: 1,
      samples: [{ id: 7, nama_depo: null, kode_depo: '0127', sumber: 'relasi receiving' }],
      unresolved_samples: [{ id: 8, nama_depo: 'Depo X', alasan: 'nama depo tidak cocok unik' }],
    },
    biaya_thls: {
      total: 1,
      resolved: 1,
      unresolved: 0,
      samples: [{ id: 9, nama_depo: 'Singkawang', kode_depo: '0127', sumber: 'nama_depo' }],
      unresolved_samples: [],
    },
  },
  applied: {},
};

const documentRows = [
  { id: 1, label: 'PO-A', subtitle: 'B 1234 XX · PO: PO-A', date: '2026-10-01', status: 'DRAFT' },
  { id: 2, label: 'PO-B', subtitle: 'B 5678 YY', date: '2026-10-02', status: 'SCHEDULED' },
];

const depotSelect = (): HTMLSelectElement =>
  screen.getByLabelText('Depo yang direset') as HTMLSelectElement;

describe('AdminDatabasePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    summary.mockImplementation(summaryImplementation);
    documents.mockResolvedValue({ data: { data: documentRows } });
    purge.mockResolvedValue({ data: { message: 'Data modul terpilih berhasil dikosongkan.', data: { counts: { rencana_kirim: 2 } } } });
    purgeItems.mockResolvedValue({ data: { message: 'Dokumen terpilih berhasil dihapus.', data: { counts: { rencana_kirim: 1 } } } });
    purgeMaster.mockResolvedValue({ data: { message: 'Master NPN berhasil dikosongkan.', data: { counts: { npn: 12 } } } });
    backfillDepot.mockResolvedValue({ data: { message: 'Pratinjau backfill: tidak ada data yang diubah.', data: emptyBackfill } });
  });

  afterEach(() => {
    cleanup();
  });

  const openDocumentMode = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Pilih Dokumen' }));
    await waitFor(() => expect(documents).toHaveBeenCalled());
    await screen.findByText('PO-A');
  };

  it('memuat daftar depo dan ringkasan modul untuk depo default', async () => {
    render(<AdminDatabasePage />);

    await waitFor(() => expect(summary).toHaveBeenCalled());
    expect(await screen.findByText('Reset Data')).toBeInTheDocument();
    expect(depotSelect().value).toBe('0127');
    expect(screen.getByText(/Hanya data Singkawang/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
    expect(screen.getByText('2 baris')).toBeInTheDocument();
  });

  it('menampilkan jumlah master NPN global di luar filter depo', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    expect(await screen.findByText('Reset Master Data (Global)')).toBeInTheDocument();
    expect(screen.getByText('12 baris')).toBeInTheDocument();
    expect(screen.getByText(/SEMUA depo/)).toBeInTheDocument();
  });

  it('pratinjau master NPN menghitung semua depo tanpa menghapus', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Pratinjau NPN' }));

    await waitFor(() => expect(purgeMaster).toHaveBeenCalledWith({
      modules: ['npn'],
      confirm: 'HAPUS NPN',
      dry_run: true,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('12 baris NPN');
    expect(purge).not.toHaveBeenCalled();
  });

  it('mengosongkan master NPN hanya setelah konfirmasi HAPUS NPN', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    const button = screen.getByRole('button', { name: 'Kosongkan Master NPN' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Konfirmasi ketik HAPUS NPN'), { target: { value: 'HAPUS NPN' } });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(purgeMaster).toHaveBeenCalledWith({
      modules: ['npn'],
      confirm: 'HAPUS NPN',
      dry_run: false,
    }));
    expect(notifyGlobal).toHaveBeenCalledWith('Master NPN berhasil dikosongkan.', 'success');
    await waitFor(() => expect(summary.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('mengganti depo memuat ulang ringkasan depo tersebut', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    fireEvent.change(depotSelect(), { target: { value: '0126' } });

    await waitFor(() => expect(summary).toHaveBeenCalledWith('0126'));
    expect(await screen.findByText('4 baris')).toBeInTheDocument();
    expect(screen.getByText(/Hanya data Pontianak/)).toBeInTheDocument();
  });

  it('dry-run menampilkan pratinjau hanya untuk depo terpilih', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Pratinjau' }));

    await waitFor(() => expect(purge).toHaveBeenCalledWith({
      modules: ['rencana_kirim'],
      kode_depo: '0127',
      confirm: 'HAPUS',
      dry_run: true,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('rencana_kirim: 2');
  });

  it('eksekusi mengirim kode_depo dan konfirmasi HAPUS', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByLabelText('Konfirmasi ketik HAPUS'), { target: { value: 'HAPUS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kosongkan Singkawang' }));

    await waitFor(() => expect(purge).toHaveBeenCalledWith({
      modules: ['rencana_kirim'],
      kode_depo: '0127',
      confirm: 'HAPUS',
      dry_run: false,
    }));
    expect(notifyGlobal).toHaveBeenCalledWith('Data modul terpilih berhasil dikosongkan.', 'success');
  });

  it('menonaktifkan eksekusi bila belum ada depo aktif', async () => {
    summary.mockResolvedValue({ data: { data: {}, depots: [], kode_depo: null } });
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    expect(screen.getByText('Belum ada depo aktif')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByLabelText('Konfirmasi ketik HAPUS'), { target: { value: 'HAPUS' } });

    expect(screen.getByRole('button', { name: 'Kosongkan Depo' })).toBeDisabled();
    expect(purge).not.toHaveBeenCalled();
  });

  it('memuat pratinjau data legacy sebagai dry-run saat halaman dibuka', async () => {
    backfillDepot.mockResolvedValue({ data: { message: 'Pratinjau backfill: tidak ada data yang diubah.', data: legacyPreview } });
    render(<AdminDatabasePage />);

    await waitFor(() => expect(backfillDepot).toHaveBeenCalledWith({ dry_run: true }));
    expect(await screen.findByText('Data Legacy Tanpa Depo')).toBeInTheDocument();
    expect(screen.getByText('Baris tanpa depo')).toBeInTheDocument();
    expect(screen.getByText('Bisa diisi otomatis')).toBeInTheDocument();
    expect(screen.getByText('Contoh yang akan diisi')).toBeInTheDocument();
    expect(screen.getByText(/relasi receiving/)).toBeInTheDocument();
    expect(screen.getByText(/nama depo tidak cocok unik/)).toBeInTheDocument();
  });

  it('backfill hanya berjalan setelah konfirmasi BACKFILL', async () => {
    backfillDepot
      .mockResolvedValueOnce({ data: { message: 'Pratinjau backfill: tidak ada data yang diubah.', data: legacyPreview } })
      .mockResolvedValueOnce({
        data: {
          message: 'Backfill kode depo selesai.',
          data: { ...legacyPreview, dry_run: false, applied: { receiving_items: 2, biaya_thls: 1 } },
        },
      })
      .mockResolvedValue({ data: { message: 'Pratinjau backfill: tidak ada data yang diubah.', data: emptyBackfill } });
    render(<AdminDatabasePage />);

    const button = await screen.findByRole('button', { name: 'Backfill Kode Depo' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Konfirmasi ketik BACKFILL'), { target: { value: 'BACKFILL' } });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(backfillDepot).toHaveBeenNthCalledWith(2, { dry_run: false, confirm: 'BACKFILL' }));
    expect(notifyGlobal).toHaveBeenCalledWith('Backfill kode depo selesai.', 'success');
  });

  it('menampilkan pesan bila tidak ada data legacy tanpa depo', async () => {
    render(<AdminDatabasePage />);

    expect(await screen.findByText('Tidak ada data legacy tanpa kode depo.')).toBeInTheDocument();
  });

  it('mode pilih dokumen memuat dokumen depo terpilih', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());
    await openDocumentMode();

    expect(documents).toHaveBeenCalledWith({
      kode_depo: '0127',
      module: 'rencana_kirim',
      search: undefined,
    });
    expect(screen.getByText('PO-A')).toBeInTheDocument();
    expect(screen.getByText(/0 dokumen dipilih/)).toBeInTheDocument();
  });

  it('pencarian dokumen mengirim kata kunci dan mengosongkan pilihan', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());
    await openDocumentMode();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText(/1 dokumen dipilih/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Cari nomor PO / SJ / dokumen'), { target: { value: 'PO-B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cari' }));

    await waitFor(() => expect(documents).toHaveBeenLastCalledWith({
      kode_depo: '0127',
      module: 'rencana_kirim',
      search: 'PO-B',
    }));
    expect(screen.getByText(/0 dokumen dipilih/)).toBeInTheDocument();
  });

  it('dry-run dokumen mengirim ID terpilih dan menampilkan pratinjau', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());
    await openDocumentMode();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Pratinjau' }));

    await waitFor(() => expect(purgeItems).toHaveBeenCalledWith({
      module: 'rencana_kirim',
      ids: [1],
      kode_depo: '0127',
      confirm: 'HAPUS',
      dry_run: true,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('rencana_kirim: 1');
  });

  it('eksekusi dokumen terpilih membutuhkan HAPUS dan memuat ulang data', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());
    await openDocumentMode();

    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    const deleteButton = screen.getByRole('button', { name: 'Hapus Dokumen Terpilih' });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Konfirmasi ketik HAPUS'), { target: { value: 'HAPUS' } });
    expect(deleteButton).not.toBeDisabled();
    fireEvent.click(deleteButton);

    await waitFor(() => expect(purgeItems).toHaveBeenCalledWith({
      module: 'rencana_kirim',
      ids: [2],
      kode_depo: '0127',
      confirm: 'HAPUS',
      dry_run: false,
    }));
    expect(notifyGlobal).toHaveBeenCalledWith('Dokumen terpilih berhasil dihapus.', 'success');
    await waitFor(() => expect(documents.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('mengganti jenis dokumen memuat modul baru dan mengosongkan pilihan', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());
    await openDocumentMode();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByLabelText('Jenis dokumen'), { target: { value: 'biaya-thl' } });

    await waitFor(() => expect(documents).toHaveBeenLastCalledWith({
      kode_depo: '0127',
      module: 'biaya-thl',
      search: undefined,
    }));
    expect(screen.getByText(/0 dokumen dipilih/)).toBeInTheDocument();
  });

  it('tanpa permission database.purge tidak memanggil API', async () => {
    hasPermission.mockReturnValue(false);
    render(<AdminDatabasePage />);

    expect(await screen.findByText('Hanya akun level admin master yang boleh membuka halaman ini.')).toBeInTheDocument();
    expect(summary).not.toHaveBeenCalled();
    expect(documents).not.toHaveBeenCalled();
    expect(purgeItems).not.toHaveBeenCalled();
    expect(purgeMaster).not.toHaveBeenCalled();
    expect(backfillDepot).not.toHaveBeenCalled();
  });
});
