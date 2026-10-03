export type ConditionTone = 'good' | 'warn' | 'bad' | 'neutral';

export const CONDITIONS = [
  'FISIK_BAGUS',
  'FISIK_RUSAK',
  'QTY_KURANG',
  'ISI_KEMASAN_KURANG',
  'EXPIRED_TIDAK_STANDAR',
  'LAINNYA',
] as const;

export const CONDITION_LABELS: Record<string, string> = {
  FISIK_BAGUS: 'Fisik Bagus',
  FISIK_RUSAK: 'Fisik Rusak',
  QTY_KURANG: 'Qty Kurang',
  ISI_KEMASAN_KURANG: 'Isi Kemasan Kurang',
  EXPIRED_TIDAK_STANDAR: 'Expired Tidak Standar',
  LAINNYA: 'Lainnya',
};

/** Kondisi yang mewajibkan bukti foto (sejajar validasi SJ). */
export const PHOTO_REQUIRED_CONDITIONS = [
  'FISIK_RUSAK',
  'QTY_KURANG',
  'ISI_KEMASAN_KURANG',
  'EXPIRED_TIDAK_STANDAR',
  'LAINNYA',
] as const;

export function conditionRequiresPhoto(condition?: string | null): boolean {
  return (PHOTO_REQUIRED_CONDITIONS as readonly string[]).includes(canonicalCondition(condition));
}

/**
 * Apakah qty aktual sudah diisi?
 *
 * Sengaja TIDAK memakai `!value`. `actual_qty = 0` adalah hasil validasi yang
 * sah — barang tidak datang sama sekali — dan backend menerimanya
 * (`required|numeric|min:0`, statusnya jadi MISMATCH). Uji falsy akan ikut
 * menolaknya, sehingga kasus "barang hilang total" justru tidak bisa direkam,
 * padahal itu hasil yang paling perlu dibuktikan. Yang ditolak hanya kondisi
 * benar-benar belum diisi: string kosong, `null`, `undefined`, dan `NaN`
 * (hasil `Number('')` pada input yang dikosongkan user).
 */
export function hasQty(value: string | number | null | undefined): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return (value ?? '').trim().length > 0;
}

interface ConditionMeta {
  label: string;
  canonical: string;
  tone: ConditionTone;
}

const CONDITION_META: Record<string, ConditionMeta> = {
  FISIK_BAGUS: { label: 'Fisik Bagus', canonical: 'FISIK_BAGUS', tone: 'good' },
  GOOD: { label: 'Fisik Bagus', canonical: 'FISIK_BAGUS', tone: 'good' },
  FISIK_RUSAK: { label: 'Fisik Rusak', canonical: 'FISIK_RUSAK', tone: 'bad' },
  'NOT GOOD': { label: 'Fisik Rusak', canonical: 'FISIK_RUSAK', tone: 'bad' },
  DAMAGED: { label: 'Fisik Rusak', canonical: 'FISIK_RUSAK', tone: 'bad' },
  QTY_KURANG: { label: 'Qty Kurang', canonical: 'QTY_KURANG', tone: 'warn' },
  LESS: { label: 'Qty Kurang', canonical: 'QTY_KURANG', tone: 'warn' },
  ISI_KEMASAN_KURANG: { label: 'Isi Kemasan Kurang', canonical: 'ISI_KEMASAN_KURANG', tone: 'warn' },
  EXPIRED_TIDAK_STANDAR: { label: 'Expired Tidak Standar', canonical: 'EXPIRED_TIDAK_STANDAR', tone: 'warn' },
  MISSING: { label: 'Barang Hilang', canonical: 'LAINNYA', tone: 'bad' },
  LAINNYA: { label: 'Lainnya', canonical: 'LAINNYA', tone: 'neutral' },
};

const TONE_CLASSES: Record<ConditionTone, { badge: string; dot: string }> = {
  good: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  warn: { badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  bad: { badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
  neutral: { badge: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400' },
};

export function canonicalCondition(condition?: string | null): string {
  return CONDITION_META[(condition ?? '').trim().toUpperCase()]?.canonical ?? 'FISIK_BAGUS';
}

export function conditionMeta(condition?: string | null): { label: string; tone: ConditionTone; badge: string; dot: string } {
  const meta = CONDITION_META[(condition ?? '').trim().toUpperCase()];
  if (!meta) {
    return { label: condition || '-', tone: 'neutral', badge: TONE_CLASSES.neutral.badge, dot: TONE_CLASSES.neutral.dot };
  }
  return { label: meta.label, tone: meta.tone, badge: TONE_CLASSES[meta.tone].badge, dot: TONE_CLASSES[meta.tone].dot };
}