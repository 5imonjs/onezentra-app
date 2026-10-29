import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PendingActions from './PendingActions';

const { hasPermission, thlList, retribusiList, sjList, rkList, gateList, standarisasiList } = vi.hoisted(() => ({
  hasPermission: vi.fn((_perm: string) => true),
  thlList: vi.fn(),
  retribusiList: vi.fn(),
  sjList: vi.fn(),
  rkList: vi.fn(),
  gateList: vi.fn(),
  standarisasiList: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  biayaThl: { list: thlList },
  biayaRetribusi: { list: retribusiList },
  sjValidations: { list: sjList },
  rencanaKirim: { list: rkList },
  gateTransactions: { list: gateList },
  standarisasiTumpukan: { list: standarisasiList },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

const kosong = { data: { data: [], total: 0 } };

describe('PendingActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    for (const fn of [thlList, retribusiList, sjList, rkList, gateList, standarisasiList]) {
      fn.mockResolvedValue(kosong);
    }
  });

  afterEach(cleanup);

  it('meneruskan filter depo ke seluruh endpoint grup', async () => {
    render(<PendingActions kodeDepo="DPO" />);

    await waitFor(() => expect(gateList).toHaveBeenCalled());
    expect(thlList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(retribusiList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(sjList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(rkList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(gateList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
  });

  it('regresi: memakai permission & status yang benar-benar ada (approval.check, pending, IN_PROGRESS)', async () => {
    render(<PendingActions kodeDepo="DPO" />);

    await waitFor(() => expect(gateList).toHaveBeenCalled());

    const ditanya = hasPermission.mock.calls.map(([perm]) => perm);
    expect(ditanya).toContain('approval.check');
    // Slug yang tidak pernah ada di PermissionSeeder tidak lagi dipakai —
    // dulu grup THL/retribusi/RK tidak pernah tampil untuk user mana pun.
    expect(ditanya).not.toContain('biaya_thl.check');
    expect(ditanya).not.toContain('retribusi.view');
    expect(ditanya).not.toContain('retribusi.check');
    expect(ditanya).not.toContain('rencana_kirim.verify');

    expect(thlList).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', dir: 'asc' }));
    expect(retribusiList).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    // sj_validations tidak pernah berstatus PENDING — hanya IN_PROGRESS.
    expect(sjList).toHaveBeenCalledWith(expect.objectContaining({ status: 'IN_PROGRESS' }));
  });

  it('badge jumlah memakai total server, bukan isi halaman (regresi moreCount selalu 0)', async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1, no_kendaraan: `B ${i + 1}`, nama_depo: 'Depo Test', kode_depo: 'DPO',
    }));
    thlList.mockResolvedValue({ data: { data: items, total: 10 } });

    render(<PendingActions kodeDepo="DPO" />);

    expect(await screen.findByText('10 item')).toBeInTheDocument();
    expect(screen.getByText('Pengajuan THL menunggu pemeriksaan')).toBeInTheDocument();
    expect(screen.getByText('+6 lainnya — lihat semua di halaman modul')).toBeInTheDocument();
  });

  it('tidak merender section bila semua grup kosong', async () => {
    render(<PendingActions />);

    await waitFor(() => expect(gateList).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Perlu Tindakan')).not.toBeInTheDocument());
  });

  it('grup approval barang luar rencana & standarisasi tampil untuk approver', async () => {
    sjList.mockImplementation((params?: Record<string, unknown>) => {
      if (params?.has_pending_extra_items) {
        return Promise.resolve({
          data: {
            data: [
              { id: 7, scan_code: 'PO-042', pending_extra_items_count: 3, rencana_kirim: { po_transporter: 'PO-042' } },
            ],
            total: 1,
          },
        });
      }
      return Promise.resolve(kosong);
    });
    standarisasiList.mockResolvedValue({
      data: {
        data: [
          { id: 88, npn: { szShortDescription: null, szNickName: 'MCC8R', szNickNameNew: '' } },
        ],
        total: 4,
      },
    });

    render(<PendingActions kodeDepo="DPO" />);

    expect(await screen.findByText('Barang luar rencana menunggu keputusan')).toBeInTheDocument();
    expect(screen.getByText('Standarisasi menunggu approval BLC')).toBeInTheDocument();

    // Grup barang luar rencana: filter spesifik + jumlah barang per sesi.
    expect(sjList).toHaveBeenCalledWith(expect.objectContaining({
      status: 'IN_PROGRESS',
      has_pending_extra_items: 1,
      kode_depo: 'DPO',
    }));
    expect(screen.getByText('PO-042')).toBeInTheDocument();
    expect(screen.getByText('3 barang menunggu')).toBeInTheDocument();

    // Grup standarisasi: ambil pengajuan PENDING dari master standarisasi.
    expect(standarisasiList).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      kode_depo: 'DPO',
    }));
    expect(screen.getByText('MCC8R')).toBeInTheDocument();
  });

  it('grup approval tidak memanggil endpoint tanpa izin terkait', async () => {
    hasPermission.mockImplementation((perm: string) => {
      if (perm === 'sj_validation.approve' || perm === 'standarisasi.approve') return false;
      return true;
    });

    render(<PendingActions kodeDepo="DPO" />);

    await waitFor(() => expect(gateList).toHaveBeenCalled());
    // Sesi tetap dimuat untuk grup "belum divalidasi" (sj_validation.view),
    // tapi tanpa filter has_pending_extra_items; endpoint standarisasi kosong.
    expect(sjList).toHaveBeenCalledTimes(1);
    expect(sjList).not.toHaveBeenCalledWith(expect.objectContaining({ has_pending_extra_items: 1 }));
    expect(standarisasiList).not.toHaveBeenCalled();
    expect(screen.queryByText('Barang luar rencana menunggu keputusan')).not.toBeInTheDocument();
    expect(screen.queryByText('Standarisasi menunggu approval BLC')).not.toBeInTheDocument();
  });
});