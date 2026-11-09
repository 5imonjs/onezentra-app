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
          weeks: ['2026-11-02', '2026-09-07'],
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

  it('menampilkan judul dan konteks minggu/depo di header', async () => {
    render(<OpnameExpiredPage />);

    expect(await screen.findByRole('heading', { name: 'Monitoring Kedaluwarsa' })).toBeInTheDocument();
    expect(screen.getByText('Pantau lot kedaluwarsa per minggu dan depo, termasuk status Aman.')).toBeInTheDocument();
    // Header sekarang ringkas: tidak ada tombol Stock Opname generik yang bersaing
    // dengan CTA kontekstual di banner (buat/lanjutkan/lihat hasil sesi).
    expect(screen.queryByRole('link', { name: 'Stock Opname' })).not.toBeInTheDocument();
    // Header sekarang ringkas: langkah alur tidak lagi dirender sebagai chip di header.
    expect(screen.queryByLabelText('Alur monitoring kedaluwarsa')).not.toBeInTheDocument();
  });

  it('menyembunyikan Buat Baris & Pengaturan tanpa izin opname.create/opname.edit', async () => {
    // Role seperti "viewer" hanya punya opname.view: dulu tombol ini tampil dan
    // klik-nya berujung 403. Sekarang tidak dirender sama sekali.
    hasPermission.mockImplementation((slug: string) => slug === 'opname.view');

    render(<OpnameExpiredPage />);

    expect(await screen.findByText('Perlu Ditindak')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buat Baris Monitoring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pengaturan/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/belum di-generate/)).not.toBeInTheDocument();
  });

  it('menampilkan langkah berikutnya dan aksi sekunder saat izin lengkap', async () => {
    render(<OpnameExpiredPage />);

    expect(await screen.findByText(/baris baru belum masuk analisa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buat Baris Monitoring' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aksi' }));

    // Menu dikelompokkan agar fungsi input, proses, laporan, dan pengaturan tidak tercampur.
    expect(screen.getByText('Input data')).toBeInTheDocument();
    expect(screen.getByText('Proses monitoring')).toBeInTheDocument();
    expect(screen.getByText('Laporan')).toBeInTheDocument();
    expect(screen.getByText('Pengaturan')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Kelola Saldo Awal/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Tambah Stok Manual/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Pengaturan Status Kedaluwarsa/ })).toBeInTheDocument();
  });

  it('memprioritaskan pemasangan saldo awal saat baseline depo belum ada', async () => {
    baselineManifests.mockResolvedValue({ data: { data: [] } });

    render(<OpnameExpiredPage />);

    expect(await screen.findByText('Saldo Awal belum dipasang')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pasang Saldo Awal' })).toBeInTheDocument();
    expect(screen.queryByText(/baris baru belum masuk analisa/)).not.toBeInTheDocument();

    // Saat saldo awal belum ada, CTA hanya muncul sekali di banner langkah
    // berikutnya; menu "Aksi" tidak boleh menduplikasi tombol yang sama.
    fireEvent.click(screen.getByRole('button', { name: 'Aksi' }));
    expect(screen.queryByRole('menuitem', { name: /Saldo Awal/ })).not.toBeInTheDocument();
  });

  it('memakai satu minggu aktif untuk daftar, pending, dan progres', async () => {
    const { container } = render(<OpnameExpiredPage />);

    const weekSelect = container.querySelector('#oe-week') as HTMLSelectElement;
    expect(weekSelect).toBeInTheDocument();
    expect(weekSelect.tagName).toBe('SELECT');
    expect(container.querySelector('#oe-from')).not.toBeInTheDocument();
    expect(container.querySelector('#oe-to')).not.toBeInTheDocument();

    // Opsi minggu berasal dari meta.weeks (2026-11-02) dan sudah berupa Senin.
    await waitFor(() => {
      expect(container.querySelector('#oe-week option[value="2026-11-02"]')).not.toBeNull();
    });
    fireEvent.change(weekSelect, { target: { value: '2026-11-02' } });

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ week_start: '2026-11-02' }),
      );
      expect(pending).toHaveBeenLastCalledWith(
        expect.objectContaining({ week_start: '2026-11-02' }),
      );
      expect(progress).toHaveBeenLastCalledWith(
        expect.objectContaining({ week_start: '2026-11-02' }),
      );
    });
  });

  it('memuat ulang daftar, pending, progres, dan status saldo awal dari tombol refresh', async () => {
    render(<OpnameExpiredPage />);

    await screen.findByRole('heading', { name: 'Monitoring Kedaluwarsa' });
    const initialListCalls = list.mock.calls.length;
    const initialPendingCalls = pending.mock.calls.length;
    const initialProgressCalls = progress.mock.calls.length;
    const initialBaselineCalls = baselineManifests.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang data' }));

    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(initialListCalls);
      expect(pending.mock.calls.length).toBeGreaterThan(initialPendingCalls);
      expect(progress.mock.calls.length).toBeGreaterThan(initialProgressCalls);
      expect(baselineManifests.mock.calls.length).toBeGreaterThan(initialBaselineCalls);
    });
  });

  it('menandai hitung fisik selesai saat semua baris sudah tervalidasi', async () => {
    pending.mockResolvedValue({
      data: {
        data: {
          week_start: '2026-11-02',
          week_end: '2026-11-08',
          wave_exists: true,
          eligible: { total: 2, sj: 2, import: 0, legacy: 0 },
          pending: { total: 0, sj: 0, import: 0, legacy: 0 },
        },
      },
    });
    progress.mockResolvedValue({
      data: {
        data: {
          depots: [
            { kode_depo: 'DPO', nama_depo: 'Depo Test', total: 2, validated: 2, has_session: true, has_open_session: false, has_finalized_session: true, finalized_session_id: 99, submitted: true },
          ],
        },
      },
    });

    render(<OpnameExpiredPage />);

    expect(await screen.findByText('Hitung fisik minggu ini selesai')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Lihat Hasil Stock Opname/ });
    expect(link.getAttribute('href')).toContain('/opname-sessions?');
    expect(link.getAttribute('href')).toContain('week_start=');
    expect(link.getAttribute('href')).toContain('kode_depo=DPO');
    expect(link.getAttribute('href')).toContain('session_id=99');
  });

  it('menampilkan status sesi berjalan saat sesi terbuka tapi belum semua tervalidasi', async () => {
    pending.mockResolvedValue({
      data: {
        data: {
          week_start: '2026-11-02',
          week_end: '2026-11-08',
          wave_exists: true,
          eligible: { total: 2, sj: 2, import: 0, legacy: 0 },
          pending: { total: 0, sj: 0, import: 0, legacy: 0 },
        },
      },
    });
    progress.mockResolvedValue({
      data: {
        data: {
          depots: [
            { kode_depo: 'DPO', nama_depo: 'Depo Test', total: 2, validated: 1, has_session: true, has_open_session: true, open_session_id: 42, submitted: false },
          ],
        },
      },
    });

    render(<OpnameExpiredPage />);

    expect(await screen.findByText('Stock Opname sedang berjalan')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Lanjutkan Stock Opname/ });
    expect(link.getAttribute('href')).toContain('/opname-sessions?');
    expect(link.getAttribute('href')).toContain('week_start=');
    expect(link.getAttribute('href')).toContain('kode_depo=DPO');
    expect(link.getAttribute('href')).toContain('session_id=42');
  });

  it('mengarahkan tombol Buat Sesi ke halaman Stock Opname dengan minggu+depo dan modal create', async () => {
    pending.mockResolvedValue({
      data: {
        data: {
          week_start: '2026-11-02',
          week_end: '2026-11-08',
          wave_exists: true,
          eligible: { total: 2, sj: 2, import: 0, legacy: 0 },
          pending: { total: 0, sj: 0, import: 0, legacy: 0 },
        },
      },
    });
    progress.mockResolvedValue({
      data: {
        data: {
          depots: [
            { kode_depo: 'DPO', nama_depo: 'Depo Test', total: 2, validated: 0, has_session: false, has_open_session: false, submitted: false },
          ],
        },
      },
    });
    list.mockResolvedValue({
      data: {
        data: { data: [], current_page: 1, last_page: 1, per_page: 25, total: 0 },
        meta: {
          weeks: ['2026-11-02'],
          thresholds: {},
          status_summary: { AMAN: { count: 2, qty_crt: 10 } },
          prev_week_start: null,
          prev_status_summary: {},
          depot_summary: [],
        },
      },
    });

    render(<OpnameExpiredPage />);

    expect(await screen.findByText('Baris monitoring siap dihitung fisik')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Buat Sesi Stock Opname/ });
    expect(link.getAttribute('href')).toContain('/opname-sessions?');
    expect(link.getAttribute('href')).toContain('week_start=');
    expect(link.getAttribute('href')).toContain('kode_depo=DPO');
    expect(link.getAttribute('href')).toContain('create=1');
    expect(link.getAttribute('href')).not.toContain('session_id=');
  });
});
