import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardActivityChart from './DashboardActivityChart';

const { activity, useSummary, hasPermission } = vi.hoisted(() => ({
  activity: vi.fn(),
  useSummary: vi.fn(),
  hasPermission: vi.fn<(perm: string) => boolean>(() => true),
}));

vi.mock('@/lib/api', () => ({
  dashboard: { activity },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/dashboardSummary', () => ({
  useDashboardSummary: useSummary,
  formatRelativeTime: vi.fn(() => ''),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

const usagePayload = () => ({
  from: '2026-09-01',
  to: '2026-09-30',
  days: 30,
  daily: [{ date: '2026-09-01', requests: 5, active_users: 2 }],
  top_users: [],
});

const summary = (trend: { current_7d: number; prev_7d: number }) => ({
  depot: null,
  totals: {},
  new_7d: {},
  alerts: { expired_kritis: 0, expired_total: 0, standarisasi_pending: 0 },
  quality: { npn_no_volume: 0, npn_no_umur: 0 },
  sla: { avg_gate_to_receiving_hours: null, sj_open_count: 0, sj_oldest_days: null },
  recent: [],
  activity_trend: trend,
});

describe('DashboardActivityChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    activity.mockResolvedValue({ data: { data: usagePayload() } });
    useSummary.mockReturnValue({
      summary: summary({ current_7d: 0, prev_7d: 0 }),
      loading: false,
      failed: false,
      reload: vi.fn(),
    });
  });

  afterEach(cleanup);

  it('regresi: tombol refresh mempertahankan filter depo (dulu reset ke semua depo)', async () => {
    render(<DashboardActivityChart kodeDepo="DPO" />);

    await waitFor(() => expect(activity).toHaveBeenCalledWith(30, 'DPO'));

    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang penggunaan sistem' }));

    await waitFor(() => expect(activity).toHaveBeenCalledTimes(2));
    expect(activity).toHaveBeenLastCalledWith(30, 'DPO');
  });

  it('menampilkan chip tren mingguan dari activity_trend summary', async () => {
    useSummary.mockReturnValue({
      summary: summary({ current_7d: 120, prev_7d: 100 }),
      loading: false,
      failed: false,
      reload: vi.fn(),
    });

    render(<DashboardActivityChart kodeDepo="DPO" />);

    expect(await screen.findByText('▲ 20% vs minggu lalu')).toBeInTheDocument();
  });

  it('menampilkan "Baru minggu ini" bila minggu lalu nol dan sekarang ada aktivitas', async () => {
    useSummary.mockReturnValue({
      summary: summary({ current_7d: 12, prev_7d: 0 }),
      loading: false,
      failed: false,
      reload: vi.fn(),
    });

    render(<DashboardActivityChart />);

    expect(await screen.findByText('Baru minggu ini')).toBeInTheDocument();
  });

  it('tidak dirender dan tidak memuat data untuk peran tanpa users.view', () => {
    hasPermission.mockReturnValue(false);

    const { container } = render(<DashboardActivityChart kodeDepo="DPO" />);

    expect(container).toBeEmptyDOMElement();
    expect(activity).not.toHaveBeenCalled();
  });
});