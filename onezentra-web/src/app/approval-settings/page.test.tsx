import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalSettingsPage from './page';

const { hasPermission, get, save, notifyGlobal } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  get: vi.fn(),
  save: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ user: { kode_depo: '0127' }, hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  approvalAssignments: { get, save },
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

type Approver = { id: number; full_name: string; email: string; level: string; kode_depo: string };

const approver = (id: number, level: string, kode_depo: string, full_name: string): Approver => ({
  id,
  level,
  kode_depo,
  full_name,
  email: `${full_name.replace(/\s+/g, '.').toLowerCase()}@test.com`,
});

const depots = [
  { kode_depo: '0127', nama_depo: 'Singkawang' },
  { kode_depo: '0126', nama_depo: 'Pontianak' },
];

const users: Approver[] = [
  approver(1, 'blc', '0127', 'BLC Singkawang'),
  approver(2, 'blc', '0126', 'BLC Pontianak'),
  approver(3, 'bac', '0127', 'BAC Singkawang'),
  approver(4, 'bac', '0126', 'BAC Pontianak'),
  approver(5, 'rlh', 'RLH-01', 'RLH Pusat'),
  approver(6, 'rfah', 'RFAH-01', 'RFAH Pusat'),
];

const emptyPayload = { data: { data: {}, users: [], depots } };

/** Panggilan bootstrap (tanpa kode_depo) mengembalikan daftar depo saja;
 *  panggilan untuk depo aktif mengembalikan users + penetapan tersimpan. */
const getImplementation =
  (data: Record<string, { user: Approver }> = {}) =>
  (kodeDepo?: string) =>
    Promise.resolve(kodeDepo === '0127' ? { data: { data, users, depots } } : emptyPayload);

const optionsOf = (select: HTMLElement): string[] =>
  Array.from(select.querySelectorAll('option')).map((option) => option.textContent ?? '');

/** Tunggu sampai render final (bukan transisi antar-load) selesai. */
const waitForLoaded = async (): Promise<HTMLElement[]> => {
  await waitFor(() => {
    const combos = screen.getAllByRole('combobox');
    expect(combos).toHaveLength(5);
    expect(optionsOf(combos[1]).join('|')).toContain('BLC Singkawang');
  });

  return screen.getAllByRole('combobox');
};

describe('ApprovalSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    get.mockImplementation(getImplementation());
    save.mockResolvedValue({ data: { data: {} } });
  });

  afterEach(() => {
    cleanup();
  });

  it('memuat data walau daftar depo belum ada (tidak deadlock)', async () => {
    render(<ApprovalSettingsPage />);

    // Regresi: sebelumnya load() menunggu effectiveDepot, sedangkan daftar
    // depo hanya datang dari respons load() — fetch tak pernah jalan.
    await waitFor(() => expect(get).toHaveBeenCalled());

    expect(await screen.findByRole('combobox', { name: /Depo BLC\/BAC/i })).toBeInTheDocument();
    expect(optionsOf(screen.getAllByRole('combobox')[0])).toEqual(
      expect.arrayContaining([expect.stringContaining('Singkawang')]),
    );
  });

  it('membatasi opsi BLC/BAC ke depo terpilih tetapi RLH/RFAH lintas depo', async () => {
    render(<ApprovalSettingsPage />);

    const combos = await waitForLoaded();
    // combos[0] = depo, lalu BLC, BAC, RLH, RFAH.
    const blc = optionsOf(combos[1]);
    const rlh = optionsOf(combos[3]);

    expect(blc).toEqual(expect.arrayContaining([expect.stringContaining('BLC Singkawang')]));
    expect(blc).not.toEqual(expect.arrayContaining([expect.stringContaining('BLC Pontianak')]));
    expect(rlh).toEqual(expect.arrayContaining([expect.stringContaining('RLH Pusat')]));
  });

  it('menyimpan BLC/BAC ke depo aktif dan RLH/RFAH ke ADMIN', async () => {
    render(<ApprovalSettingsPage />);
    const combos = await waitForLoaded();

    fireEvent.change(combos[0], { target: { value: '0127' } });
    fireEvent.change(combos[1], { target: { value: '1' } });
    fireEvent.change(combos[2], { target: { value: '3' } });
    fireEvent.change(combos[3], { target: { value: '5' } });
    fireEvent.change(combos[4], { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenNthCalledWith(1, {
      kode_depo: '0127',
      module: 'biaya_thl',
      assignments: [
        { approval_level: 'BLC', user_id: 1 },
        { approval_level: 'BAC', user_id: 3 },
      ],
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      kode_depo: 'ADMIN',
      module: 'biaya_thl',
      assignments: [
        { approval_level: 'RLH', user_id: 5 },
        { approval_level: 'RFAH', user_id: 6 },
      ],
    });
  });

  it('menolak simpan bila approver belum lengkap', async () => {
    render(<ApprovalSettingsPage />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Simpan Pengaturan/i }));

    await waitFor(() => expect(notifyGlobal).toHaveBeenCalledWith('Pilih approver untuk semua tahap', 'error'));
    expect(save).not.toHaveBeenCalled();
  });

  it('memberi peringatan saat penetapan tersimpan menunjuk user tak valid', async () => {
    get.mockImplementation(getImplementation({ BLC: { user: approver(99, 'blc', '0126', 'BLC Lama') } }));

    render(<ApprovalSettingsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/BLC/);
  });

  it('menonaktifkan kontrol tanpa permission approval.manage', async () => {
    hasPermission.mockReturnValue(false);

    render(<ApprovalSettingsPage />);
    const combos = await waitForLoaded();

    expect(screen.getByRole('button', { name: /Simpan Pengaturan/i })).toBeDisabled();
    combos.forEach((select) => expect(select).toBeDisabled());
  });
});
