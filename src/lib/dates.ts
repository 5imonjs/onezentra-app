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
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { y, m, d };
}

/** 'YYYY-MM-DD...' -> 'YYYY-MM-DD' untuk input date, tanpa sentuhan Date. */
export function toDateInput(value?: string | null): string {
  const parts = splitDateOnly(value ?? null);
  return parts ? `${parts.y}-${parts.m}-${parts.d}` : '';
}

/** Tanggal hari ini (zona lokal browser) sebagai 'YYYY-MM-DD'. */
export function todayLocal(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 'YYYY-MM-DD...' -> '12 Jan 2026' (id-ID), tanpa sentuhan Date. */
export function formatDateId(value?: string | null): string {
  const parts = splitDateOnly(value ?? null);
  if (!parts) return '-';
  return `${parts.d} ${MONTHS_ID[Number(parts.m) - 1]} ${parts.y}`;
}
