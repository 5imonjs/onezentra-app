import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RencanaKirimImportModal from './RencanaKirimImportModal';

describe('RencanaKirimImportModal — baris dilewati', () => {
  afterEach(cleanup);

  it('menampilkan alasan baris dilewati saat qty di bawah 1', () => {
    render(
      <RencanaKirimImportModal
        showImport
        setShowImport={vi.fn()}
        importing={false}
        selectedFile={null}
        setSelectedFile={vi.fn()}
        importResult={{
          message: 'Import berhasil',
          ok: true,
          total_rows: 2,
          matched: 1,
          skipped: 1,
          errors: [{ row: 2, message: 'Qty minimal 1 untuk barang B-FRAKSI (baris 2)' }],
        }}
        setImportResult={vi.fn()}
        fileInputRef={{ current: null }}
        handleImportItems={vi.fn()}
        handleItemTemplate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Baris yang dilewati saat import')).toBeInTheDocument();
    expect(screen.getByText(/Baris 2: Qty minimal 1/)).toBeInTheDocument();
    expect(screen.getByText(/Qty minimal 1 — baris dengan qty di bawah 1 dilewati/)).toBeInTheDocument();
  });
});
