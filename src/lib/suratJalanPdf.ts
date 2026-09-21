'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface RencanaKirimItem {
  item_number: number;
  kode_barang: string;
  nama_barang: string;
  jumlah: number;
  satuan: string;
  keterangan: string;
}

export interface RencanaKirimData {
  rkh_date: string;
  po_transporter: string;
  driver_name: string;
  nopol: string;
  jenis_kendaraan?: string;
  expedisi: string;
  shipper_name: string;
  shipper_address: string;
  shipper_phone: string;
  destination_name: string;
  destination_address?: string;
  notes: string;
  total_qty: number;
  total_kubikasi?: number | null;
  items: RencanaKirimItem[];
  nama_depo: string;
}

/**
 * Tabel Code 39. Setiap nilai adalah representasi 12 modul (lebar sudah
 * diperluas: elemen wide = 2 modul, narrow = 1 modul). Elemen bar/space
 * ditentukan oleh *run* bit yang sama, bukan oleh paritas index.
 */
const CODE39_CHARS: Record<string, string> = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
  '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
  '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
  'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
  'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
  'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
  'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
  'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
  'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101', '$': '100100100101',
  '/': '100100101001', '+': '100101001001', '%': '101001001001', '*': '100101101101',
};

const W = 210;
const H = 297;
const M = 8;

/** jsPDF memang punya getNumberOfPages(); @types/jspdf lama belum mendeklarasikannya. */
type JsPdfWithPages = jsPDF & { getNumberOfPages: () => number; lastAutoTable?: { finalY: number } };

export function getPdfPageCount(doc: jsPDF): number {
  return (doc as JsPdfWithPages).getNumberOfPages();
}

export function normalizePdfText(value: string | null | undefined): string {
  return (value || '-').replace(/[\t ]+/g, ' ').replace(/\r\n/g, '\n').trim() || '-';
}

