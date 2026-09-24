import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BiayaThlPage from './page';

const { hasPermission, thlList, thlGet, getBiayaConfig, notify } = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  thlList: vi.fn(),
  thlGet: vi.fn(),
  getBiayaConfig: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const htmlProps = Object.fromEntries(
      Object.entries(props)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...htmlProps} alt="" />;
  },
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/api', () => ({
  biayaThl: { list: thlList, get: thlGet },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
  API_ROOT: 'http://localhost:3000',
}));

vi.mock('@/lib/biaya', () => ({
  getBiayaConfig,
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
  generateTHLPdf: vi.fn(),
  previewTHLPdf: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    user: { id: 1, full_name: 'Admin', kode_depo: 'DPT-A', nama_depo: 'Depo A', level: 'admin_master' },
    hasPermission,
    hasRole: () => true,
  }),
}));

vi.mock('@/store/globalToast', () => ({
  notifyGlobal: notify,
}));

const makeThlItem = (overrides: Record<string, unknown> = {}) => ({
  id: 77,
  tanggal_pengajuan: '2026-09-24',
  kode_depo: 'SKW',
  nama_depo: 'Singkawang',
  no_kendaraan: 'B 3434 FD',
  type_kendaraan: 'CDD',
  no_surat_jalan: '0127-26-00000TES5',
  kubikasi_base: 0,
  nominal_biaya: 1025000,
  is_rfah_required: true,
  rfah_name: 'Umi Marzuqoh',
  approval_pengajuan: 'bac',
  approval_pengajuan_level: 'BLC',
  status: 'revisi',
  created_by: 1,
  submitted_at: '2026-09-24 10:00:00',
  checked_at: null,
  rlh_approved_at: null,
  approved_at: null,
  rejected_at: null,
  rejection_reason: null,
  revised_at: null,
  revisi_reason: null,
  resubmitted_at: null,
  submittedBy: { id: 2, full_name: 'Simon Peres' },
  checkedBy: null,
  approvedBy: null,
  rlhApprovedBy: null,
  rejectedBy: null,
  revisedBy: null,
  details: [],
  photos: [],
  ...overrides,
});

