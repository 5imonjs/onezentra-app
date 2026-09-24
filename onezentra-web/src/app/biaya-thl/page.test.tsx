import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BiayaThlPage from './page';

const { hasPermission, thlList, getBiayaConfig, notify } = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  thlList: vi.fn(),
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
  biayaThl: { list: thlList },
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

describe('BiayaThlPage — pola input langsung di step Data Pekerja', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    thlList.mockResolvedValue({ data: { data: [], last_page: 1 } });
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
});