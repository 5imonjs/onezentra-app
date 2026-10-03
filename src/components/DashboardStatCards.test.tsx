import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardStatCards from './DashboardStatCards';

const {
  useSummary, hasPermission,
  rencanaKirimList, gateList, receivingItemsList, receivingsList, sjList, npnList, standarUmurList, standarisasiList,
} = vi.hoisted(() => ({
  useSummary: vi.fn(),
  hasPermission: vi.fn(() => true),
  rencanaKirimList: vi.fn(),
  gateList: vi.fn(),
  receivingItemsList: vi.fn(),
  receivingsList: vi.fn(),
  sjList: vi.fn(),
  npnList: vi.fn(),
  standarUmurList: vi.fn(),
  standarisasiList: vi.fn(),
}));

vi.mock('@/lib/dashboardSummary', () => ({
  useDashboardSummary: useSummary,
  formatRelativeTime: vi.fn(() => ''),
}));

vi.mock('@/lib/api', () => ({
  rencanaKirim: { list: rencanaKirimList },
  gateTransactions: { list: gateList },
  receivingItems: { list: receivingItemsList },
  receivings: { list: receivingsList },
  sjValidations: { list: sjList },
  npn: { list: npnList },
  standarUmurProduk: { list: standarUmurList },
  standarisasiTumpukan: { list: standarisasiList },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

describe('DashboardStatCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    // Summary gagal → memaksa jalur fallback per-modul.
    useSummary.mockReturnValue({
      summary: {
        depot: null, totals: {}, new_7d: {},
        alerts: { expired_kritis: 0, expired_total: 0, standarisasi_pending: 0 },
        quality: { npn_no_volume: 0, npn_no_umur: 0 },
        sla: { avg_gate_to_receiving_hours: null, sj_open_count: 0, sj_oldest_days: null },
        recent: [],
        activity_trend: { current_7d: 0, prev_7d: 0 },
      },
      loading: false,
      failed: true,
      reload: vi.fn(),
    });
    for (const fn of [
      rencanaKirimList, gateList, receivingItemsList, receivingsList,
      sjList, npnList, standarUmurList, standarisasiList,
    ]) {
      fn.mockResolvedValue({ data: { total: 7 } });
    }
  });

  afterEach(cleanup);

  it('fallback mengirim kodeDepo ke modul ber-depo, npn & standar umur tetap global', async () => {
    render(<DashboardStatCards kodeDepo="DPO" />);

    await waitFor(() => expect(rencanaKirimList).toHaveBeenCalled());

    expect(rencanaKirimList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(gateList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(receivingItemsList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(receivingsList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(sjList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    expect(standarisasiList).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'DPO' }));
    // Identik dengan summary: npn & standar umur tidak difilter per depo.
    expect(npnList).toHaveBeenCalledWith({ per_page: 1 });
    expect(standarUmurList).toHaveBeenCalledWith({ per_page: 1 });
  });

  it('menampilkan angka fallback, bukan tanda gagal, ketika summary error', async () => {
    render(<DashboardStatCards kodeDepo="DPO" />);

    expect((await screen.findAllByText('7')).length).toBeGreaterThan(0);
  });
});