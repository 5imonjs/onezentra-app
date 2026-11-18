import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ExpiredReportNotice from './ExpiredReportNotice';

describe('ExpiredReportNotice', () => {
  afterEach(() => {
    cleanup();
  });

  it('menjelaskan sumber batch dan menautkan ke laporan monitoring', () => {
    render(<ExpiredReportNotice kind="batch" />);

    expect(screen.getByRole('heading', { name: 'Tentang data laporan ini' })).toBeInTheDocument();
    expect(screen.getByText('Ledger penerimaan (mentah) — receiving_items')).toBeInTheDocument();
    expect(screen.getByText('Satu baris = satu batch penerimaan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lihat Monitoring Kedaluwarsa/i })).toHaveAttribute('href', '/reports/opname-expired');
  });

  it('menjelaskan sumber monitoring dan menautkan ke laporan batch', () => {
    render(<ExpiredReportNotice kind="monitoring" />);

    expect(screen.getByText('Snapshot mingguan — opname_expired_waves')).toBeInTheDocument();
    expect(screen.getByText('Qty efektif = qty awal + koreksi opname yang disetujui')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lihat Batch Kedaluwarsa/i })).toHaveAttribute('href', '/reports/penerimaan-batch-expired');
  });
});
