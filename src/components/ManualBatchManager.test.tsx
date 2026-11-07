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

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission: () => true,
    user: authUser,
  }),
}));

describe('ManualBatchManager — stok manual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.manualItems.mockResolvedValue({ data: { data: [], total: 0 } });
    api.pending.mockResolvedValue({
      data: { data: { pending: { total: 0, sj: 0, import: 0, legacy: 0 }, week_start: '2026-11-02' } },
    });
  });

  afterEach(cleanup);

  it('memakai istilah stok manual dan tidak lagi memuat alur data awal', async () => {
    const { container } = render(<ManualBatchManager />);

    fireEvent.click(screen.getByRole('button', { name: /Tambah Stok Manual/i }));

    expect(await screen.findByText(/Stok tambahan yang tidak berasal dari SJ\/Receiving/)).toBeTruthy();
    expect(screen.queryByText(/Import Baseline Legacy/)).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('menampilkan status sinkron setelah import stok manual', async () => {
    api.manualImport.mockResolvedValue({
      data: { imported: 2, skipped: 0, duplicates: 0, opname_synced: true },
    });
    const onChanged = vi.fn();
    const { container } = render(<ManualBatchManager onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: /Tambah Stok Manual/i }));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'stok.csv', { type: 'text/csv' })] },
    });

    await waitFor(() => {
      expect(api.manualImport).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/Import stok manual selesai: 2 baris masuk/)).toBeTruthy();
    expect(screen.getByText(/Baris monitoring sudah disinkronkan/)).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });
});
