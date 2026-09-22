import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type PdfMode = 'save' | 'preview';
type ThlPhoto = File | { file_path?: string; file_name?: string };
type ApprovalSection = { title: string; people: { name: string; role: string }[] };

type ThlData = {
  tanggal_pengajuan: string;
  kode_depo?: string;
  nama_depo?: string;
  no_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  kubikasi_base: number;
  nominal_biaya: number;
  is_rfah_required: boolean;
  rfah_name: string;
  status: string;
  submitted_at?: string | null;
  checked_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  revised_at?: string | null;
  revisi_reason?: string | null;
  approval_pengajuan?: string;
  approval_pengajuan_level?: string;
  approval_sections?: ApprovalSection[];
  details: {
    nama_thl: string;
    driver_name?: string;
    nopol_kendaraan: string;
    type_kendaraan: string;
    no_surat_jalan?: string;
    kendaraan_sj?: string;
    kendaraan_nopol?: string;
    kendaraan_type?: string;
    nominal_biaya: number;
    kubikasi: number;
    droppoint: string;
    posisi: string;
    jam_datang?: string;
    jam_pulang?: string;
    photos?: ThlPhoto[];
  }[];
};

type RetribusiData = {
  tanggal_pengajuan: string;
  kode_depo: string;
  nama_depo: string;
  nominal_biaya: number;
  is_rfah_required: boolean;
  rfah_name: string;
  status: string;
  submitted_at?: string | null;
  checked_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  revised_at?: string | null;
  revisi_reason?: string | null;
  approval_pengajuan?: string;
  approval_pengajuan_level?: string;
  approval_sections?: ApprovalSection[];
  details: {
    nopol_kendaraan: string;
    type_kendaraan: string;
    no_surat_jalan: string;
    kendaraan_sj?: string;
    kendaraan_nopol?: string;
    kendaraan_type?: string;
    nominal_biaya: number;
    biaya_thl_detail?: {
      nama_thl?: string;
      driver_name?: string;
      kubikasi?: number;
      droppoint?: string;
      posisi?: string;
      jam_datang?: string;
      jam_pulang?: string;
      photos?: ThlPhoto[];
    } | null;
  }[];
  documents: { document_type: string; file_name: string; file_path?: string }[];
};

/** Gabungkan seluruh nomor surat jalan milik satu kendaraan ke sel PDF yang sama. */
export function formatSuratJalan(detail: { no_surat_jalan?: string | null; kendaraan_sj?: string | null }): string {
  const suratJalans = [detail.no_surat_jalan, detail.kendaraan_sj]
    .flatMap((item) => String(item || '').split(/[,;\n]+/))
    .map((item) => item.trim())
    .filter((item, index, values) => item !== '' && values.indexOf(item) === index);

  return suratJalans.join(', ') || '-';
}

function formatPdfColumn(primary?: string | null, additional?: string | null): string {
  const values = [primary, additional]
    .flatMap((item) => String(item || '').split(/[,;\n]+/))
    .map((item) => item.trim())
    .filter((item, index, allValues) => item !== '' && allValues.indexOf(item) === index);

  return values.join(', ') || '-';
}

const money = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const date = (value: string | null | undefined) => {
  if (!value) return '-';
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};
const value = (item: unknown) => String(item ?? '-');

const STAMP_GREEN: [number, number, number] = [21, 128, 61];
const STAMP_RED: [number, number, number] = [220, 38, 38];
const STAMP_ORANGE: [number, number, number] = [217, 119, 6];

type AuditDates = { submitted?: string; checked?: string; approved?: string; rejected?: string; revised?: string };

/** Nama pelaku aksi dari relasi *By (ada pada item tersimpan, kosong pada draft form). */
function actorName(data: RetribusiData, key: 'submittedBy' | 'checkedBy' | 'approvedBy' | 'rejectedBy' | 'revisedBy'): string {
  const holder = data as unknown as Record<string, { full_name?: string } | null | undefined>;
  return holder[key]?.full_name || '';
}

/**
 * Nama pada kolom approval mencerminkan AKSI, bukan daftar assignee.
 * Draft/preview pengajuan yang belum diperiksa: kotak Mengetahui/Menyetujui
 * menampilkan '-' (role tetap tertera) + tanpa cap.
 */
