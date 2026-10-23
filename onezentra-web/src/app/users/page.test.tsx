import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UsersPage from './page';

const {
  hasPermission,
  list,
  create,
  update,
  remove,
  getDepots,
  syncDepots,
  depotList,
  notifyGlobal,
} = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  getDepots: vi.fn(),
  syncDepots: vi.fn(),
  depotList: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/lib/api', () => ({
  users: { list, create, update, delete: remove, getDepots, syncDepots },
  depotSettings: { list: depotList },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/components/Modal', () => ({
  default: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => open ? (
    <section>
      {title && <h2>{title}</h2>}
      {children}
      {footer}
    </section>
  ) : null,
}));

vi.mock('@/components/ConfirmDialog', () => ({
  default: ({
    open,
    title,
    onConfirm,
    confirmLabel = 'Konfirmasi',
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    confirmLabel?: string;
  }) => open ? (
    <div role="alertdialog">
      <h2>{title}</h2>
      <button onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ) : null,
}));

const depots = [
  { kode_depo: 'D-01', nama_depo: 'Depo Satu', region_id: 'REG-1' },
  { kode_depo: 'D-02', nama_depo: 'Depo Dua', region_id: 'REG-1' },
  { kode_depo: 'D-03', nama_depo: 'Depo Tiga', region_id: 'REG-2' },
];

const user = {
  id: 11,
  kode_depo: 'D-01',
  nama_depo: 'Depo Satu',
  depot_codes: ['D-01'],
  region_id: 'REG-1',
  full_name: 'User Satu',
  alamat: '',
  email: 'satu@example.com',
  level: 'staff_logistic',
  status: 'active',
  role_id: 1,
  roles: [],
  created_at: '2026-10-01',
  updated_at: '2026-10-01',
};

const listResponse = (rows: Record<string, unknown>[] = []) => ({
  data: {
    data: rows,
    last_page: 1,
    total: rows.length,
    meta: { total: rows.length, active: rows.length, inactive: 0, admin_master: 0 },
  },
});

describe('UsersPage region and depot assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    list.mockResolvedValue(listResponse());
    depotList.mockResolvedValue({ data: { data: depots } });
    create.mockResolvedValue({ data: { data: { id: 41 } } });
    update.mockResolvedValue({ data: { data: user } });
    remove.mockResolvedValue({ data: {} });
    getDepots.mockResolvedValue({
      data: {
        data: depots.map(depot => ({ ...depot, assigned: depot.kode_depo === 'D-01' })),
        has_region_permission: false,
        uses_global_scope: false,
      },
    });
    syncDepots.mockResolvedValue({ data: {} });
  });

  afterEach(() => cleanup());

  it('creates a user with only selected depots from the chosen region', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    await screen.findAllByRole('option', { name: 'REG-1' });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'REG-1' } });

    expect(await screen.findByRole('checkbox', { name: /D-01/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /D-02/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /D-03/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /D-01/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /D-02/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button')!);

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      region_id: 'REG-1',
      kode_depo: 'D-01',
      nama_depo: 'Depo Satu',
      depot_codes: ['D-01', 'D-02'],
    })));
    expect(syncDepots).not.toHaveBeenCalled();
  });

  it('saves edited depot assignments only from the selected region', async () => {
    list.mockResolvedValue(listResponse([user]));
    getDepots.mockResolvedValue({
      data: {
        data: depots.map(depot => ({ ...depot, assigned: depot.kode_depo === 'D-01' })),
        has_region_permission: true,
        uses_global_scope: false,
      },
    });
    render(<UsersPage />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Depot Akses' }));
    expect(await screen.findByRole('checkbox', { name: /D-01/ })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /D-03/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Data User' }));
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'REG-2' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Depot Akses' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /D-03/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button')!);

    await waitFor(() => expect(update).toHaveBeenCalledWith(11, expect.objectContaining({ region_id: 'REG-2' })));
    await waitFor(() => expect(syncDepots).toHaveBeenCalledWith(11, ['D-03']));
  });
});
