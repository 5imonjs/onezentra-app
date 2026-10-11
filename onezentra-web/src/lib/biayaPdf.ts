import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';
import { API_ROOT, API_URL, apiClient } from './api';

type PdfMode = 'save' | 'preview';

/** True bila font Roboto berhasil diregistrasi; selain itu pakai helvetica. */
let robotoReady = false;

function setDocFont(doc: jsPDF, style: 'normal' | 'bold'): void {
  try {
    doc.setFont(robotoReady ? 'Roboto' : 'helvetica', style);
  } catch {
    doc.setFont('helvetica', style);
  }
}
type ThlPhoto = File | { id?: number; file_path?: string; file_name?: string };
export type ApprovalSection = { title: string; people: { name: string; role: string }[] };

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
  /** Ambang RFAH efektif (per modul) untuk catatan kaki — fallback per modul bila tak diisi. */
  rfah_threshold?: number;
  status: string;
  submitted_at?: string | null;
  checked_at?: string | null;
  approved_at?: string | null;
  rlh_approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  revised_at?: string | null;
  revisi_reason?: string | null;
  approval_pengajuan?: string;
  approval_pengajuan_level?: string;
  approval_sections?: ApprovalSection[];
  submittedBy?: { full_name?: string } | null;
  checkedBy?: { full_name?: string } | null;
  approvedBy?: { full_name?: string } | null;
  rlhApprovedBy?: { full_name?: string } | null;
  rejectedBy?: { full_name?: string; level?: string } | null;
  revisedBy?: { full_name?: string; level?: string } | null;
  details: {
    nama_thl: string;
    driver_name?: string;
    nopol_kendaraan: string;
    type_kendaraan: string;
    no_surat_jalan?: string;
    kendaraan_sj?: string;
    kendaraan_nopol?: string;
    kendaraan_type?: string;
    kendaraan?: Array<{ sj?: string; nopol?: string; type?: string }>;
    nominal_biaya: number;
    kubikasi: number;
    droppoint: string;
    posisi: string;
    jam_datang?: string;
    jam_pulang?: string;
    photos?: ThlPhoto[];
  }[];
};

export type RetribusiData = {
  tanggal_pengajuan: string;
  kode_depo: string;
  nama_depo: string;
  nominal_biaya: number;
  is_rfah_required: boolean;
  rfah_name: string;
  /** Ambang RFAH efektif (per modul) untuk catatan kaki — fallback per modul bila tak diisi. */
  rfah_threshold?: number;
  status: string;
  submitted_at?: string | null;
  checked_at?: string | null;
  approved_at?: string | null;
  rlh_approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  revised_at?: string | null;
  revisi_reason?: string | null;
  approval_pengajuan?: string;
  approval_pengajuan_level?: string;
  approval_sections?: ApprovalSection[];
  submittedBy?: { full_name?: string } | null;
  checkedBy?: { full_name?: string } | null;
  approvedBy?: { full_name?: string } | null;
  rlhApprovedBy?: { full_name?: string } | null;
  rejectedBy?: { full_name?: string; level?: string } | null;
  revisedBy?: { full_name?: string; level?: string } | null;
  details: {
    nopol_kendaraan: string;
    type_kendaraan: string;
    no_surat_jalan: string;
    kendaraan_sj?: string;
    kendaraan_nopol?: string;
    kendaraan_type?: string;
    kendaraan?: Array<{ sj?: string; nopol?: string; type?: string }>;
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
  documents: { id?: number; document_type: string; file_name: string; file_path?: string; file?: File | null; file_size?: number }[];
};

type LampiranDoc = RetribusiData['documents'][number];

const lampiranName = (doc: LampiranDoc): string => `${doc.file_name || ''} ${doc.file_path || ''}`.toLowerCase();

const isImageDoc = (doc: LampiranDoc, blobType = ''): boolean => {
  if (doc.file instanceof File) return doc.file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(doc.file.name.toLowerCase());
  if (blobType && blobType !== 'application/octet-stream') return blobType.startsWith('image/');
  return /\.(jpe?g|png|webp)$/.test(lampiranName(doc));
};

const formatFileSize = (bytes?: number | null): string => {
  const n = Number(bytes) || 0;
  if (n <= 0) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

/** Baca lampiran gambar (File baru atau path tersimpan) menjadi dataUrl. */
async function readLampiran(doc: LampiranDoc): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    if (doc.file instanceof File) {
      if (!doc.file.type.startsWith('image/')) return null;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(doc.file as File);
      });
      return { dataUrl, format: doc.file.type === 'image/png' ? 'PNG' : 'JPEG' };
    }
    if (doc.id) {
      const { data: blob, status } = await apiClient.get(
        `${API_URL}/biaya-retribusi/documents/${doc.id}`,
        { responseType: 'blob' }
      );
      if (status !== 200) return null;
      if (!blob.type.startsWith('image/')) return null;
      return readBlob(blob);
    }
    if (!doc.file_path) return null;
    const { data: storageBlob, status: storageStatus } = await apiClient.get(
      `${API_ROOT}/storage/${doc.file_path}`,
      { responseType: 'blob' }
    );
    if (storageStatus !== 200) return null;
    if (!storageBlob.type.startsWith('image/')) return null;
    return readBlob(storageBlob);
  } catch {
    return null;
  }
}