describe('BiayaThlPage — pola input langsung di step Data Pekerja', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    thlList.mockResolvedValue({ data: { data: [], last_page: 1 } });
    thlGet.mockResolvedValue({ data: { data: {} } });
    getBiayaConfig.mockResolvedValue({
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

  const openDataPekerjaStep = async () => {
    const { getByRole, getByLabelText } = screen;
    fireEvent.click(await getByRole('button', { name: 'Buat Pengajuan' }));
    fireEvent.change(getByLabelText('Tanggal Pengajuan'), { target: { value: '2026-09-24' } });
    fireEvent.click(getByRole('button', { name: /Lanjut ke Data Pekerja/ }));
  };

  it('auto-membuat 1 grup Surat Jalan + 1 baris pekerja kosong saat masuk step Data Pekerja pada pembuatan baru', async () => {
    render(<BiayaThlPage />);
    await openDataPekerjaStep();

    await waitFor(() => expect(document.getElementById('sj-group-0')).not.toBeNull());
    expect(document.getElementById('worker-card-0')).not.toBeNull();
    expect(screen.getAllByText('1 pekerja').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Belum ada data pekerja')).not.toBeInTheDocument();
  });

  it('tidak menggandakan grup saat keluar-masuk step Data Pekerja', async () => {
    render(<BiayaThlPage />);
    await openDataPekerjaStep();
    await waitFor(() => expect(document.getElementById('sj-group-0')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Kembali ke Informasi' }));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Data Pekerja/ }));

    await waitFor(() => expect(document.getElementById('sj-group-0')).not.toBeNull());
    expect(document.getElementById('sj-group-1')).toBeNull();
  });

  const openDetail = async (item: ReturnType<typeof makeThlItem>) => {
    thlList.mockResolvedValue({ data: { data: [item], last_page: 1 } });
    thlGet.mockResolvedValue({ data: { data: item } });
    render(<BiayaThlPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Lihat' }))[0]);
    await screen.findByRole('heading', { name: 'Detail Biaya THL' });
  };

  it('tidak menampilkan tombol Kirim di modal detail untuk status revisi (kirim ulang lewat edit modal)', async () => {
    await openDetail(makeThlItem({ status: 'revisi', revisi_reason: 'tesss', revised_at: '2026-09-24 11:00:00', revisedBy: { id: 3, full_name: 'Bac User', level: 'bac' } }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Kirim' })).not.toBeInTheDocument();
  });

  it('tidak menampilkan tombol Kirim di modal detail untuk status rejected', async () => {
    await openDetail(makeThlItem({ status: 'rejected', rejection_reason: 'lengkapi dokumen', rejected_at: '2026-09-24 11:00:00', rejectedBy: { id: 4, full_name: 'Rlh User', level: 'rlh' } }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Kirim' })).not.toBeInTheDocument();
  });

  it('menampilkan tombol Kirim di modal detail untuk draft milik pembuat dengan approval.submit', async () => {
    await openDetail(makeThlItem({ status: 'draft' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kirim' })).toBeInTheDocument();
  });

  it('tidak menampilkan tombol Kirim di modal detail untuk draft milik pengguna lain', async () => {
    await openDetail(makeThlItem({ status: 'draft', created_by: 999 }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Kirim' })).not.toBeInTheDocument();
  });
});

describe('BiayaThlPage — pipeline alur approval di daftar', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    thlList.mockResolvedValue({ data: { data: [], last_page: 1 } });
    thlGet.mockResolvedValue({ data: { data: {} } });
    getBiayaConfig.mockResolvedValue({
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

  const renderList = async (item: ReturnType<typeof makeThlItem>) => {
    thlList.mockResolvedValue({ data: { data: [item], last_page: 1 } });
    render(<BiayaThlPage />);
    await waitFor(() =>
      expect(document.querySelectorAll('[aria-label="Alur tahapan persetujuan"]').length).toBeGreaterThan(0),
    );
  };

  it('draft: semua tahap belum tercapai', async () => {
    await renderList(makeThlItem({ status: 'draft' }));
    expect(stageCount('BLC', 'todo')).toBe(2);
    expect(stageCount('BAC', 'todo')).toBe(2);
    expect(stageCount('RLH', 'todo')).toBe(2);
    expect(stageCount('RFAH', 'todo')).toBe(2);
    expect(stageCount('BAC', 'current')).toBe(0);
  });

  it('pending: menunggu pemeriksaan BAC', async () => {
    await renderList(makeThlItem({ status: 'pending' }));
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'current')).toBe(2);
    expect(stageCount('RLH', 'todo')).toBe(2);
  });

  it('checked: menunggu persetujuan RLH', async () => {
    await renderList(makeThlItem({ status: 'checked', checked_at: '2026-09-24 10:30:00' }));
    expect(stageCount('BAC', 'done')).toBe(2);
    expect(stageCount('RLH', 'current')).toBe(2);
    expect(stageCount('RFAH', 'todo')).toBe(2);
  });

  it('rlh_approved dengan RFAH wajib: menunggu persetujuan RFAH', async () => {
    await renderList(
      makeThlItem({
        status: 'rlh_approved',
        checked_at: '2026-09-24 10:30:00',
        rlh_approved_at: '2026-09-24 11:00:00',
      }),
    );
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'done')).toBe(2);
    expect(stageCount('RLH', 'done')).toBe(2);
    expect(stageCount('RFAH', 'current')).toBe(2);
  });

  it('approved: semua tahap selesai', async () => {
    await renderList(
      makeThlItem({
        status: 'approved',
        checked_at: '2026-09-24 10:30:00',
        rlh_approved_at: '2026-09-24 11:00:00',
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
      makeThlItem({
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
      makeThlItem({
        status: 'revisi',
        revised_at: '2026-09-24 11:00:00',
        revisedBy: { id: 3, full_name: 'Bac User', level: 'bac' },
        revisi_reason: 'lengkapi foto',
      }),
    );
    expect(stageCount('BLC', 'done')).toBe(2);
    expect(stageCount('BAC', 'revisi')).toBe(2);
    expect(stageCount('RLH', 'todo')).toBe(2);
  });
});