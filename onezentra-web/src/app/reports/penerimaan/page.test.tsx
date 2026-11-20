import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PenerimaanReportPage from './page';

const { hasPermission, depoList, list, getErrorMessage } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  depoList: vi.fn(),
  list: vi.fn(),
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
    penerimaan: list,
    penerimaanExport: vi.fn(),
    deleteRows: vi.fn(),
  },
  getErrorMessage,
}));

vi.mock('@/lib/dates', () => ({ todayLocal: () => '2026-11-18' }));

describe('PenerimaanReportPage — header tabel', () => {
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
        data: [
          {
            id: 1,
            tanggal_penerimaan: '2026-11-18',
            kode_depo: '0126',
            nama_depo: 'Singkawang',
            sumber_material: 'PT Sumber',
            po_transporter: 'PO-001',
            driver_name: 'Andi',
            kode_barang: 'BRG-A',
            nama_barang: 'Produk A',
            qty_crt: 10,
            qty_pcs: 240,
            satuan: 'CRT',
            expired_date: '2026-12-01',
            condition: 'GOOD',
            selisih_qty: 0,
            selisih_reason: '',
            notes: '',
            sumber: 'VALIDASI_SJ',
          },
        ],
        summary: {
          total_item: 1,
          total_qty_crt: 10,
          total_qty_pcs: 240,
          item_sj: 1,
          item_manual: 0,
          total_selisih: 0,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('mengunci header tabel saat baris laporan inbound digulir', async () => {
    render(<PenerimaanReportPage />);

    const table = await screen.findByRole('table', { name: 'Laporan penerimaan' });

    expect(table.querySelector('thead')).toHaveClass('sticky', 'top-0');
    // Sticky butuh scroll container bertinggi tetap; `overflow-x-auto` saja
    // membuat header ikut naik bersama halaman.
    expect(table.parentElement).toHaveClass('overflow-auto', 'max-h-[65vh]');
  });
});

it('menampilkan kartu durasi per PO', async () => {
  vi.clearAllMocks();
  hasPermission.mockReturnValue(true);
  depoList.mockResolvedValue({ data: { data: [] } });
  list.mockResolvedValue({
    data: {
      current_page: 1, last_page: 1, per_page: 25, total: 1,
      data: [{
        id: 1, tanggal_penerimaan: '2026-11-18', kode_depo: '0126', nama_depo: 'Singkawang',
        sumber_material: 'PT Sumber', po_transporter: 'PO-DURASI', driver_name: 'Andi',
        kode_barang: 'BRG-A', nama_barang: 'Produk A', qty_crt: 10, qty_pcs: 240,
        satuan: 'CRT', expired_date: '2026-12-01', condition: 'GOOD', selisih_qty: 0,
        selisih_reason: '', notes: '', sumber: 'VALIDASI_SJ',
        total_label: '1j 20m', unload_label: '1j 10m',
      }],
      summary: {
        total_item: 1, total_qty_crt: 10, total_qty_pcs: 240,
        item_sj: 1, item_manual: 0, total_selisih: 0,
      },
    },
  });
  render(<PenerimaanReportPage />);
  expect(await screen.findByText('Durasi per PO')).toBeInTheDocument();
  expect(screen.getAllByText('PO-DURASI').length).toBeGreaterThan(0);
});
