import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyGlobal } from '@/store/globalToast';
import RencanaKirimPage from './page';

const { hasPermission, list, create, update, remove, searchProduct, depoList, depotSettingsGet } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  searchProduct: vi.fn(),
  depoList: vi.fn(),
  depotSettingsGet: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission,
    user: {
      id: 1,
      kode_depo: '',
      nama_depo: 'Depo Test',
      full_name: 'Planner Tes',
      alamat: 'Jl. Tes No. 1',
      email: 'planner@example.com',
      level: 'planner',
      status: 'active',
      roles: [],
    },
  }),
}));

vi.mock('@/lib/api', () => ({
  rencanaKirim: { list, create, update, delete: remove },
  npn: { searchProduct },
  depo: { list: depoList },
  depotSettings: { get: depotSettingsGet },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/store/globalToast', () => ({
  notifyGlobal: vi.fn(),
}));

let productId = 0;
const product = (code: string, name: string) => ({
  id: ++productId,
  BOSnetszProductId: code,
  SAPszProductId: `S-${code}`,
  SAPszUomId: 'CRT',
  SAPdecUom: 1,
  decVolume: 1,
  szNickName: name,
  szNickNameNew: '',
  szShortDescription: name,
});

/**
 * Buka wizard "Buat Rencana" sampai langkah 4 lalu buka modal Kelola Daftar
 * Barang — satu-satunya tempat input Nama Barang (combobox pencarian NPN).
 */
async function openItemsModal(): Promise<HTMLInputElement> {
  render(<RencanaKirimPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Buat rencana kirim baru' }));

  // Langkah 1 — Dokumen. Tanggal RKH diisi manual seperti user nyata:
  // auto-fill todayDateStr() hanya aktif saat state masih `undefined`,
  // sedangkan reset awal mengisinya dengan string kosong.
  fireEvent.change(await screen.findByPlaceholderText('cth: PO-2026-0001'), { target: { value: 'PO-TES-001' } });
  fireEvent.change(screen.getByLabelText(/Tanggal RKH/), { target: { value: '2026-10-23' } });
  fireEvent.click(screen.getByRole('button', { name: /Selanjutnya/ }));

  // Langkah 2 — Kendaraan.
  fireEvent.change(screen.getByPlaceholderText('cth: Budi Santoso'), { target: { value: 'Budi' } });
  fireEvent.change(screen.getByPlaceholderText('cth: DA 8323 BU'), { target: { value: 'DA 1111 XX' } });
  fireEvent.change(screen.getByPlaceholderText('cth: CTP / Nama ekspedisi'), { target: { value: 'CTP' } });
  fireEvent.change(screen.getByDisplayValue('Pilih jenis kendaraan'), { target: { value: 'CDD' } });
  fireEvent.click(screen.getByRole('button', { name: /Selanjutnya/ }));

  // Langkah 3 — Pengirim: mengetik nama depo yang ada di master membuat
  // kode_depo ikut terisi (match case-insensitive) sehingga bagian lolos.
  fireEvent.change(await screen.findByPlaceholderText('Nama depo tujuan'), { target: { value: 'Singkawang' } });
  fireEvent.click(screen.getByRole('button', { name: /Selanjutnya/ }));

  // Langkah 4 — buka modal kelola barang.
  fireEvent.click(await screen.findByRole('button', { name: /Tambah Barang/ }));

  return (await screen.findByLabelText(/Nama Barang/)) as unknown as HTMLInputElement;
}

describe('Rencana Kirim — pencarian Nama Barang (combobox NPN)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    create.mockResolvedValue({ data: { data: {} } });
    update.mockResolvedValue({ data: { data: {} } });
    remove.mockResolvedValue({ data: {} });
    depoList.mockResolvedValue({ data: { data: [{ kode_depo: '0127', nama_depo: 'Singkawang' }] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  afterEach(() => {
    cleanup();
  });

  it('pencarian kosong menampilkan empty-state, bukan layar diam', async () => {
    const input = await openItemsModal();

    // Spasi di ujung dibuang sebelum dikirim ke server.
    fireEvent.change(input, { target: { value: '  zzz  ' } });

    expect(await screen.findByText(/Tidak ada barang yang cocok dengan/)).toBeInTheDocument();
    await waitFor(() => expect(searchProduct).toHaveBeenCalledWith('zzz', expect.objectContaining({ offset: 0 })));
    expect(searchProduct.mock.calls[0][1]).toHaveProperty('signal');
    // Tanpa hasil berarti tanpa listbox opsi.
    expect(screen.queryByRole('listbox', { name: 'Hasil pencarian barang NPN' })).not.toBeInTheDocument();
  });

  it('menampilkan "Menampilkan X dari Y" dan menarik halaman berikutnya saat tombol diklik', async () => {
    searchProduct
      .mockResolvedValueOnce({ data: { data: [product('B-1', 'MINYAK ONE'), product('B-2', 'MINYAK DUA')], total: 3 } })
      .mockResolvedValueOnce({ data: { data: [product('B-3', 'MINYAK TIGA')], total: 3 } });

    const input = await openItemsModal();
    fireEvent.change(input, { target: { value: 'minyak' } });

    expect(await screen.findByText(/Menampilkan 2 dari 3 barang/)).toBeInTheDocument();
    expect(await screen.findByText('MINYAK ONE')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Muat lebih banyak' }));

    expect(await screen.findByText('MINYAK TIGA')).toBeInTheDocument();
    await waitFor(() => expect(searchProduct).toHaveBeenLastCalledWith('minyak', expect.objectContaining({ offset: 2 })));
    // Seluruh data sudah termuat — indikator hilang.
    expect(screen.queryByText(/Menampilkan/)).not.toBeInTheDocument();
  });

  it('respons pencarian lama tidak menimpa hasil kata kunci terbaru', async () => {
    let resolveStale: ((v: { data: { data: unknown[]; total: number } }) => void) | undefined;
    searchProduct
      .mockImplementationOnce(() => new Promise((res) => { resolveStale = res; }))
      .mockResolvedValueOnce({ data: { data: [product('B-9', 'HASIL BARU AB')], total: 1 } });

    const input = await openItemsModal();

    fireEvent.change(input, { target: { value: 'a' } });
    await waitFor(() => expect(searchProduct).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'ab' } });
    expect(await screen.findByText('HASIL BARU AB')).toBeInTheDocument();
    expect(searchProduct).toHaveBeenLastCalledWith('ab', expect.objectContaining({ signal: expect.anything() }));

    // Respons untuk "a" baru tiba SETELAH "ab" tampil (lambatnya jaringan).
    resolveStale?.({ data: { data: [product('B-1', 'HASIL LAMA A')], total: 1 } });
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('HASIL LAMA A')).not.toBeInTheDocument();
    expect(screen.getByText('HASIL BARU AB')).toBeInTheDocument();
    expect(notifyGlobal).not.toHaveBeenCalledWith('Gagal memuat produk NPN.', 'error');
  });
});
