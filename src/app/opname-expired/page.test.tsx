import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpnameExpiredPage from './page';

const { hasPermission, list, pending, progress, baselineManifests, getErrorMessage, notifyGlobal } = vi.hoisted(() => ({
  hasPermission: vi.fn((_slug: string) => true),
  list: vi.fn(),
  pending: vi.fn(),
  progress: vi.fn(),
  baselineManifests: vi.fn(),
  getErrorMessage: vi.fn((_e: unknown, fallback: string) => fallback),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission,
    user: { kode_depo: 'DPO', nama_depo: 'Depo Test' },
  }),
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/components/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ConfirmDialog', () => ({ default: () => null }));

vi.mock('@/components/ManualBatchManager', () => ({ default: () => null }));

vi.mock('@/components/BaselineImportManager', () => ({ default: () => null }));

vi.mock('@/lib/api', () => ({
  opnameExpired: {
    list,
    pending,
    progress,
    baselineManifests,
    generate: vi.fn(),
    export: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    delete: vi.fn(),
    remind: vi.fn(),
  },
  getErrorMessage,
}));

describe('OpnameExpiredPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);

    list.mockResolvedValue({
      data: {
        data: { data: [], current_page: 1, last_page: 1, per_page: 25, total: 0 },
        meta: {
          weeks: ['2026-09-07'],
          thresholds: {},
          status_summary: {},
          prev_week_start: null,
          prev_status_summary: {},
          depot_summary: [],
        },
      },
    });
    pending.mockResolvedValue({
      data: {
        data: {
          week_start: '2026-09-07',
          week_end: '2026-09-13',
          wave_exists: false,
          eligible: { total: 3, sj: 1, import: 2 },
          pending: { total: 3, sj: 1, import: 2 },
        },
      },
    });
    progress.mockResolvedValue({ data: { data: { depots: [] } } });
    baselineManifests.mockResolvedValue({
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
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan judul Opname Expired dan alur data end-to-end', async () => {
    render(<OpnameExpiredPage />);

    expect(await screen.findByRole('heading', { name: 'Opname Expired' })).toBeInTheDocument();
    const flow = screen.getByLabelText('Alur opname expired');
    expect(flow).toHaveTextContent('1. Data Awal');
    expect(flow).toHaveTextContent('2. Hitung Fisik');
    expect(flow).toHaveTextContent('3. Selesai');
  });

  it('menyembunyikan Generate & Threshold tanpa izin opname.create/opname.edit', async () => {
    // Role seperti "viewer" hanya punya opname.view: dulu tombol ini tampil dan
    // klik-nya berujung 403. Sekarang tidak dirender sama sekali.
    hasPermission.mockImplementation((slug: string) => slug === 'opname.view');

    render(<OpnameExpiredPage />);

    expect(await screen.findByText('Perlu Ditindak')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Threshold/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/belum di-generate/)).not.toBeInTheDocument();
  });

  it('menampilkan langkah berikutnya dan aksi sekunder saat izin lengkap', async () => {
    render(<OpnameExpiredPage />);

    expect(await screen.findByText(/baris baru belum masuk analisa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate sekarang' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lainnya' }));

    expect(screen.getByRole('menuitem', { name: /Import Data Awal/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Tambah Stok Manual/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Pengaturan threshold/ })).toBeInTheDocument();
  });

  it('memprioritaskan pemasangan data awal saat baseline depo belum ada', async () => {
    baselineManifests.mockResolvedValue({ data: { data: [] } });

    render(<OpnameExpiredPage />);

    expect(await screen.findByText('Data awal belum dipasang')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import Data Awal' })).toBeInTheDocument();
    expect(screen.queryByText(/baris baru belum masuk analisa/)).not.toBeInTheDocument();
  });

  it('mengganti picker minggu dengan dua input rentang tanggal manual', async () => {
    const { container } = render(<OpnameExpiredPage />);

    expect(container.querySelector('#week-start')).not.toBeInTheDocument();
    const fromInput = container.querySelector('#oe-from') as HTMLInputElement;
    const toInput = container.querySelector('#oe-to') as HTMLInputElement;
    expect(fromInput).toBeInTheDocument();
    expect(toInput).toBeInTheDocument();

    fireEvent.change(fromInput, { target: { value: '2026-11-05' } });
    fireEvent.change(toInput, { target: { value: '2026-11-07' } });

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ date_from: '2026-11-05', date_to: '2026-11-07' }),
      );
    });
  });
});
