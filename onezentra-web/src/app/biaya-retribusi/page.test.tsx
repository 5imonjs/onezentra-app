import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BiayaRetribusiPage from './page';

const { hasPermission, hasRole, rbList, getBiayaConfigFresh, notify } = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  hasRole: vi.fn(() => true),
  rbList: vi.fn(),
  getBiayaConfigFresh: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/api', () => ({
  biayaRetribusi: { list: rbList },
  retribusiRates: {},
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
  API_ROOT: 'http://localhost:8000',
}));

vi.mock('@/lib/biaya', () => ({
  getBiayaConfigFresh,
  clearBiayaConfigCache: vi.fn(),
  BIAYA_CONFIG_FALLBACK: {
    rfah_name: 'Umi Marzuqoh',
    thl_rfah_threshold: 750000,
    retribusi_rfah_threshold: 1000000,
    retribusi_calc_mode: 'borongan',
    retribusi_rate_zak: 0,
    retribusi_rate_crt: 0,
  },
}));

vi.mock('@/lib/biayaPdf', () => ({
  generateRetribusiPdf: vi.fn(),
  previewRetribusiPdf: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    user: { id: 1, full_name: 'Admin', kode_depo: 'SKW', nama_depo: 'Singkawang', level: 'admin_master' },
    hasPermission,
    hasRole,
  }),
}));

vi.mock('@/store/globalToast', () => ({
  notifyGlobal: notify,
}));

const makeItem = (overrides: Record<string, unknown> = {}) => ({
  id: 77,
  tanggal_pengajuan: '2026-09-24',
  kode_depo: 'SKW',
  nama_depo: 'Singkawang',
  nominal_biaya: 1025000,
  is_rfah_required: true,
  rfah_name: 'Umi Marzuqoh',
  approval_pengajuan: 'bac',
  approval_pengajuan_level: 'BLC',
  status: 'revisi',
  created_by: 1,
  submitted_at: '2026-09-24 10:00:00',
  checked_at: null,
  rejected_at: null,
  rejection_reason: null,
  revised_at: null,
  revisi_reason: null,
  submittedBy: { id: 2, full_name: 'Simon Peres' },
  checkedBy: null,
  approvedBy: null,
  rejectedBy: null,
  revisedBy: null,
  details: [],
  documents: [],
  ...overrides,
});

