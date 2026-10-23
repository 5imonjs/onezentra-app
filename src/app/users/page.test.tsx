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
  regionList,
  regionCreate,
  regionUpdate,
  depotCreate,
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
  regionList: vi.fn(),
  regionCreate: vi.fn(),
  regionUpdate: vi.fn(),
  depotCreate: vi.fn(),
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
  depotSettings: { list: depotList, create: depotCreate, upsert: depotUpsert },
  regions: { list: regionList, create: regionCreate, update: regionUpdate },
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
    regionList.mockResolvedValue({ data: { data: [
      { code: 'REG-1', name: 'Region Satu' },
      { code: 'REG-2', name: 'Region Dua' },
      { code: 'REG-EMPTY', name: 'Region Tanpa Depo' },
    ] } });
    regionCreate.mockImplementation(async (data: { code: string; name: string }) => ({ data: { data } }));
    regionUpdate.mockImplementation(async (code: string, data: { name: string }) => ({ data: { data: { code, ...data } } }));
    depotCreate.mockImplementation(async (data: { kode_depo: string; nama_depo: string; region_id: string }) => ({ data: { data: { ...data, is_active: true } } }));
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
    expect(within(regionTable).getByRole('row', { name: /REG-EMPTY/ })).toHaveTextContent('Belum ada depo');
  });

  it('shows the mapped depot region for legacy users without region_id', async () => {
    list.mockResolvedValue(listResponse([{
      ...user,
      region_id: null,
      depot_codes: ['D-01'],
    }]));
    render(<UsersPage />);

    const userTable = await screen.findByRole('table', { name: 'Daftar pengguna' });
    expect(within(userTable).getByRole('row', { name: /Region REG-1 · Region Satu \(dari pemetaan depo\) · D-01/ })).toBeInTheDocument();
    expect(within(userTable).getByText('REG-1 · Region Satu · dari depo')).toBeInTheDocument();
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
    fireEvent.change(await screen.findByRole('combobox', { name: 'Kode region untuk depo D-01' }), { target: { value: 'REG-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan region D-01' }));

    await waitFor(() => expect(depotUpsert).toHaveBeenCalledWith('D-01', { region_id: 'REG-2' }));
    const regionTable = screen.getByRole('table', { name: 'Pemetaan region dan depo' });
    expect(within(regionTable).getByRole('row', { name: /REG-2/ })).toHaveTextContent('D-01');
  });

  it('creates a region from its code and name in the user form', async () => {
    render(<UsersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.click(await screen.findByRole('button', { name: '+ Buat region baru' }));
    fireEvent.change(screen.getByLabelText('Kode region baru'), { target: { value: 'REG-NEW' } });
    fireEvent.change(screen.getByLabelText('Nama region baru'), { target: { value: 'Region Baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan dan pilih region' }));

    await waitFor(() => expect(regionCreate).toHaveBeenCalledWith({ code: 'REG-NEW', name: 'Region Baru' }));
    expect(screen.getByLabelText('Region User')).toHaveValue('REG-NEW');
    expect(screen.getAllByText('REG-NEW · Region Baru').length).toBeGreaterThan(0);
  });

  it('updates the name of a legacy region master', async () => {
    render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Atur Region → Depo' }));
    const regionSelect = screen.getByRole('combobox', { name: 'Pilih region untuk ubah nama' });
    expect(regionSelect.closest('.mb-5')).toHaveClass('bg-surface-card');
    fireEvent.change(regionSelect, { target: { value: 'REG-1' } });
    fireEvent.change(screen.getByLabelText('Nama region master'), { target: { value: 'Region Barat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan nama' }));

    await waitFor(() => expect(regionUpdate).toHaveBeenCalledWith('REG-1', { name: 'Region Barat' }));
    const regionTable = screen.getByRole('table', { name: 'Pemetaan region dan depo' });
    expect(within(regionTable).getAllByRole('row', { name: /REG-1 · Region Barat/ }).length).toBeGreaterThan(0);
  });

  it('creates a depot in the selected region and assigns it to the new user', async () => {
    render(<UsersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(await screen.findByLabelText('Region User'), { target: { value: 'REG-1' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Buat depo' }));
    fireEvent.change(screen.getByLabelText('Kode depo baru'), { target: { value: 'R1-NEW' } });
    fireEvent.change(screen.getByLabelText('Nama depo baru'), { target: { value: 'Depo Baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan depo dan tetapkan ke user' }));

    await waitFor(() => expect(depotCreate).toHaveBeenCalledWith({
      kode_depo: 'R1-NEW',
      nama_depo: 'Depo Baru',
      region_id: 'REG-1',
    }));
    expect(await screen.findByRole('checkbox', { name: /R1-NEW/ })).toBeChecked();
  });

  it('creates a region, creates its depot, and submits the user with that depot assigned', async () => {
    render(<UsersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    fireEvent.click(await screen.findByRole('button', { name: '+ Buat region baru' }));
    fireEvent.change(screen.getByLabelText('Kode region baru'), { target: { value: 'REG-NEW' } });
    fireEvent.change(screen.getByLabelText('Nama region baru'), { target: { value: 'Region Baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan dan pilih region' }));
    await waitFor(() => expect(screen.getByLabelText('Region User')).toHaveValue('REG-NEW'));

    fireEvent.click(screen.getByRole('button', { name: '+ Buat depo' }));
    fireEvent.change(screen.getByLabelText('Kode depo baru'), { target: { value: 'NEW-DEPOT' } });
    fireEvent.change(screen.getByLabelText('Nama depo baru'), { target: { value: 'Depo Baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan depo dan tetapkan ke user' }));
    expect(await screen.findByRole('checkbox', { name: /NEW-DEPOT/ })).toBeChecked();

    fireEvent.change(screen.getByLabelText('Full Name *'), { target: { value: 'User Baru' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'user.baru@example.com' } });
    fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Konfirmasi Password *'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      region_id: 'REG-NEW',
      level: 'staff_logistic',
      kode_depo: 'NEW-DEPOT',
      nama_depo: 'Depo Baru',
      depot_codes: ['NEW-DEPOT'],
    })));
  });

  it('creates a user with only selected depots from the chosen region', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    await screen.findAllByRole('option', { name: /REG-1 · Region Satu/ });
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