async function readBlob(blob: Blob): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { dataUrl, format: blob.type === 'image/png' ? 'PNG' : 'JPEG' };
}

/** Dimensi asli gambar agar skala lampiran PDF tidak distorsi. */
function imageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({
      w: img.naturalWidth || 4,
      h: img.naturalHeight || 3,
    });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

/**
 * Lampirkan dokumen ke PDF retribusi: gambar (JPG/PNG/WEBP) menjadi
 * halaman penuh; selain itu (PDF/lainnya) masuk daftar manifest karena
 * halaman PDF tidak bisa dirender client-side tanpa pdf.js.
 */
async function appendLampiranPages(doc: jsPDF, data: RetribusiData): Promise<void> {
  const docs = data.documents || [];
  if (docs.length === 0) return;
  const width = 297;
  const pageMargin = 10;
  const pageWidth = width - pageMargin * 2;
  const manifest: string[][] = [];
  let lampiranNo = 0;

  for (const item of docs) {
    lampiranNo += 1;
    const image = isImageDoc(item) ? await readLampiran(item) : null;
    let embedded = false;
    if (image) {
      try {
        doc.addPage('a4', 'landscape');
        setDocFont(doc, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(20, 20, 20);
        doc.text(`LAMPIRAN ${lampiranNo} — ${String(item.document_type || '').toUpperCase()} — ${item.file_name || '-'}`, pageMargin, 14);
        const top = 18;
        const maxW = pageWidth;
        const maxH = 210 - top - 10;
        const natural = await imageDimensions(image.dataUrl);
        const ratio = Math.min(maxW / natural.w, maxH / natural.h);
        const w = Math.min(maxW, natural.w * ratio);
        const h = Math.min(maxH, natural.h * ratio);
        doc.addImage(image.dataUrl, image.format, pageMargin + (maxW - w) / 2, top + (maxH - h) / 2, w, h, undefined, 'FAST');
        embedded = true;
      } catch {
        embedded = false;
      }
    }
    if (embedded) continue;
    // Semua yang tidak tertanam (PDF/berkas/gambar gagal baca) masuk manifest.
    manifest.push([
      String(manifest.length + 1),
      String(item.document_type || '').toUpperCase(),
      item.file_name || '-',
      formatFileSize(item.file_size),
    ]);
  }

  if (manifest.length > 0) {
    doc.addPage('a4', 'landscape');
    setDocFont(doc, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text('DAFTAR LAMPIRAN DOKUMEN', pageMargin, 14);
    setDocFont(doc, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('Dokumen PDF di bawah ini digabungkan pada halaman-halaman berikutnya dalam satu kesatuan dokumen.', pageMargin, 20);
    autoTable(doc, {
      startY: 24,
      margin: { left: pageMargin, right: pageMargin },
      head: [['No', 'Tipe', 'Nama File', 'Ukuran']],
      body: manifest,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, textColor: [20, 20, 20], lineColor: [35, 35, 35], lineWidth: 0.25, cellPadding: 1.3, valign: 'middle' },
      headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 40 }, 2: { cellWidth: 150 }, 3: { cellWidth: 30, halign: 'right' } },
    });
  }
}

/** Gabungkan seluruh nomor surat jalan milik satu kendaraan ke sel PDF yang sama. */
export function formatSuratJalan(detail: { no_surat_jalan?: string | null; kendaraan_sj?: string | null; kendaraan?: Array<{ sj?: string }> }): string {
  const fromArray = Array.isArray(detail.kendaraan)
    ? detail.kendaraan.flatMap((v) => String(v?.sj || '').split(/[,;\n]+/))
    : [];
  const suratJalans = [detail.no_surat_jalan, detail.kendaraan_sj, ...fromArray]
    .flatMap((item) => String(item || '').split(/[,;\n]+/))
    .map((item) => item.trim())
    .filter((item, index, values) => item !== '' && values.indexOf(item) === index);

  return suratJalans.join(', ') || '-';
}

/** Ekstrak semua nopol dari array kendaraan (format baru) atau field legacy. */
const extractAllNopol = (detail: { kendaraan?: Array<{ nopol?: string }>; nopol_kendaraan?: string }): string => {
  const nopol: string[] = [];
  // Dari array kendaraan baru
  if (detail.kendaraan && Array.isArray(detail.kendaraan)) {
    detail.kendaraan.forEach((v) => { if (v.nopol) nopol.push(String(v.nopol).trim()); });
  }
  // Dari field legacy (fallback)
  if (detail.nopol_kendaraan && !nopol.includes(String(detail.nopol_kendaraan).trim())) {
    nopol.push(String(detail.nopol_kendaraan).trim());
  }
  return nopol.length > 0 ? nopol.join(', ') : '-';
};