function actedNameFor(section: ApprovalSection, data: RetribusiData, dates: AuditDates): string {
  const assignee = section.people[0]?.name || '-';
  if (section.title === 'Mengajukan') return data.approval_pengajuan || assignee;
  if (section.title === 'Mengetahui') {
    if (!dates.checked || dates.checked === '-') return '-';
    return actorName(data, 'checkedBy') || assignee;
  }
  if (section.title === 'Menyetujui') {
    if (!['approved', 'rejected', 'revisi'].includes(data.status)) return '-';
    const key = data.status === 'approved' ? 'approvedBy' : data.status === 'rejected' ? 'rejectedBy' : 'revisedBy';
    return actorName(data, key) || assignee;
  }
  // RFAH* dan section lain: nama hanya setelah aksi final.
  return data.status === 'approved' ? assignee : '-';
}

type StampSpec = { text: string; color: [number, number, number]; date: string };

function auditDates(data: { submitted_at?: string | null; checked_at?: string | null; approved_at?: string | null; rejected_at?: string | null; revised_at?: string | null }): AuditDates {
  return {
    submitted: date(data.submitted_at),
    checked: date(data.checked_at),
    approved: date(data.approved_at),
    rejected: date(data.rejected_at),
    revised: date(data.revised_at),
  };
}

function stampFor(section: ApprovalSection, status: string, dates: AuditDates): StampSpec | null {
  if (section.title === 'Mengajukan') {
    // Sejajar server (resolveStamps): cap mengikuti AKSI submit (status),
    // bukan keberadaan nama — nama bisa kosong pada data lama/API langsung.
    return status && status !== 'draft'
      ? { text: 'PENGAJUAN', color: STAMP_GREEN, date: dates.submitted || '' }
      : null;
  }

  if (section.title === 'Mengetahui') {
    // Sejajar server (resolveStamps): cap DIPERIKSA hanya bila aksi periksa
    // benar terjadi (checked_at ada) — BUKAN karena nama assignee terdaftar.
    // Versi lama mencap dari keberadaan nama sehingga PDF draft pun tercap.
    return dates.checked ? { text: 'DIPERIKSA', color: STAMP_GREEN, date: dates.checked } : null;
  }

  if (section.title === 'Menyetujui') {
    if (status === 'approved') return { text: 'DISETUJUI', color: STAMP_GREEN, date: dates.approved || '' };
    if (status === 'rejected') return { text: 'DITOLAK', color: STAMP_RED, date: dates.rejected || '' };
    if (status === 'revisi') return { text: 'REVISI', color: STAMP_ORANGE, date: dates.revised || '' };
  }

  return null;
}

function drawStamp(doc: jsPDF, cx: number, cy: number, stamp: StampSpec) {
  const angle = -14;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotated = (px: number, py: number) => ({
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  });

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(14);
  const w = doc.getTextWidth(stamp.text) + 10;
  const h = 11;
  const tl = rotated(cx - w / 2, cy - h / 2);
  const tr = rotated(cx + w / 2, cy - h / 2);
  const br = rotated(cx + w / 2, cy + h / 2);
  const bl = rotated(cx - w / 2, cy + h / 2);
  doc.setDrawColor(stamp.color[0], stamp.color[1], stamp.color[2]);
  doc.setLineWidth(0.9);
  doc.line(tl.x, tl.y, tr.x, tr.y);
  doc.line(tr.x, tr.y, br.x, br.y);
  doc.line(br.x, br.y, bl.x, bl.y);
  doc.line(bl.x, bl.y, tl.x, tl.y);
  doc.setTextColor(stamp.color[0], stamp.color[1], stamp.color[2], 0.8);
  doc.text(stamp.text, cx, cy - 0.5, { align: 'center', angle });

  doc.setFontSize(6);
  const dateLabel = stamp.date || '-';
  const dateWidth = doc.getTextWidth(dateLabel);
  const dateA = rotated(cx - dateWidth / 2 - 1, cy + 2.5);
  const dateB = rotated(cx + dateWidth / 2 + 1, cy + 2.5);
  doc.line(dateA.x, dateA.y, dateB.x, dateB.y);
  doc.text(dateLabel, cx, cy + 5, { align: 'center', angle });
}

