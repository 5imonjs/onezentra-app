import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateSessionModal } from '@/components/OpnameCreateSessionModal';

const { officers, expiredList, notifyGlobal } = vi.hoisted(() => ({
  officers: vi.fn(),
  expiredList: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  opnameSessions: { officers },
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

describe('CreateSessionModal — petugas dipanggil sesuai depo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expiredList.mockResolvedValue({ data: { data: { data: [] } } });
    officers.mockResolvedValue({ data: { data: [] } });
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
});
