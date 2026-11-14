import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BaselineImportManager from './BaselineImportManager';

const { api, notifyGlobal, authUser, hasPermission } = vi.hoisted(() => ({
  notifyGlobal: vi.fn(),
  authUser: { kode_depo: 'DPO', nama_depo: 'Depo Test' },
  hasPermission: vi.fn((_slug: string): boolean => true),
  api: {
    baselineManifests: vi.fn(),
    baselineTemplate: vi.fn(),
    baselineUpdate: vi.fn(() => Promise.resolve({
      data: { message: 'Tanggal posisi data awal diperbarui dari 2026-09-01 ke 2026-09-06.', opname_synced: true },
    })),
    baselineImport: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  opnameExpired: api,
  getErrorMessage: (_error: unknown, fallback?: string) => fallback ?? 'error',
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission,
    user: authUser,
  }),
}));

function baseline(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    kode_depo: 'DPO',
    nama_depo: 'Depo Test',
    baseline_date: '2026-09-01',
    imported_at: '2026-09-05T09:00:00+00:00',
    file_name: 'baseline.xlsx',
    row_count: 12,
    items_count: 12,
    total_qty_crt: 120,
    total_qty_pcs: 1200,
    notes: null,
    imported_by: 'Admin Gudang',
    has_open_session: false,
    has_finalized_current_week: false,
    ...overrides,
  };
}

describe('BaselineImportManager — koreksi saldo awal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockImplementation((_slug: string): boolean => true);
    api.baselineManifests.mockResolvedValue({ data: { data: [baseline()] } });
  });

  afterEach(cleanup);

  it('menampilkan form import saat saldo awal belum terpasang', async () => {
    api.baselineManifests.mockResolvedValueOnce({ data: { data: [] } });

    render(<BaselineImportManager open onClose={vi.fn()} />);

    expect(await screen.findByText('Saldo awal = saldo pembuka sebelum sistem ini.')).toBeTruthy();
    expect(screen.getByLabelText('Kode Depo *')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Import Saldo Awal/i })).toBeDisabled();
    expect(screen.getByText(/Belum ada saldo awal terpasang/)).toBeTruthy();
  });

  it('menyembunyikan form import saat role tidak punya izin pasang saldo awal', async () => {
    api.baselineManifests.mockResolvedValueOnce({ data: { data: [] } });
    hasPermission.mockImplementation((slug: string): boolean => slug !== 'penerimaan.baseline');

    render(<BaselineImportManager open onClose={vi.fn()} />);

    expect(await screen.findByText('Saldo awal belum terpasang')).toBeTruthy();
    expect(screen.getByText(/Penerimaan Pasang Saldo Awal/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Import Saldo Awal/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Kode Depo *')).not.toBeInTheDocument();
  });

  it('mengunduh template acuan saldo awal', async () => {
    api.baselineManifests.mockResolvedValueOnce({ data: { data: [] } });
    api.baselineTemplate.mockResolvedValue({ data: new Blob(['x']) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:template') });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    render(<BaselineImportManager open onClose={vi.fn()} />);

    expect(await screen.findByText('Saldo awal = saldo pembuka sebelum sistem ini.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Template$/i }));

    await waitFor(() => {
      expect(api.baselineTemplate).toHaveBeenCalledTimes(1);
    });
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('menampilkan saldo awal terpasang dan mengirim koreksi tanggal', async () => {
    render(<BaselineImportManager open onClose={vi.fn()} />);

    expect(await screen.findByText('Saldo awal terpasang')).toBeTruthy();

    const dateInput = screen.getByLabelText('Tanggal saldo baru') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-06' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan koreksi/i }));

    await waitFor(() => {
      expect(api.baselineUpdate).toHaveBeenCalledWith(7, { baseline_date: '2026-09-06' });
    });
    expect(await screen.findByText(/Baris monitoring sudah disinkronkan/)).toBeTruthy();
  });

  it('menonaktifkan koreksi saat sesi opname masih terbuka', async () => {
    api.baselineManifests.mockResolvedValueOnce({
      data: { data: [baseline({ has_open_session: true })] },
    });

    render(<BaselineImportManager open onClose={vi.fn()} />);

    expect(await screen.findByText(/Stock Opname depo ini masih terbuka/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Simpan koreksi/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('menonaktifkan koreksi saat sesi minggu ini sudah final', async () => {
    api.baselineManifests.mockResolvedValueOnce({
      data: { data: [baseline({ has_finalized_current_week: true })] },
    });

    render(<BaselineImportManager open onClose={vi.fn()} />);

    expect(await screen.findByText(/Stock Opname minggu ini sudah final/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Simpan koreksi/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