async function loadApprovalSections(data: RetribusiData): Promise<ApprovalSection[]> {
  if (data.approval_sections?.length) return data.approval_sections;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  try {
    const response = await fetch(`${apiUrl}/approval-assignments?kode_depo=${encodeURIComponent(data.kode_depo)}`, { credentials: 'include' });
    if (response.ok) {
      const payload = await response.json() as { data?: Record<string, { user?: { full_name?: string } }> };
      const titles: Record<string, string> = { BLC: 'Mengajukan', BAC: 'Mengetahui', RLH: 'Menyetujui' };
      const sections = ['BLC', 'BAC', 'RLH'].map((level) => ({
        title: titles[level],
        people: [{
          name: level === 'BLC'
            ? data.approval_pengajuan || payload.data?.[level]?.user?.full_name || '-'
            : payload.data?.[level]?.user?.full_name || '-',
          role: level === 'BLC' ? data.approval_pengajuan_level || 'BLC' : level,
        }],
      }));
      if (sections.some((section) => section.people[0].name !== '-')) return sections;
    }
  } catch {
    // Use the configured defaults when the settings endpoint is unavailable.
  }

  return [
    { title: 'Mengajukan', people: [{ name: data.approval_pengajuan || '-', role: data.approval_pengajuan_level || 'BLC' }] },
    { title: 'Mengetahui', people: [{ name: '-', role: 'BAC' }] },
    { title: 'Menyetujui', people: [{ name: '-', role: 'RLH' }] },
  ];
}

let pdfFontsReady: Promise<{ regular: string; bold: string }> | null = null;

async function fontToBase64(response: Response): Promise<string> {
  if (!response.ok) throw new Error('Roboto font could not be loaded');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function loadPdfFonts(doc: jsPDF): Promise<void> {
  if (!pdfFontsReady) {
    pdfFontsReady = Promise.all([
      fetch('/fonts/Roboto-Regular.ttf').then(fontToBase64),
      fetch('/fonts/Roboto-Bold.ttf').then(fontToBase64),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }

  const fonts = await pdfFontsReady;
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');
}

function showPreview(doc: jsPDF) {
  const url = String(doc.output('bloburl'));
  const tab = window.open(url, '_blank');
  if (!tab) window.location.href = url;
}

export function generateTHLPdf(data: ThlData) {
  void buildCombinedRetribusi(toCombinedRetribusiData(data), 'save');
}

export function previewTHLPdf(data: ThlData) {
  void buildCombinedRetribusi(toCombinedRetribusiData(data), 'preview');
}

function toCombinedRetribusiData(data: ThlData): RetribusiData {
  return {
    tanggal_pengajuan: data.tanggal_pengajuan,
    kode_depo: data.kode_depo || '',
    nama_depo: data.nama_depo || '',
    nominal_biaya: data.nominal_biaya,
    is_rfah_required: data.is_rfah_required,
    rfah_name: data.rfah_name,
    status: data.status,
    submitted_at: data.submitted_at,
    checked_at: data.checked_at,
    approved_at: data.approved_at,
    rejected_at: data.rejected_at,
    rejection_reason: data.rejection_reason,
    revised_at: data.revised_at,
    revisi_reason: data.revisi_reason,
    approval_pengajuan: data.approval_pengajuan,
    approval_pengajuan_level: data.approval_pengajuan_level,
    approval_sections: data.approval_sections,
    details: data.details.map((detail) => ({
      nopol_kendaraan: formatPdfColumn(detail.nopol_kendaraan, detail.kendaraan_nopol),
      type_kendaraan: formatPdfColumn(detail.type_kendaraan, detail.kendaraan_type),
      no_surat_jalan: formatSuratJalan(detail),
      kendaraan_sj: detail.kendaraan_sj,
      nominal_biaya: detail.nominal_biaya,
      biaya_thl_detail: detail,
    })),
    documents: [],
  };
}

let headerLogoCache: Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> | null = null;

/**
 * Logo headerPDF dari public/biaya THL.jpeg (sekali fetch per sesi).
 * Null bila file belum disimpan — pemanggil wajib fallback ke teks SNS.
 */
function loadHeaderLogo(): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  if (!headerLogoCache) {
    headerLogoCache = (async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const backendOrigin = apiUrl.replace(/\/api\/v1\/?$/, '');
      const logoUrls = [
        `${window.location.origin}/biaya%20THL.jpeg`,
        `${backendOrigin}/biaya%20THL.jpeg`,
      ];

      for (const logoUrl of logoUrls) {
        try {
          const res = await fetch(logoUrl, { credentials: 'include' });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) continue;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('read'));
            reader.readAsDataURL(blob);
          });
          return { dataUrl, format: blob.type === 'image/png' ? 'PNG' : 'JPEG' };
        } catch {
          // Try the backend asset when the Next public path is unavailable.
        }
      }

      return null;
    })();
  }
  return headerLogoCache;
}

