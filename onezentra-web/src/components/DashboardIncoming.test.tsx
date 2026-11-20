import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardIncoming from './DashboardIncoming';

const { useSummary, hasPermission } = vi.hoisted(() => ({
  useSummary: vi.fn(),
  hasPermission: vi.fn(() => true),
}));

vi.mock('@/lib/dashboardSummary', () => ({
  useDashboardSummary: useSummary,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

const summary = (today: number, tomorrow: number, overdue = 0) => ({
  incoming: { today, tomorrow, overdue },
});

describe('DashboardIncoming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    useSummary.mockReturnValue({ summary: summary(3, 5, 2), loading: false });
  });

  afterEach(cleanup);

  it('menampilkan jumlah rencana tiba hari ini dan besok', () => {
    render(<DashboardIncoming />);

    expect(screen.getByText('Kedatangan Terjadwal')).toBeInTheDocument();
    expect(screen.getByText(/Rencana tiba dari planner/)).toBeInTheDocument();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Tiba Hari Ini/ })).toHaveAttribute('href', '/rencana-kirim?eta=today');
    expect(screen.getByRole('link', { name: /Tiba Besok/ })).toHaveAttribute('href', '/rencana-kirim?eta=tomorrow');
    expect(screen.getByText(/Lewat ETA, belum check-in/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lewat ETA, belum check-in/ })).toHaveAttribute('href', '/rencana-kirim?eta=overdue');
  });

  it('tidak tampil bila tidak ada kedatangan terjadwal', () => {
    useSummary.mockReturnValue({ summary: summary(0, 0), loading: false });

    const { container } = render(<DashboardIncoming />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tidak tampil tanpa izin rencana kirim', () => {
    hasPermission.mockReturnValue(false);

    const { container } = render(<DashboardIncoming />);
    expect(container).toBeEmptyDOMElement();
  });
});
