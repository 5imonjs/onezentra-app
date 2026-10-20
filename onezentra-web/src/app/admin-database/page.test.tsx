import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDatabasePage from './page';

const { hasPermission, summary, purge, notifyGlobal } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  summary: vi.fn(),
  purge: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ user: { kode_depo: '0127' }, hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  adminDatabase: { summary, purge },
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

const depots = [
  { kode_depo: '0127', nama_depo: 'Singkawang' },
  { kode_depo: '0126', nama_depo: 'Pontianak' },
];

const countsFor = (kodeDepo?: string): Record<string, number> => ({
  rencana_kirim: kodeDepo === '0126' ? 4 : 2,
  gate: 1,
  'validasi-sj': 1,
  receiving: 1,
  penerimaan: 0,
  'opname-session': 0,
  'opname-wave': 3,
  standarisasi: 0,
  'biaya-thl': 0,
  'biaya-retribusi': 0,
});

const summaryImplementation = (kodeDepo?: string) => Promise.resolve({
  data: {
    data: countsFor(kodeDepo),
    depots,
    kode_depo: kodeDepo ?? '0127',
  },
});

const depotSelect = (): HTMLSelectElement =>
  screen.getByLabelText('Depo yang direset') as HTMLSelectElement;

describe('AdminDatabasePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    summary.mockImplementation(summaryImplementation);
    purge.mockResolvedValue({ data: { message: 'Data modul terpilih berhasil dikosongkan.', data: { counts: { rencana_kirim: 2 } } } });
  });

  afterEach(() => {
    cleanup();
  });

  it('memuat daftar depo dan ringkasan modul untuk depo default', async () => {
    render(<AdminDatabasePage />);

    await waitFor(() => expect(summary).toHaveBeenCalled());
    expect(await screen.findByText('Reset Data Operasional')).toBeInTheDocument();
    expect(depotSelect().value).toBe('0127');
    expect(screen.getByText(/Hanya data Singkawang/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
    expect(screen.getByText('2 baris')).toBeInTheDocument();
  });

  it('mengganti depo memuat ulang ringkasan depo tersebut', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    fireEvent.change(depotSelect(), { target: { value: '0126' } });

    await waitFor(() => expect(summary).toHaveBeenCalledWith('0126'));
    expect(await screen.findByText('4 baris')).toBeInTheDocument();
    expect(screen.getByText(/Hanya data Pontianak/)).toBeInTheDocument();
  });

  it('dry-run menampilkan pratinjau hanya untuk depo terpilih', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Pratinjau' }));

    await waitFor(() => expect(purge).toHaveBeenCalledWith({
      modules: ['rencana_kirim'],
      kode_depo: '0127',
      confirm: 'HAPUS',
      dry_run: true,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('rencana_kirim: 2');
  });

  it('eksekusi mengirim kode_depo dan konfirmasi HAPUS', async () => {
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByLabelText('Konfirmasi ketik HAPUS'), { target: { value: 'HAPUS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kosongkan Singkawang' }));

    await waitFor(() => expect(purge).toHaveBeenCalledWith({
      modules: ['rencana_kirim'],
      kode_depo: '0127',
      confirm: 'HAPUS',
      dry_run: false,
    }));
    expect(notifyGlobal).toHaveBeenCalledWith('Data modul terpilih berhasil dikosongkan.', 'success');
  });

  it('menonaktifkan eksekusi bila belum ada depo aktif', async () => {
    summary.mockResolvedValue({ data: { data: {}, depots: [], kode_depo: null } });
    render(<AdminDatabasePage />);
    await waitFor(() => expect(summary).toHaveBeenCalled());

    expect(screen.getByText('Belum ada depo aktif')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByLabelText('Konfirmasi ketik HAPUS'), { target: { value: 'HAPUS' } });

    expect(screen.getByRole('button', { name: 'Kosongkan Depo' })).toBeDisabled();
    expect(purge).not.toHaveBeenCalled();
  });

  it('tanpa permission database.purge tidak memanggil API', async () => {
    hasPermission.mockReturnValue(false);
    render(<AdminDatabasePage />);

    expect(await screen.findByText('Hanya akun level admin master yang boleh membuka halaman ini.')).toBeInTheDocument();
    expect(summary).not.toHaveBeenCalled();
  });
});
