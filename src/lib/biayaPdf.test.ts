import { describe, expect, it } from 'vitest';
import { formatSuratJalan } from './biayaPdf';

describe('formatSuratJalan', () => {
  it('renders primary and additional surat jalan in one cell', () => {
    expect(formatSuratJalan({
      no_surat_jalan: '11111',
      kendaraan_sj: '0127-26-0000-TES',
    })).toBe('11111, 0127-26-0000-TES');
  });

  it('splits list values and removes duplicate or empty values', () => {
    expect(formatSuratJalan({
      no_surat_jalan: '11111, 22222',
      kendaraan_sj: '22222;33333',
    })).toBe('11111, 22222, 33333');
  });

  it('uses a placeholder when no surat jalan exists', () => {
    expect(formatSuratJalan({})).toBe('-');
  });
});
