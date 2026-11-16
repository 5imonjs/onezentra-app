/**
 * Parse/format tanggal TANPA pergeseran zona waktu.
 *
 * `new Date('YYYY-MM-DD')` diparse sebagai UTC tengah malam, lalu
 * `getFullYear/getMonth/getDate` membaca zona lokal — di zona negatif
 * tanggal mundur 1 hari di form. Semua helper di sini mem-parse secara
 * tekstual (regex `^(\d{4})-(\d{2})-(\d{2})`) sehingga stabil di semua zona.
 */

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function splitDateOnly(value: string | null | undefined): { y: string; m: string; d: string } | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(trimmed)
    ?? /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return null;
  return { y, m, d };
}

/** 'YYYY-MM-DD...' -> 'YYYY-MM-DD' untuk input date, tanpa sentuhan Date. */
export function toDateInput(value?: string | null): string {
  const parts = splitDateOnly(value ?? null);
  return parts ? `${parts.y}-${parts.m}-${parts.d}` : '';
}

/** Format tanggal label 'YYYY-MM-DD...' atau 'YYYYMMDD' sebagai 'DD/MM/YYYY'. */
export function formatDateDmy(value?: string | null): string {
  const parts = splitDateOnly(value ?? null);
  return parts ? `${parts.d}/${parts.m}/${parts.y}` : '-';
}

/** Tanggal hari ini (zona lokal browser) sebagai 'YYYY-MM-DD'. */
export function todayLocal(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> hari Senin pada minggu yang sama, tanpa pergeseran zona. */
export function mondayOfWeek(value: string): string {
  const parts = splitDateOnly(value);
  if (!parts) return value;
  const date = new Date(Number(parts.y), Number(parts.m) - 1, Number(parts.d));
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Geser 'YYYY-MM-DD' sebanyak N hari, tanpa pergeseran zona. */
export function addDaysIso(value: string, days: number): string {
  const parts = splitDateOnly(value);
  if (!parts) return value;
  const date = new Date(Number(parts.y), Number(parts.m) - 1, Number(parts.d));
  date.setDate(date.getDate() + days);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * Sisa hari -> teks ringkas berdasarkan TOTAL hari.
 *
 * Versi lama memecah 1 tahun = 365 hari dan 1 bulan = 30 hari. Untuk barang
 * yang sudah expired, itu menghasilkan "Lewat 0 thn 8 bln 19 hr" padahal
 * selisih kalender aslinya 8 bulan 14 hari. Karena helper ini hanya menerima
 * jumlah hari (bukan tanggal acuan), satu-satunya angka yang bisa dijamin
 * benar adalah total harinya.
 */
export function formatDurationId(days: number): string {
  if (!Number.isFinite(days)) return '-';
  const total = Math.round(Math.abs(days));
  if (days < 0) return `Lewat ${total} hari`;
  if (days === 0) return 'Hari ini';
  return `${total} hari`;
}

/** Judul tooltip: hindari angka negatif mentah seperti "-259 hari". */
export function sisaHariTitle(days: number): string {
  if (!Number.isFinite(days)) return 'Sisa hari tidak diketahui';
  if (days < 0) return `Lewat ${Math.round(Math.abs(days))} hari`;
  if (days === 0) return 'Kedaluwarsa hari ini';
  return `Tersisa ${Math.round(days)} hari`;
}

/** 'YYYY-MM-DD...' -> '12 Jan 2026' (id-ID), tanpa sentuhan Date. */
export function formatDateId(value?: string | null): string {
  const parts = splitDateOnly(value ?? null);
  if (!parts) return '-';
  return `${parts.d} ${MONTHS_ID[Number(parts.m) - 1]} ${parts.y}`;
}
