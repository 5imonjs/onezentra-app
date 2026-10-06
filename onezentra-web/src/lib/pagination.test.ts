import { describe, expect, it } from 'vitest';
import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('menampilkan semua bila sedikit', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('memadatkan dengan ellipsis di kedua sisi', () => {
    expect(pageWindow(10, 20)).toEqual([1, '…', 8, 9, 10, 11, 12, '…', 20]);
  });

  it('tanpa ellipsis di tepi', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, '…', 20]);
    expect(pageWindow(20, 20)).toEqual([1, '…', 18, 19, 20]);
  });
});
