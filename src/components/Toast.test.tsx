import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Toast from './Toast';

/**
 * Toast harus mempertahankan baris baru pada pesan.
 *
 * getErrorMessage() merakit daftar baris import dengan "\n" (mis. "Baris 3: …"
 * \n "Baris 5: …"). Tanpa `whitespace-pre-line`, HTML meng-collapse newline
 * menjadi spasi — pesan yang tampil jadi satu baris panjang dan nomor baris
 * tidak bisa dipindai mata. Kelas itu mudah terhapus karena tidak ada error,
 * hanya tampilan yang berubah diam-diam.
 */
describe('Toast', () => {
  it('mempertahankan baris baru pada pesan multi-baris', () => {
    const message = 'Import gagal: 2 baris tidak valid.\nBaris 3: PO tidak ditemukan.\nBaris 5: PO wajib diisi';

    const { container } = render(<Toast message={message} type="error" onClose={() => {}} />);

    // Teksnya sendiri tetap satu string; yang menentukan tampilan baris baru
    // adalah kelas CSS, jadi itu yang diperiksa.
    const span = container.querySelector('span.text-sm');
    expect(span).not.toBeNull();
    expect(span?.className).toContain('whitespace-pre-line');

    // Isi pesan tidak boleh berubah.
    expect(screen.getByText(/Baris 3: PO tidak ditemukan\./)).toBeTruthy();
  });

  it('tetap men				  pesan satu baris tanpa efek samping', () => {
    render(<Toast message="Import berhasil" type="success" onClose={() => {}} />);

    expect(screen.getByText('Import berhasil')).toBeTruthy();
  });
});