async function drawHeaderLogo(doc: jsPDF, cx: number, cy: number): Promise<void> {
  const logo = await loadHeaderLogo();
  if (!logo) return;
  doc.addImage(logo.dataUrl, logo.format, cx - 7, cy - 7, 14, 14, undefined, 'FAST');
}

async function readPhoto(photo: ThlPhoto): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  if (photo instanceof File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(photo);
    });
    return { dataUrl, format: photo.type === 'image/png' ? 'PNG' : 'JPEG' };
  }

  if (!photo.file_path) return null;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const response = await fetch(`${apiUrl}/storage/${photo.file_path}`, { credentials: 'include' });
  if (!response.ok) return null;
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { dataUrl, format: blob.type === 'image/png' ? 'PNG' : 'JPEG' };
}

async function buildCombinedRetribusi(data: RetribusiData, mode: PdfMode) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  await loadPdfFonts(doc);
  const width = 297;
  const pageMargin = 10;
  const pageWidth = width - pageMargin * 2;

  doc.setDrawColor(35, 35, 35);
  doc.setFillColor(244, 246, 248);
  doc.setLineWidth(0.35);
  doc.rect(pageMargin, 7, pageWidth, 18, 'FD');
  doc.line(pageMargin + 18, 7, pageMargin + 18, 25);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  if (!(await loadHeaderLogo())) doc.text('SNS', pageMargin + 9, 18, { align: 'center' });
  else await drawHeaderLogo(doc, pageMargin + 9, 15);
  doc.setFontSize(11.5);
  doc.text('FORM KLAIM BIAYA PENGAJUAN RETRIBUSI', 148, 17.5, { align: 'center' });
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.2);
  doc.text(`DEPO: ${value(data.nama_depo || data.kode_depo)}`, 210, 12.5);
  doc.text(`Tanggal Pengajuan: ${date(data.tanggal_pengajuan)}`, 210, 18.5);

  autoTable(doc, {
    startY: 27,
    margin: { left: pageMargin, right: pageMargin },
    head: [['No', 'NO KENDARAAN', 'JENIS KENDARAAN', 'SURAT JALAN', 'NOMINAL', 'Paraf']],
    body: data.details.map((detail, index) => [index + 1, detail.nopol_kendaraan || '-', detail.type_kendaraan || '-', formatSuratJalan(detail), money(detail.nominal_biaya), '']),
    foot: [['', '', '', 'Total', money(data.nominal_biaya), '']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, textColor: [20, 20, 20], lineColor: [35, 35, 35], lineWidth: 0.25, cellPadding: 1.3, minCellHeight: 5.5, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 62 }, 2: { cellWidth: 52 }, 3: { cellWidth: 55 }, 4: { cellWidth: 46, halign: 'right' }, 5: { cellWidth: 53 } },
  });
  const retribusiY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 65;

  const approvalY = Math.min(retribusiY + 3, 82);
  const approvalSections = (await loadApprovalSections(data)).filter((section) => section.title !== 'RFAH*' || data.is_rfah_required);

  const approvalWidth = pageWidth / approvalSections.length;
  doc.setFontSize(7);
  const audit = auditDates(data);
  approvalSections.forEach((section, index) => {
    const x = pageMargin + approvalWidth * index;
    doc.rect(x, approvalY, approvalWidth, 6);
    doc.text(section.title, x + approvalWidth / 2, approvalY + 4, { align: 'center' });
    doc.rect(x, approvalY + 6, approvalWidth, 20);
    doc.rect(x, approvalY + 26, approvalWidth, 7);
    const person = section.people[0];
    const approvalName = mode === 'preview'
      ? ''
      : section.title === 'Mengajukan'
        ? (data.approval_pengajuan || person?.name || '-')
        : actedNameFor(section, data, audit);
    doc.text(approvalName, x + approvalWidth / 2, approvalY + 17, { align: 'center' });
    doc.text(section.title === 'Mengajukan' ? (data.approval_pengajuan_level || person?.role || '-') : (person?.role || '-'), x + approvalWidth / 2, approvalY + 30.5, { align: 'center' });

    const stamp = mode === 'preview' ? null : stampFor(section, data.status, audit);
    if (stamp) drawStamp(doc, x + approvalWidth / 2, approvalY + 16, stamp);
  });
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(6.2);
  doc.text('Note: * Jika pengajuan biaya > Rp 1 Juta Rupiah', pageMargin, approvalY + 38);

  const rejected = data.status === 'rejected';
  const revisi = data.status === 'revisi';
  const thlTop = approvalY + (rejected ? 54 : revisi ? 54 : 42);
  if (rejected && data.rejection_reason) {
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(185, 28, 28);
    doc.text(`DITOLAK — ${data.rejection_reason}`, pageMargin, approvalY + 46, { maxWidth: pageWidth });
    doc.setTextColor(20, 20, 20);
  }
  if (revisi && data.revisi_reason) {
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(180, 83, 9);
    doc.text(`REVISI — ${data.revisi_reason}`, pageMargin, approvalY + 46, { maxWidth: pageWidth });
    doc.setTextColor(20, 20, 20);
  }
  doc.setDrawColor(35, 35, 35);
  doc.setFillColor(244, 246, 248);
  doc.setLineWidth(0.35);
  doc.rect(pageMargin, thlTop, pageWidth, 14, 'FD');
  doc.line(pageMargin + 18, thlTop, pageMargin + 18, thlTop + 14);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  if (!(await loadHeaderLogo())) doc.text('SNS', pageMargin + 9, thlTop + 8.5, { align: 'center' });
  else await drawHeaderLogo(doc, pageMargin + 9, thlTop + 7);
  doc.setFontSize(11.5);
  doc.text('FORM KLAIM TENAGA HARIAN LEPAS', 148, thlTop + 9, { align: 'center' });
  doc.rect(pageMargin, thlTop + 14, pageWidth, 6.5);
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7);
  doc.text(`TANGGAL ${date(data.tanggal_pengajuan).toUpperCase()}`, pageMargin + 2, thlTop + 18.2);

  autoTable(doc, {
    startY: thlTop + 21,
    margin: { left: pageMargin, right: pageMargin },
    head: [['No', 'Nama', 'Kubikasi', 'Drop Point', 'Posisi', 'Jam Datang', 'Jam Pulang']],
    body: data.details.map((detail, index) => {
      const source = detail.biaya_thl_detail;
      const kendaraan = detail.nopol_kendaraan || '-';
      return [index + 1, `${kendaraan} - ${source?.nama_thl || source?.driver_name || '-'}`, source?.kubikasi ?? 0, source?.droppoint || '0', source?.posisi || '-', source?.jam_datang ? new Date(source.jam_datang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-', source?.jam_pulang ? new Date(source.jam_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'];
    }),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, textColor: [20, 20, 20], lineColor: [35, 35, 35], lineWidth: 0.25, cellPadding: 1.1, minCellHeight: 5, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 80 }, 2: { cellWidth: 32, halign: 'center' }, 3: { cellWidth: 40 }, 4: { cellWidth: 48 }, 5: { cellWidth: 34, halign: 'center' }, 6: { cellWidth: 34, halign: 'center' } },
  });
  const thlY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? thlTop + 50;
  const photoTop = thlY + 1;
  doc.rect(pageMargin, photoTop, pageWidth, 25);
  const photos = data.details.flatMap((detail) => detail.biaya_thl_detail?.photos || []).slice(0, 10);
  let photoX = pageMargin + 2;
  for (const photo of photos) {
    try {
      const image = await readPhoto(photo);
      if (image) doc.addImage(image.dataUrl, image.format, photoX, photoTop + 1, 18, 23, undefined, 'FAST');
    } catch {
      // Ignore inaccessible old attachments and keep the form printable.
    }
    photoX += 20;
  }

  const filename = `biaya_retribusi_${data.nama_depo || 'pengajuan'}_${data.tanggal_pengajuan}.pdf`;
  if (mode === 'preview') showPreview(doc); else doc.save(filename);
}

export function generateRetribusiPdf(data: RetribusiData) {
  void buildCombinedRetribusi(data, 'save');
}

export function previewRetribusiPdf(data: RetribusiData) {
  void buildCombinedRetribusi(data, 'preview');
}
