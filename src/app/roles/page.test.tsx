import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccessManagementPage from './page';

const { hasPermission, listRoles } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  listRoles: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission, user: { level: 'admin_master', scope_level: 'master' } }),
}));

vi.mock('@/lib/api', () => ({
  roles: { list: listRoles },
  permissions: {},
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal: vi.fn() }));
vi.mock('@/components/Modal', () => ({ default: () => null }));
vi.mock('@/components/ConfirmDialog', () => ({ default: () => null }));
vi.mock('@/components/ToggleSwitch', () => ({ default: () => null }));

describe('AccessManagementPage role guidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    listRoles.mockResolvedValue({ data: { data: [], meta: { total_permissions: 0 } } });
  });

  afterEach(() => cleanup());

  it('explains role actions separately from depot data scope and global access', async () => {
    render(<AccessManagementPage />);

    expect(await screen.findByText('Buat role sesuai pekerjaan')).toBeInTheDocument();
    expect(screen.getByText('Atur hak tindakan role')).toBeInTheDocument();
    expect(screen.getByText('Pilih role saat mengatur user')).toBeInTheDocument();
    expect(screen.getByText('Cakupan data: assignment user')).toBeInTheDocument();
    expect(screen.getByText(/depot\.view_region/)).toBeInTheDocument();
    expect(screen.getByText('Sensitif: Akses Semua Depo')).toBeInTheDocument();
    expect(screen.getByText(/depot\.view_all/)).toBeInTheDocument();
    expect(screen.getByText(/tidak memberi hak membuat atau mengubah Region/)).toBeInTheDocument();
    expect(screen.getByText('admin_master')).toBeInTheDocument();
    expect(screen.getByText(/tidak memberi akses otomatis/)).toBeInTheDocument();
  });
});
