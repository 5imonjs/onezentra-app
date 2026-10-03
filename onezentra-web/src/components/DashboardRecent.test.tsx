import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardRecent from './DashboardRecent';

const { useSummary } = vi.hoisted(() => ({
  useSummary: vi.fn(),
}));

vi.mock('@/lib/dashboardSummary', () => ({
  useDashboardSummary: useSummary,
  formatRelativeTime: vi.fn(() => 'baru saja'),
}));

const summaryKosong = {
  depot: null,
  totals: {},
  new_7d: {},
  alerts: { expired_kritis: 0, expired_total: 0, standarisasi_pending: 0 },
  quality: { npn_no_volume: 0, npn_no_umur: 0 },
  sla: { avg_gate_to_receiving_hours: null, sj_open_count: 0, sj_oldest_days: null },
  recent: [],
  activity_trend: { current_7d: 0, prev_7d: 0 },
};

describe('DashboardRecent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('regresi: kegagalan memuat tampil dengan tombol coba lagi, bukan null diam-diam', () => {
    const reload = vi.fn();
    useSummary.mockReturnValue({ summary: summaryKosong, loading: false, failed: true, reload });

    render(<DashboardRecent kodeDepo="DPO" />);

    expect(screen.getByText(/Gagal memuat aktivitas terbaru/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('tidak merender section bila daftar aktivitas kosong', () => {
    useSummary.mockReturnValue({ summary: summaryKosong, loading: false, failed: false, reload: vi.fn() });

    render(<DashboardRecent />);

    expect(screen.queryByText('Aktivitas Terbaru')).not.toBeInTheDocument();
  });

  it('menampilkan item aktivitas terbaru', () => {
    useSummary.mockReturnValue({
      summary: {
        ...summaryKosong,
        recent: [{
          type: 'Rencana Kirim',
          title: 'PO-TEST-1',
          subtitle: 'DRAFT • Depo Test',
          href: '/rencana-kirim',
          at: '2026-10-01T08:00:00+07:00',
        }],
      },
      loading: false,
      failed: false,
      reload: vi.fn(),
    });

    render(<DashboardRecent />);

    expect(screen.getByText('Aktivitas Terbaru')).toBeInTheDocument();
    expect(screen.getByText('PO-TEST-1')).toBeInTheDocument();
  });
});