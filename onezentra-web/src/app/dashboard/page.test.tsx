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

vi.mock('@/components/DashboardOverview', () => ({ default: () => <div data-testid="kpi-strip" /> }));
vi.mock('@/components/DashboardInsights', () => ({ default: () => <div data-testid="dashboard-insights" /> }));
vi.mock('@/components/DashboardAlerts', () => ({ default: () => <div data-testid="alerts-panel" /> }));
vi.mock('@/components/DashboardBiayaQueue', () => ({ default: () => null }));
vi.mock('@/components/DashboardReminders', () => ({ default: () => null }));
vi.mock('@/components/DashboardRecent', () => ({ default: () => null }));
vi.mock('@/components/PendingActions', () => ({ default: () => null }));

describe('DashboardPage — tata letak chart-driven', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockImplementation(() => true);
    depoList.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(cleanup);

  it('menampilkan KPI strip dan panel wawasan chart', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-insights')).toBeInTheDocument();
  });

  it('tidak menampilkan panel Perlu Perhatian di dashboard utama', () => {
    render(<DashboardPage />);
    expect(screen.queryByTestId('alerts-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Perlu Perhatian')).not.toBeInTheDocument();
  });

  it('menggabungkan blok pendukung dalam grid dua kolom di layar lebar', () => {
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

  it('tombol Mode Ringkas menyembunyikan panel chart diagnostik', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('dashboard-insights')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mode Ringkas' }));
    expect(screen.queryByTestId('dashboard-insights')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tampilan Lengkap' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tampilan Lengkap' }));
    expect(screen.getByTestId('dashboard-insights')).toBeInTheDocument();
  });
});
