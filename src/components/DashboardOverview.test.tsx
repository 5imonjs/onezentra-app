import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardOverview from './DashboardOverview';

const { useSummary, hasPermission } = vi.hoisted(() => ({
  useSummary: vi.fn(),
  hasPermission: vi.fn((_permission: string) => true),
}));

vi.mock('@/lib/dashboardSummary', () => ({ useDashboardSummary: useSummary }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ hasPermission }) }));

const summary = {
  alerts: { standarisasi_pending: 2, extra_item_pending: 1, expired_kritis: 1, expired_total: 5 },
  incoming: { today: 3, tomorrow: 4, overdue: 2 },
  sla: { avg_gate_to_receiving_hours: 2.5, avg_unload_hours: 1.25, sj_open_count: 6, sj_oldest_days: 1, rk_checked_in_count: 0, rk_checked_in_oldest_days: null },
  activity_trend: { current_7d: 80, prev_7d: 40 },
  totals: {},
  new_7d: {},
  opname_at_risk: { week_start: '2026-11-23', kritis_rows: 1, expired_rows: 4, pcs: 100, crt: 50 },
  quality: { npn_no_volume: 0, npn_no_umur: 0 },
  inbound_selisih: { items: 0, kurang: 0, lebih: 0 },
  recent: [],
  depot: null,
};

describe('DashboardOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    useSummary.mockReturnValue({ summary, loading: false });
  });

  afterEach(cleanup);

  it('menampilkan KPI utama dengan angka nyata dan penanda waktu', () => {
    render(<DashboardOverview />);

    expect(screen.getByText('Ringkasan Hari Ini')).toBeInTheDocument();
    expect(screen.getByText(/Diperbarui/)).toBeInTheDocument();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByText('1j 15m')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lewat ETA/ })).toHaveAttribute('href', '/rencana-kirim?eta=overdue');
    expect(screen.getByRole('link', { name: /Kritis \+ Expired/ })).toBeInTheDocument();
    expect(screen.getByText('1 kritis · 4 expired')).toBeInTheDocument();
  });

  it('menyembunyikan KPI tanpa izin modul', () => {
    hasPermission.mockImplementation((p: string) => p !== 'opname.view');
    render(<DashboardOverview />);
    expect(screen.queryByRole('link', { name: /Kritis \+ Expired/ })).not.toBeInTheDocument();
  });
});
