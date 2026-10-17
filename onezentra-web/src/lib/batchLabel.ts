import jsPDF from 'jspdf';
import { encodeCode39 } from './suratJalanPdf';

/** Data label yang perlu dicetak setelah satu produk divalidasi. */
export type BatchLabelData = {
  batch_number: string | null;
  barcode_label: string | null;
  kode_barang: string | null;
  nama_barang: string | null;
  actual_qty: number | null;
  satuan: string | null;
  expired_date: string | null;
  condition?: string | null;
  nama_depo?: string | null;
  po_transporter?: string | null;
};

/**
 * Lebar kertas thermal printer. 58 mm dipakai hampir semua printer label
 * gudang; 80 mm hanya perlu kalau nama barang panjang sekali.
 */
export type LabelWidth = 58 | 80;

const CONDITION_LABEL: Record<string, string> = {
  FISIK_BAGUS: 'Fisik Bagus',
  FISIK_RUSAK: 'Fisik Rusak',
  QTY_KURANG: 'Qty Kurang',
  ISI_KEMASAN_KURANG: 'Isi Kemasan Kurang',
  EXPIRED_TIDAK_STANDAR: 'Expired / Tidak Standar',
  LAINNYA: 'Lainnya',
};

/**
 * Tanggal dicetak apa adanya (YYYY-MM-DD dari API), bukan lewat `new Date()`.
 *
 * Label adalah dokumen fisik yang menempel di rak. Kalau someday dicetak
 * ulang di zona waktu berbeda, tanggal bisa bergeser sehari — dan tanggal
 * expired yang bergeser berarti produk berada di rak yang salah. Format ISO
 * tidak ambigu dan persis sama dengan yang tersimpan di database.
 */
function safeDate(value: string | null | undefined): string {
  return value && value.length > 0 ? value : '-';
}

function safe(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const text = String(value).trim();
  return text.length > 0 ? text : '-';
}

