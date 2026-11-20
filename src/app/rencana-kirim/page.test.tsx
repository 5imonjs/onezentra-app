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
  fireEvent.change(screen.getByLabelText(/Tanggal Rencana Kirim/), { target: { value: '2026-10-23' } });
  fireEvent.change(screen.getByLabelText(/Rencana Tiba di Depo/), { target: { value: '2026-10-25' } });
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

  it('menampilkan nickname lama dan nickname baru pada hasil pencarian', async () => {
    searchProduct.mockResolvedValueOnce({
      data: {
        data: [
          {
            ...product('B-77', 'NICK LAMA'),
            szNickNameNew: 'NICK BARU',
            szShortDescription: 'Deskripsi Lengkap',
          },
        ],
        total: 1,
      },
    });

    const input = await openItemsModal();
    fireEvent.change(input, { target: { value: 'nick' } });

    expect(await screen.findByText('NICK LAMA')).toBeInTheDocument();
    expect(await screen.findByText(/NICK BARU/)).toBeInTheDocument();
    expect(await screen.findByText(/Deskripsi Lengkap/)).toBeInTheDocument();
  });

  it('menyimpan nickname sebagai nama barang setelah produk dipilih', async () => {
    searchProduct.mockResolvedValueOnce({
      data: {
        data: [
          {
            ...product('B-CSP4OK', 'CSP4OK'),
            szNickNameNew: 'CSP4OK NEW',
            szShortDescription: 'Deskripsi Sama',
          },
        ],
        total: 1,
      },
    });

    const input = await openItemsModal();
    fireEvent.change(input, { target: { value: 'csp4ok' } });

    fireEvent.click(await screen.findByRole('button', { name: /CSP4OK/ }));

    // Nama yang tersimpan harus identitas yang dicari, bukan short description
    // yang bisa sama untuk dua produk berbeda.
    expect(await screen.findByTitle('CSP4OK')).toBeInTheDocument();
    expect(screen.getByText('B-CSP4OK')).toBeInTheDocument();
    expect(screen.queryByText('Deskripsi Sama')).not.toBeInTheDocument();
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

describe('Rencana Kirim — tanggal kirim vs waktu input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    depoList.mockResolvedValue({ data: { data: [] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  const ymd = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('filter Besok mengirim date_from/date_to yang sama ke backend', async () => {
    render(<RencanaKirimPage />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Filter tanggal kirim'), { target: { value: 'tomorrow' } });

    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({
      date_from: ymd(1), date_to: ymd(1),
    })));
  });

  it('klik kalender memfilter daftar dan menyediakan tombol buat terpisah', async () => {
    render(<RencanaKirimPage />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    const target = ymd(2);
    const dayCell = screen.getAllByText(String(Number(target.slice(8)))).find((el) => el.closest('button'));
    expect(dayCell).toBeTruthy();
    fireEvent.click(dayCell!.closest('button')!);

    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({
      date_from: target, date_to: target,
    })));
    expect(screen.queryByLabelText(/Tanggal Rencana Kirim/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Buat rencana untuk ${target}` })).toBeInTheDocument();
  });

  it('menampilkan grup tanggal kirim "Hari ini" dan "Besok" di tabel', async () => {
    list.mockResolvedValue({ data: { data: [
      { id: 1, po_transporter: 'PO-HARI-INI', rkh_date: `${ymd(0)}T00:00:00`, status: 'DRAFT', created_at: `${ymd(-2)}T08:00:00` },
      { id: 2, po_transporter: 'PO-BESOK', rkh_date: `${ymd(1)}T00:00:00`, status: 'DRAFT', created_at: `${ymd(-1)}T08:00:00` },
    ], last_page: 1 } });

    render(<RencanaKirimPage />);

    expect((await screen.findAllByText(/Hari ini,/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Besok,/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ PO$/).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Rencana Kirim — panel kalender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    depoList.mockResolvedValue({ data: { data: [] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  it('bisa ditutup agar tabel melebar lalu dibuka lagi', async () => {
    render(<RencanaKirimPage />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    expect(screen.getByRole('region', { name: 'Kalender pengiriman' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan kalender' }));
    expect(screen.queryByRole('region', { name: 'Kalender pengiriman' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tampilkan kalender' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Daftar Rencana Pengiriman')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan kalender' }));
    expect(screen.getByRole('region', { name: 'Kalender pengiriman' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sembunyikan kalender' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Rencana Kirim — rencana tiba terpisah dari RKH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    depoList.mockResolvedValue({ data: { data: [] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  it('form menampilkan field Rencana Tiba di Depo yang berbeda dari RKH', async () => {
    render(<RencanaKirimPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Buat rencana kirim baru' }));

    expect(screen.getByLabelText(/Tanggal Rencana Kirim/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rencana Tiba di Depo/)).toBeInTheDocument();
    expect(screen.getByText(/Rencana tiba = kapan barang diharapkan sampai/)).toBeInTheDocument();
  });

  it('tabel menampilkan kolom Rencana Tiba', async () => {
    list.mockResolvedValue({ data: { data: [
      {
        id: 1, po_transporter: 'PO-ETA', rkh_date: '2026-11-21T00:00:00',
        eta_date: '2026-11-23T00:00:00', status: 'DRAFT', created_at: '2026-11-20T08:00:00',
      },
    ], last_page: 1 } });

    render(<RencanaKirimPage />);

    expect(await screen.findByRole('columnheader', { name: 'Rencana Tiba' })).toBeInTheDocument();
    expect(screen.getAllByText('2026-11-23').length).toBeGreaterThan(0);
  });
});

describe('Rencana Kirim — ETA wajib diisi planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    depoList.mockResolvedValue({ data: { data: [] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  it('tombol lanjut ditolak bila Rencana Tiba belum diisi', async () => {
    render(<RencanaKirimPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Buat rencana kirim baru' }));

    fireEvent.change(await screen.findByPlaceholderText('cth: PO-2026-0001'), { target: { value: 'PO-WAJIB-ETA' } });
    fireEvent.change(screen.getByLabelText(/Tanggal Rencana Kirim/), { target: { value: '2026-11-21' } });
    fireEvent.click(screen.getByRole('button', { name: /Selanjutnya/ }));

    expect(notifyGlobal).toHaveBeenCalledWith(
      expect.stringContaining('Rencana Tiba di Depo'),
      'error',
    );
  });
});

describe('Rencana Kirim — deep link ETA dari dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    depoList.mockResolvedValue({ data: { data: [] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  afterEach(() => window.history.pushState({}, '', '/'));

  it('?eta=today memfilter daftar berdasarkan rencana tiba', async () => {
    window.history.pushState({}, '', '/?eta=today');
    render(<RencanaKirimPage />);

    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({
      eta_from: expect.any(String),
      eta_to: expect.any(String),
    })));
    expect(screen.getByText(/Menampilkan rencana tiba/)).toBeInTheDocument();
  });
});

describe('Rencana Kirim — deep link ETA terlewat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    depoList.mockResolvedValue({ data: { data: [] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  afterEach(() => window.history.pushState({}, '', '/'));

  it('?eta=overdue memfilter ETA terlewat yang belum check-in', async () => {
    window.history.pushState({}, '', '/?eta=overdue');
    render(<RencanaKirimPage />);

    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ eta_overdue: true })));
    expect(screen.getByText(/ETA terlewat & belum check-in/)).toBeInTheDocument();
  });
});

describe('Rencana Kirim — kalender RKH vs ETA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: [], last_page: 1 } });
    depoList.mockResolvedValue({ data: { data: [] } });
    depotSettingsGet.mockResolvedValue({ data: { data: {} } });
    searchProduct.mockResolvedValue({ data: { data: [], total: 0 } });
  });

  it('bisa mengganti titik kalender ke basis Rencana Tiba', async () => {
    render(<RencanaKirimPage />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Rencana Tiba' }));

    expect(screen.getByText(/Titik kalender mengikuti Rencana Tiba/)).toBeInTheDocument();
  });
});