/** Ekstrak semua jenis kendaraan dari array kendaraan (format baru) atau field legacy. */
const extractAllType = (detail: { kendaraan?: Array<{ type?: string }>; type_kendaraan?: string }): string => {
  const types: string[] = [];
  if (detail.kendaraan && Array.isArray(detail.kendaraan)) {
    detail.kendaraan.forEach((v) => { if (v.type) types.push(String(v.type).trim()); });
  }
  if (detail.type_kendaraan && !types.includes(String(detail.type_kendaraan).trim())) {
    types.push(String(detail.type_kendaraan).trim());
  }
  return types.length > 0 ? types.join(', ') : '-';
};

/** Gabungkan semua surat jalan (no_surat_jalan + kendaraan_sj) dari array kendaraan. */
const extractAllSuratJalan = (detail: { kendaraan?: Array<{ sj?: string }>; no_surat_jalan?: string }): string => {
  const sj: string[] = [];
  if (detail.kendaraan && Array.isArray(detail.kendaraan)) {
    detail.kendaraan.forEach((v) => { if (v.sj) sj.push(String(v.sj).trim()); });
  }
  if (detail.no_surat_jalan && !sj.includes(String(detail.no_surat_jalan).trim())) {
    sj.push(String(detail.no_surat_jalan).trim());
  }
  return sj.length > 0 ? sj.join(', ') : '-';
};

function formatPdfColumn(primary?: string | null, additional?: string | null): string {
  const values = [primary, additional]
    .flatMap((item) => String(item || '').split(/[,;\n]+/))
    .map((item) => item.trim())
    .filter((item, index, allValues) => item !== '' && allValues.indexOf(item) === index);

  return values.join(', ') || '-';
}

const money = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
// Normalisasi 'YYYY-MM-DD HH:mm:ss' (gaya Laravel) menjadi ISO agar
// new Date() dapat mem-parse; format ISO (dengan 'T' atau 'Z') dibiarkan.
const normalizedDateInput = (value: string) => (value.includes('T') ? value : value.replace(' ', 'T'));
const date = (value: string | null | undefined) => {
  if (!value) return '-';
  const parsed = new Date(normalizedDateInput(value));
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};
const value = (item: unknown) => String(item ?? '-');

const STAMP_GREEN: [number, number, number] = [21, 128, 61];
const STAMP_RED: [number, number, number] = [220, 38, 38];
const STAMP_ORANGE: [number, number, number] = [217, 119, 6];
const STAMP_PURPLE: [number, number, number] = [124, 58, 237];

export type AuditDates = { submitted?: string; checked?: string; rlhApproved?: string; approved?: string; rejected?: string; revised?: string };

/** Nama pelaku aksi dari relasi *By (ada pada item tersimpan, kosong pada draft form). */
function actorName(data: RetribusiData, key: 'submittedBy' | 'checkedBy' | 'approvedBy' | 'rlhApprovedBy' | 'rejectedBy' | 'revisedBy'): string {
  const holder = data as unknown as Record<string, { full_name?: string } | null | undefined>;
  return holder[key]?.full_name || '';
}

/**
 * Kotak kolom approval tempat cap REVISI/DITOLAK diletakkan mengikuti peran
 * pelaku aksinya — bukan selalu kotak RLH. BAC membubuhkan di kotak
 * Mengetahui, RFAH di kotak RFAH*, selainnya (RLH / data lama tanpa level)
 * kembali ke kotak Menyetujui.
 */
export function stampSectionFor(level?: string | null): string {
  const normalized = (level || '').toUpperCase();
  if (normalized === 'BAC') return 'Mengetahui';
  if (normalized === 'RFAH') return 'RFAH*';
  return 'Menyetujui';
}

/**
 * Nama pada kolom approval mencerminkan AKSI, bukan daftar assignee.
 * Draft/preview pengajuan yang belum diperiksa: kotak Mengetahui/Menyetujui
 * menampilkan '-' (role tetap tertera) + tanpa cap.
 *
 * Nama pelaku revisi/ditolak ditempatkan di kotak sesuai peran pelakunya
 * (BAC -> Mengetahui, RFAH -> RFAH*, selainnya -> Menyetujui), sejajar
 * dengan penempatan cap — revisi oleh RFAH tidak boleh muncul di kotak RLH.
 */
export function actedNameFor(section: ApprovalSection, data: RetribusiData, dates: AuditDates): string {
  const assignee = section.people[0]?.name || '-';
  if (section.title === 'Mengajukan') return actorName(data, 'submittedBy') || data.approval_pengajuan || assignee;

  const isRejected = data.status === 'rejected';
  const isRevisi = data.status === 'revisi';
  const actorNameOf = isRejected ? actorName(data, 'rejectedBy') : isRevisi ? actorName(data, 'revisedBy') : '';
  const actorLevel = (isRejected ? data.rejectedBy?.level : isRevisi ? data.revisedBy?.level : '') || '';

  // Nama pelaku aksi terminal (revisi/ditolak) menempel pada kotak sesuai
  // perannya; kotak lain menampilkan nama aksi aktual atau assignee.
  if ((isRejected || isRevisi) && actorNameOf) {
    if (stampSectionFor(actorLevel) === section.title) return actorNameOf;
    return assignee;
  }

  if (section.title === 'Mengetahui') {
    if (dates.checked && dates.checked !== '-') return actorName(data, 'checkedBy') || assignee;
    return assignee;
  }

  if (section.title === 'Menyetujui') {
    if (data.status === 'rlh_approved') return actorName(data, 'rlhApprovedBy') || assignee;
    if (data.status === 'approved') {
      return data.is_rfah_required
        ? actorName(data, 'rlhApprovedBy') || assignee
        : actorName(data, 'approvedBy') || assignee;
    }
    return assignee;
  }

  if (section.title === 'RFAH*' && data.status === 'approved') return actorName(data, 'approvedBy') || assignee;

  return assignee;
}

