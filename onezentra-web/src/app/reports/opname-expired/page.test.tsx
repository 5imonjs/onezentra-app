import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpnameExpiredReportPage from './page';

const { hasPermission, depoList, list, exportReport, getErrorMessage } = vi.hoisted(() => ({
  hasPermission: vi.fn((_slug: string) => true),
  depoList: vi.fn(),
  list: vi.fn(),
  exportReport: vi.fn(),
  getErrorMessage: vi.fn((_e: unknown, fallback: string) => fallback),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  opnameExpired: { list, export: exportReport },
  depo: { list: depoList },
  getErrorMessage,
}));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    kode_depo: 'DPO',
    nama_depo: 'Depo Test',
    kode_barang: 'BRG-A',
    nama_barang: 'Produk A',
    sumber_material: 'PT Sumber',
    tanggal_penerimaan: '2026-09-01',
    qty_ini_crt: 10,
    qty_ini_pcs: 240,
    qty_lalu_crt: 0,
    qty_lalu_pcs: 0,
    expired_date_ini: '2026-12-01',
    expired_date_lalu: null,
    sisa_hari: 57,
    status_ini: 'AMAN',
    status_lalu: null,
    perubahan: 'BARU',
    selisih_expired_date: null,
    qty_koreksi_crt: 0,
    qty_koreksi_pcs: 0,
    ...overrides,
  };
}

describe('OpnameExpiredReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    depoList.mockResolvedValue({ data: { data: [] } });
    list.mockResolvedValue({
      data: {
        data: { data: [row()], current_page: 1, last_page: 1, total: 1, from: 1, to: 1 },
        meta: {
          weeks: ['2026-09-07'],
          status_summary: { AMAN: { count: 1, qty_crt: 10 } },
          depot_summary: [],
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('menolak akses saat punya reports.view tapi tidak opname.view dan tidak memanggil API', async () => {
    // Endpoint laporan ini milik modul opname (`opname.view`); izin laporan saja
    // tidak cukup — tanpa keduanya halaman akan memuat lalu kena 403.
    hasPermission.mockImplementation((slug: string) => slug === 'reports.view');

    render(<OpnameExpiredReportPage />);

    expect(await screen.findByText(/tidak memiliki izin/i)).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it('menampilkan laporan saat punya reports.view dan opname.view', async () => {
    render(<OpnameExpiredReportPage />);

    expect(await screen.findByRole('heading', { name: /monitoring batch expired/i })).toBeInTheDocument();
    expect(list).toHaveBeenCalled();
  });
});
