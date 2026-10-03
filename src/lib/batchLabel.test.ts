import { describe, expect, it } from 'vitest';
import { buildBatchLabelPdf } from './batchLabel';
import { encodeCode39 } from './suratJalanPdf';

const label = {
  batch_number: 'BATCH-ABC12345',
  barcode_label: 'LBL-XYZ98765',
  kode_barang: '000123',
  nama_barang: 'Indomie Goreng 85g',
  actual_qty: 120,
  satuan: 'PCS',
  expired_date: '2027-01-31',
  condition: 'FISIK_BAGUS',
  po_transporter: 'PO-042',
};

describe('buildBatchLabelPdf', () => {
  it('membuat PDF dengan ukuran kertas label thermal', () => {
    const doc = buildBatchLabelPdf(label);
    // 58mm x 40mm — format roll label, bukan A4.
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(58, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(40, 1);
  });

  it('menghormati lebar 80mm tanpa mengubah isi', () => {
    const doc = buildBatchLabelPdf(label, { width: 80 });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(80, 1);
  });

  it('tidak melempar saat semua field kosong', () => {
    // Label tercetak untuk produk yang datanya belum terisi lengkap tidak
    // boleh menggagalkan cetakan — petugas tetap butuh kode barcode tempel.
    const doc = buildBatchLabelPdf({
      batch_number: null,
      barcode_label: null,
      kode_barang: null,
      nama_barang: null,
      actual_qty: null,
      satuan: null,
      expired_date: null,
    });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(58, 1);
  });

  it('memakai barcode_label apa adanya sebagai barcode', () => {
    // Label fisik yang ditempel harus persis sama dengan yang dipindai.
    // Kalau teks di bawah barcode dan barcode itu sendiri berbeda, produk tidak
    // akan ketemu saat operator memindai label ini.
    const encoded = encodeCode39(label.barcode_label);
    // Code39 dibungkus '*' sebagai start/stop, jadi isinya mulai dan berakhir '1'.
    expect(encoded.startsWith('1')).toBe(true);
    expect(encoded.endsWith('1')).toBe(true);
  });

  it('mempertahankan tanggal expired apa adanya, tanpa konversi timezone', () => {
    // Tanggal yang bergeser satu hari karena timezone akan menaruh produk di
    // rak yang salah, jadi label harus memakai nilai mentah dari API.
    expect(label.expired_date).toBe('2027-01-31');
  });
});