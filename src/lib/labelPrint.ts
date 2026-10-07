/**
 * Jejak label batch yang sudah dicetak per sesi validasi SJ.
 *
 * Base praktik: "Selesaikan Validasi" (hard gate) hanya aktif bila SEMUA item
 * yang sudah divalidasi sudah dicetak labelnya. Tanpa jejak ini operator lupa
 * item mana yang labelnya belum menempel fisik, dan tombol Selesaikan tetap
 * aktif — dokumen selesai tapi rak tanpa label.
 *
 * Batch dibuat server sekali di scan() dan tidak pernah berubah (existingBatch
 * guard di SjValidationController), jadi `barcode_label` adalah kunci jejak
 * yang stabil walau item di-re-validasi (Ubah) berkali-kali.
 *
 * Penyimpanan localStorage per validation id:
 * - Bertahan reload browser di tengah sesi (operator tidak harus cetak ulang).
 * - Batasan sadar: per browser, bukan per akun — ganti device = jejak hilang
 *   dan harus cetak ulang. Kalau nanti butuh lintas device, pindahkan ke kolom
 *   `batches.printed_at` di backend (saat ini tidak ada).
 *
 * Semua fungsi di sini pure/defensif (tanpa asumsi window) supaya mudah diuji.
 */

const STORAGE_PREFIX = 'sj-label-printed:';

/**
 * Sumber kebenaran badge "Label tercetak" = kombinasi:
 * (1) `batch.printed_at` dari server — akurat lintas device/halaman
 *     (dicatat endpoint POST /batches/{id}/mark-printed saat tombol cetak
 *     ditekan dari validasi-sj MAUPUN halaman Inbound);
 * (2) jejak localStorage per-browser sebagai fallback optimis —
 *     menutup jarak bila request mark-printed gagal (offline) dan
 *     mewarisi jejak yang sudah terkumpul sebelum kolom printed_at ada.
 */

function storageKey(validationId: number): string {
  return `${STORAGE_PREFIX}${validationId}`;
}

function readStore(): Record<string, string[]> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(STORAGE_PREFIX);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, string[]>;
  } catch {
    // JSON rusak / storage penuh / mode privat: anggap belum ada yang tercetak,
    // jangan sampai gate macet total karena masalah penyimpanan lokal.
    return {};
  }
}

function writeStore(store: Record<string, string[]>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_PREFIX, JSON.stringify(store));
  } catch {
    // Gagal simpan = jejak hilang di reload berikutnya; operator cukup cetak
    // ulang. Jangan lempar error ke UI.
  }
}

/** Daftar `barcode_label` yang sudah dicetak pada sesi validasi ini. */
export function loadPrintedLabels(validationId: number | null | undefined): string[] {
  if (validationId == null) return [];
  const list = readStore()[String(validationId)];
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [];
}

/** Tandai satu label sebagai sudah dicetak (idempoten). */
export function markLabelPrinted(validationId: number, barcodeLabel: string | null | undefined): string[] {
  const label = barcodeLabel?.trim() ?? '';
  const current = loadPrintedLabels(validationId);
  if (!label || current.includes(label)) return current;
  const next = [...current, label];
  const store = readStore();
  store[String(validationId)] = next;
  writeStore(store);
  return next;
}

/** Hapus jejak sesi ini (dipanggil setelah Selesaikan / Batalkan sukses). */
export function clearPrintedLabels(validationId: number): void {
  const store = readStore();
  delete store[String(validationId)];
  writeStore(store);
}

export type PrintableItem = {
  id: number;
  status: string;
  batch?: {
    barcode_label?: string | null;
    status?: string | null;
    /** Jejak cetak dari server (nullable sebelum kolom printed_at diisi). */
    printed_at?: string | null;
  } | null;
};

/**
 * Status cetak satu item: sudah kalau server mencatat `printed_at`,
 * atau kalau barcode-nya ada di jejak localStorage (fallback lokal).
 * Dipakai badge per baris DAN gate Selesaikan Validasi supaya keduanya
 * tidak pernah berbeda pendapat.
 */
export function isLabelPrinted<T extends PrintableItem>(item: T | null | undefined, printedLabels: string[]): boolean {
  if (item?.batch?.printed_at) return true;
  const barcode = item?.batch?.barcode_label?.trim() ?? '';
  if (!barcode) return false;
  return printedLabels.includes(barcode);
}

/**
 * Item yang menghalangi Selesaikan Validasi dari sisi cetak: sudah divalidasi
 * (punya batch aktif dengan barcode) tapi labelnya belum ditandai tercetak.
 * Item PENDING / tanpa batch / batch CANCELLED dilewati — mereka diurus gate
 * lain (kelengkapan) atau memang tidak bisa dicetak.
 */
export function unprintedCompleteItems<T extends PrintableItem>(items: T[] | null | undefined, printedLabels: string[]): T[] {
  if (!items?.length) return [];
  return items.filter((item) => {
    if (item.status === 'PENDING') return false;
    const barcode = item.batch?.barcode_label?.trim() ?? '';
    if (!barcode) return false;
    if (item.batch?.status === 'CANCELLED') return false;
    return !isLabelPrinted(item, printedLabels);
  });
}
