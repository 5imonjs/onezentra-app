import { describe, expect, it } from 'vitest';
import { findDuplicateIndexes, firstIndexOfCode, takenCodesExcept } from './itemDuplicates';

const item = (kode_barang: string) => ({ kode_barang });

describe('findDuplicateIndexes', () => {
  it('marks nothing when every code is unique', () => {
    const result = findDuplicateIndexes([item('A'), item('B'), item('C')]);
    expect([...result]).toEqual([]);
  });

  it('keeps the first row and flags every later repeat', () => {
    // The first row is the legitimate one; only the copy is a defect.
    const result = findDuplicateIndexes([item('A'), item('A'), item('A')]);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('ignores blank codes so unfinished rows are not counted as duplicates', () => {
    const result = findDuplicateIndexes([item(''), item(''), item('A')]);
    expect([...result]).toEqual([]);
  });

  it('treats surrounding whitespace as the same code', () => {
    // A pasted code with a stray space is still the same product.
    const result = findDuplicateIndexes([item('A'), item(' A '), item('  ')]);
    expect([...result]).toEqual([1]);
  });

  it('is case sensitive, because product codes are', () => {
    expect([...findDuplicateIndexes([item('abc'), item('ABC')])]).toEqual([]);
  });

  it('handles duplicates interleaved with other codes', () => {
    const result = findDuplicateIndexes([item('A'), item('B'), item('A'), item('C'), item('B')]);
    expect([...result].sort((a, b) => a - b)).toEqual([2, 4]);
  });
});

describe('firstIndexOfCode', () => {
  it('points at the original row so the message can name it', () => {
    const items = [item('A'), item('B'), item('A')];
    expect(firstIndexOfCode(items, 'A')).toBe(0);
  });

  it('returns -1 when the code is absent', () => {
    expect(firstIndexOfCode([item('A')], 'Z')).toBe(-1);
  });
});

describe('takenCodesExcept', () => {
  it('excludes the row itself so it does not disable its own current value', () => {
    // Without this, editing an existing row would grey out the product it
    // already holds and the user could not re-select it.
    expect(takenCodesExcept([item('A'), item('B')], 0)).toEqual(['B']);
  });

  it('returns an empty list for a single row', () => {
    expect(takenCodesExcept([item('A')], 0)).toEqual([]);
  });
});