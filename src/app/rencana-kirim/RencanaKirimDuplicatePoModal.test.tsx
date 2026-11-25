import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RencanaKirimDuplicatePoModal from './RencanaKirimDuplicatePoModal';

const existing = {
  id: 54,
  po_transporter: 'PO-TEST-MUNDUR-20261123',
  driver_name: 'Tester',
  nopol: 'DA 1111 XX',
  rkh_date: '2026-12-03T00:00:00',
  eta_date: '2026-12-02T00:00:00',
  status: 'DRAFT',
  kode_depo: '01',
  nama_depo: 'Depo 01',
  created_at: '2026-11-24T09:27:44',
  creator: { id: 1, full_name: 'Simon Peres', email: 'simon@example.com', level: 'admin_master' },
};

describe('RencanaKirimDuplicatePoModal', () => {
  const onClose = vi.fn();
  const onViewExisting = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('tidak merender bila tidak ada dokumen bentrok', () => {
    render(<RencanaKirimDuplicatePoModal show existing={null} onClose={onClose} onViewExisting={onViewExisting} />);
    expect(screen.queryByText('PO Transporter sudah terdaftar')).not.toBeInTheDocument();
  });

  it('menampilkan detail dokumen lama termasuk pembuatnya', () => {
    render(<RencanaKirimDuplicatePoModal show existing={existing as never} onClose={onClose} onViewExisting={onViewExisting} />);

    expect(screen.getByText('PO Transporter sudah terdaftar')).toBeInTheDocument();
    expect(screen.getByText('PO-TEST-MUNDUR-20261123')).toBeInTheDocument();
    expect(screen.getByText('Tester')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Simon Peres')).toBeInTheDocument();
    expect(screen.getByText(/Rencana tidak disimpan/)).toBeInTheDocument();
  });

  it('tombol Batal dan Lihat Dokumen memanggil handler masing-masing', () => {
    render(<RencanaKirimDuplicatePoModal show existing={existing as never} onClose={onClose} onViewExisting={onViewExisting} />);

    fireEvent.click(screen.getByRole('button', { name: 'Kembali ke Form' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Lihat Dokumen Lama' }));
    expect(onViewExisting).toHaveBeenCalledTimes(1);
  });
});
