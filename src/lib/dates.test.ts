import { describe, expect, it } from 'vitest';
import { addDaysIso, formatDateDmy, formatDateId, mondayOfWeek, todayLocal, toDateInput, formatDurationId } from './dates';

describe('toDateInput', () => {
  it('memotong bagian waktu tanpa menggeser hari', () => {
    expect(toDateInput('2026-09-09')).toBe('2026-09-09');
    expect(toDateInput('2026-09-09T00:00:00.000000Z')).toBe('2026-09-09');
    expect(toDateInput('20260823')).toBe('2026-08-23');
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
    expect(formatDateId('20260823')).toBe('23 Agu 2026');
    expect(formatDateId('20260230')).toBe('-');
  });

  it('mengembalikan strip untuk nilai tak valid', () => {
    expect(formatDateId(null)).toBe('-');
    expect(formatDateId('')).toBe('-');
  });
});

describe('formatDateDmy', () => {
  it('memformat tanggal ISO dan ringkas tanpa zona waktu', () => {
    expect(formatDateDmy('2026-08-23T00:00:00.000000Z')).toBe('23/08/2026');
    expect(formatDateDmy('20260823')).toBe('23/08/2026');
  });

  it('menolak tanggal kalender yang tidak valid', () => {
    expect(formatDateDmy('20260230')).toBe('-');
  });
});

describe('todayLocal', () => {
  it('memakai komponen lokal (stabil di zona mana pun)', () => {
    expect(todayLocal(new Date(2026, 0, 15, 12, 0, 0))).toBe('2026-01-15');
    expect(todayLocal(new Date(2026, 11, 5, 0, 30, 0))).toBe('2026-12-05');
  });
});

describe('mondayOfWeek', () => {
  it('mengembalikan Senin pada minggu yang sama tanpa pergeseran zona', () => {
    expect(mondayOfWeek('2026-11-02')).toBe('2026-11-02');
    expect(mondayOfWeek('2026-11-05')).toBe('2026-11-02');
    expect(mondayOfWeek('2026-11-08')).toBe('2026-11-02');
    expect(mondayOfWeek('2026-11-09')).toBe('2026-11-09');
  });

  it('mengembalikan nilai asli bila tanggal tidak valid', () => {
    expect(mondayOfWeek('bukan-tanggal')).toBe('bukan-tanggal');
  });
});

describe('addDaysIso', () => {
  it('menggeser hari melewati batas bulan/tahun', () => {
    expect(addDaysIso('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
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
