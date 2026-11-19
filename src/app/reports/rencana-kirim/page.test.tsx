import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RencanaKirimReportPage from './page';

const {
  hasPermission,
  depoList,
  list,
  exportReport,
  detail,
  detailExport,
  getErrorMessage,
} = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  depoList: vi.fn(),
  list: vi.fn(),
  exportReport: vi.fn(),
  detail: vi.fn(),
  detailExport: vi.fn(),
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
    rencanaKirim: list,
    rencanaKirimExport: exportReport,
    rencanaKirimDetail: detail,
    rencanaKirimDetailExport: detailExport,
    deleteRows: vi.fn(),
  },
  getErrorMessage,
}));

vi.mock('@/lib/dates', () => ({ todayLocal: () => '2026-11-18' }));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    rkh_date: '2026-11-18',
    po_transporter: 'PO-DETAIL-01',
    driver_name: 'Andi',
    nopol: 'B 1234 ABC',
    expedisi: 'JNE',
    jenis_kendaraan: 'Truck',
    destination_name: 'Singkawang',
    kode_depo: '0126',
    nama_depo: 'Singkawang',
    total_qty: 13,
    total_kubikasi: 0.6,
    item_count: 2,
    item_names: ['Produk Detail', 'Barang Manual'],
    status: 'SCHEDULED',
    ...overrides,
  };
}

const detailRow = {
  ...row(),
  items: [
    {
      id: 11,
      item_number: 1,
      kode_barang: 'SAP-DTL-01',
      nama_barang: 'Produk Detail',
      jumlah: 10,
      satuan: 'CRT',
      kubikasi: 0.6,
      keterangan: 'aman',
      received_qty: 8,
    },
    {
      id: 12,
      item_number: 2,
      kode_barang: 'MANUAL-01',
      nama_barang: 'Barang Manual',
      jumlah: 3,
      satuan: 'PCS',
      kubikasi: null,
      keterangan: null,
      received_qty: null,
    },
  ],
};

async function openDetailDialog() {
  const table = await screen.findByRole('table', { name: 'Laporan rencana kirim' });
  fireEvent.click(within(table).getByRole('button', { name: 'Lihat detail PO-DETAIL-01' }));
  return screen.findByRole('dialog', { name: 'Detail Rencana Kirim' });
}

describe('RencanaKirimReportPage — detail dokumen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    depoList.mockResolvedValue({ data: { data: [] } });
    list.mockResolvedValue({
      data: {
        current_page: 1,
        last_page: 1,
        per_page: 25,
        total: 1,
        data: [row()],
        summary: {
          total: 1,
          total_qty: 13,
          total_kubikasi: 0.6,
          completed_count: 0,
          cancelled_count: 0,
          status_counts: { SCHEDULED: { count: 1, label: 'Dijadwalkan' } },
        },
      },
    });
    detail.mockResolvedValue({ data: { data: detailRow } });
    detailExport.mockResolvedValue({ data: 'xlsx' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('menolak akses tanpa permission dan tidak memanggil API', async () => {
    hasPermission.mockReturnValue(false);

    render(<RencanaKirimReportPage />);

    expect(await screen.findByText(/tidak memiliki izin/i)).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });

  it('menampilkan nama barang di baris tanpa membuka detail', async () => {
    render(<RencanaKirimReportPage />);

    const table = await screen.findByRole('table', { name: 'Laporan rencana kirim' });

    expect(within(table).getByRole('columnheader', { name: 'Barang' })).toBeInTheDocument();
    expect(within(table).getByText(/Produk Detail/)).toBeInTheDocument();
  });

  it('memuat detail dokumen dan menampilkan barang saat tombol Detail diklik', async () => {
    render(<RencanaKirimReportPage />);

    const dialog = await openDetailDialog();

    expect(detail).toHaveBeenCalledWith(7);
    expect(within(dialog).getByText('SAP-DTL-01')).toBeInTheDocument();
    expect(within(dialog).getByText('Produk Detail')).toBeInTheDocument();
    expect(within(dialog).getByText('0.6000')).toBeInTheDocument();
    expect(within(dialog).getByText('8')).toBeInTheDocument();
    expect(within(dialog).getByText('Barang Manual')).toBeInTheDocument();
  });

  it('mengekspor isi dokumen yang sedang dibuka', async () => {
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:detail') });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<RencanaKirimReportPage />);

    const dialog = await openDetailDialog();
    await waitFor(() => expect(within(dialog).getByText('SAP-DTL-01')).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export Excel Detail' }));

    await waitFor(() => expect(detailExport).toHaveBeenCalledWith(7));
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it('menampilkan pesan galat saat detail gagal dimuat', async () => {
    getErrorMessage.mockImplementationOnce(() => 'Rencana kirim tidak ditemukan');
    detail.mockRejectedValueOnce(new Error('404'));
    render(<RencanaKirimReportPage />);

    const dialog = await openDetailDialog();

    expect(await within(dialog).findByText('Rencana kirim tidak ditemukan')).toBeInTheDocument();
  });

  it('mengunci header tabel laporan dan tabel detail saat baris digulir', async () => {
    render(<RencanaKirimReportPage />);

    const reportTable = await screen.findByRole('table', { name: 'Laporan rencana kirim' });
    expect(reportTable.querySelector('thead')).toHaveClass('sticky', 'top-0');
    // Sticky butuh scroll container bertinggi tetap; `overflow-x-auto` saja
    // membuat header ikut naik bersama halaman.
    expect(reportTable.parentElement).toHaveClass('overflow-auto', 'max-h-[65vh]');

    const dialog = await openDetailDialog();
    await waitFor(() => expect(within(dialog).getByText('SAP-DTL-01')).toBeInTheDocument());
    const detailTable = within(dialog).getByRole('table', { name: /Barang dalam rencana kirim/ });
    expect(detailTable.querySelector('thead')).toHaveClass('sticky', 'top-0');
    expect(detailTable.parentElement).toHaveClass('overflow-auto', 'max-h-[420px]');
  });
});