export type StampSpec = { text: string; color: [number, number, number]; date: string };

export function auditDates(data: { submitted_at?: string | null; checked_at?: string | null; rlh_approved_at?: string | null; approved_at?: string | null; rejected_at?: string | null; revised_at?: string | null }): AuditDates {
  return {
    submitted: date(data.submitted_at),
    checked: date(data.checked_at),
    rlhApproved: date(data.rlh_approved_at),
    approved: date(data.approved_at),
    rejected: date(data.rejected_at),
    revised: date(data.revised_at),
  };
}

export function stampFor(section: ApprovalSection, data: RetribusiData, dates: AuditDates): StampSpec | null {
  const { status } = data;
  if (section.title === 'Mengajukan') {
    // Sejajar server (resolveStamps): cap mengikuti AKSI submit (status),
    // bukan keberadaan nama — nama bisa kosong pada data lama/API langsung.
    return status && status !== 'draft' && dates.submitted && dates.submitted !== '-'
      ? { text: 'PENGAJUAN', color: STAMP_GREEN, date: dates.submitted || '' }
      : null;
  }

  if (section.title === 'Mengetahui') {
    // Sejajar server (resolveStamps): cap DIPERIKSA hanya bila aksi periksa
    // benar terjadi (checked_at ada) — BUKAN karena nama assignee terdaftar.
    // Nama pelaku boleh tidak terbawa pada data PDF, tetapi cap audit tetap
    // harus tampil karena timestamp adalah bukti aksinya.
    if (dates.checked && dates.checked !== '-') return { text: 'DIPERIKSA', color: STAMP_GREEN, date: dates.checked };
    // Revisi/ditolak oleh BAC menempel di kotak Mengetahui (bukan RLH).
    if (status === 'revisi' && stampSectionFor(data.revisedBy?.level) === 'Mengetahui' && dates.revised && actorName(data, 'revisedBy')) {
      return { text: 'REVISI', color: STAMP_ORANGE, date: dates.revised };
    }
    if (status === 'rejected' && stampSectionFor(data.rejectedBy?.level) === 'Mengetahui' && dates.rejected && actorName(data, 'rejectedBy')) {
      return { text: 'DITOLAK', color: STAMP_RED, date: dates.rejected };
    }
    return null;
  }

  if (section.title === 'Menyetujui') {
    // Cap DISETUJUI RLH hanya menyala pada status yang benar-benar
    // melewati RLH; status revisi/ditolak pasca-RLH menampilkan cap
    // terminal (REVISI/DITOLAK) sesuai pelaku, konsisten dengan server.
    if (dates.rlhApproved && dates.rlhApproved !== '-' && (status === 'rlh_approved' || status === 'approved')) {
      return { text: 'DISETUJUI RLH', color: STAMP_GREEN, date: dates.rlhApproved };
    }
    if (status === 'approved' && dates.approved && actorName(data, 'approvedBy')) return { text: 'DISETUJUI', color: STAMP_GREEN, date: dates.approved };
    if (status === 'rejected' && stampSectionFor(data.rejectedBy?.level) === 'Menyetujui' && dates.rejected && actorName(data, 'rejectedBy')) return { text: 'DITOLAK', color: STAMP_RED, date: dates.rejected };
    if (status === 'revisi' && stampSectionFor(data.revisedBy?.level) === 'Menyetujui' && dates.revised && actorName(data, 'revisedBy')) return { text: 'REVISI', color: STAMP_ORANGE, date: dates.revised };
    // Persetujuan RLH pada siklus sebelumnya tetap tercatat di kotaknya
    // walau aksi terminal (revisi/ditolak) dilakukan pelaku lain (BAC/RFAH)
    // — cap terminal ada di kotak pelakunya, sehingga kotak RLH tidak kosong.
    if (status === 'rejected' && dates.rejected && dates.rlhApproved && dates.rlhApproved !== '-' && stampSectionFor(data.rejectedBy?.level) !== 'Menyetujui') return { text: 'DISETUJUI RLH', color: STAMP_GREEN, date: dates.rlhApproved };
    if (status === 'revisi' && dates.revised && dates.rlhApproved && dates.rlhApproved !== '-' && stampSectionFor(data.revisedBy?.level) !== 'Menyetujui') return { text: 'DISETUJUI RLH', color: STAMP_GREEN, date: dates.rlhApproved };
    return null;
  }

  if (section.title === 'RFAH*') {
    if (status === 'approved' && dates.approved && actorName(data, 'approvedBy')) {
      return { text: 'DISETUJUI RFAH', color: STAMP_GREEN, date: dates.approved };
    }
    if (status === 'rejected' && stampSectionFor(data.rejectedBy?.level) === 'RFAH*' && dates.rejected && actorName(data, 'rejectedBy')) {
      return { text: 'DITOLAK', color: STAMP_RED, date: dates.rejected };
    }
    if (status === 'revisi' && stampSectionFor(data.revisedBy?.level) === 'RFAH*' && dates.revised && actorName(data, 'revisedBy')) {
      return { text: 'REVISI', color: STAMP_ORANGE, date: dates.revised };
    }
    return null;
  }

  return null;
}

