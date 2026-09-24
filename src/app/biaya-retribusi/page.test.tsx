import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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