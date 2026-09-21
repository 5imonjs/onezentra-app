import { describe, expect, it } from 'vitest';
import {
  encodeCode39,
  generateSuratJalanPDF,
  getPdfPageCount,
  normalizeRkhDate,
  sanitizeCode39Value,
  type RencanaKirimData,
  type RencanaKirimItem,
} from './suratJalanPdf';

/** Decode modul barcode menjadi elemen bar/space berurutan (run-length). */
function decodeRuns(modules: string): { bar: boolean; length: number }[] {
  const runs: { bar: boolean; length: number }[] = [];
  let i = 0;
  while (i < modules.length) {
    let j = i + 1;
    while (j < modules.length && modules[j] === modules[i]) j++;
    runs.push({ bar: modules[i] === '1', length: j - i });
    i = j;
  }
  return runs;
}

function makeItem(index: number, overrides: Partial<RencanaKirimItem> = {}): RencanaKirimItem {
  return {
    item_number: index + 1,
    kode_barang: `KODE-${index + 1}`,
    nama_barang: `Barang contoh ${index + 1}`,
    jumlah: 1,
    satuan: 'CRT',
    keterangan: '-',
    ...overrides,
  };
}

function makeData(overrides: Partial<RencanaKirimData> = {}): RencanaKirimData {
  return {
    rkh_date: '2026-09-21',
    po_transporter: 'PO-2026-0001',
    driver_name: 'Budi',
    nopol: 'KB 1234 XY',
    jenis_kendaraan: 'CDD',
    expedisi: 'Ekspedisi A',
    shipper_name: 'Gudang Onezentra',
    shipper_address: 'Jl. Contoh No. 1, Pontianak',
    shipper_phone: '08123456789',
    destination_name: 'Depo Singkawang',
    destination_address: 'Jl. Tujuan No. 2',
    notes: '',
    total_qty: 1,
    items: [makeItem(0)],
    nama_depo: 'Singkawang',
    ...overrides,
  };
}

describe('sanitizeCode39Value', () => {
  it('mengubah ke huruf besar dan membuang karakter di luar Code 39', () => {
    expect(sanitizeCode39Value('po-12_ab#')).toBe('PO-12AB');
    expect(sanitizeCode39Value('kb 1234 xy')).toBe('KB 1234 XY');
  });

  it('nilai kosong menjadi "-" agar barcode tetap valid', () => {
    expect(sanitizeCode39Value('')).toBe('-');
    expect(sanitizeCode39Value(undefined)).toBe('-');
  });
});

describe('encodeCode39', () => {
  it('menyisipkan start/stop dan gap narrow antar karakter', () => {
    // '*', '0', '*' dipisah satu modul space (gap).
    expect(encodeCode39('0')).toBe('100101101101' + '0' + '101001101101' + '0' + '100101101101');
    expect(encodeCode39('0')).toHaveLength(38);
  });

  it('setiap karakter Code 39 ter-decode menjadi 5 bar + 4 space (2 bar wide, 1 space wide)', () => {
    const modules = encodeCode39('0');
    const characters = [modules.slice(0, 12), modules.slice(13, 25), modules.slice(26, 38)];
    for (const character of characters) {
      const runs = decodeRuns(character);
      expect(runs.filter((run) => run.bar)).toHaveLength(5);
      expect(runs.filter((run) => !run.bar)).toHaveLength(4);
      expect(runs.filter((run) => run.bar && run.length === 2)).toHaveLength(2);
      expect(runs.filter((run) => !run.bar && run.length === 2)).toHaveLength(1);
    }
  });
});

describe('normalizeRkhDate', () => {
  it('memformat tanggal RKH sebagai DD-MM-YYYY', () => {
    expect(normalizeRkhDate('2026-09-21')).toBe('21-09-2026');
  });

  it('mengembalikan "-" untuk nilai kosong', () => {
    expect(normalizeRkhDate('')).toBe('-');
  });

  it('tanggal dengan jam tidak bergeser (parse tekstual, bukan new Date UTC)', () => {
    expect(normalizeRkhDate('2026-01-01T00:00:00.000000Z')).toBe('01-01-2026');
    expect(normalizeRkhDate('2026-12-31T23:30:00Z')).toBe('31-12-2026');
  });

  it('nilai non-ISO dikembalikan apa adanya', () => {
    expect(normalizeRkhDate('21/09/2026')).toBe('21/09/2026');
  });
});

describe('generateSuratJalanPDF', () => {
  it('menghasilkan satu halaman untuk rencana kecil', () => {
    const doc = generateSuratJalanPDF(makeData({ items: [makeItem(0), makeItem(1), makeItem(2)] }));
    expect(getPdfPageCount(doc)).toBe(1);
  });

  it('memecah dokumen menjadi beberapa halaman saat item banyak', () => {
    const items = Array.from({ length: 60 }, (_, index) =>
      makeItem(index, { nama_barang: `Barang dengan nama panjang untuk uji wrap ${index}` }),
    );
    const doc = generateSuratJalanPDF(makeData({ items, total_qty: items.length }));
    expect(getPdfPageCount(doc)).toBeGreaterThan(1);
  });
});