export function normalizeRkhDate(value: string | null | undefined): string {
  if (!value) return '-';
  // Ambil bagian tanggal secara tekstual: new Date('YYYY-MM-DD') diparse sebagai
  // UTC sehingga di timezone negatif tanggal bisa bergeser satu hari.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const [, yyyy, mm, dd] = match;
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Buang karakter yang tidak didukung Code 39 agar nilai yang dicetak (human
 * readable) selalu identik dengan nilai yang di-encode ke bar.
 */
export function sanitizeCode39Value(value: string | null | undefined): string {
  return normalizePdfText(value).toUpperCase().replace(/[^0-9A-Z. $/+%-]/g, '') || '-';
}

/**
 * Modul barcode ('1' = bar, '0' = space) untuk seluruh isi barcode, termasuk
 * start/stop `*` dan gap (space narrow) antar karakter.
 */
export function encodeCode39(value: string | null | undefined): string {
  const clean = sanitizeCode39Value(value);
  return `*${clean}*`
    .split('')
    .map((char) => CODE39_CHARS[char] ?? CODE39_CHARS['-'])
    .join('0');
}

function drawCode39(doc: jsPDF, value: string, centerX: number, y: number, maxWidth: number, height: number) {
  const modules = encodeCode39(value);
  const moduleWidth = Math.min(maxWidth / modules.length, 0.34);
  const actualWidth = modules.length * moduleWidth;
  let cursor = centerX - actualWidth / 2;

  doc.setFillColor(0, 0, 0);
  let i = 0;
  while (i < modules.length) {
    let j = i + 1;
    while (j < modules.length && modules[j] === modules[i]) j++;
    const runWidth = (j - i) * moduleWidth;
    if (modules[i] === '1') doc.rect(cursor, y, runWidth, height, 'F');
    cursor += runWidth;
    i = j;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text(sanitizeCode39Value(value), centerX, y + height + 3.6, { align: 'center' });
}

function drawInfoBox(doc: jsPDF, data: RencanaKirimData, boxTop: number): number {
  const boxW = W - M * 2;
  const labelX = M + 5;
  const valueX = M + 42;
  const valueW = boxW - (valueX - M) - 5;
  const lineHeight = 4.3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const addressLines = doc.splitTextToSize(normalizePdfText(data.shipper_address), valueW);
  const phone = normalizePdfText(data.shipper_phone);
  if (phone !== '-') {
    const suffix = `  Hp. ${phone}`;
    const last = addressLines[addressLines.length - 1] ?? '';
    if (doc.getTextWidth(`${last}${suffix}`) <= valueW) {
      addressLines[addressLines.length - 1] = `${last}${suffix}`;
    } else {
      addressLines.push(`Hp. ${phone}`);
    }
  }

  const destAddr = normalizePdfText(data.destination_address);
  const destFull = destAddr !== '-' ? `${normalizePdfText(data.destination_name)}\n${destAddr}` : normalizePdfText(data.destination_name);
  const destinationLines = doc.splitTextToSize(destFull, valueW);
  const vehicle = data.expedisi
    ? `${normalizePdfText(data.expedisi)} / ${normalizePdfText(data.nopol)}`
    : normalizePdfText(data.nopol);
  const vehicleLines = doc.splitTextToSize(vehicle.trim(), valueW);

  const boxH = 8 + addressLines.length * lineHeight + 3 + destinationLines.length * lineHeight + 3 + vehicleLines.length * lineHeight + 5;

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.3);
  doc.rect(M, boxTop, boxW, boxH, 'D');

  let ay = boxTop + 6.5;
  const label = (text: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(text, labelX, ay);
  };
  const valueLines = (lines: string[]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(lines.map((line, index) => (index === 0 ? `:  ${line}` : `   ${line}`)), valueX, ay);
  };

  label('PENGIRIM');
  valueLines([normalizePdfText(data.shipper_name)]);
  ay += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(addressLines, valueX, ay);
  ay += addressLines.length * lineHeight + 3;

  label('KEPADA YTH');
  valueLines(destinationLines);
  ay += destinationLines.length * lineHeight + 3;

  label('KENDARAAN');
  valueLines(vehicleLines);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Kami kirimkan barang-barang sbb:', labelX, boxTop + boxH - 3);

  return boxTop + boxH;
}

function drawFooter(doc: jsPDF, data: RencanaKirimData, afterTableY: number): void {
  const CW = W - M * 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const notesLines = data.notes ? doc.splitTextToSize(normalizePdfText(data.notes), CW - 12) : [];
  const notesBody = notesLines.length > 0 ? notesLines : ['-'];
  const notesH = 12 + notesBody.length * 4;
  const signatureH = 26;
  const footerNeed = notesH + 6 + 6 + signatureH + 5 + 6;

  let fy = afterTableY + 6;
  if (fy + footerNeed > H - M) {
    doc.addPage();
    fy = 20;
  }

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.3);
  doc.rect(M, fy, CW, notesH, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text('Catatan', M + 5, fy + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text(notesBody, M + 5, fy + 11.5);
  fy += notesH + 6;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  doc.text('Pastikan barang sudah dicek dan pas saat muat di gudang', W / 2, fy, { align: 'center' });
  fy += 6;

  const sW = CW / 4;
  const sTop = fy;
  const titles = ['Pengirim,', 'Mengetahui,', 'Supir,', 'Penerima,'];
  const roles = ['( Warehouse Coord )', '( Planner RDC )', '', `( ${normalizePdfText(data.nama_depo)} )`];

  for (let i = 0; i < 4; i++) {
    const sx = M + i * sW;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.3);
    doc.rect(sx, sTop, sW, signatureH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(20, 20, 20);
    doc.text(titles[i], sx + sW / 2, sTop + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    const roleLines = roles[i] ? doc.splitTextToSize(roles[i], sW - 8) : [];
    if (roleLines.length > 0) doc.text(roleLines, sx + sW / 2, sTop + 9.5, { align: 'center' });
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.2);
    doc.line(sx + 6, sTop + 18, sx + sW - 6, sTop + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(40, 40, 40);
    doc.text('Tgl.', sx + 5, sTop + 23.5);
  }
  fy = sTop + signatureH + 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(60, 60, 60);
  const legends: [string, string][] = [
    ['Putih', 'Accounting'],
    ['Merah', 'Gudang'],
    ['Hijau', 'Customer'],
    ['Kuning', 'Accounting'],
    ['Biru', 'Gudang'],
  ];
  const legendGap = CW / legends.length;
  legends.forEach(([color, role], index) => {
    doc.text(`${color} — ${role}`, M + index * legendGap, fy);
  });
}

function stampPageChrome(doc: jsPDF, data: RencanaKirimData): void {
  const pageCount = getPdfPageCount(doc);
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(`Halaman ${page} dari ${pageCount}`, W - M, H - 6, { align: 'right' });
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      doc.text('SURAT JALAN', M, 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text(`PO ${normalizePdfText(data.po_transporter)} • ${normalizeRkhDate(data.rkh_date)}`, M, 11.5);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.line(M, 13.5, W - M, 13.5);
    }
  }
  doc.setTextColor(0, 0, 0);
  doc.setPage(1);
}

export function generateSuratJalanPDF(data: RencanaKirimData) {
  const doc = new jsPDF('p', 'mm', 'a4');

  // ── LETTERHEAD + META ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('ONEZENTRA', M, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Warehouse Management System', M, 19.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(`DEPO ${normalizePdfText(data.nama_depo)}`, M, 25);

  const meta: [string, string][] = [
    ['Tanggal RKH', normalizeRkhDate(data.rkh_date)],
    ['Nama Driver', normalizePdfText(data.driver_name)],
    ['No. PO Transporter', normalizePdfText(data.po_transporter)],
  ];
  if (data.jenis_kendaraan) meta.push(['Jenis Kendaraan', normalizePdfText(data.jenis_kendaraan)]);

  let my = 11;
  for (const [label, val] of meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, W - M - 58, my);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(val, W - M, my, { align: 'right' });
    my += 4.6;
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  const ruleY = Math.max(28, my + 1);
  doc.line(M, ruleY, W - M, ruleY);

  // ── TITLE + BARCODE ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('SURAT JALAN', W / 2, ruleY + 9, { align: 'center' });
  drawCode39(doc, data.po_transporter, W / 2, ruleY + 12, 80, 9);

  // ── INFO BOX ──
  const boxTop = ruleY + 26.5;
  const boxBottom = drawInfoBox(doc, data, boxTop);
  const tableY = boxBottom + 4;

  // ── ITEMS TABLE (autoTable: pagination + text wrap) ──
  const itemRows = data.items.map((item) => [
    String(item.item_number ?? ''),
    normalizePdfText(item.kode_barang),
    normalizePdfText(item.nama_barang),
    String(Number(item.jumlah) || 0),
    normalizePdfText(item.satuan),
    normalizePdfText(item.keterangan),
  ]);
  if (itemRows.length === 0) itemRows.push(['', '-', 'Tidak ada item', '-', '-', '-']);

  autoTable(doc, {
    startY: tableY,
    margin: { top: 18, left: M, right: M, bottom: 16 },
    head: [['NO', 'KODE', 'NAMA BARANG', 'QTY', 'SAT', 'KET']],
    body: itemRows,
    foot: [[
      { content: 'Total', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: String(Number(data.total_qty) || 0), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: '', styles: {} },
      { content: '', styles: {} },
      { content: '', styles: {} },
    ]],
    theme: 'grid',
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      textColor: [20, 20, 20],
      lineColor: [120, 120, 120],
      lineWidth: 0.15,
      cellPadding: 1.5,
      minCellHeight: 5,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [20, 20, 20],
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.2,
    },
    footStyles: {
      fillColor: [245, 245, 245],
      textColor: [20, 20, 20],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 30 },
      2: { cellWidth: 82 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 38 },
    },
  });

  const afterTableY = (doc as JsPdfWithPages).lastAutoTable?.finalY ?? tableY;

  // ── NOTES + SIGNATURES (halaman terakhir, dengan page-break bila perlu) ──
  drawFooter(doc, data, afterTableY);

  stampPageChrome(doc, data);

  return doc;
}

export function downloadSuratJalan(data: RencanaKirimData) {
  const doc = generateSuratJalanPDF(data);
  doc.save(`Surat_Jalan_${data.po_transporter || 'document'}.pdf`);
}

export function previewSuratJalan(data: RencanaKirimData) {
  const doc = generateSuratJalanPDF(data);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Popup diblokir browser — fallback unduh agar dokumen tetap bisa diakses user.
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Surat_Jalan_${data.po_transporter || 'document'}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  // Revoke ditunda: tab preview membaca blob saat navigasi; revoke segera memutus tab di sebagian browser.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
