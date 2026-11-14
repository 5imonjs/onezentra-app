import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateSessionModal } from '@/components/OpnameCreateSessionModal';

const { officers, expiredList, create, notifyGlobal } = vi.hoisted(() => ({
  officers: vi.fn(),
  expiredList: vi.fn(),
  create: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  opnameSessions: { officers, create },
  opnameExpired: { list: expiredList },
  getErrorMessage: (_e: unknown, fallback?: string) => fallback ?? 'error',
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

const officer = (id: number, fullName: string) => ({
  id,
  full_name: fullName,
  email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@test.com`,
  level: 'staff_logistic',
});

const userDepo = { kode_depo: '0126', nama_depo: 'Depo Pontianak' };

const wave = (id: number, kode: string, kodeDepo: string, hasOpenSession = false) => ({
  id,
  kode_barang: kode,
  nama_barang: `Produk ${kode}`,
  kode_depo: kodeDepo,
  expired_date_ini: '2027-02-01',
  qty_ini_crt: 5,
  status_ini: 'AMAN',
  has_open_session: hasOpenSession,
});

describe('CreateSessionModal — petugas dipanggil sesuai depo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expiredList.mockResolvedValue({ data: { data: { data: [] } } });
    officers.mockResolvedValue({ data: { data: [] } });
    create.mockResolvedValue({ data: { data: { id: 1 } } });
  });

  afterEach(cleanup);

  it('mengambil petugas dari endpoint officers sesuai kode depo dan menampilkannya', async () => {
    officers.mockResolvedValue({ data: { data: [officer(7, 'Budi Petugas')] } });

    render(<CreateSessionModal userDepo={userDepo} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByRole('option', { name: /Budi Petugas/ })).toBeInTheDocument();
    expect(officers).toHaveBeenCalledWith('0126');
    // Tidak ada lagi input ID manual.
    expect(screen.queryByPlaceholderText('ID user petugas')).not.toBeInTheDocument();
  });

  it('menampilkan keadaan kosong bila depo tidak punya petugas aktif', async () => {
    render(<CreateSessionModal userDepo={userDepo} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByRole('option', { name: /Tidak ada petugas aktif di depo ini/ })).toBeInTheDocument();
  });

  it('memuat ulang petugas dan mereset pilihan lama saat kode depo berubah', async () => {
    officers.mockResolvedValue({ data: { data: [officer(7, 'Budi Petugas')] } });

    render(<CreateSessionModal userDepo={userDepo} onClose={vi.fn()} onCreated={vi.fn()} />);

    const select = await screen.findByLabelText('Petugas *');
    fireEvent.change(select, { target: { value: '7' } });
    expect(select).toHaveValue('7');

    // Depo lain: petugas sebelumnya tidak ada di daftar baru.
    officers.mockResolvedValue({ data: { data: [officer(9, 'Siti Petugas')] } });
    fireEvent.change(screen.getByLabelText('Kode Depo *'), { target: { value: '9999' } });

    await waitFor(() => expect(screen.getByRole('option', { name: /Siti Petugas/ })).toBeInTheDocument());
    expect(officers).toHaveBeenCalledWith('9999');
    expect(screen.getByLabelText('Petugas *')).toHaveValue('');
  });

  it('memakai minggu dari deep link dan mengirim filter depo ke server', async () => {
    render(
      <CreateSessionModal
        userDepo={userDepo}
        initialWeekStart="2026-11-05"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Minggu (Senin) *')).toHaveValue('2026-11-02');
    await waitFor(() => {
      expect(expiredList).toHaveBeenCalledWith(expect.objectContaining({
        week_start: '2026-11-02',
        kode_depo: '0126',
        per_page: 100,
        page: 1,
      }));
    });
  });

  it('hanya memilih baris depo sesi dan mengunci wave yang sudah masuk sesi berjalan', async () => {
    officers.mockResolvedValue({ data: { data: [officer(7, 'Budi Petugas')] } });
    expiredList.mockResolvedValue({
      data: {
        data: {
          data: [
            wave(1, 'B-OK', '0126'),
            wave(2, 'B-LOCKED', '0126', true),
            wave(3, 'B-OTHER', '0127'),
          ],
        },
      },
    });

    render(<CreateSessionModal userDepo={userDepo} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByRole('checkbox', { name: /B-OK/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /B-LOCKED/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /B-LOCKED/ })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /B-OTHER/ })).not.toBeInTheDocument();

    await screen.findByRole('option', { name: /Budi Petugas/ });
    fireEvent.change(screen.getByLabelText('Petugas *'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buat Sesi' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      kode_depo: '0126',
      assigned_to: 7,
      wave_ids: [1],
    })));
  });
});
