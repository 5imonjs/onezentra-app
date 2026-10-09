import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './page';

const { hasPermission, depoList } = vi.hoisted(() => ({
  hasPermission: vi.fn<(perm: string) => boolean>(() => true),
  depoList: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ user: { full_name: 'Budi Santoso' }, hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  depo: { list: depoList },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/components/DashboardActivityChart', () => ({ default: () => <div data-testid="activity-chart" /> }));
vi.mock('@/components/RencanaKirimStatusChart', () => ({ default: () => <div data-testid="rencana-chart" /> }));
vi.mock('@/components/DashboardAlerts', () => ({ default: () => null }));
vi.mock('@/components/DashboardBiayaQueue', () => ({ default: () => null }));
vi.mock('@/components/DashboardOpnameChart', () => ({ default: () => null }));
vi.mock('@/components/DashboardRecent', () => ({ default: () => null }));
vi.mock('@/components/DashboardStatCards', () => ({ default: () => null }));
vi.mock('@/components/PendingActions', () => ({ default: () => null }));

describe('DashboardPage — tata letak chart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockImplementation(() => true);
    depoList.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(cleanup);

  it('tanpa izin rencana kirim, chart aktivitas melebar penuh (satu kolom)', () => {
    hasPermission.mockImplementation((perm: string) => perm !== 'rencana_kirim.view' && perm !== 'depot.view_all');

    render(<DashboardPage />);

    const wrapper = screen.getByTestId('activity-chart').parentElement as HTMLElement;
    expect(wrapper.className).not.toContain('xl:grid-cols-2');
    expect(screen.queryByTestId('rencana-chart')).not.toBeInTheDocument();
  });

  it('dengan izin rencana kirim, kedua chart tampil berdampingan di layar lebar', () => {
    hasPermission.mockImplementation((perm: string) => perm !== 'depot.view_all');

    render(<DashboardPage />);

    const wrapper = screen.getByTestId('activity-chart').parentElement as HTMLElement;
    expect(wrapper.className).toContain('xl:grid-cols-2');
    expect(screen.getByTestId('rencana-chart')).toBeInTheDocument();
  });

  it('tanpa izin users.view, chart sistem tidak dirender walau chart rencana kirim tampil', () => {
    hasPermission.mockImplementation((perm: string) => perm !== 'users.view' && perm !== 'depot.view_all');

    render(<DashboardPage />);

    expect(screen.queryByTestId('activity-chart')).not.toBeInTheDocument();
    const rencana = screen.getByTestId('rencana-chart');
    expect(rencana.parentElement?.className).not.toContain('xl:grid-cols-2');
  });
});
