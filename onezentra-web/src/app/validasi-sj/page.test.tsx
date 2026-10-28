import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ValidasiSjPage from './page';

const { hasPermission, list, get, stats, reportExtraItem, approveExtraItem, rejectExtraItem, depoList, npnSearch, notifyGlobal, printBatchLabel, downloadBatchLabel, batchesMarkPrinted } = vi.hoisted(() => ({
  hasPermission: vi.fn<(permission: string) => boolean>(() => true),
  list: vi.fn(),
  get: vi.fn(),
  stats: vi.fn(),
  reportExtraItem: vi.fn(),
  approveExtraItem: vi.fn(),
  rejectExtraItem: vi.fn(),
  depoList: vi.fn(),
  npnSearch: vi.fn(),
  notifyGlobal: vi.fn(),
  printBatchLabel: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  downloadBatchLabel: vi.fn(),
  batchesMarkPrinted: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ''} />,
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  sjValidations: { list, get, stats, reportExtraItem, approveExtraItem, rejectExtraItem },
  batches: { markPrinted: batchesMarkPrinted },
  depo: { list: depoList },
  npn: { searchProduct: npnSearch },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/components/BarcodeScanner', () => ({
  default: ({ open, onDetected }: { open: boolean; onDetected: (code: string) => void }) =>
    open ? <button type="button" onClick={() => onDetected('8991234567890')}>Simulasi Scan</button> : null,
  SCAN_FORMATS_1D: [],
}));

vi.mock('@/components/SearchInput', () => ({
  default: ({ value, placeholder }: { value: string; placeholder?: string }) => (
    <input aria-label={placeholder} value={value} readOnly />
  ),
}));

vi.mock('@/store/globalToast', () => ({
  notifyGlobal,
}));

vi.mock('@/lib/batchLabel', () => ({
  printBatchLabel,
  downloadBatchLabel,
}));

vi.mock('@/lib/storageFile', () => ({
  storageFileUrl: (path: string) => path,
  AUTHENTICATED_FILE_REL: 'noopener noreferrer',
}));

const emptyItem = {
  id: 31,
  kode_barang: 'BRG-1',
  nama_barang: 'Gula 50kg',
  expected_qty: 100,
  actual_qty: 100,
  satuan: 'zak',
  expired_date: '2027-01-31',
  condition: 'FISIK_BAGUS',
  status: 'VALIDATED',
};

const detailPayload = (extraItems: Record<string, unknown>[], status = 'IN_PROGRESS') => ({
  data: {
    data: {
      id: 9,
      status,
      scan_code: 'PO-042',
      started_at: '2026-10-01T08:00:00.000Z',
      completed_at: null,
      rencana_kirim: { po_transporter: 'PO-042', driver_name: 'Andi', nopol: 'B 9999 ZZ' },
      items: [emptyItem],
      extra_items: extraItems,
    },
  },
});

const listRow = (status = 'IN_PROGRESS') => ({
  data: {
    data: [
      {
        id: 9,
        status,
        scan_code: 'PO-042',
        started_at: '2026-10-01T08:00:00.000Z',
        completed_at: null,
        validated_items_count: 1,
        items_count: 1,
        rencana_kirim: { po_transporter: 'PO-042', driver_name: 'Andi', nopol: 'B 9999 ZZ' },
      },
    ],
    last_page: 1,
    current_page: 1,
    total: 1,
  },
});

async function openDetail(extraItems: Record<string, unknown>[]) {
  list.mockResolvedValue(listRow());
  get.mockResolvedValue(detailPayload(extraItems));
  stats.mockResolvedValue({ data: { data: { today: 0, in_progress: 1, completed: 0, cancelled: 0, total: 1 } } });
  depoList.mockResolvedValue({ data: { data: [] } });

  render(<ValidasiSjPage />);

  // Buka modal detail lewat tombol Detail (desktop + mobile masing-masing
  // merender satu — ambil yang pertama).
  const detailButtons = await screen.findAllByRole('button', { name: 'Detail' });
  fireEvent.click(detailButtons[0]);

  // Tunggu modal detail selesai memuat.
  await screen.findByText('Daftar Barang');
}