function drawStamp(doc: jsPDF, cx: number, cy: number, stamp: StampSpec) {
  setDocFont(doc, 'bold');
  doc.setFontSize(9);
  const radius = 14;
  doc.setDrawColor(stamp.color[0], stamp.color[1], stamp.color[2]);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.55);
  doc.circle(cx, cy, radius, 'FD');
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, radius - 1.2, 'S');
  doc.setTextColor(stamp.color[0], stamp.color[1], stamp.color[2]);
  doc.text(stamp.text, cx, cy - 1, { align: 'center' });

  doc.setDrawColor(stamp.color[0], stamp.color[1], stamp.color[2]);
  doc.line(cx - radius + 3, cy + 2, cx + radius - 3, cy + 2);
  setDocFont(doc, 'normal');
  doc.setFontSize(5);
  const dateLabel = stamp.date || '-';
  doc.text(dateLabel, cx, cy + 6, { align: 'center' });
  doc.setDrawColor(35, 35, 35);
  doc.setTextColor(20, 20, 20);
  doc.setLineWidth(0.25);
}

async function loadApprovalSections(data: RetribusiData): Promise<ApprovalSection[]> {
  if (data.approval_sections?.length) return data.approval_sections;

  const actualSections: ApprovalSection[] = [
    { title: 'Mengajukan', people: [{ name: actorName(data, 'submittedBy') || data.approval_pengajuan || '-', role: data.approval_pengajuan_level || 'BLC' }] },
    { title: 'Mengetahui', people: [{ name: actorName(data, 'checkedBy') || '-', role: 'BAC' }] },
    { title: 'Menyetujui', people: [{ name: actorName(data, 'rlhApprovedBy') || '-', role: 'RLH' }] },
    { title: 'RFAH*', people: [{ name: actorName(data, 'approvedBy') || data.rfah_name || '-', role: 'RFAH' }] },
  ];

  try {
    const approvalModule = 'no_kendaraan' in data && 'kubikasi_base' in data ? 'biaya_thl' : 'biaya_retribusi';
    const { data: payloadData, status: approvalStatus } = await apiClient.get(
        `approval-assignments?kode_depo=${encodeURIComponent(data.kode_depo)}&module=${approvalModule}`,
        { responseType: 'json' }
      );
      if (approvalStatus === 200) {
      const payload = payloadData as { data?: Record<string, { user?: { full_name?: string } }> };
      const titles: Record<string, string> = { BLC: 'Mengajukan', BAC: 'Mengetahui', RLH: 'Menyetujui', RFAH: 'RFAH*' };
      const sections = ['BLC', 'BAC', 'RLH', 'RFAH'].map((level) => ({
        title: titles[level],
        people: [{
          name: level === 'BLC'
            ? data.approval_pengajuan || payload.data?.[level]?.user?.full_name || '-'
            : level === 'BAC'
              ? actorName(data, 'checkedBy') || payload.data?.[level]?.user?.full_name || '-'
              : level === 'RLH'
                ? actorName(data, 'rlhApprovedBy') || payload.data?.[level]?.user?.full_name || '-'
                : actorName(data, 'approvedBy') || payload.data?.[level]?.user?.full_name || data.rfah_name || '-',
          role: level === 'BLC' ? data.approval_pengajuan_level || 'BLC' : level,
        }],
      }));
      return sections.map((section) => ({
        ...section,
        people: [{
          ...section.people[0],
          name: section.people[0].name !== '-' ? section.people[0].name : actualSections.find((actual) => actual.title === section.title)?.people[0]?.name || '-',
        }],
      }));
    }
  } catch {
    // Use the configured defaults when the settings endpoint is unavailable.
  }

  return actualSections;
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
  setDocFont(doc, 'normal');
}

function showPreview(doc: jsPDF) {
  const url = String(doc.output('bloburl'));
  const tab = window.open(url, '_blank');
  if (!tab) window.location.href = url;
}

export function generateTHLPdf(data: ThlData): Promise<void> {
  return buildCombinedRetribusi(toCombinedRetribusiData(data), 'save');
}
export function previewTHLPdf(data: ThlData): Promise<void> {
  return buildCombinedRetribusi(toCombinedRetribusiData(data), 'preview');
}

