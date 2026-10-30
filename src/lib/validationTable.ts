/** Format tanggal id-ID; dipakai tabel validasi dan detail sesi. */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Tanggal + jam. Satu PO transporter bisa punya beberapa sesi (mis. dibatalkan
 * lalu di-scan ulang), dan semuanya sering jatuh di tanggal yang sama — hanya
 * jamnya yang membedakan. Tanpa jam, barisnya terlihat identik dan operator
 * bisa salah membatalkan sesi yang bukan yang dimaksud.
 */
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${fmtDate(v)} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Format durasi dalam Bahasa Indonesia, mis. "2h 16j 38m" atau "45j 12m".
 *
 * Singkatan dipakai karena kolomnya sempit: "2 hari 16 jam 38 menit" membuat
 * kolom selebar layar dan membuat tabel perlu scrollhorizontal. `h` = hari,
 * `j` = jam, `m` = menit. Detik sengaja tidak ditampilkan karena di bawah satu
 * menit angkanya tidak berarti apa-apa dan hanya menambah digit.
 *
 * Semua unit bukan nol ditampilkan, bukan hanya dua terbesar: "1h 5j 3m" jauh
 * lebih enak dibaca daripada "29j 3m", dan bagian kecilnya tidak mengubah
 * gambaran besaran durasi.
 */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '-';
  if (seconds < 0) return '-';

  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}h`);
  if (hours > 0) parts.push(`${hours}j`);
  if (minutes > 0) parts.push(`${minutes}m`);

  // Durasi di bawah satu menit dibulatkan jadi "0m" supaya tetap terbaca
  // sebagai durasi, bukan "–" yang berarti datanya memang tidak ada.
  return parts.length > 0 ? parts.join(' ') : '0m';
}

/**
 * Durasi sesi validasi untuk ditampilkan di tabel.
 *
 * Sesi terminal (COMPLETED / CANCELLED) memakai `duration_seconds` yang
 * disimpan server. Sesi IN_PROGRESS belum punya nilai final, jadi elapsed-nya
 * dihitung dari `started_at` sampai `now` supaya operator langsung tahu sudah
 * berjalan berapa lama tanpa harus membuka detail.
 *
 * `nowIso` dioper masuk sebagai string, bukan diambil di dalam fungsi, supaya
 * fungsi ini tetap murni dan deterministik: kalau `new Date()` diambil di
 * dalam, setiap render menghasilkan angka berbeda sehingga komponen lain ikut
 * re-render tanpa perlu.
 */
export function validationDuration(
  validation: {
    started_at?: string | null;
    duration_seconds?: number | null;
    status?: string;
  } | null | undefined,
  nowIso: string,
): string {
  if (!validation) return '-';

  if (validation.status !== 'IN_PROGRESS' && validation.duration_seconds != null) {
    return fmtDuration(validation.duration_seconds);
  }

  if (!validation.started_at) return '-';

  const started = new Date(validation.started_at).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(started) || Number.isNaN(now)) return '-';

  return fmtDuration(Math.max(0, (now - started) / 1000));
}

/** Bentuk batch yang dipakai frontend (lihat `BatchInfo` di halaman validasi SJ). */
export type BatchCellInput = {
  batch_number?: string | null;
  barcode_label?: string | null;
  status?: string | null;
} | null | undefined;

/** State sel "No. Batch" pada tabel detail validasi. */
export type BatchCellState =
  | { kind: 'none' }
  | { kind: 'cancelled'; number: string }
  | { kind: 'active'; number: string; barcode: string | null };

/**
 * Nomor batch hanya lahir setelah item divalidasi (dibuat server bersama
 * respons scan), jadi item PENDING memang tidak punya — itu kondisi normal,
 * bukan data hilang.
 *
 * Batch `CANCELLED` (sesi validasi dibatalkan, label sudah tercetak tapi tidak
 * berlaku) tetap ditampilkan nomornya supaya petugas bisa mencari label fisik
 * yang harus dibuang, tapi ditandai supaya tidak dipakai sebagai rujukan.
 */
export function batchCell(batch: BatchCellInput): BatchCellState {
  const number = batch?.batch_number?.trim() ?? '';
  if (!number) {
    return { kind: 'none' };
  }
  if (batch?.status === 'CANCELLED') {
    return { kind: 'cancelled', number };
  }
  return { kind: 'active', number, barcode: batch?.barcode_label?.trim() || null };
}

/**
 * Apakah hasil item pada sesi validasi ini masih boleh diubah oleh pengguna.
 *
 * Cermin dari `SjValidationController::itemEditability()` di backend. Keduanya
 * harus bergerak bersama: kalau UI dilonggarkan tanpa backend, operator akan
 * mengisi form lalu kena 422; kalau backend dilonggarkan tanpa UI, aksinya ada
 * tapi tidak terlihat.
 *
 * - `IN_PROGRESS` -> bebas ubah (jalur normal operator).
 * - `COMPLETED` -> hanya bila pengguna memegang `sj_validation.edit_completed`
 *   DAN Receiving-nya belum selesai. `canCorrectCompleted` dikirim backend lewat
 *   `show()` karena hanya server yang tahu status Receiving.
 * - `CANCELLED` -> tidak pernah, oleh siapa pun. Label batch-nya sudah dicoret.
 *
 * Status tak dikenal gagal DEFAULT ke tutup.
 */
export function canEditItems(
  validation: { status: string } | null | undefined,
  options: { canCorrectCompleted?: boolean } = {},
): boolean {
  if (!validation) {
    return false;
  }
  if (validation.status === 'IN_PROGRESS') {
    return true;
  }
  if (validation.status === 'COMPLETED') {
    return options.canCorrectCompleted === true;
  }
  return false;
}