import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TarifRetribusiPage from './page';

const { hasPermission, depoList, rateList, saveRate, removeRate, notify } = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  depoList: vi.fn(),
  rateList: vi.fn(),
  saveRate: vi.fn(),
  removeRate: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/store/globalToast', () => ({
  notifyGlobal: notify,
}));

vi.mock('@/lib/api', () => ({
  depo: { list: depoList },
  retribusiRates: { list: rateList, save: saveRate, remove: removeRate },
}));

describe('TarifRetribusiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    depoList.mockResolvedValue({ data: { data: [] } });
    rateList.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan kartu akses terbatas dan tidak memanggil API tanpa permission retribusi_rates.manage', async () => {
    hasPermission.mockReturnValue(false);

    render(<TarifRetribusiPage />);

    expect(await screen.findByText('Akses terbatas')).toBeInTheDocument();
    expect(depoList).not.toHaveBeenCalled();
    expect(rateList).not.toHaveBeenCalled();
  });

  it('menampilkan daftar depo dengan nilai override existing dan pill bawaan config untuk depo lain', async () => {
    depoList.mockResolvedValue({
      data: {
        data: [
          { kode_depo: 'DPT-A', nama_depo: 'Depo A' },
          { kode_depo: 'DPT-B', nama_depo: 'Depo B' },
        ],
      },
    });
    rateList.mockResolvedValue({
      data: {
        data: [
          { kode_depo: 'DPT-A', nama_depo: 'Depo A', mode: 'koli', rate_zak: '5000', rate_crt: '2000', is_active: 1 },
        ],
      },
    });

    render(<TarifRetribusiPage />);

    expect(await screen.findByText('DPT-A')).toBeInTheDocument();
    expect(screen.getByText('DPT-B')).toBeInTheDocument();
    expect(screen.getByLabelText('Mode hitung DPT-A')).toHaveValue('koli');
    expect(screen.getByLabelText('Tarif per zak DPT-A')).toHaveValue(5000);
    expect(screen.getByLabelText('Tarif per crt DPT-A')).toHaveValue(2000);
    expect(screen.getByText('Bawaan config')).toBeInTheDocument();
  });

  it('menyimpan override per depo lewat retribusiRates.save dan menampilkan toast sukses', async () => {
    depoList.mockResolvedValue({ data: { data: [{ kode_depo: 'DPT-A', nama_depo: 'Depo A' }] } });
    rateList.mockResolvedValue({ data: { data: [] } });
    saveRate.mockResolvedValue({ data: { data: {} } });

    render(<TarifRetribusiPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(saveRate).toHaveBeenCalledWith({
      kode_depo: 'DPT-A',
      nama_depo: 'Depo A',
      mode: 'borongan',
      rate_zak: 0,
      rate_crt: 0,
      is_active: true,
    }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('disimpan'), 'success'));
  });

  it('menampilkan tombol Reset hanya untuk baris ber-override dan mereset ke bawaan config via remove', async () => {
    depoList.mockResolvedValue({ data: { data: [{ kode_depo: 'DPT-A', nama_depo: 'Depo A' }] } });
    rateList.mockResolvedValue({
      data: {
        data: [
          { kode_depo: 'DPT-A', nama_depo: 'Depo A', mode: 'borongan', rate_zak: '0', rate_crt: '0', is_active: 1 },
        ],
      },
    });
    removeRate.mockResolvedValue({ data: {} });

    render(<TarifRetribusiPage />);

    expect(await screen.findByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.queryByText('Bawaan config')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(removeRate).toHaveBeenCalledWith('DPT-A'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('direset'), 'success'));
  });
});