function toCombinedRetribusiData(data: ThlData): RetribusiData {
  return {
    tanggal_pengajuan: data.tanggal_pengajuan,
    kode_depo: data.kode_depo || '',
    nama_depo: data.nama_depo || '',
    nominal_biaya: data.nominal_biaya,
    is_rfah_required: data.is_rfah_required,
    rfah_name: data.rfah_name,
    rfah_threshold: data.rfah_threshold,
    status: data.status,
    submitted_at: data.submitted_at,
    checked_at: data.checked_at,
    approved_at: data.approved_at,
    rlh_approved_at: data.rlh_approved_at,
    rejected_at: data.rejected_at,
    rejection_reason: data.rejection_reason,
    revised_at: data.revised_at,
    revisi_reason: data.revisi_reason,
    approval_pengajuan: data.approval_pengajuan,
    approval_pengajuan_level: data.approval_pengajuan_level,
    approval_sections: data.approval_sections,
    submittedBy: data.submittedBy,
    checkedBy: data.checkedBy,
    approvedBy: data.approvedBy,
    rlhApprovedBy: data.rlhApprovedBy,
    rejectedBy: data.rejectedBy,
    revisedBy: data.revisedBy,
    details: data.details.map((detail) => ({
      nopol_kendaraan: extractAllNopol({ kendaraan: detail.kendaraan, nopol_kendaraan: formatPdfColumn(detail.nopol_kendaraan, detail.kendaraan_nopol) }),
      type_kendaraan: extractAllType({ kendaraan: detail.kendaraan, type_kendaraan: formatPdfColumn(detail.type_kendaraan, detail.kendaraan_type) }),
      no_surat_jalan: formatSuratJalan(detail),
      kendaraan_sj: detail.kendaraan_sj,
      kendaraan: detail.kendaraan?.map((v) => ({ sj: v.sj, nopol: v.nopol, type: v.type })),
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
      const backendOrigin = API_ROOT;
      const logoUrls = [
        `${window.location.origin}/biaya%20THL.jpeg`,
        `${backendOrigin}/biaya%20THL.jpeg`,
      ];

      for (const logoUrl of logoUrls) {
        try {
          const { data: logoBlob, status: logoStatus } = await apiClient.get(logoUrl, { responseType: 'blob' });
          if (logoStatus !== 200) continue;
          if (!logoBlob.type.startsWith('image/')) continue;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('read'));
            reader.readAsDataURL(logoBlob);
          });
          return { dataUrl, format: logoBlob.type === 'image/png' ? 'PNG' : 'JPEG' };
        } catch {
          // Try the backend asset when the Next public path is unavailable.
        }
      }

      return null;
    })();
  }
  return headerLogoCache;
}

async function drawHeaderLogo(doc: jsPDF, cx: number, cy: number, size = 16): Promise<void> {
  const logo = await loadHeaderLogo();
  if (!logo) return;
  const offset = size / 2;
  doc.addImage(logo.dataUrl, logo.format, cx - offset, cy - offset, size, size, undefined, 'FAST');
}

async function readPhoto(photo: ThlPhoto): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  if (!(photo instanceof File) && typeof photo.id === 'number') {
    try {
      const { data: blob, status } = await apiClient.get(
        `biaya-thl/photos/${photo.id}`,
        { responseType: 'blob' }
      );
      if (status !== 200) return null;
      if (!blob.type.startsWith('image/')) return null;
      return readBlob(blob);
    } catch {
      return null;
    }
  }
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
  try {
    const { data: photoBlobData, status: photoStatus } = await apiClient.get(
      `${API_ROOT}/storage/${photo.file_path}`,
      { responseType: 'blob' }
    );
    if (photoStatus !== 200) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(photoBlobData);
    });
    return { dataUrl, format: photoBlobData.type === 'image/png' ? 'PNG' : 'JPEG' };
  } catch {
    return null;
  }
}

const isPdfDoc = (doc: LampiranDoc, blobType = ''): boolean => {
  const byName = /\.pdf$/i.test(lampiranName(doc).trim());
  if (doc.file instanceof File) return doc.file.type === 'application/pdf' || byName;
  if (blobType && blobType !== 'application/octet-stream') return blobType === 'application/pdf' || byName;
  return byName;
};

async function readPdfBytes(doc: LampiranDoc): Promise<ArrayBuffer | null> {
  if (doc.file instanceof File) {
    if (!isPdfDoc(doc)) return null;
    return await doc.file.arrayBuffer();
  }
  const url = doc.id
    ? `biaya-retribusi/documents/${doc.id}`
    : doc.file_path
      ? `${API_ROOT}/storage/${doc.file_path}`
      : null;
  if (!url) return null;
  try {
    const { data: responseData, status: responseStatus } = await apiClient.get(url, { responseType: 'arraybuffer' });
    if (responseStatus !== 200) return null;
    const arrayBuffer = responseData as ArrayBuffer;
    if (!isPdfDoc(doc)) return null;
    return arrayBuffer;
  } catch {
    return null;
  }
}

/**
 * Gabungkan halaman file PDF lampiran ke dokumen utama (satu kesatuan
 * dokumen). File rusak/terenkripsi dilewati — daftarnya tetap ada di
 * halaman manifest. Mengembalikan null bila tidak ada PDF valid.
 */
