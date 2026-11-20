import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StandarisasiPage from './page';

const { hasPermission, list, stats, approve, reject, notify, searchProduct, notifyGlobal } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  list: vi.fn(),
  stats: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  notify: vi.fn(),
  searchProduct: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ hasPermission }) }));
vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/lib/api', () => ({
  standarisasiTumpukan: {
    list,
    stats,
    approve,
    reject,
    notify,
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkDelete: vi.fn(),
    import: vi.fn(),
    export: vi.fn(),
    template: vi.fn(),
  },
  npn: { searchProduct },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const pendingItem = {
  id: 7,
  npn_id: 11,
  npn: {
    id: 11,
    BOSnetszProductId: 'BOS-77',
    SAPszProductId: 'SAP-1',
    szNickName: 'Prod',
    szNickNameNew: '',
    szShortDescription: 'Susu Kental Manis',
    szBarcode: '8991001',
  },
  tier: 3,
  tinggi_tumpukan: 4,
  total_tier_tinggi: 12,
  status: 'pending',
  requested_by: 2,
  requested_by_email: 'lapangan@depo.test',
  approved_by: 0,
  approved_by_email: '',
  kode_depo: '0126',
  nama_depo: 'Singkawang',
  created_at: '2026-11-20T00:00:00Z',
  updated_at: '2026-11-20T00:00:00Z',
};

const secondPendingItem = {
  ...pendingItem,
  id: 8,
  npn_id: 12,
  npn: { ...pendingItem.npn, id: 12, BOSnetszProductId: 'BOS-88', szShortDescription: 'Kopi Bubuk' },
};

beforeEach(() => {
  list.mockResolvedValue({ data: { data: [pendingItem], last_page: 1, total: 1 } });
  stats.mockResolvedValue({ data: { data: { total: 1, pending: 1, approved: 0, rejected: 0 } } });
  approve.mockResolvedValue({ data: { message: 'Disetujui' } });
  reject.mockResolvedValue({ data: { message: 'Ditolak' } });
  notify.mockResolvedValue({ data: { message: 'Notifikasi terkirim' } });
  searchProduct.mockResolvedValue({ data: { data: [] } });
  hasPermission.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StandarisasiPage — keputusan approval BLC', () => {
  it('menampilkan ringkasan item di modal keputusan lalu memanggil approve', async () => {
    render(<StandarisasiPage />);

    fireEvent.click((await screen.findAllByText('Setujui'))[0]);

    const dialog = await screen.findByText('Setujui Standarisasi');
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByText('Susu Kental Manis').length).toBeGreaterThan(1);
    expect(screen.getAllByText('BOS-77').length).toBeGreaterThan(1);
    expect(screen.getAllByText('0126').length).toBeGreaterThan(0);
    expect(screen.getByText(/3 × 4/)).toBeInTheDocument();
    expect(screen.getByText(/Notifikasi email akan dikirim ke BLC/)).toBeInTheDocument();

    const confirmButtons = screen.getAllByText('Setujui');
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(approve).toHaveBeenCalledWith(7));
    expect(reject).not.toHaveBeenCalled();
    expect(notifyGlobal).toHaveBeenCalledWith(expect.stringContaining('disetujui'), 'success');
  });

  it('mewajibkan alasan sebelum tombol Tolak aktif lalu memanggil reject', async () => {
    render(<StandarisasiPage />);

    fireEvent.click((await screen.findAllByText('Tolak'))[0]);

    expect(await screen.findByText('Tolak Standarisasi')).toBeInTheDocument();
    const confirm = screen.getAllByText('Tolak').at(-1)?.closest('button');
    expect(confirm).toBeDisabled();
    expect(screen.queryByText('Yakin ingin menolak standarisasi ini?')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Alasan penolakan/), {
      target: { value: 'Tier tidak sesuai SOP depo' },
    });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm!);
    await waitFor(() => expect(reject).toHaveBeenCalledWith(7));
    expect(approve).not.toHaveBeenCalled();
  });

  it('mengirim ulang notifikasi email dari menu aksi lewat endpoint notify', async () => {
    render(<StandarisasiPage />);

    fireEvent.click(await screen.findByLabelText('Aksi lainnya'));
    fireEvent.click(screen.getByText('Kirim ulang notifikasi'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(7));
    expect(notifyGlobal).toHaveBeenCalledWith(expect.stringContaining('berhasil dikirim ulang'), 'success');
  });

  it('menampilkan antrean approval dan tombol Tinjau membuka pengajuan pending pertama', async () => {
    render(<StandarisasiPage />);

    expect(await screen.findByText('Antrean Approval BLC')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tinjau Sekarang'));

    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', page: 1 })));
    expect(await screen.findByText('Detail Standarisasi')).toBeInTheDocument();
  });

  it('memproses lalu membuka item pending berikutnya lewat tombol Lanjut', async () => {
    list.mockResolvedValue({ data: { data: [pendingItem, secondPendingItem], last_page: 1, total: 2 } });
    render(<StandarisasiPage />);

    fireEvent.click((await screen.findAllByText('Setujui'))[0]);
    expect(await screen.findByText('Setujui Standarisasi')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Setujui & Lanjut'));

    await waitFor(() => expect(approve).toHaveBeenCalledWith(7));
    expect(approve).not.toHaveBeenCalledWith(8);
    expect(screen.getAllByText('Kopi Bubuk').length).toBeGreaterThan(0);

    const confirmButtons = screen.getAllByText('Setujui');
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(approve).toHaveBeenCalledWith(8));
  });

  it('mengunci kolom Aksi dan menyediakan aksi sekunder di menu', async () => {
    render(<StandarisasiPage />);

    expect(screen.getByRole('columnheader', { name: 'Aksi' }).className).toContain('sticky');
    fireEvent.click(await screen.findByLabelText('Aksi lainnya'));
    expect(screen.getByText('Lihat Detail')).toBeInTheDocument();
    expect(screen.getByText('Kirim ulang notifikasi')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Hapus')).toBeInTheDocument();
  });

  it('tidak menampilkan aksi keputusan bila tanpa izin approve', async () => {
    hasPermission.mockImplementation((permission) => permission !== 'standarisasi.approve');
    render(<StandarisasiPage />);

    expect(await screen.findByText('Susu Kental Manis')).toBeInTheDocument();
    expect(screen.queryByText('Setujui')).not.toBeInTheDocument();
    expect(screen.queryByText('Tolak')).not.toBeInTheDocument();
  });
});
