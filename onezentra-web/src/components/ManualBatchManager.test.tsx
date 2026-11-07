import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ManualBatchManager from './ManualBatchManager';

const { api, notifyGlobal, authUser } = vi.hoisted(() => ({
  notifyGlobal: vi.fn(),
  authUser: { kode_depo: 'DPO', nama_depo: 'Depo Test' },
  api: {
    manualItems: vi.fn(() => Promise.resolve({ data: { data: [], total: 0 } })),
    pending: vi.fn(() => Promise.resolve({
      data: { data: { pending: { total: 0, sj: 0, import: 0, legacy: 0 }, week_start: '2026-11-02' } },
    })),
    baselineManifests: vi.fn(() => Promise.resolve({
      data: {
        data: [{
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
        }],
      },
    })),
    baselineUpdate: vi.fn(() => Promise.resolve({
      data: { message: 'Tanggal posisi baseline diperbarui dari 2026-09-01 ke 2026-09-06.', opname_synced: true },
    })),
    manualTemplate: vi.fn(),
    manualImport: vi.fn(),
    manualCreate: vi.fn(),
    manualDelete: vi.fn(),
    manualBulkDelete: vi.fn(),
    generate: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  opnameExpired: api,
  npn: { searchProduct: vi.fn(() => Promise.resolve({ data: { data: [] } })) },
  getErrorMessage: (_error: unknown, fallback?: string) => fallback ?? 'error',
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('next/image', () => ({ default: () => <span data-testid="next-image" /> }));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission: () => true,
    user: authUser,
  }),
}));

describe('ManualBatchManager — koreksi baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('menampilkan baseline terpasang dan mengirim koreksi tanggal', async () => {
    render(<ManualBatchManager />);

    fireEvent.click(screen.getByRole('button', { name: /Batch Manual/i }));

    expect(await screen.findByText('Baseline terpasang')).toBeTruthy();

    const dateInput = screen.getByLabelText('Koreksi tanggal posisi baseline') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-06' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan koreksi/i }));

    await waitFor(() => {
      expect(api.baselineUpdate).toHaveBeenCalledWith(7, { baseline_date: '2026-09-06' });
    });
    expect(await screen.findByText(/Opname sudah disinkronkan/)).toBeTruthy();
  });

  it('menonaktifkan koreksi saat sesi opname masih terbuka', async () => {
    api.baselineManifests.mockResolvedValueOnce({
      data: {
        data: [{
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
          has_open_session: true,
          has_finalized_current_week: false,
        }],
      },
    });

    render(<ManualBatchManager />);
    fireEvent.click(screen.getByRole('button', { name: /Batch Manual/i }));

    expect(await screen.findByText(/Sesi opname depo ini masih terbuka/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Simpan koreksi/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('menonaktifkan koreksi saat sesi minggu ini sudah final', async () => {
    api.baselineManifests.mockResolvedValueOnce({
      data: {
        data: [{
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
          has_finalized_current_week: true,
        }],
      },
    });

    render(<ManualBatchManager />);
    fireEvent.click(screen.getByRole('button', { name: /Batch Manual/i }));

    expect(await screen.findByText(/Sesi opname minggu ini sudah final/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Simpan koreksi/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
