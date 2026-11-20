import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardDuration from './DashboardDuration';

const { useSummary, hasPermission } = vi.hoisted(() => ({
  useSummary: vi.fn(),
  hasPermission: vi.fn(() => true),
}));

vi.mock('@/lib/dashboardSummary', () => ({ useDashboardSummary: useSummary }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ hasPermission }) }));

const summary = (total: number | null, unload: number | null) => ({
  summary: { sla: { avg_gate_to_receiving_hours: total, avg_unload_hours: unload } },
  loading: false,
});

describe('DashboardDuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    useSummary.mockReturnValue(summary(1.5, 0.75));
  });

  afterEach(cleanup);

  it('menampilkan rata-rata check-in sampai selesai dan durasi bongkar', () => {
    render(<DashboardDuration />);
    expect(screen.getByText('Durasi Receiving')).toBeInTheDocument();
    expect(screen.getByText('1 jam 30 mnt')).toBeInTheDocument();
    expect(screen.getByText('45 mnt')).toBeInTheDocument();
  });

  it('tidak tampil tanpa izin receiving atau tanpa data', () => {
    hasPermission.mockReturnValue(false);
    const { container } = render(<DashboardDuration />);
    expect(container).toBeEmptyDOMElement();

    hasPermission.mockReturnValue(true);
    useSummary.mockReturnValue(summary(null, null));
    cleanup();
    const second = render(<DashboardDuration />);
    expect(second.container).toBeEmptyDOMElement();
  });
});
