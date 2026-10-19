import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpnameExpiredPage from './page';

const { hasPermission, list, pending, progress, getErrorMessage, notifyGlobal } = vi.hoisted(() => ({
  hasPermission: vi.fn((_slug: string) => true),
  list: vi.fn(),
  pending: vi.fn(),
  progress: vi.fn(),
  getErrorMessage: vi.fn((_e: unknown, fallback: string) => fallback),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/components/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ConfirmDialog', () => ({ default: () => null }));

vi.mock('@/components/ManualBatchManager', () => ({ default: () => null }));

vi.mock('@/lib/api', () => ({
  opnameExpired: {
    list,
    pending,
    progress,
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
  });

  afterEach(() => {
    cleanup();
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

  it('menampilkan Generate & Threshold saat izin lengkap', async () => {
    render(<OpnameExpiredPage />);

    expect(await screen.findByText(/belum di-generate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Threshold/ })).toBeInTheDocument();
  });
});
