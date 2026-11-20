import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('@/components/DashboardLiveActivity', () => ({ default: () => <div data-testid="live-activity" /> }));
vi.mock('@/components/RencanaKirimStatusChart', () => ({ default: () => <div data-testid="rencana-chart" /> }));
vi.mock('@/components/DashboardAlerts', () => ({ default: () => <div data-testid="alerts-panel" /> }));
vi.mock('@/components/DashboardBiayaQueue', () => ({ default: () => null }));
vi.mock('@/components/DashboardOpnameChart', () => ({ default: () => null }));
vi.mock('@/components/DashboardRecent', () => ({ default: () => null }));
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
    expect(screen.queryByTestId('live-activity')).not.toBeInTheDocument();
    const rencana = screen.getByTestId('rencana-chart');
    expect(rencana.parentElement?.className).not.toContain('xl:grid-cols-2');
  });

  it('menampilkan feed aktivitas real-time di bawah chart untuk pemegang users.view', () => {
    hasPermission.mockImplementation((perm: string) => perm !== 'depot.view_all');

    render(<DashboardPage />);

    expect(screen.getByTestId('live-activity')).toBeInTheDocument();
  });

  it('tidak menampilkan panel Perlu Perhatian di dashboard utama', () => {
    render(<DashboardPage />);

    expect(screen.queryByTestId('alerts-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Perlu Perhatian')).not.toBeInTheDocument();
  });

  it('menggabungkan blok opname dan aktivitas terbaru dalam grid dua kolom di layar lebar', () => {
    render(<DashboardPage />);

    const pair = screen.getByTestId('supporting-blocks');
    expect(pair.className).toContain('grid-cols-1');
    expect(pair.className).toContain('xl:grid-cols-2');
  });

  it('hero menampilkan sapaan dengan nama depan user', () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Budi');
  });

  it('tidak lagi menampilkan kartu ringkasan modul agar dashboard tidak ramai', () => {
    render(<DashboardPage />);

    expect(screen.queryByText('Modul Operasional')).not.toBeInTheDocument();
    expect(screen.queryByText('Data Master')).not.toBeInTheDocument();
  });

  it('filter depo hanya tampil bagi pemegang izin depot.view_all', () => {
    const { unmount } = render(<DashboardPage />);
    expect(screen.getByLabelText('Filter depo dashboard')).toBeInTheDocument();
    unmount();

    hasPermission.mockImplementation((perm: string) => perm !== 'depot.view_all');
    render(<DashboardPage />);

    expect(screen.queryByLabelText('Filter depo dashboard')).not.toBeInTheDocument();
  });
});

describe('DashboardPage — mode ringkas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockImplementation(() => true);
    depoList.mockResolvedValue({ data: { data: [] } });
  });

  it('tombol Mode Ringkas menyembunyikan panel diagnostik', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('activity-chart')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mode Ringkas' }));

    expect(screen.queryByTestId('activity-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-activity')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tampilan Lengkap' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tampilan Lengkap' }));
    expect(screen.getByTestId('activity-chart')).toBeInTheDocument();
  });
});
