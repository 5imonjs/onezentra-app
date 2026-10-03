import { describe, expect, it } from 'vitest';
import { canonicalCondition, conditionMeta, hasQty } from './condition';

describe('hasQty', () => {
  it('menerima 0 karena "barang tidak datang" adalah hasil validasi yang sah', () => {
    // Regression guard. Backend menerima 0 (`required|numeric|min:0`) dan
    // menjadikannya MISMATCH. Guard lama memakai `!form.actual_qty`, jadi 0 ikut
    // tertolak dan kasus "barang hilang total" tidak bisa direkam sama sekali.
    expect(hasQty(0)).toBe(true);
  });

  it('menerima qty positif dan qty pecahan', () => {
    expect(hasQty(1)).toBe(true);
    expect(hasQty(120)).toBe(true);
    expect(hasQty(0.5)).toBe(true);
  });

  it('menerima string angka dari input, termasuk "0"', () => {
    expect(hasQty('0')).toBe(true);
    expect(hasQty('25')).toBe(true);
  });

  it('menolak yang benar-benar belum diisi', () => {
    expect(hasQty('')).toBe(false);
    expect(hasQty('   ')).toBe(false);
    expect(hasQty(null)).toBe(false);
    expect(hasQty(undefined)).toBe(false);
  });

  it('menolak NaN dari input yang tidak valid', () => {
    // `Number('')` ternyata 0, bukan NaN — itu sebabnya form TIDAK boleh
    // menyimpan qty sebagai number (field yang dikosongkan akan terbaca
    // "barang tidak datang"). Guard ini tetap harus menolak NaN yang bisa
    // datang dari sumber lain.
    expect(Number('')).toBe(0);
    expect(hasQty(Number(''))).toBe(true); // 0 = valid, konsisten dengan test pertama
    expect(hasQty(Number('abc'))).toBe(false);
    expect(hasQty(Number.NaN)).toBe(false);
  });
});

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
