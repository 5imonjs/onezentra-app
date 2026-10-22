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
  daily: [{ date: '2026-09-01', requests: 5, active_users: 2, logins: 1 }],
  top_users: [],
  top_modules: [
    { module: 'Rencana Kirim', requests: 4 },
    { module: 'Login & Logout', requests: 1 },
  ],
  totals: { activities: 5, logins: 1, active_users: 2, peak_active_users: 2 },
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

    await waitFor(() => expect(activity).toHaveBeenCalledWith(30, 'DPO', expect.anything()));

    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang penggunaan sistem' }));

    await waitFor(() => expect(activity).toHaveBeenCalledTimes(2));
    expect(activity).toHaveBeenLastCalledWith(30, 'DPO', expect.anything());
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

  it('menampilkan aktivitas menyeluruh: login dan rincian per modul', async () => {
    render(<DashboardActivityChart />);

    expect(await screen.findByText('Login berhasil')).toBeInTheDocument();
    expect(screen.getByText('Login & Logout')).toBeInTheDocument();
    expect(screen.getByText('Rencana Kirim')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('tidak dirender dan tidak memuat data untuk peran tanpa users.view', () => {
    hasPermission.mockReturnValue(false);

    const { container } = render(<DashboardActivityChart kodeDepo="DPO" />);

    expect(container).toBeEmptyDOMElement();
    expect(activity).not.toHaveBeenCalled();
  });

  it('regresi: respons lama yang tiba belakangan tidak menimpa periode yang baru dipilih', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    activity.mockReturnValueOnce(first);
    activity.mockResolvedValueOnce({
      data: {
        data: {
          ...usagePayload(),
          days: 7,
          daily: [{ date: '2026-09-01', requests: 99, active_users: 3, logins: 2 }],
          totals: { activities: 99, logins: 2, active_users: 3, peak_active_users: 3 },
        },
      },
    });

    render(<DashboardActivityChart />);
    await waitFor(() => expect(activity).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '7 hari' }));
    await waitFor(() => expect(activity).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('99')).toBeInTheDocument();

    // Permintaan 30 hari (mount) baru selesai SETELAH permintaan 7 hari.
    // Tanpa guard balapan, angka lama (5) akan menimpa angka terbaru.
    resolveFirst({
      data: {
        data: {
          ...usagePayload(),
          days: 30,
          daily: [{ date: '2026-09-01', requests: 5, active_users: 2, logins: 1 }],
          totals: { activities: 5, logins: 1, active_users: 2, peak_active_users: 2 },
        },
      },
    });

    await waitFor(() => expect(screen.getByText('99')).toBeInTheDocument());
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });
});