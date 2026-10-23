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
  partnerSiteList,
  partnerSiteCreate,
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
  partnerSiteList: vi.fn(),
  partnerSiteCreate: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission,
    user: { id: 7, level: 'admin_master', scope_level: 'master', region_id: null, kode_depo: 'ADMIN', nama_depo: 'Master' },
  }),
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/lib/api', () => ({
  users: { list, roleOptions, create, update, delete: remove, getDepots, syncDepots },
  depotSettings: { list: depotList, create: depotCreate, upsert: depotUpsert },
  regions: { list: regionList, create: regionCreate, update: regionUpdate },
  partnerSites: { list: partnerSiteList, create: partnerSiteCreate },
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
  scope_level: 'depot' as const,
  kode_ps: null,
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
    partnerSiteList.mockResolvedValue({ data: { data: [] } });
    partnerSiteCreate.mockImplementation(async (data: { kode_ps: string; nama_ps: string; kode_depo: string }) => ({ data: { data } }));
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

  it('shows a load error instead of making a failed user list look empty', async () => {
    list.mockRejectedValue(new Error('network failure'));
    render(<UsersPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat data pengguna.');
  });

  it('wraps password inputs in forms and submits the current password for self-service changes', async () => {
    list.mockResolvedValue(listResponse([{ ...user, id: 7 }]));
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    const createPassword = await screen.findByLabelText('Password *');
    expect(createPassword.closest('form')).toHaveAttribute('id', 'create-user-form');
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);
    const newPassword = await screen.findByLabelText('Password (kosongkan jika tidak diubah)');
    expect(newPassword.closest('form')).toHaveAttribute('id', 'edit-user-form');
    fireEvent.change(newPassword, { target: { value: 'password-baru-123' } });
    fireEvent.change(screen.getByLabelText('Konfirmasi Password'), { target: { value: 'password-baru-123' } });
    fireEvent.change(await screen.findByLabelText('Password saat ini'), { target: { value: 'password-lama-123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(7, expect.objectContaining({
      password: 'password-baru-123',
      password_confirmation: 'password-baru-123',
      current_password: 'password-lama-123',
    })));
  });

  it('explains hierarchy scope, a single depot, and active roles in the import dialog', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByText(/scope_level, region_id, kode_depo, kode_ps, level, status/)).toBeInTheDocument();
    expect(screen.getByText(/tepat satu depo/)).toBeInTheDocument();
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
    expect(await screen.findByRole('radio', { name: /R1-NEW/ })).toBeChecked();
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
    expect(await screen.findByRole('radio', { name: /NEW-DEPOT/ })).toBeChecked();

    fireEvent.change(screen.getByLabelText('Full Name *'), { target: { value: 'User Baru' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'user.baru@example.com' } });
    fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Konfirmasi Password *'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      region_id: 'REG-NEW',
      scope_level: 'depot',
      level: 'staff_logistic',
      kode_depo: 'NEW-DEPOT',
      nama_depo: 'Depo Baru',
      depot_codes: ['NEW-DEPOT'],
    })));
  });

  it('requires a PS under the selected depot for a Partner Site-scoped account', async () => {
    partnerSiteList.mockResolvedValue({
      data: { data: [{ kode_ps: 'PS-01', nama_ps: 'Partner Satu', kode_depo: 'D-01', is_active: true }] },
    });
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(await screen.findByLabelText('Scope hierarki *'), { target: { value: 'ps' } });
    fireEvent.change(screen.getByLabelText('Region User'), { target: { value: 'REG-1' } });
    fireEvent.click(await screen.findByRole('radio', { name: /D-01/ }));
    fireEvent.change(await screen.findByLabelText('Partner Site *'), { target: { value: 'PS-01' } });
    fireEvent.change(screen.getByLabelText('Full Name *'), { target: { value: 'User PS' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'user.ps@example.com' } });
    fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Konfirmasi Password *'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      scope_level: 'ps',
      region_id: 'REG-1',
      kode_depo: 'D-01',
      kode_ps: 'PS-01',
      depot_codes: ['D-01'],
    })));
  });

  it('creates a Partner Site linked to the selected depot', async () => {
    render(<UsersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(await screen.findByLabelText('Scope hierarki *'), { target: { value: 'ps' } });
    fireEvent.change(await screen.findByLabelText('Region User'), { target: { value: 'REG-1' } });
    fireEvent.click(await screen.findByRole('radio', { name: /D-01/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Buat Partner Site' }));
    fireEvent.change(screen.getByLabelText('Kode PS baru'), { target: { value: 'PS-NEW' } });
    fireEvent.change(screen.getByLabelText('Nama PS baru'), { target: { value: 'Partner Baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Partner Site' }));

    await waitFor(() => expect(partnerSiteCreate).toHaveBeenCalledWith({
      kode_ps: 'PS-NEW',
      nama_ps: 'Partner Baru',
      kode_depo: 'D-01',
    }));
    expect(await screen.findByLabelText('Partner Site *')).toHaveValue('PS-NEW');
  });

  it('creates a user with only selected depots from the chosen region', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    await screen.findAllByRole('option', { name: /REG-1 · Region Satu/ });
    expect(screen.getByText('1. Akun User')).toBeInTheDocument();
    expect(screen.getByText('2. Scope & Hierarki')).toBeInTheDocument();
    expect(screen.getByText('3. Hak Tindakan User')).toBeInTheDocument();
    expect(screen.getByText('Role menentukan menu dan tindakan yang boleh dilakukan. Role tidak memilih depo user.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Region User'), { target: { value: 'REG-1' } });

    expect(await screen.findByRole('radio', { name: /D-01/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /D-02/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /D-03/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /D-02/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button')!);

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      region_id: 'REG-1',
      kode_depo: 'D-02',
      nama_depo: 'Depo Dua',
      depot_codes: ['D-02'],
    })));
    expect(syncDepots).not.toHaveBeenCalled();
  });

  it('separates hierarchy scope from a role with cross-depot operational access', async () => {
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(await screen.findByLabelText('Role / Peran *'), { target: { value: 'auditor_global' } });

    expect(screen.getAllByRole('option', { name: 'Supervisor Regional' })).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Role ini memberi akses data operasional lintas depo');
    expect(screen.getByRole('alert')).toHaveTextContent('tidak memperluas hak kelola entitas');
    expect(screen.getByLabelText('Ringkasan akses user baru')).toHaveTextContent('Scope hierarki: Depo');
    expect(screen.getByLabelText('Ringkasan akses user baru')).toHaveTextContent('Role operasional: Auditor Global · Akses data: Lintas depo');
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
    expect(await screen.findByRole('radio', { name: /D-01/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /D-03/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '1. Profil & Role' }));
    fireEvent.change(screen.getByLabelText('Region akun'), { target: { value: 'REG-2' } });
    expect(screen.getByRole('status')).toHaveTextContent('Region berubah. Assignment depo lama sudah dikosongkan');
    fireEvent.click(screen.getByRole('tab', { name: '2. Cakupan Depo' }));
    fireEvent.click(await screen.findByRole('radio', { name: /D-03/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button')!);

    await waitFor(() => expect(update).toHaveBeenCalledWith(11, expect.objectContaining({
      region_id: 'REG-2',
      depot_codes: ['D-03'],
    })));
    expect(update.mock.calls[0][1]).toHaveProperty('kode_depo', 'D-03');
    expect(update.mock.calls[0][1]).toHaveProperty('nama_depo', 'Depo Tiga');
    expect(update.mock.calls[0][1]).not.toHaveProperty('password');
    expect(update.mock.calls[0][1]).not.toHaveProperty('password_confirmation');
    expect(update.mock.calls[0][1]).not.toHaveProperty('current_password');
    expect(syncDepots).not.toHaveBeenCalled();
  });

  it('does not submit a user edit until a depot is selected after changing region', async () => {
    list.mockResolvedValue(listResponse([user]));
    const { container } = render(<UsersPage />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);
    await waitFor(() => expect(getDepots).toHaveBeenCalledWith(user.id));

    fireEvent.click(await screen.findByRole('tab', { name: '1. Profil & Role' }));
    fireEvent.change(screen.getByLabelText('Region akun'), { target: { value: 'REG-2' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Pilih tepat satu depo aktif');
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled();

    fireEvent.submit(container.querySelector('#edit-user-form')!);

    expect(update).not.toHaveBeenCalled();
    expect(notifyGlobal).toHaveBeenCalledWith('Pilih tepat satu depo aktif sebelum menyimpan perubahan user.');
  });
});
