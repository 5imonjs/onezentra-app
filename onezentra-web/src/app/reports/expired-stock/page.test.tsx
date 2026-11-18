import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExpiredStockReportPage from './page';

const { hasPermission, depoList, list, exportReport, getErrorMessage } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
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
  depo: { list: depoList },
  reports: {
    expiredStock: list,
    expiredStockExport: exportReport,
  },
  getErrorMessage,
}));

vi.mock('@/lib/dates', () => ({ todayLocal: () => '2026-11-18' }));

const ledgerRow = {
  id: 1,
  grain: 'ledger',
  qty_sumber: 'mentah',
  row_no: 1,
  cluster: 'Small Cup',
  sku: 'BRG-A',
  satuan: 'CRT',
  kode_barang: 'BOS-001',
  nama_barang: 'Produk A',
  kode_depo: 'DPO',
  nama_depo: 'Depo Test',
  sumber_material: 'PT Sumber',
  tanggal_penerimaan: '2026-11-17',
  tanggal_expired: '2026-12-17',
  sisa_hari: 30,
  sisa_simpan: '0 Thn 1 Bln 0 Hr',
  qty_crt: 10,
  qty_pcs: 240,
  qty_koreksi_crt: null,
  status_kode: 'FUTURE',
  status_tier: null,
  is_expired: false,
  perubahan: null,
  week_start: null,
  principal_1: 'Principal A',
  principal_2: '-',
};

const waveRow = {
  ...ledgerRow,
  id: 9,
  grain: 'wave',
  qty_sumber: 'efektif',
  row_no: null,
  sku: null,
  cluster: null,
  kode_barang: 'BOS-002',
  nama_barang: 'Produk B',
  qty_crt: 8,
  qty_pcs: 192,
  qty_koreksi_crt: -2,
  status_kode: 'KRITIS',
  status_tier: 'KRITIS',
  sisa_hari: 5,
  sisa_simpan: '0 Thn 1 Bln 0 Hr',
  perubahan: 'TETAP',
  week_start: '2026-11-16',
};

function response(grain: 'ledger' | 'wave', data: object[]) {
  return {
    data: {
      data,
      current_page: 1,
      last_page: 1,
      per_page: 25,
      total: data.length,
      summary: { total_item: data.length, total_qty_crt: 10, total_qty_pcs: 240 },
      meta: {
        grain,
        qty_sumber: grain === 'wave' ? 'efektif' : 'mentah',
        status_options: grain === 'wave' ? ['EXPIRED', 'KRITIS', 'PERHATIAN', 'AMAN'] : ['FUTURE', 'EXPIRED'],
        cluster_options: grain === 'wave' ? [] : ['Small Cup'],
      },
    },
  };
}

describe('ExpiredStockReportPage — satu data, dua tahap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    depoList.mockResolvedValue({ data: { data: [] } });
    list.mockImplementation(async (params: Record<string, unknown>) =>
      params.grain === 'wave' ? response('wave', [waveRow]) : response('ledger', [ledgerRow]));
  });

  afterEach(() => {
    cleanup();
  });

  it('tidak memanggil API tanpa izin laporan manapun', async () => {
    hasPermission.mockReturnValue(false);

    render(<ExpiredStockReportPage />);

    expect(await screen.findByText(/tidak memiliki izin/i)).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it('memuat data dasar dengan skema unified dari endpoint yang sama', async () => {
    render(<ExpiredStockReportPage />);

    expect(await screen.findByRole('heading', { name: 'Laporan Stok Kedaluwarsa' })).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ grain: 'ledger' }));
    const table = await screen.findByRole('table', { name: 'Laporan stok kedaluwarsa' });
    expect(within(table).getByText('BRG-A')).toBeInTheDocument();
    expect(within(table).getByText('Berlaku')).toBeInTheDocument();
    expect(within(table).getByText('0 Thn 1 Bln 0 Hr')).toBeInTheDocument();
  });

  it('berpindah ke hasil monitoring memakai endpoint yang sama dengan grain berbeda', async () => {
    render(<ExpiredStockReportPage />);
    await screen.findByRole('table', { name: 'Laporan stok kedaluwarsa' });

    fireEvent.click(screen.getByRole('tab', { name: 'Hasil Monitoring' }));

    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ grain: 'wave' })));
    const table = await screen.findByRole('table', { name: 'Laporan stok kedaluwarsa' });
    await waitFor(() => expect(within(table).getByText('Produk B')).toBeInTheDocument());
    expect(within(table).getByText('Kritis')).toBeInTheDocument();
    expect(within(table).getByText('-2')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Koreksi' })).toBeInTheDocument();
    // Masa Simpan memakai rumus yang sama dengan tab Data Dasar.
    expect(within(table).getByRole('columnheader', { name: 'Masa Simpan' })).toBeInTheDocument();
    expect(within(table).getByText('0 Thn 1 Bln 0 Hr')).toBeInTheDocument();
  });

  it('header tabel tetap saat baris digulir', async () => {
    render(<ExpiredStockReportPage />);
    const table = await screen.findByRole('table', { name: 'Laporan stok kedaluwarsa' });

    expect(table.querySelector('thead')).toHaveClass('sticky', 'top-0');
    expect(table.parentElement).toHaveClass('overflow-auto', 'max-h-[65vh]');
  });
});