/** Potong teks agar tidak melebihi lebar label dan menggeser barcode. */
function clamp(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** Gambar Code39 memakai encoder yang sama dengan PDF surat jalan. */
function drawBarcode(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  height: number,
): void {
  const modules = encodeCode39(value);
  // Modul terlalu rapat saat dicetak printer thermal, dan barcode yang terlalu
  // rapat juga sulit dibaca scanner. 0.28 mm adalah kompromis lazim untuk 58 mm.
  const moduleWidth = Math.min(maxWidth / modules.length, 0.28);
  const barWidth = modules.length * moduleWidth;
  let cursor = x + (maxWidth - barWidth) / 2;

  doc.setFillColor(0, 0, 0);
  // `module` dicadangkan Next.js (mematikan bundler), jadi bit barcode
  // dinamai `bit` supaya tidak menabrak scheduler Turbopack/webpack.
  for (const bit of modules) {
    if (bit === '1') {
      doc.rect(cursor, y, moduleWidth, height, 'F');
    }
    cursor += moduleWidth;
  }
}

/**
 * Susun PDF label untuk satu batch/produk.
 *
 * `height` dalam mm. Default 40 mm cocok untuk label 58×40; naikkan hanya
 * kalau nama_barang memuat dua baris dan tidak mau terpotong.
 */
export function buildBatchLabelPdf(
  data: BatchLabelData,
  options: { width?: LabelWidth; height?: number } = {},
): jsPDF {
  const width: LabelWidth = options.width ?? 58;
  const height = options.height ?? 40;
  // Margin kecil: printer thermal punya area tidak cetak di tepi.
  const margin = 2;
  const innerWidth = width - margin * 2;

  /**
   * jsPDF menebak orientasi dari `format`: begitu width > height, halaman
   * dibalik dan `format: [58, 40]` berakhir jadi 40×58 — seluruh koordinat x
   * jatuh di luar label dan barcode tergeser. `orientation: 'landscape'`
   * memaksa sumbu lebar-lebar itu, sesuai roll label thermal yang selalu lebih
   * lebar daripada tingginya.
   */
  const doc = new jsPDF({ unit: 'mm', format: [width, height], orientation: 'landscape' });

  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, width, 6, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BATCH LABEL', margin, 4);

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  const headerRight = data.po_transporter ? `PO ${data.po_transporter}` : '';
  if (headerRight) {
    doc.text(clamp(headerRight, 24), width - margin, 4, { align: 'right' });
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(safe(data.kode_barang), margin, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(clamp(safe(data.nama_barang), 38), margin, 15);

  // Baris ringkas: qty + satuan di kiri, kondisi di kanan.
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`QTY ${safe(data.actual_qty)} ${safe(data.satuan)}`.trim(), margin, 19.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 90);
  const conditionText = CONDITION_LABEL[data.condition ?? ''] ?? safe(data.condition);
  doc.text(clamp(conditionText, 20), margin + 30, 19.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`EXP ${safeDate(data.expired_date)}`, margin, 23.5);

  if (data.nama_depo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(90, 90, 90);
    doc.text(clamp(data.nama_depo, 30), margin + 26, 23.5);
  }

  // Teks barcode harus PERSIS sama dengan yang dicetak di atas: kalau berbeda,
  // produk tidak akan ketemu saat operator memindai label ini.
  const labelText = safe(data.barcode_label);
  const barcodeY = 26.5;
  drawBarcode(doc, labelText, margin, barcodeY, innerWidth, 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  doc.text(labelText, width / 2, barcodeY + 10.5, { align: 'center' });

  doc.setFontSize(5);
  doc.setTextColor(120, 120, 120);
  doc.text(`BATCH ${safe(data.batch_number)}`, width / 2, barcodeY + 13.2, { align: 'center' });

  return doc;
}

/** Unduh label sebagai file PDF. */
export function downloadBatchLabel(
  data: BatchLabelData,
  options?: { width?: LabelWidth; height?: number },
): void {
  const doc = buildBatchLabelPdf(data, options);
  const fileName = safe(data.kode_barang).replace(/[^\w-]+/g, '_');
  const url = URL.createObjectURL(doc.output('blob'));

  // Unduh lewat <a download> eksplisit, bukan `doc.save()`: perilaku `save()`
  // berbeda antara build browser dan Node (yang terakhir menulis ke disk saat
  // tes), sedangkan pola anchor ini sama dan sudah dipakai di PDF lain.
  const link = document.createElement('a');
  link.href = url;
  link.download = `label-batch-${fileName}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke ditunda: sebagian browser membaca blob setelah click() kembali.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Kirim label ke printer.
 *
 * `window.print()` membuka dialog cetak browser; pengguna memilih printer
 * thermal dan mengatur ukuran kertas ke "Label" agar tidak ada margin putih.
 * Printer Bluetooth langsung hanya mungkin di mobile — browser tidak boleh
 * berbicara ke perangkat BLE tanpa izin eksplisit pengguna per perangkat.
 *
 * PDF-nya dimuat ke <iframe> tersembunyi dari `blob:` lalu di-print dari
 * dokumen frame itu. Dua hal yang mudah salah:
 * - CSP aplikasi wajib mengizinkan `frame-src blob:` (lihat next.config.mjs).
 *   Tanpa itu frame diblokir, iframe tetap `about:blank`, dan print() melempar
 *   SecurityError "Blocked a frame ... from accessing a cross-origin frame".
 * - `blob:` harus di-revoke setelah frame dibuang, kalau tidak setiap cetak
 *   meninggalkan satu blob PDF di memori.
 *
 * Mengembalikan `true` HANYA kalau `print()` benar-benar berhasil dipanggil.
 * Pemanggil memakai nilai ini untuk menandai label "tercetak": menandai saat
 * cetak gagal (dulu selalu) membuat tombol berubah jadi "Cetak Ulang" padahal
 * label belum pernah keluar dari printer — persis keluhan operator.
 *
 * Kalau `print()` ditolak (CSP/cross-origin), label diunduh sebagai gantinya
 * dan hasilnya `false` (unduh ≠ cetak, jadi tidak menandai tercetak).
 */
export function printBatchLabel(
  data: BatchLabelData,
  options?: { width?: LabelWidth; height?: number },
): Promise<boolean> {
  const doc = buildBatchLabelPdf(data, options);
  const url = URL.createObjectURL(doc.output('blob'));

  return new Promise<boolean>((resolve) => {
    const frame = document.createElement('iframe');
    // 0x0 di pojok: dialog cetak memakai dokumen di dalam frame, halaman tidak
    // perlu menampilkan apa pun.
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('aria-hidden', 'true');
    frame.src = url;

    frame.onload = () => {
      let printed = false;
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        printed = true;
      } catch {
        downloadBatchLabel(data, options);
      }

      // Beri dialog print waktu mengambil dokumen sebelum iframe dibuang.
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 1000);

      resolve(printed);
    };

    document.body.appendChild(frame);
  });
}