import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardRecent from './DashboardRecent';

const { hasPermission, liveActivity } = vi.hoisted(() => ({
  hasPermission: vi.fn((_perm: string) => true),
  liveActivity: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  dashboard: { liveActivity },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/dashboardSummary', () => ({
  formatRelativeTime: vi.fn(() => 'baru saja'),
}));

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  user_id: 7,
  user_name: 'Budi Petugas',
  level: 'staff_logistic',
  kode_depo: '0127',
  nama_depo: 'Singkawang',
  method: 'POST',
  route: 'api/v1/opname-sessions/42/items/11',
  module: 'Opname Expired',
  action: 'Memproses Opname Expired',
  occurred_at: '2026-11-22T08:00:00+07:00',
  ...overrides,
});

describe('DashboardRecent — log aktivitas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    liveActivity.mockResolvedValue({
      data: { data: { events: [event()] } },
    });
  });

  afterEach(cleanup);

  it('tidak merender panel tanpa izin activity.view', () => {
    hasPermission.mockReturnValue(false);
    render(<DashboardRecent />);
    expect(screen.queryByText('Aktivitas Terbaru')).not.toBeInTheDocument();
    expect(liveActivity).not.toHaveBeenCalled();
  });

  it('menampilkan aktivitas mobile dan login dari log aktivitas', async () => {
    liveActivity.mockResolvedValue({
      data: {
        data: {
          events: [
            event({
              id: 2,
              module: 'Login & Logout',
              action: 'Login ke sistem',
              user_name: 'Siti Admin',
              method: 'LOGIN',
              route: 'auth.login',
            }),
            event(),
          ],
        },
      },
    });

    render(<DashboardRecent kodeDepo="0127" />);

    expect(await screen.findByText('Aktivitas Terbaru')).toBeInTheDocument();
    expect(screen.getByText('Login ke sistem')).toBeInTheDocument();
    expect(screen.getByText(/Siti Admin/)).toBeInTheDocument();
    expect(screen.getByText('Memproses Opname Expired')).toBeInTheDocument();
    expect(screen.getByText('Budi Petugas · Singkawang · staff_logistic')).toBeInTheDocument();
    expect(screen.getByLabelText('Daftar aktivitas terbaru')).toHaveClass('overflow-y-auto');
    expect(liveActivity).toHaveBeenCalledWith(0, '0127');
  });

  it('regresi: gagal memuat menampilkan tombol coba lagi', async () => {
    liveActivity.mockRejectedValueOnce(new Error('offline'));

    render(<DashboardRecent />);

    const retry = await screen.findByRole('button', { name: 'Coba lagi' });
    fireEvent.click(retry);
    expect(liveActivity).toHaveBeenCalledTimes(2);
  });
});
