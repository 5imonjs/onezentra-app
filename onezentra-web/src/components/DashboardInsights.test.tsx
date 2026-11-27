import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardInsights from './DashboardInsights';

const { hasPermission, activity, stats, progress, useSummary } = vi.hoisted(() => ({
  hasPermission: vi.fn((_perm: string) => true),
  activity: vi.fn(),
  stats: vi.fn(),
  progress: vi.fn(),
  useSummary: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ hasPermission }) }));
vi.mock('@/lib/dashboardSummary', () => ({ useDashboardSummary: useSummary }));
vi.mock('@/lib/api', () => ({
  dashboard: { activity },
  rencanaKirim: { stats },
  opnameExpired: { progress },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

describe('DashboardInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    activity.mockResolvedValue({
      data: { data: { daily: [
        { date: '2026-11-15', requests: 10 }, { date: '2026-11-16', requests: 30 },
        { date: '2026-11-17', requests: 20 }, { date: '2026-11-18', requests: 50 },
      ] } },
    });
    stats.mockResolvedValue({ data: { data: { SCHEDULED: { count: 3 }, COMPLETED: { count: 7 } } } });
    progress.mockResolvedValue({ data: { data: { week_start: '2026-11-16', depots: [
      { kode_depo: '0127', nama_depo: 'Singkawang', total: 10, validated: 8, item_total: 0, item_counted: 0, submitted: true },
    ] } } });
    useSummary.mockReturnValue({
      loading: false,
      summary: {
        alerts: { standarisasi_pending: 2, extra_item_pending: 1, expired_kritis: 1, expired_total: 4 },
        incoming: { today: 3, tomorrow: 2, overdue: 5 },
        sla: { sj_open_count: 6 },
      },
    });
  });

  afterEach(cleanup);

  it('menampilkan empat chart dengan data nyata', async () => {
    render(<DashboardInsights />);

    expect(await screen.findByText('Aktivitas 7 Hari')).toBeInTheDocument();
    expect(screen.getByText('Sebaran Rencana Kirim')).toBeInTheDocument();
    expect(screen.getByText('Peta Exception')).toBeInTheDocument();
    expect(screen.getByText('Progres Monitoring Expired')).toBeInTheDocument();

    expect(await screen.findByText('80%')).toBeInTheDocument();
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getByText('5', { selector: '.font-bold' })).toBeInTheDocument();
    expect(activity).toHaveBeenCalledWith(7, undefined);
    expect(stats).toHaveBeenCalled();
    expect(progress).toHaveBeenCalled();
  });

  it('progres mengikuti hitungan item mobile, bukan wave tervalidasi', async () => {
    progress.mockResolvedValue({ data: { data: { week_start: '2026-11-16', depots: [
      { kode_depo: '0127', nama_depo: 'Singkawang', total: 10, validated: 10, item_total: 20, item_counted: 5 },
    ] } } });

    render(<DashboardInsights />);

    expect(await screen.findByText('25%')).toBeInTheDocument();
    expect(screen.getByText('5 / 20 batch dihitung')).toBeInTheDocument();
  });

  it('memakai total wave saat sesi belum dibuat (item_total 0)', async () => {
    progress.mockResolvedValue({ data: { data: { week_start: '2026-11-16', depots: [
      { kode_depo: '0127', nama_depo: 'Singkawang', total: 10, validated: 3, item_total: 0, item_counted: 0 },
    ] } } });

    render(<DashboardInsights />);

    expect(await screen.findByText('30%')).toBeInTheDocument();
    expect(screen.getByText('3 / 10 batch dihitung')).toBeInTheDocument();
  });

  it('menarik ulang progres otomatis supaya dashboard hidup', async () => {
    vi.useFakeTimers();
    try {
      render(<DashboardInsights />);
      await act(async () => {});
      const before = progress.mock.calls.length;

      await act(async () => { vi.advanceTimersByTime(15_000); });

      expect(progress.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tidak menampilkan chart tanpa izin modul terkait', () => {
    hasPermission.mockImplementation((p: string) => p !== 'users.view' && p !== 'opname.view' && p !== 'activity.view');
    render(<DashboardInsights />);
    expect(screen.queryByText('Aktivitas 7 Hari')).not.toBeInTheDocument();
    expect(screen.queryByText('Progres Monitoring Expired')).not.toBeInTheDocument();
    expect(screen.getByText('Sebaran Rencana Kirim')).toBeInTheDocument();
  });
});
