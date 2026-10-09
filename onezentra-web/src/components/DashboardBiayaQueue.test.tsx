import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardBiayaQueue from './DashboardBiayaQueue';

const { hasPermission, biayaThlList, biayaRetribusiList } = vi.hoisted(() => ({
  hasPermission: vi.fn<(perm: string) => boolean>(() => true),
  biayaThlList: vi.fn(),
  biayaRetribusiList: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  biayaThl: { list: biayaThlList },
  biayaRetribusi: { list: biayaRetribusiList },
}));

const emptyQueue = {
  check: { count: 0, nominal: 0, oldest_days: null },
  approve: { count: 0, nominal: 0, oldest_days: null },
  rfah: { count: 0, nominal: 0, oldest_days: null },
};

const queueResponse = (queue: unknown) => ({ data: { summary: { queue } } });

describe('DashboardBiayaQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    biayaThlList.mockResolvedValue(queueResponse(emptyQueue));
    biayaRetribusiList.mockResolvedValue(queueResponse(emptyQueue));
  });

  afterEach(cleanup);

  it('menampilkan antrean RLH hanya untuk modul yang bisa dibaca dan level yang boleh', async () => {
    hasPermission.mockImplementation((perm: string) => ['biaya_thl.view', 'approval.approve'].includes(perm));
    biayaThlList.mockResolvedValue(queueResponse({
      ...emptyQueue,
      check: { count: 9, nominal: 100, oldest_days: 1 },
      approve: { count: 2, nominal: 500000, oldest_days: 3 },
    }));

    render(<DashboardBiayaQueue kodeDepo="DPO" />);

    expect(await screen.findByText('THL — Perlu Disetujui (RLH)')).toBeInTheDocument();
    expect(screen.getByText(/500\.000/)).toBeInTheDocument();
    expect(screen.getByText(/tertua 3 hari/)).toBeInTheDocument();
    // Level lain tidak ditampilkan walau queue-nya berisi, karena tak berizin.
    expect(screen.queryByText('THL — Perlu Diperiksa (BAC)')).not.toBeInTheDocument();
    // Modul tanpa biaya_retribusi.view tidak dipanggil/ditampilkan.
    expect(biayaRetribusiList).not.toHaveBeenCalled();
  });

  it('mengirim filter depo ke endpoint list', async () => {
    hasPermission.mockImplementation((perm: string) => ['biaya_thl.view', 'approval.check'].includes(perm));

    render(<DashboardBiayaQueue kodeDepo="DPO" />);

    await waitFor(() => expect(biayaThlList).toHaveBeenCalledWith({ per_page: 1, kode_depo: 'DPO' }));
  });

  it('tidak merender apa pun bila semua antrean kosong', async () => {
    const { container } = render(<DashboardBiayaQueue />);

    await waitFor(() => expect(biayaThlList).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });
});