describe('ValidasiSjPage — barang di luar rencana', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    list.mockResolvedValue(listRow());
    get.mockResolvedValue(detailPayload([]));
    stats.mockResolvedValue({ data: { data: { today: 0, in_progress: 1, completed: 0, cancelled: 0, total: 1 } } });
    depoList.mockResolvedValue({ data: { data: [] } });
    npnSearch.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan catatan barang luar rencana yang tersimpan', async () => {
    await openDetail([
      {
        id: 71,
        kode_barang: 'SKU-LUAR-1',
        nama_barang: 'Kopi Special Grade',
        qty: 2,
        satuan: 'CRT',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra.jpg',
        notes: 'Ditulis manual di kertas',
        recorder: { full_name: 'Cheker' },
      },
    ]);

    // getComputedStyle is not implemented by jsdom; stub it for the detail modal internals if needed.
    expect(await screen.findByText('Barang di luar rencana')).toBeInTheDocument();
    expect(screen.getByText('Kopi Special Grade')).toBeInTheDocument();
    expect(screen.getByText(/SKU-LUAR-1/)).toBeInTheDocument();
    expect(screen.getByText(/Ditulis manual di kertas/)).toBeInTheDocument();
  });

  it('catatan disetujui dengan batch menampilkan tombol cetak — catatan pending tidak', async () => {
    await openDetail([
      {
        id: 71,
        kode_barang: 'SKU-LUAR-1',
        nama_barang: 'Kopi Special Grade',
        qty: 2,
        satuan: 'CRT',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra.jpg',
        status: 'PENDING',
        recorder: { full_name: 'Cheker' },
      },
      {
        id: 72,
        kode_barang: 'SKU-LUAR-2',
        nama_barang: 'Teh Celup',
        qty: 4,
        satuan: 'PAK',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra2.jpg',
        status: 'APPROVED',
        batch: { id: 55, batch_number: 'B-55', barcode_label: 'LBL-EXTRA-72', status: 'ACTIVE', printed_at: null },
      },
    ]);

    expect(await screen.findByText('Barang di luar rencana')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cetak Label/ })).not.toBeNull();
    // Hanya catatan APPROVED dengan batch yang punya tombol.
    expect(screen.getAllByRole('button', { name: /Cetak Label/ }).length).toBe(1);
  });

  it('mencetak label barang luar rencana melaporkan mark-printed ke server', async () => {
    await openDetail([
      {
        id: 72,
        kode_barang: 'SKU-LUAR-2',
        nama_barang: 'Teh Celup',
        qty: 4,
        satuan: 'PAK',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra2.jpg',
        status: 'APPROVED',
        batch: { id: 55, batch_number: 'B-55', barcode_label: 'LBL-EXTRA-72', status: 'ACTIVE', printed_at: null },
      },
    ]);

    fireEvent.click(await screen.findByRole('button', { name: /Cetak Label/ }));
    await waitFor(() => {
      expect(printBatchLabel).toHaveBeenCalledTimes(1);
    });
    expect(printBatchLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_number: 'B-55',
        barcode_label: 'LBL-EXTRA-72',
        kode_barang: 'SKU-LUAR-2',
        nama_barang: 'Teh Celup',
        actual_qty: 4,
        satuan: 'PAK',
      }),
    );
    // Jejak cetak dilaporkan ke server (mark-printed pada batch 55).
    await waitFor(() => {
      expect(batchesMarkPrinted).toHaveBeenCalledWith(55);
    });
    // Label sudah terlapor → tombol berubah menjadi cetak ulang.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cetak Ulang/ })).toBeInTheDocument();
    });
  });

  it('tombol Laporkan Barang hanya untuk sesi berjalan dengan izin', async () => {
    await openDetail([]);

    expect(await screen.findByRole('button', { name: /Laporkan Barang/ })).toBeInTheDocument();
  });

  it('tanpa izin sj_validation.extra section tersembunyi saat kosong', async () => {
    hasPermission.mockImplementation((permission: string) => permission !== 'sj_validation.extra');
    await openDetail([]);

    await screen.findByText('Daftar Barang');
    await waitFor(() => {
      expect(screen.queryByText('Barang di luar rencana')).not.toBeInTheDocument();
    });
  });

  it('melaporkan barang mengirim FormData dengan foto wajib', async () => {
    reportExtraItem.mockResolvedValue({ data: { data: { id: 71 } } });
    get.mockResolvedValue(detailPayload([
      {
        id: 71,
        kode_barang: 'SKU-LUAR-1',
        nama_barang: 'Kopi Special Grade',
        qty: 7,
        satuan: 'CRT',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra.jpg',
      },
    ]));

    await openDetail([]);

    fireEvent.click(await screen.findByRole('button', { name: /Laporkan Barang/ }));

    // Isi identitas manual (tanpa barcode) + jumlah.
    const kode = await screen.findByPlaceholderText('Dari kertas / manual');
    const nama = screen.getByPlaceholderText('Nama barang');
    const qty = screen.getByLabelText(/Jumlah/);
    fireEvent.change(kode, { target: { value: 'SKU-LUAR-1' } });
    fireEvent.change(nama, { target: { value: 'Kopi Special Grade' } });
    fireEvent.change(qty, { target: { value: '7' } });

    // Simulasi foto terpilih lewat input galeri pada panel foto bukti.
    const photoInput = screen.getByLabelText('Pilih foto dari galeri') as HTMLInputElement;
    const file = new File(['bukti'], 'bukti.jpg', { type: 'image/jpeg' });
    Object.defineProperty(photoInput, 'files', { value: [file] });
    fireEvent.change(photoInput);

    fireEvent.click(screen.getByRole('button', { name: /^Laporkan$/ }));

    await waitFor(() => expect(reportExtraItem).toHaveBeenCalledTimes(1));
    const [validationId, payload] = reportExtraItem.mock.calls[0] as [number, FormData];
    expect(validationId).toBe(9);
    expect(payload.get('kode_barang')).toBe('SKU-LUAR-1');
    expect(payload.get('nama_barang')).toBe('Kopi Special Grade');
    expect(payload.get('qty')).toBe('7');
    expect(payload.get('photo')).toBeInstanceOf(File);
  });

  it('memilih barang dari master NPN mengunci identitas & mengirim npn_id', async () => {
    reportExtraItem.mockResolvedValue({ data: { data: { id: 72 } } });
    get.mockResolvedValue(detailPayload([]));
    npnSearch.mockResolvedValue({
      data: {
        data: [{
          id: 5,
          BOSnetszProductId: 'SKU-NPN-77',
          SAPszProductId: 'MAT-77',
          SAPszUomId: 'CRT',
          SAPdecUom: null,
          decVolume: null,
          szNickName: 'Minyak Goreng 2L',
          szNickNameNew: '',
          szShortDescription: '',
        }],
        total: 1,
      },
    });

    await openDetail([]);
    fireEvent.click(await screen.findByRole('button', { name: /Laporkan Barang/ }));

    // Ketik di combobox master NPN, tunggu debounce selesai, pilih satu-satunya hasil.
    fireEvent.change(await screen.findByPlaceholderText('Ketik nama barang...'), { target: { value: 'Minyak' } });
    await waitFor(() => expect(npnSearch).toHaveBeenCalledWith('Minyak', expect.objectContaining({ limit: 500 })), { timeout: 3000 });
    fireEvent.click(await screen.findByRole('button', { name: /Minyak Goreng 2L/ }));

    // Identitas terkunci ke master: field manual hilang, satuan jadi suffix qty.
    await waitFor(() => expect(screen.queryByPlaceholderText('Dari kertas / manual')).not.toBeInTheDocument());
    expect(screen.getByText('Minyak Goreng 2L')).toBeInTheDocument();
    expect(screen.getByText('CRT')).toBeInTheDocument();

    const qty = screen.getByLabelText(/Jumlah/);
    fireEvent.change(qty, { target: { value: '5' } });
    const photoInput = screen.getByLabelText('Pilih foto dari galeri') as HTMLInputElement;
    Object.defineProperty(photoInput, 'files', { value: [new File(['bukti'], 'bukti.jpg', { type: 'image/jpeg' })] });
    fireEvent.change(photoInput);
    fireEvent.click(screen.getByRole('button', { name: /^Laporkan$/ }));

    await waitFor(() => expect(reportExtraItem).toHaveBeenCalledTimes(1));
    const [, payload] = reportExtraItem.mock.calls[0] as [number, FormData];
    // Identitas dipegang npn_id — nilai manual tidak ikut dikirim.
    expect(payload.get('npn_id')).toBe('5');
    expect(payload.get('kode_barang')).toBeNull();
    expect(payload.get('nama_barang')).toBeNull();
    expect(payload.get('qty')).toBe('5');
    expect(payload.get('photo')).toBeInstanceOf(File);
  });

  it('form barang luar rencana tidak lagi memakai barcode', async () => {
    await openDetail([]);

    fireEvent.click(await screen.findByRole('button', { name: /Laporkan Barang/ }));

    // Identifikasi sekarang lewat pencarian nama saja — barcode dihapus
    // supaya input lebih cepat; tidak ada tombol kamera maupun field barcode.
    await screen.findByPlaceholderText('Ketik nama barang...');
    expect(screen.queryByPlaceholderText('Scan / ketik barcode kemasan')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pindai/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simulasi Scan' })).not.toBeInTheDocument();
  });

  it('planner menyetujui catatan pending lewat modal keputusan', async () => {
    approveExtraItem.mockResolvedValue({ data: { data: { id: 71, status: 'APPROVED' } } });
    const approved = detailPayload([
      {
        id: 71,
        kode_barang: 'SKU-LUAR-1',
        nama_barang: 'Kopi Special Grade',
        qty: 2,
        satuan: 'CRT',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra.jpg',
        status: 'APPROVED',
        approved_at: '2026-10-28T08:00:00.000Z',
        decision_notes: 'Barang diterima',
        approver: { full_name: 'Planner' },
        recorder: { full_name: 'Cheker' },
      },
    ]);
    await openDetail([
      {
        id: 71,
        kode_barang: 'SKU-LUAR-1',
        nama_barang: 'Kopi Special Grade',
        qty: 2,
        satuan: 'CRT',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra.jpg',
        status: 'PENDING',
        recorder: { full_name: 'Cheker' },
      },
    ]);

    // Badge PENDING + tombol keputusan tampil.
    await screen.findByText('Menunggu persetujuan');
    fireEvent.click(screen.getByRole('button', { name: /Setujui/ }));

    // Modal keputusan terbuka; tombol konfirmasi di dalam modal (kedua).
    fireEvent.click((await screen.findAllByRole('button', { name: /Setujui/ })).at(-1)!);

    await waitFor(() => expect(approveExtraItem).toHaveBeenCalledWith(9, 71, undefined));
    // Detail sesi diambil ulang supaya badge status ikut segar.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    get.mockResolvedValue(approved);
  });

  it('menolak wajib alasan sebelum dikirim ke server', async () => {
    rejectExtraItem.mockResolvedValue({ data: { data: { id: 71, status: 'REJECTED' } } });
    await openDetail([
      {
        id: 71,
        kode_barang: 'SKU-LUAR-1',
        nama_barang: 'Kopi Special Grade',
        qty: 2,
        satuan: 'CRT',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra.jpg',
        status: 'PENDING',
        recorder: { full_name: 'Cheker' },
      },
    ]);

    fireEvent.click(await screen.findByRole('button', { name: /Tolak/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: /Tolak/ })).at(-1)!);

    // Guard frontend: tanpa alasan, server tidak dipanggil.
    await waitFor(() =>
      expect(notifyGlobal).toHaveBeenCalledWith('Alasan penolakan wajib diisi.', 'error'));
    expect(rejectExtraItem).not.toHaveBeenCalled();

    fireEvent.change(await screen.findByPlaceholderText('Contoh: kembalikan ke transporter'), {
      target: { value: 'Kembalikan ke transporter' },
    });
    fireEvent.click((screen.getAllByRole('button', { name: /Tolak/ })).at(-1)!);

    await waitFor(() => expect(rejectExtraItem).toHaveBeenCalledWith(9, 71, 'Kembalikan ke transporter'));
  });

  it('catatan yang sudah diputuskan menampilkan badge, keputusan & tanpa tombol', async () => {
    await openDetail([
      {
        id: 71,
        kode_barang: 'SKU-LUAR-1',
        nama_barang: 'Kopi Special Grade',
        qty: 2,
        satuan: 'CRT',
        condition: 'FISIK_BAGUS',
        expired_date: null,
        photo: 'validation-photos/extra.jpg',
        status: 'REJECTED',
        decision_notes: 'Barang tidak diterima',
        approver: { full_name: 'Planner' },
        recorder: { full_name: 'Cheker' },
      },
    ]);

    await screen.findByText('Ditolak');
    await screen.findByText(/Barang tidak diterima/);
    expect(screen.queryByRole('button', { name: /Setujui/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tolak/ })).not.toBeInTheDocument();
  });
});
