import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityHistoryPage from './page';

const { hasPermission, history, depoList } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  history: vi.fn(),
  depoList: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission,
    user: { id: 1, kode_depo: '', nama_depo: 'Depo Test', level: 'admin_master' },
  }),
}));

vi.mock('@/lib/api', () => ({
  dashboard: { history },
  depo: { list: depoList },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const log = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  user_id: 7,
  user_name: 'Budi Planner',
  level: 'admin_planner',
  kode_depo: '0127',
  nama_depo: 'Singkawang',
  method: 'POST',
  route: 'api/v1/rencana-kirim',
  module: 'Rencana Kirim',
  action: 'Memproses Rencana Kirim',
  ip_address: '187.77.121.102',
  user_agent: 'curl/8.18.0',
  device_name: null,
  occurred_at: '2026-11-25T08:00:00+07:00',
  ...overrides,
});

const historyResponse = (rows: Array<Record<string, unknown>>) => ({
  data: { data: rows, current_page: 1, last_page: 1, total: rows.length },
});

describe('Riwayat Aktivitas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    history.mockResolvedValue(historyResponse([log()]));
    depoList.mockResolvedValue({ data: { data: [{ kode_depo: '0127', nama_depo: 'Singkawang' }] } });
  });

  afterEach(cleanup);

  it('tidak memuat data tanpa izin activity.view', () => {
    hasPermission.mockReturnValue(false);
    render(<ActivityHistoryPage />);

    expect(screen.getByText(/tidak memiliki izin untuk melihat riwayat aktivitas/i)).toBeInTheDocument();
    expect(history).not.toHaveBeenCalled();
  });

  it('menampilkan pengguna, modul, dan aksi dari log aktivitas', async () => {
    render(<ActivityHistoryPage />);

    expect((await screen.findAllByText('Budi Planner')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rencana Kirim').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Memproses Rencana Kirim').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Singkawang').length).toBeGreaterThan(0);
    expect(screen.getAllByText('curl/8.18.0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('187.77.121.102').length).toBeGreaterThan(0);
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 25 }));
  });

  it('menampilkan nama perangkat mobile bila tersedia', async () => {
    history.mockResolvedValue(historyResponse([log({
      method: 'LOGIN',
      module: 'Login & Logout',
      action: 'Login ke sistem',
      device_name: 'Android 3',
      ip_address: '114.122.10.5',
      user_agent: 'okhttp/4.12.0',
    })]));

    render(<ActivityHistoryPage />);

    expect((await screen.findAllByText('Android 3')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('114.122.10.5').length).toBeGreaterThan(0);
    expect(screen.queryByText('okhttp/4.12.0')).not.toBeInTheDocument();
  });

  it('filter modul langsung dikirim ke API dan mereset halaman', async () => {
    render(<ActivityHistoryPage />);
    await screen.findAllByText('Budi Planner');

    fireEvent.change(screen.getByLabelText('Modul'), { target: { value: 'Login & Logout' } });

    await waitFor(() => expect(history).toHaveBeenLastCalledWith(expect.objectContaining({
      module: 'Login & Logout',
      page: 1,
    })));
  });

  it('pencarian memakai debounce sebelum memanggil API', async () => {
    render(<ActivityHistoryPage />);
    await screen.findAllByText('Budi Planner');

    fireEvent.change(screen.getByLabelText('Cari'), { target: { value: 'budi' } });

    await waitFor(() => expect(history).toHaveBeenLastCalledWith(expect.objectContaining({
      search: 'budi',
      page: 1,
    })), { timeout: 1500 });
  });
});
