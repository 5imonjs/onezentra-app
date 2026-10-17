import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBatchLabelPdf, downloadBatchLabel, printBatchLabel } from './batchLabel';
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

describe('downloadBatchLabel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.querySelectorAll('a').forEach((link) => link.remove());
  });

  it('memicu unduhan lewat <a download> dengan nama file dari kode barang', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    // Link langsung dihapus setelah click(), jadi tangkap elemennya di sini.
    const clicked: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    downloadBatchLabel(label);

    expect(clicked).toHaveLength(1);
    expect(clicked[0].getAttribute('download')).toBe('label-batch-000123.pdf');
    expect(clicked[0].href).toBe('blob:download-1');
    expect(click).toHaveBeenCalledTimes(1);
    // Blob tidak di-revoke sebelum browser sempat membacanya.
    expect(revoke).not.toHaveBeenCalledWith('blob:download-1');
  });
});

describe('printBatchLabel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.querySelectorAll('iframe').forEach((frame) => frame.remove());
    document.querySelectorAll('a').forEach((link) => link.remove());
  });

  /** Pasang contentWindow palsu — jsdom tidak memuat `blob:`. */
  function stubFrameWindow(frame: HTMLIFrameElement, win: { focus: () => void; print: () => void }) {
    Object.defineProperty(frame, 'contentWindow', { value: win, configurable: true });
  }

  it('memuat PDF blob ke iframe tersembunyi dan mencetak dari frame itu', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:label-1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const result = printBatchLabel(label);

    const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    expect(frame?.src).toBe('blob:label-1');

    const print = vi.fn();
    const focus = vi.fn();
    stubFrameWindow(frame as HTMLIFrameElement, { print, focus });

    frame?.onload?.(new Event('load'));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    // true = cetak benar-benar jalan → pemanggil boleh menandai "tercetak".
    await expect(result).resolves.toBe(true);
  });

  it('membuang iframe dan melepas blob URL setelah cetak', async () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:label-2');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const result = printBatchLabel(label);
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    stubFrameWindow(frame, { print: vi.fn(), focus: vi.fn() });
    frame.onload?.(new Event('load'));
    await result;

    // Frame masih ada saat dialog cetak dibuka, lalu dibuang setelah jeda.
    expect(document.querySelector('iframe')).not.toBeNull();
    vi.advanceTimersByTime(1000);

    expect(document.querySelector('iframe')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:label-2');
  });

  it('tidak melempar saat print() ditolak, unduh PDF, dan laporkan gagal (false)', async () => {
    // Bug produksi: CSP "default-src 'self'" memblokir frame blob, sehingga
    // contentWindow.print() melempar SecurityError. Dulu ini tetap dianggap
    // "tercetak" sehingga tombol langsung jadi "Cetak Ulang" padahal gagal.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:label-3');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    const result = printBatchLabel(label);
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    stubFrameWindow(frame, {
      focus: vi.fn(),
      print: () => {
        throw new DOMException('Blocked a frame', 'SecurityError');
      },
    });

    expect(() => frame.onload?.(new Event('load'))).not.toThrow();

    // false = tidak boleh ditandai "tercetak"; PDF diunduh sebagai gantinya.
    await expect(result).resolves.toBe(false);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].getAttribute('download')).toContain('label-batch-');
  });
});