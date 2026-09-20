'use client';

import jsPDF from 'jspdf';

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
  expedisi: string;
  shipper_name: string;
  shipper_address: string;
  shipper_phone: string;
  destination_name: string;
  destination_address?: string;
  notes: string;
  total_qty: number;
  items: RencanaKirimItem[];
  nama_depo: string;
}

const CODE39: Record<string, string> = {
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

function drawCode39(doc: jsPDF, value: string, centerX: number, y: number, width: number, height: number) {
  const displayValue = normalizePdfText(value).toUpperCase();
  const encoded = `*${displayValue.replace(/[^0-9A-Z. $/+%-]/g, '')}*`;
  const narrow = 1;
  const wide = 2.5;
  const gap = 1;
  const pattern = encoded.split('').map(char => CODE39[char] || CODE39['-']);
  const totalUnits = pattern.reduce((sum, charPattern) => sum + [...charPattern].reduce((n, bit) => n + (bit === '1' ? wide : narrow), 0) + gap, 0);
  const scale = Math.min(width / totalUnits, 0.45);
  const actualWidth = totalUnits * scale;
  const x = centerX - actualWidth / 2;
  let cursor = x;

  doc.setFillColor(0, 0, 0);
  for (const charPattern of pattern) {
    [...charPattern].forEach((bit, index) => {
      const barWidth = (bit === '1' ? wide : narrow) * scale;
      if (index % 2 === 0) doc.rect(cursor, y, barWidth, height, 'F');
      cursor += barWidth;
    });
    cursor += gap * scale;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(displayValue, centerX, y + height + 3.5, { align: 'center' });
}

function normalizePdfText(value: string | null | undefined): string {
  return (value || '-').replace(/[\t ]+/g, ' ').replace(/\r\n/g, '\n').trim();
}

function normalizeRkhDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function generateSuratJalanPDF(data: RencanaKirimData) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const M = 7;
  const CW = W - M * 2;
  const HDR_X = W - 72;

  let y = 10;

  // ── HEADER (kanan, print-friendly) ──
  const hdrData: [string, string][] = [
    ['Tanggal RKH', normalizeRkhDate(data.rkh_date)],
    ['Nama Driver', data.driver_name || '-'],
    ['No. PO Transporter', data.po_transporter || '-'],
  ];
  const LH = 5;
  for (const [lbl, val] of hdrData) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(lbl, HDR_X, y);
    doc.setFont('helvetica', 'normal');
    doc.text(':', HDR_X + 26, y);
    doc.setFont('helvetica', 'bold');
    const maxW = W - M - HDR_X - 30;
    let fs = 9;
    doc.setFontSize(fs);
    while (doc.getTextWidth(val || '-') > maxW && fs > 6) { fs -= 0.5; doc.setFontSize(fs); }
    doc.text(val, W - M, y, { align: 'right' });
    y += LH;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('BARCODE', HDR_X, y);
  const barcodeValue = normalizePdfText(data.po_transporter);
  const barcodeCenter = HDR_X + 39;
  drawCode39(doc, barcodeValue, barcodeCenter, y - 3.5, 48, 7);
  y += 12;

  // ── TITLE ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SURAT JALAN', W / 2, y, { align: 'center' });
  y += 10;

  const pad = 5;
  const ly = M + pad;
  const rx = M + 48;
  const valueWidth = W - M - rx - pad;
  const addressLineHeight = 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const addressText = normalizePdfText(data.shipper_address);
  const addressLines: string[] = doc.splitTextToSize(addressText, valueWidth);
  const phone = normalizePdfText(data.shipper_phone);
  if (phone !== '-') {
    const phoneSuffix = `  Hp. ${phone}`;
    const last = addressLines[addressLines.length - 1] || '';
    if (doc.getTextWidth(`${last}${phoneSuffix}`) <= valueWidth) {
      addressLines[addressLines.length - 1] = `${last}${phoneSuffix}`;
    } else {
      addressLines.push(`Hp. ${phone}`);
    }
  }
  const destAddr = normalizePdfText((data as unknown as { destination_address?: string }).destination_address);
  const destFull = destAddr !== '-' && destAddr !== '' ? `${normalizePdfText(data.destination_name)}\n${destAddr}` : normalizePdfText(data.destination_name);
  const destinationLines = doc.splitTextToSize(destFull, valueWidth);
  const vehicle = data.expedisi ? `${normalizePdfText(data.expedisi)} / ${normalizePdfText(data.nopol)}` : normalizePdfText(data.nopol);
  const vehicleLines = doc.splitTextToSize(vehicle.trim(), valueWidth);
  const contentHeight = 7 + 5 + addressLines.length * addressLineHeight + 5 + destinationLines.length * addressLineHeight + vehicleLines.length * addressLineHeight + 6;
  const boxY = y;
  const boxH = Math.max(46, contentHeight + 5);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(M, boxY, CW, boxH, 'D');

  let ay = boxY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('PENGIRIMAN', ly, ay);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8);
  doc.text(`:  ${normalizePdfText(data.shipper_name)}`, rx, ay);
  ay += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(addressLines, rx, ay);
  ay += addressLines.length * addressLineHeight + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('KEPADA YTH', ly, ay);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(destinationLines.map((line: string, idx: number) => idx === 0 ? `:  ${line}` : `   ${line}`), rx, ay);
  ay += destinationLines.length * addressLineHeight + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('KENDARAAN', ly, ay);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(vehicleLines.map((line: string, idx: number) => idx === 0 ? `:  ${line}` : `   ${line}`), rx, ay);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Kami kirimkan barang-barang sbb:', ly, boxY + boxH - 3.5);

  y = boxY + boxH + 5;

  // ── ITEMS TABLE — modern ──
  const cW = [10, 28, 94, 18, 14, 32];
  const cX: number[] = [];
  let tx = M;
  for (const w of cW) { cX.push(tx); tx += w; }
  const tW = cW.reduce((a, b) => a + b, 0);
  const hh = 8;
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(M, y, tW, hh, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  const heads = ['NO', 'KODE', 'NAMA BARANG', 'QTY', 'SAT', 'KET'];
  for (let i = 0; i < heads.length; i++) {
    const ax = (i === 0 || i === 3 || i === 4) ? cX[i] + cW[i] / 2 : cX[i] + 2.5;
    const al = (i === 0 || i === 3 || i === 4) ? { align: 'center' as const } : {};
    doc.text(heads[i], ax, y + 4.8, al);
  }
  y += hh;
  const rows = data.items.map(it => [it.item_number.toString(), it.kode_barang || '-', it.nama_barang || '-', (it.jumlah || 0).toString(), it.satuan || '-', it.keterangan || '-']);
  if (rows.length === 0) rows.push(['', '', '', '', '', '']);
  const rH = 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  for (let r = 0; r < rows.length; r++) {
    const ry = y + r * rH;
    if (r % 2 === 1) { doc.setFillColor(250, 250, 250); doc.rect(M, ry, tW, rH, 'F'); }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.12);
    doc.rect(M, ry, tW, rH, 'D');
    for (let c = 1; c < cW.length; c++) doc.line(cX[c], ry, cX[c], ry + rH);
    doc.setTextColor(0, 0, 0);
    for (let c = 0; c < rows[r].length; c++) {
      const t = rows[r][c]; if (!t) continue;
      const ax = (c === 0 || c === 3 || c === 4) ? cX[c] + cW[c] / 2 : cX[c] + 2.2;
      const al = (c === 0 || c === 3 || c === 4) ? { align: 'center' as const } : {};
      doc.text(t, ax, ry + 3.5, al);
    }
  }
  y += rows.length * rH;
  // Total — abu terang, teks hitam
  const totH = 7;
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(M, y, tW, totH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Total', cX[2] + 4, y + 5);
  doc.text(String(data.total_qty || 0), cX[3] + cW[3] / 2, y + 5, { align: 'center' });
  y += totH + 5;

  // ── NOTES (print-friendly) ──
  const nbH = 18;
  const nbY = y;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(M, nbY, CW, nbH, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Catatan', M + 4, nbY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (data.notes) doc.text(doc.splitTextToSize(normalizePdfText(data.notes), CW - 6), M + 4, nbY + 12);
  y = nbY + nbH + 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Pastikan barang sudah dicek dan pas saat muat di gudang', W / 2, y, { align: 'center' });
  y += 7;

  // ── SIGNATURES (print-friendly) ──
  const sW = CW / 4;
  const sH = 30;
  const sTop = y;
  const sLbl = ['Pengirim,', 'Mengetahui,', 'Supir,', 'Penerima,'];
  const sRole = ['( Warehouse Coord )', '( Planner RDC )', '', `( ${data.nama_depo || 'DEPO'} )`];
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  for (let i = 0; i < 4; i++) {
    const sx = M + i * sW;
    doc.rect(sx, sTop, sW, sH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(sLbl[i], sx + sW / 2, sTop + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Tgl.    :', sx + 2, sTop + 14);
    doc.text('Cap.     :', sx + 2, sTop + 21);
    doc.text('Ttd.    :', sx + 2, sTop + 28);
    doc.setFontSize(6);
    doc.text(sRole[i], sx + sW / 2, sTop + sH - 3, { align: 'center' });
  }
  y = sTop + sH + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  const legends = [
    { t: 'Putih — Accounting', x: M },
    { t: 'Merah — Gudang', x: M + 36 },
    { t: 'Hijau — Customer', x: M + 70 },
    { t: 'Kuning — Accounting', x: M + 104 },
    { t: 'Biru — Gudang', x: M + 138 },
  ];
  for (const l of legends) doc.text(l.t, l.x, y);

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
  window.open(url, '_blank');
}