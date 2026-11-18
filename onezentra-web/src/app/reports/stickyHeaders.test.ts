import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

describe('header tabel sticky', () => {
  it('memberi tinggi tetap pada wrapper tabel yang punya header sticky', () => {
    // `thead sticky top-0` hanya bekerja bila scroll container terdekat
    // benar-benar punya scroll vertikal. `overflow-x-auto` saja menjadikan
    // wrapper itu scroll container tanpa tinggi, jadi header ikut naik
    // bersama halaman. Pola yang dipakai: `max-h-[...] overflow-auto`.
    const offenders = walk(SRC).flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((text, i) => {
        if (!/\boverflow-(?:x-)?auto\b/.test(text) || /max-h-/.test(text)) return [];
        const window = lines.slice(i + 1, i + 9).join('\n');
        // Hanya wrapper tabel dengan thead sticky yang wajib bertinggi tetap;
        // listbox dan tabel pratinjau tanpa sticky tidak masuk aturan ini.
        return /<table\b/.test(window) && /sticky top-0/.test(window)
          ? [`${file.slice(SRC.length + 1)}:${i + 1}`]
          : [];
      });
    });

    expect(offenders).toEqual([]);

    // Self-check: guard harus menangkap pola lama yang memicu bug ini, dan
    // tidak boleh mengganggu listbox yang memang memakai overflow-auto.
    const broken = [
      '<div className="overflow-x-auto hidden lg:block">',
      '<table>',
      '<thead className="sticky top-0 z-10">',
    ].join('\n');
    const listbox = '<ul className="max-h-60 overflow-auto">';
    const scan = (source: string) =>
      source
        .split('\n')
        .some((line, i, all) =>
          /\boverflow-(?:x-)?auto\b/.test(line) &&
          !/max-h-/.test(line) &&
          /<table\b/.test(all.slice(i + 1, i + 9).join('\n')) &&
          /sticky top-0/.test(all.slice(i + 1, i + 9).join('\n')),
        );
    expect(scan(broken)).toBe(true);
    expect(scan(listbox)).toBe(false);
  });
});