async function mergePdfAttachments(doc: jsPDF, data: RetribusiData, warnings: string[]): Promise<Uint8Array | null> {
  const pdfParts: ArrayBuffer[] = [];
  for (const item of data.documents || []) {
    if (!isPdfDoc(item)) continue;
    const bytes = await readPdfBytes(item);
    if (bytes) {
      pdfParts.push(bytes);
    } else {
      warnings.push(`Lampiran ${item.file_name || '-'} tidak dapat dimuat (file tidak ditemukan)`);
    }
  }
  if (pdfParts.length === 0) return null;
  try {
    const merged = await PDFDocument.load(doc.output('arraybuffer'));
    for (const part of pdfParts) {
      const src = await PDFDocument.load(part, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    return await merged.save();
  } catch (e) {
    warnings.push(e instanceof Error ? `Gabung PDF gagal: ${e.message}` : 'Gabung PDF gagal');
    return null;
  }
}

function showPreviewBytes(bytes: Uint8Array): void {
  const url = window.URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
  const tab = window.open(url, '_blank');
  if (!tab) window.location.href = url;
}

function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = window.URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function buildCombinedRetribusi(data: RetribusiData, mode: PdfMode, options?: { includeThlSection?: boolean; onWarning?: (message: string) => void }) {
  const includeThlSection = options?.includeThlSection ?? true;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  try {
    await loadPdfFonts(doc);
    robotoReady = true;
  } catch {
    robotoReady = false;
    doc.setFont('helvetica', 'normal');
  }
  const width = 297;
  const pageMargin = 10;
  const pageWidth = width - pageMargin * 2;

  doc.setDrawColor(35, 35, 35);
  doc.setFillColor(244, 246, 248);
  doc.setLineWidth(0.35);
  doc.rect(pageMargin, 7, pageWidth, 18, 'FD');
  doc.line(pageMargin + 18, 7, pageMargin + 18, 25);
  setDocFont(doc, 'bold');
  doc.setFontSize(10);
  if (!(await loadHeaderLogo())) doc.text('SNS', pageMargin + 9, 18, { align: 'center' });
  else await drawHeaderLogo(doc, pageMargin + 9, 16);
  doc.setFontSize(11.5);
  doc.text('FORM KLAIM BIAYA PENGAJUAN RETRIBUSI', 148, 17.5, { align: 'center' });
  setDocFont(doc, 'normal');
  doc.setFontSize(7.2);
  doc.text(`DEPO: ${value(data.nama_depo || data.kode_depo)}`, 210, 12.5);
  doc.text(`Tanggal Pengajuan: ${date(data.tanggal_pengajuan)}`, 210, 18.5);

  autoTable(doc, {
    startY: 27,
    margin: { left: pageMargin, right: pageMargin },
    head: [['No', 'NO KENDARAAN', 'JENIS KENDARAAN', 'SURAT JALAN', 'NOMINAL', 'Paraf']],
    body: data.details.map((detail, index) => [index + 1, String(extractAllNopol(detail)).toUpperCase(), String(extractAllType(detail)).toUpperCase(), extractAllSuratJalan(detail), money(detail.nominal_biaya), '']),
    foot: [['', '', '', 'Total', money(data.nominal_biaya), '']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, textColor: [20, 20, 20], lineColor: [35, 35, 35], lineWidth: 0.25, cellPadding: 1.3, minCellHeight: 5.5, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 55 }, 2: { cellWidth: 48 }, 3: { cellWidth: 50 }, 4: { cellWidth: 42, halign: 'center' }, 5: { cellWidth: 48 } },
    didParseCell: (hookData) => {
      if (hookData.section === 'foot') hookData.cell.styles.halign = 'center';
    },
  });
  const retribusiY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 65;

  const approvalY = Math.min(retribusiY + 3, 82);
  const approvalSections = (await loadApprovalSections(data)).filter((section) => section.title !== 'RFAH*' || data.is_rfah_required);

  const approvalWidth = pageWidth / approvalSections.length;
  doc.setFontSize(7);
  const audit = auditDates(data);
  const cleanDraftPreview = mode === 'preview' && data.status === 'draft';
  const headingSections = approvalSections.length > 2 ? approvalSections.slice(0, 2) : approvalSections;
  headingSections.forEach((section, index) => {
    const x = pageMargin + approvalWidth * index;
    doc.setLineWidth(0.25);
    doc.setDrawColor(35, 35, 35);
    doc.setTextColor(20, 20, 20);
    doc.rect(x, approvalY, approvalWidth, 6);
    doc.text(section.title, x + approvalWidth / 2, approvalY + 4, { align: 'center' });
  });
  if (approvalSections.length > 2) {
    const x = pageMargin + approvalWidth * 2;
    const width = approvalWidth * (approvalSections.length - 2);
    doc.rect(x, approvalY, width, 6);
    doc.text('Menyetujui', x + width / 2, approvalY + 4, { align: 'center' });
  }
  approvalSections.forEach((section, index) => {
    const x = pageMargin + approvalWidth * index;
    doc.setLineWidth(0.25);
    doc.setDrawColor(35, 35, 35);
    doc.setTextColor(20, 20, 20);
    doc.rect(x, approvalY + 6, approvalWidth, 22);
    doc.rect(x, approvalY + 28, approvalWidth, 7);
    doc.rect(x, approvalY + 35, approvalWidth, 7);
    const person = section.people[0];
    const approvalName = actedNameFor(section, data, audit);
    doc.text(approvalName, x + approvalWidth / 2, approvalY + 32.5, { align: 'center' });
    const approvalRole = section.title === 'Mengajukan'
      ? (data.approval_pengajuan_level || person?.role || 'BLC')
      : (person?.role || section.title);
    doc.text(approvalRole.toUpperCase(), x + approvalWidth / 2, approvalY + 39.5, { align: 'center' });

    const stamp = cleanDraftPreview ? null : stampFor(section, data, audit);
    if (stamp) drawStamp(doc, x + approvalWidth / 2, approvalY + 16, stamp);
  });
  setDocFont(doc, 'normal');
  doc.setFontSize(6.2);
  doc.text(`Note: * Jika pengajuan biaya > Rp ${(Number(data.rfah_threshold) || (includeThlSection ? 750000 : 1000000)).toLocaleString('id-ID')}`, pageMargin, approvalY + 47);

  if (!includeThlSection) {
    await appendLampiranPages(doc, data);
    const filename = `biaya_retribusi_${data.nama_depo || 'pengajuan'}_${data.tanggal_pengajuan}.pdf`;
    const warnings: string[] = [];
    const merged = await mergePdfAttachments(doc, data, warnings);
    if (warnings.length > 0) options?.onWarning?.(`Lampiran bermasalah: ${warnings.slice(0, 2).join(' · ')}`);
    if (merged) {
      if (mode === 'preview') showPreviewBytes(merged);
      else downloadBytes(merged, filename);
    } else if (mode === 'preview') {
      showPreview(doc);
    } else {
      doc.save(filename);
    }
    return;
  }

  const rejected = data.status === 'rejected';
  const revisi = data.status === 'revisi';
  const thlTop = approvalY + (rejected ? 63 : revisi ? 63 : 52);
  if (rejected && data.rejection_reason) {
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(185, 28, 28);
    doc.text(`DITOLAK — ${data.rejection_reason}`, pageMargin, approvalY + 46, { maxWidth: pageWidth });
    doc.setTextColor(20, 20, 20);
  }
  if (revisi && data.revisi_reason) {
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(180, 83, 9);
    doc.text(`REVISI — ${data.revisi_reason}`, pageMargin, approvalY + 46, { maxWidth: pageWidth });
    doc.setTextColor(20, 20, 20);
  }
  doc.setDrawColor(35, 35, 35);
  doc.setFillColor(244, 246, 248);
  doc.setLineWidth(0.35);
  doc.rect(pageMargin, thlTop, pageWidth, 18, 'FD');
  doc.line(pageMargin + 18, thlTop, pageMargin + 18, thlTop + 18);
  setDocFont(doc, 'bold');
  doc.setFontSize(10);
  if (!(await loadHeaderLogo())) doc.text('SNS', pageMargin + 9, thlTop + 8.5, { align: 'center' });
  else await drawHeaderLogo(doc, pageMargin + 9, thlTop + 9, 16);
  doc.setFontSize(11.5);
  doc.text('FORM KLAIM TENAGA HARIAN LEPAS', 148, thlTop + 11, { align: 'center' });
  doc.rect(pageMargin, thlTop + 18, pageWidth, 6.5);
  setDocFont(doc, 'normal');
  doc.setFontSize(7);
  doc.text(`TANGGAL ${date(data.tanggal_pengajuan).toUpperCase()}`, pageMargin + 2, thlTop + 22.2);

  autoTable(doc, {
    startY: thlTop + 25,
    margin: { left: pageMargin, right: pageMargin },
    head: [['No', 'Nama', 'Kubikasi', 'Drop Point', 'Posisi', 'Jam Datang', 'Jam Pulang']],
    body: data.details.map((detail, index) => {
      const source = detail.biaya_thl_detail;
      const kendaraan = String(detail.nopol_kendaraan || '-').toUpperCase();
      return [index + 1, `${kendaraan} - ${source?.nama_thl || source?.driver_name || '-'}`, source?.kubikasi ?? 0, source?.droppoint || '0', source?.posisi || '-', source?.jam_datang ? new Date(source.jam_datang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-', source?.jam_pulang ? new Date(source.jam_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'];
    }),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, textColor: [20, 20, 20], lineColor: [35, 35, 35], lineWidth: 0.25, cellPadding: 1.1, minCellHeight: 5, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 80 }, 2: { cellWidth: 32, halign: 'center' }, 3: { cellWidth: 40, halign: 'center' }, 4: { cellWidth: 48 }, 5: { cellWidth: 34, halign: 'center' }, 6: { cellWidth: 34, halign: 'center' } },
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

export function generateRetribusiPdf(data: RetribusiData, options?: { onWarning?: (message: string) => void }): Promise<void> {
  return buildCombinedRetribusi(data, 'save', { includeThlSection: false, ...options });
}

export function previewRetribusiPdf(data: RetribusiData, options?: { onWarning?: (message: string) => void }): Promise<void> {
  return buildCombinedRetribusi(data, 'preview', { includeThlSection: false, ...options });
}
