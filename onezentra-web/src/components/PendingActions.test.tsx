import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PendingActions from './PendingActions';

const { hasPermission, thlList, retribusiList, sjList, rkList, gateList } = vi.hoisted(() => ({
  hasPermission: vi.fn((_perm: string) => true),
  thlList: vi.fn(),
  retribusiList: vi.fn(),
  sjList: vi.fn(),
  rkList: vi.fn(),
  gateList: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  biayaThl: { list: thlList },
  biayaRetribusi: { list: retribusiList },
  sjValidations: { list: sjList },
  rencanaKirim: { list: rkList },
  gateTransactions: { list: gateList },
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
    for (const fn of [thlList, retribusiList, sjList, rkList, gateList]) {
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
});