describe('BiayaRetribusiPage — tombol Kirim di modal detail', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    rbList.mockResolvedValue({ data: { data: [], last_page: 1 } });
    getBiayaConfigFresh.mockResolvedValue({
      rfah_name: 'Umi Marzuqoh',
      thl_rfah_threshold: 750000,
      retribusi_rfah_threshold: 1000000,
      retribusi_calc_mode: 'borongan',
      retribusi_rate_zak: 0,
      retribusi_rate_crt: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  const openDetail = async (item: ReturnType<typeof makeItem>) => {
    rbList.mockResolvedValue({ data: { data: [item], last_page: 1 } });
    render(<BiayaRetribusiPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Lihat' }))[0]);
    await screen.findByRole('heading', { name: 'Detail Biaya Retribusi' });
  };

  it('tidak menampilkan tombol Kirim di modal detail untuk status revisi (kirim ulang lewat edit modal)', async () => {
    await openDetail(makeItem({ status: 'revisi', revisi_reason: 'tesss', revised_at: '2026-09-24 11:00:00', revisedBy: { id: 3, full_name: 'Bac User', level: 'bac' } }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Kirim' })).not.toBeInTheDocument();
  });

  it('tidak menampilkan tombol Kirim di modal detail untuk status rejected', async () => {
    await openDetail(makeItem({ status: 'rejected', rejection_reason: 'lengkapi dokumen', rejected_at: '2026-09-24 11:00:00', rejectedBy: { id: 4, full_name: 'Rlh User', level: 'rlh' } }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Kirim' })).not.toBeInTheDocument();
  });

  it('menampilkan tombol Kirim di modal detail untuk draft milik pembuat dengan approval.submit', async () => {
    await openDetail(makeItem({ status: 'draft' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kirim' })).toBeInTheDocument();
  });

  it('tidak menampilkan tombol Kirim di modal detail untuk draft milik pengguna lain', async () => {
    await openDetail(makeItem({ status: 'draft', created_by: 999 }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Kirim' })).not.toBeInTheDocument();
  });
});

describe('BiayaRetribusiPage — pipeline alur approval di daftar', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    rbList.mockResolvedValue({ data: { data: [], last_page: 1 } });
    getBiayaConfigFresh.mockResolvedValue({
      rfah_name: 'Umi Marzuqoh',
      thl_rfah_threshold: 750000,
      retribusi_rfah_threshold: 1000000,
      retribusi_calc_mode: 'borongan',
      retribusi_rate_zak: 0,
      retribusi_rate_crt: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  /** Pipeline dirender dua kali per item (tabel desktop + kartu mobile),
   *  jadi state yang tampil berjumlah 2 dan yang tidak tampil berjumlah 0. */
  const stageCount = (role: string, state: string) =>
    document.querySelectorAll(`[data-role="${role}"][data-state="${state}"]`).length;

  const renderList = async (item: ReturnType<typeof makeItem>) => {
    rbList.mockResolvedValue({ data: { data: [item], last_page: 1 } });
    render(<BiayaRetribusiPage />);
    await waitFor(() =>
      expect(document.querySelectorAll('[aria-label="Alur tahapan persetujuan"]').length).toBeGreaterThan(0),
    );
  };

  it('draft: semua tahap belum tercapai', async () => {
    await renderList(makeItem({ status: 'draft' }));
    expect(stageCount('BLC', 'todo')).toBe(2);
    expect(stageCount('BAC', 'todo')).toBe(2);
    expect(stageCount('RLH', 'todo')).toBe(2);
    expect(stageCount('RFAH', 'todo')).toBe(2);
    expect(stageCount('BAC', 'current')).toBe(0);
  });

  it('pending: menunggu pemeriksaan BAC', async () => {
    await renderList(makeItem({ status: 'pending' }));
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'current')).toBe(2);
    expect(stageCount('RLH', 'todo')).toBe(2);
  });

  it('checked: menunggu persetujuan RLH', async () => {
    await renderList(makeItem({ status: 'checked', checked_at: '2026-09-24 10:30:00' }));
    expect(stageCount('BAC', 'done')).toBe(2);
    expect(stageCount('RLH', 'current')).toBe(2);
    expect(stageCount('RFAH', 'todo')).toBe(2);
  });

  it('rlh_approved dengan RFAH wajib: menunggu persetujuan RFAH', async () => {
    await renderList(makeItem({ status: 'rlh_approved', checked_at: '2026-09-24 10:30:00' }));
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'done')).toBe(2);
    expect(stageCount('RLH', 'done')).toBe(2);
    expect(stageCount('RFAH', 'current')).toBe(2);
  });

  it('approved: semua tahap selesai', async () => {
    await renderList(
      makeItem({
        status: 'approved',
        checked_at: '2026-09-24 10:30:00',
        approved_at: '2026-09-24 12:00:00',
      }),
    );
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'done')).toBe(2);
    expect(stageCount('RLH', 'done')).toBe(2);
    expect(stageCount('RFAH', 'done')).toBe(2);
    expect(stageCount('RFAH', 'current')).toBe(0);
  });

  it('rejected: tanda ditolak pada tahap RLH', async () => {
    await renderList(
      makeItem({
        status: 'rejected',
        checked_at: '2026-09-24 10:30:00',
        rejected_at: '2026-09-24 11:00:00',
        rejectedBy: { id: 4, full_name: 'Rlh User', level: 'rlh' },
      }),
    );
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'done')).toBe(2);
    expect(stageCount('RLH', 'reject')).toBe(2);
    expect(stageCount('RFAH', 'todo')).toBe(2);
  });

  it('revisi dari BAC: tanda revisi pada tahap BAC', async () => {
    await renderList(
      makeItem({
        status: 'revisi',
        revised_at: '2026-09-24 11:00:00',
        revisedBy: { id: 3, full_name: 'Bac User', level: 'bac' },
        revisi_reason: 'lengkapi dokumen',
      }),
    );
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'revisi')).toBe(2);
    expect(stageCount('RLH', 'todo')).toBe(2);
  });
});