import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardAlerts from './DashboardAlerts';

const { useSummary, hasPermission } = vi.hoisted(() => ({
  useSummary: vi.fn(),
  hasPermission: vi.fn(() => true),
}));

vi.mock('@/lib/dashboardSummary', () => ({
  useDashboardSummary: useSummary,
  formatRelativeTime: vi.fn(() => ''),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

const summaryKosong = {
  depot: null,
  totals: {},
  new_7d: {},
  alerts: { expired_kritis: 0, expired_total: 0, standarisasi_pending: 0 },
  opname_at_risk: null,
  quality: { npn_no_volume: 0, npn_no_umur: 0 },
  sla: { avg_gate_to_receiving_hours: null, sj_open_count: 0, sj_oldest_days: null, rk_checked_in_count: 0, rk_checked_in_oldest_days: null },
  inbound_selisih: { items: 0, kurang: 0, lebih: 0 },
  recent: [],
  activity_trend: { current_7d: 0, prev_7d: 0 },
};

describe('DashboardAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
  });

  afterEach(cleanup);

  it('regresi: kegagalan memuat tampil dengan tombol coba lagi, bukan null diam-diam', () => {
    const reload = vi.fn();
    useSummary.mockReturnValue({ summary: summaryKosong, loading: false, failed: true, reload });

    render(<DashboardAlerts kodeDepo="DPO" />);

    expect(screen.getByText(/Gagal memuat peringatan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('tidak merender apa pun saat masih loading', () => {
    useSummary.mockReturnValue({ summary: summaryKosong, loading: true, failed: false, reload: vi.fn() });

    render(<DashboardAlerts />);

    expect(screen.queryByText(/Gagal memuat/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('menampilkan kartu peringatan saat ada data alert', () => {
    useSummary.mockReturnValue({
      summary: { ...summaryKosong, alerts: { expired_kritis: 3, expired_total: 5, standarisasi_pending: 0 } },
      loading: false,
      failed: false,
      reload: vi.fn(),
    });

    render(<DashboardAlerts />);

    expect(screen.getByText('Kritis / Kedaluwarsa')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3 kritis perlu tindakan')).toBeInTheDocument();
  });

  it('menampilkan kartu selisih inbound dan RK tertahan dari summary baru', () => {
    useSummary.mockReturnValue({
      summary: {
        ...summaryKosong,
        opname_at_risk: { week_start: '2026-10-05', kritis_rows: 2, expired_rows: 1, pcs: 40, crt: 2 },
        alerts: { expired_kritis: 3, expired_total: 5, standarisasi_pending: 0 },
        inbound_selisih: { items: 4, kurang: 3, lebih: 1 },
        sla: { ...summaryKosong.sla, rk_checked_in_count: 2, rk_checked_in_oldest_days: 5 },
      },
      loading: false,
      failed: false,
      reload: vi.fn(),
    });

    render(<DashboardAlerts />);

    expect(screen.getByText('3 kritis • 40 pcs')).toBeInTheDocument();
    expect(screen.getByText('Selisih Qty Inbound')).toBeInTheDocument();
    expect(screen.getByText('3 kurang • 1 lebih')).toBeInTheDocument();
    expect(screen.getByText('RK Tertahan di Gate')).toBeInTheDocument();
    expect(screen.getByText('tertua 5 hari')).toBeInTheDocument();
  });
});