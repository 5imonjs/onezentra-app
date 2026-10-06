import { describe, expect, it } from 'vitest';
import { formatDateId, todayLocal, toDateInput, formatDurationId } from './dates';

describe('toDateInput', () => {
  it('memotong bagian waktu tanpa menggeser hari', () => {
    expect(toDateInput('2026-09-09')).toBe('2026-09-09');
    expect(toDateInput('2026-09-09T00:00:00.000000Z')).toBe('2026-09-09');
  });

  it('mengembalikan kosong untuk nilai tak valid', () => {
    expect(toDateInput(null)).toBe('');
    expect(toDateInput('')).toBe('');
    expect(toDateInput('bukan-tanggal')).toBe('');
  });
});

describe('formatDateId', () => {
  it('memformat tanpa sentuhan zona waktu', () => {
    expect(formatDateId('2026-09-09')).toBe('09 Sep 2026');
    expect(formatDateId('2027-01-15T00:00:00.000000Z')).toBe('15 Jan 2027');
  });

  it('mengembalikan strip untuk nilai tak valid', () => {
    expect(formatDateId(null)).toBe('-');
    expect(formatDateId('')).toBe('-');
  });
});

describe('todayLocal', () => {
  it('memakai komponen lokal (stabil di zona mana pun)', () => {
    expect(todayLocal(new Date(2026, 0, 15, 12, 0, 0))).toBe('2026-01-15');
    expect(todayLocal(new Date(2026, 11, 5, 0, 30, 0))).toBe('2026-12-05');
  });
});

describe('formatDurationId', () => {
  it('memecah hari ke tahun-bulan-hari (365/30)', () => {
    expect(formatDurationId(274)).toBe('0 Thn 9 Bln 4 Hr');
    expect(formatDurationId(400)).toBe('1 Thn 1 Bln 5 Hr');
    expect(formatDurationId(0)).toBe('0 Thn 0 Bln 0 Hr');
  });

  it('menandai yang kedaluwarsa', () => {
    expect(formatDurationId(-8)).toBe('Lewat 0 thn 0 bln 8 hr');
  });
});
