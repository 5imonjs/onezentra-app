import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PenerimaanBatchExpiredReportPage from './page';

const { hasPermission, depoList, list, exportReport, getErrorMessage } = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
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
    penerimaanBatchExpired: list,
    penerimaanBatchExpiredExport: exportReport,
  },
  getErrorMessage,
}));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    no: 1,
    cluster: 'Small Cup',
    kode_barang: 'BRG-A',
    nama_barang: 'Produk A',
    qty_dus_ball: 10,
    qty_pcs: 240,
    satuan: 'CRT',
    tanggal_expired: '2026-12-01',
    tanggal_penerimaan: '2026-09-01',
    weekday: 'Future',
    sisa_simpan: '0 Thn 3 Bln 0 Hr',
    sisa_hari: 57,
    is_expired: false,
    kode_depo: '0127',
    nama_depo: 'Singkawang',
    sumber_material: 'PT Sumber',
    ...overrides,
  };
}

const summary = {
  total_item: 2,
  total_qty_dus: 40,
  total_qty_pcs: 480,
  total_cluster: 1,
  item_expired: 1,
  item_future: 1,
  item_tanpa_expired: 0,
};

describe('PenerimaanBatchExpiredReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    depoList.mockResolvedValue({ data: { data: [] } });
    list.mockResolvedValue({
      data: {
        current_page: 1,
        last_page: 1,
        per_page: 25,
        total: 2,
        data: [
          row(),
          row({
            id: 2,
            no: 2,
            kode_barang: 'BRG-B',
            nama_barang: 'Produk B',
            weekday: 'Past',
            is_expired: true,
            tanggal_expired: '2026-09-01',
            sisa_hari: -34,
            sisa_simpan: '0 Thn 0 Bln 0 Hr',
          }),
        ],
        summary,
        cluster_options: ['Small Cup', 'Big Cup'],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('menolak akses tanpa permission reports.view dan tidak memanggil API', async () => {
    hasPermission.mockReturnValue(false);

    render(<PenerimaanBatchExpiredReportPage />);

    expect(await screen.findByText(/tidak memiliki izin/i)).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it('menampilkan kolom format standar: produk, dus/ball, pcs, tanggal, weekday, sisa simpan', async () => {
    render(<PenerimaanBatchExpiredReportPage />);

    // Tabel desktop & kartu mobile sama-sama dirender (satu disembunyikan
    // lewat CSS), jadi kueri dibatasi ke tabel agar tidak ambigu.
    const table = await screen.findByRole('table');

    expect(within(table).getByText('BRG-A')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Dus/Ball' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'PCS' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Weekday' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Sisa Simpan' })).toBeInTheDocument();

    // Future/Past dan "umur" tampil di layar, bukan hanya di file Excel.
    expect(within(table).getByText('Future')).toBeInTheDocument();
    expect(within(table).getByText('Past')).toBeInTheDocument();
    expect(within(table).getByText('0 Thn 3 Bln 0 Hr')).toBeInTheDocument();
    // Tanggal expired yang lewat ditandai "lewat N hari".
    expect(within(table).getByText('lewat 34 hari')).toBeInTheDocument();
  });

  it('menampilkan ringkasan dari seluruh baris terfilter', async () => {
    render(<PenerimaanBatchExpiredReportPage />);

    const totalLabel = await screen.findByText('Total Penerimaan');
    const totalCard = totalLabel.parentElement as HTMLElement;
    expect(totalCard).toHaveTextContent('2');
    expect(totalCard).toHaveTextContent('1 cluster');

    const expiredCard = screen.getByText('Sudah Expired').parentElement as HTMLElement;
    expect(expiredCard).toHaveTextContent('1');
  });

  it('mengirim filter status ke backend saat dipilih', async () => {
    render(<PenerimaanBatchExpiredReportPage />);

    const select = (await screen.findByLabelText('Status Expired')) as HTMLSelectElement;
    select.value = 'EXPIRED';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' })
      );
    });
  });
});