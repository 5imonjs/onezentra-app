import { describe, expect, it } from 'vitest';
import { canonicalCondition, conditionMeta } from './condition';

describe('canonicalCondition', () => {
  it('memetakan alias lama ke kondisi kanonik', () => {
    expect(canonicalCondition('GOOD')).toBe('FISIK_BAGUS');
    expect(canonicalCondition('NOT GOOD')).toBe('FISIK_RUSAK');
    expect(canonicalCondition('DAMAGED')).toBe('FISIK_RUSAK');
    expect(canonicalCondition('LESS')).toBe('QTY_KURANG');
    expect(canonicalCondition('MISSING')).toBe('LAINNYA');
  });

  it('mengabaikan perbedaan huruf besar/kecil dan spasi', () => {
    expect(canonicalCondition(' fisik_rusak ')).toBe('FISIK_RUSAK');
    expect(canonicalCondition('Qty_Kurang')).toBe('QTY_KURANG');
  });

  it('fallback ke FISIK_BAGUS untuk nilai kosong atau tidak dikenal', () => {
    expect(canonicalCondition(null)).toBe('FISIK_BAGUS');
    expect(canonicalCondition('')).toBe('FISIK_BAGUS');
    expect(canonicalCondition('KODE_APA_SAJA')).toBe('FISIK_BAGUS');
  });
});

describe('conditionMeta', () => {
  it('mengembalikan label dan tone sesuai kondisi', () => {
    expect(conditionMeta('FISIK_RUSAK')).toMatchObject({ label: 'Fisik Rusak', tone: 'bad' });
    expect(conditionMeta('FISIK_BAGUS')).toMatchObject({ label: 'Fisik Bagus', tone: 'good' });
    expect(conditionMeta('QTY_KURANG')).toMatchObject({ label: 'Qty Kurang', tone: 'warn' });
    expect(conditionMeta('LAINNYA')).toMatchObject({ label: 'Lainnya', tone: 'neutral' });
  });

  it('kelas badge & dot konsisten dengan tone', () => {
    const meta = conditionMeta('FISIK_BAGUS');
    expect(meta.badge).toContain('bg-emerald-50');
    expect(meta.dot).toContain('bg-emerald-500');
  });

  it('nilai tidak dikenal dilewatkan apa adanya dengan tone netral', () => {
    expect(conditionMeta('KODE_APA_SAJA')).toMatchObject({ label: 'KODE_APA_SAJA', tone: 'neutral' });
    expect(conditionMeta(null)).toMatchObject({ label: '-', tone: 'neutral' });
  });
});
