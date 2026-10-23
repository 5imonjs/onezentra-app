import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UsersPage from './page';

const {
  hasPermission,
  list,
  roleOptions,
  create,
  update,
  remove,
  getDepots,
  syncDepots,
  depotList,
  depotUpsert,
  notifyGlobal,
} = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  list: vi.fn(),
  roleOptions: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  getDepots: vi.fn(),
  syncDepots: vi.fn(),
  depotList: vi.fn(),
  depotUpsert: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission, user: { level: 'admin_master' } }),
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/lib/api', () => ({
  users: { list, roleOptions, create, update, delete: remove, getDepots, syncDepots },
  depotSettings: { list: depotList, upsert: depotUpsert },
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
    roleOptions.mockResolvedValue({
      data: {
        data: [
          { id: 1, name: 'Staff Logistik', slug: 'staff_logistic', is_active: true, has_global_depot_access: false },
          { id: 2, name: 'Supervisor Regional', slug: 'supervisor_regional', is_active: true, has_global_depot_access: false },
          { id: 3, name: 'Auditor Global', slug: 'auditor_global', is_active: true, has_global_depot_access: true },
        ],
      },
    });
    depotList.mockResolvedValue({ data: { data: depots } });
    depotUpsert.mockResolvedValue({ data: {} });
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

  it('shows the region-to-depot table before the user table', async () => {
    render(<UsersPage />);

    const regionTable = await screen.findByRole('table', { name: 'Pemetaan region dan depo' });
    const userTable = screen.getByRole('table', { name: 'Daftar pengguna' });

    expect(regionTable.compareDocumentPosition(userTable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(regionTable).getByRole('row', { name: /REG-1/ })).toHaveTextContent('D-01');
    expect(within(regionTable).getByRole('row', { name: /REG-2/ })).toHaveTextContent('D-03');
  });

  it('shows the mapped depot region for legacy users without region_id', async () => {
    list.mockResolvedValue(listResponse([{
      ...user,
      region_id: null,
      depot_codes: ['D-01'],
    }]));
    render(<UsersPage />);

    const userTable = await screen.findByRole('table', { name: 'Daftar pengguna' });
    expect(within(userTable).getByRole('row', { name: /Region REG-1 \(dari pemetaan depo\) · D-01/ })).toBeInTheDocument();
    expect(within(userTable).getByText('REG-1 · dari depo')).toBeInTheDocument();
  });

  it('does not fetch user or depot data without users.view', () => {
    hasPermission.mockReturnValue(false);

    render(<UsersPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Anda tidak memiliki izin untuk melihat manajemen pengguna.');
    expect(list).not.toHaveBeenCalled();
    expect(roleOptions).not.toHaveBeenCalled();
    expect(depotList).not.toHaveBeenCalled();
  });

  it('explains region, multi-depot, and active-role columns in the import dialog', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByText(/region_id, depot_codes, level, status/)).toBeInTheDocument();
    expect(screen.getByText(/dipisahkan koma atau titik koma/)).toBeInTheDocument();
    expect(screen.getByText(/slug role aktif/)).toBeInTheDocument();
  });

  it('lets admin master map depot codes under a region', async () => {
    render(<UsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Atur Region → Depo' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Kode region untuk depo D-01' }), {
      target: { value: 'REG-NEW' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan region D-01' }));

    await waitFor(() => expect(depotUpsert).toHaveBeenCalledWith('D-01', { region_id: 'REG-NEW' }));
    const regionTable = screen.getByRole('table', { name: 'Pemetaan region dan depo' });
    expect(within(regionTable).getByRole('row', { name: /REG-NEW/ })).toHaveTextContent('D-01');
  });

  it('creates a user with only selected depots from the chosen region', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    await screen.findAllByRole('option', { name: 'REG-1' });
    expect(screen.getByText('1. Akun User')).toBeInTheDocument();
    expect(screen.getByText('2. Cakupan Data')).toBeInTheDocument();
    expect(screen.getByText('3. Hak Tindakan User')).toBeInTheDocument();
    expect(screen.getByText('Role menentukan menu dan tindakan yang boleh dilakukan. Role tidak memilih depo user.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Region User'), { target: { value: 'REG-1' } });

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

  it('offers active custom roles and warns when a role has global depot access', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(await screen.findByLabelText('Role / Peran *'), { target: { value: 'auditor_global' } });

    expect(screen.getAllByRole('option', { name: 'Supervisor Regional' })).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Role ini memberi akses global ke semua depo');
    expect(screen.getByLabelText('Ringkasan akses user baru')).toHaveTextContent('Semua depo (global)');
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
    fireEvent.click(await screen.findByRole('tab', { name: '2. Cakupan Depo' }));
    expect(await screen.findByRole('checkbox', { name: /D-01/ })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /D-03/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '1. Profil & Role' }));
    fireEvent.change(screen.getByLabelText('Region User'), { target: { value: 'REG-2' } });
    expect(screen.getByRole('status')).toHaveTextContent('Region berubah. Assignment depo lama sudah dikosongkan');
    fireEvent.click(screen.getByRole('tab', { name: '2. Cakupan Depo' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /D-03/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button')!);

    await waitFor(() => expect(update).toHaveBeenCalledWith(11, expect.objectContaining({
      region_id: 'REG-2',
      depot_codes: ['D-03'],
    })));
    expect(syncDepots).not.toHaveBeenCalled();
  });
});
