import { beforeEach, describe, expect, it, vi } from 'vitest';

const { login, logout, getUser, clearDashboardSummaryCache } = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getUser: vi.fn(),
  clearDashboardSummaryCache: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ auth: { login, logout, getUser } }));
vi.mock('@/lib/dashboardSummary', () => ({ clearDashboardSummaryCache }));

import { useAuthStore } from './auth';

const user = (id: number, depo: string) => ({
  id,
  kode_depo: depo,
  nama_depo: depo,
  full_name: 'Nama',
  alamat: '',
  email: `${depo.toLowerCase()}@depot.test`,
  level: 'staff_logistic',
  status: 'active',
  roles: [],
});

describe('useAuthStore — reset cache ringkasan dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, permissions: [], isLoading: false });
    sessionStorage.clear();
  });

  it('logout mengosongkan cache agar user berikutnya tidak melihat data user lama', async () => {
    logout.mockResolvedValue({});
    useAuthStore.setState({ user: user(1, 'A'), permissions: ['x'] });

    await useAuthStore.getState().logout();

    expect(clearDashboardSummaryCache).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().permissions).toEqual([]);
  });

  it('logout tetap mengosongkan state meski request logout gagal', async () => {
    logout.mockRejectedValue(new Error('offline'));
    useAuthStore.setState({ user: user(1, 'A'), permissions: ['x'] });

    await useAuthStore.getState().logout();

    expect(clearDashboardSummaryCache).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('login mengosongkan cache sebelum menampilkan data user baru', async () => {
    login.mockResolvedValue({ data: { user: user(2, 'B'), permissions: [] } });

    await useAuthStore.getState().login('b@depot.test', 'secret');

    expect(clearDashboardSummaryCache).toHaveBeenCalled();
    expect(useAuthStore.getState().user?.id).toBe(2);
  });
});
