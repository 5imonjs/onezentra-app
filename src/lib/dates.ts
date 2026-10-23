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

/**
 * Sisa hari -> 'X Thn Y Bln Z Hr' (konvensi dagang: 1 thn = 365 hr,
 * 1 bln = 30 hr). Negatif (kedaluwarsa) = 'Lewat ...'.
 */
export function formatDurationId(days: number): string {
  if (!Number.isFinite(days)) return '-';
  if (days < 0) return `Lewat ${formatDurationId(-days).toLowerCase()}`;
  const thn = Math.floor(days / 365);
  const rest = days % 365;
  const bln = Math.floor(rest / 30);
  const hr = rest % 30;
  return `${thn} Thn ${bln} Bln ${hr} Hr`;
}

/** 'YYYY-MM-DD...' -> '12 Jan 2026' (id-ID), tanpa sentuhan Date. */
export function formatDateId(value?: string | null): string {
  const parts = splitDateOnly(value ?? null);
  if (!parts) return '-';
  return `${parts.d} ${MONTHS_ID[Number(parts.m) - 1]} ${parts.y}`;
}
