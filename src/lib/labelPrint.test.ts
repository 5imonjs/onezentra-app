import { describe, expect, it } from 'vitest';
import { loadPrintedLabels, markLabelPrinted, clearPrintedLabels, unprintedCompleteItems } from './labelPrint';

describe('markLabelPrinted', () => {
  it('menandai label lalu terbaca kembali pada sesi yang sama', () => {
    window.localStorage.clear();
    expect(markLabelPrinted(7, 'LBL-A1')).toEqual(['LBL-A1']);
    expect(loadPrintedLabels(7)).toEqual(['LBL-A1']);
  });

  it('idempoten: cetak ulang label yang sama tidak menduplikasi', () => {
    window.localStorage.clear();
    markLabelPrinted(7, 'LBL-A1');
    expect(markLabelPrinted(7, 'LBL-A1')).toEqual(['LBL-A1']);
  });

  it('sesi berbeda tidak saling bocor', () => {
    window.localStorage.clear();
    markLabelPrinted(7, 'LBL-A1');
    expect(loadPrintedLabels(8)).toEqual([]);
  });

  it('mengembalikan jejak lama bila label kosong (tidak menimpa)', () => {
    window.localStorage.clear();
    markLabelPrinted(7, 'LBL-A1');
    expect(markLabelPrinted(7, '')).toEqual(['LBL-A1']);
    expect(markLabelPrinted(7, null)).toEqual(['LBL-A1']);
  });

  it('clear menghapus jejak sesi itu saja', () => {
    window.localStorage.clear();
    markLabelPrinted(7, 'LBL-A1');
    markLabelPrinted(8, 'LBL-B2');
    clearPrintedLabels(7);
    expect(loadPrintedLabels(7)).toEqual([]);
    expect(loadPrintedLabels(8)).toEqual(['LBL-B2']);
  });
});

describe('unprintedCompleteItems', () => {
  const base = { id: 1, status: 'VALIDATED', batch: { barcode_label: 'LBL-A1', status: 'ACTIVE' } };

  it('item yang sudah dicetak tidak menghalangi', () => {
    expect(unprintedCompleteItems([base], ['LBL-A1'])).toEqual([]);
  });

  it('item lengkap tapi belum cetak menghalangi', () => {
    expect(unprintedCompleteItems([base], [])).toEqual([base]);
  });

  it('PENDING diurus gate kelengkapan, bukan gate cetak', () => {
    const pending = { ...base, status: 'PENDING' };
    expect(unprintedCompleteItems([pending], [])).toEqual([]);
  });

  it('tanpa batch / tanpa barcode tidak bisa dicetak sehingga tidak menghalangi', () => {
    expect(unprintedCompleteItems([{ ...base, batch: null }], [])).toEqual([]);
    expect(unprintedCompleteItems([{ ...base, batch: { barcode_label: '  ' } }], [])).toEqual([]);
  });

  it('batch CANCELLED tidak bisa dicetak ulang sehingga tidak menghalangi', () => {
    const cancelled = { ...base, batch: { barcode_label: 'LBL-A1', status: 'CANCELLED' } };
    expect(unprintedCompleteItems([cancelled], [])).toEqual([]);
  });

  it('kosong untuk input kosong', () => {
    expect(unprintedCompleteItems(null, [])).toEqual([]);
    expect(unprintedCompleteItems(undefined, [])).toEqual([]);
    expect(unprintedCompleteItems([], [])).toEqual([]);
  });
});
