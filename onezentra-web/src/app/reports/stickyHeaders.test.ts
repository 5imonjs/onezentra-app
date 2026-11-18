import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = __dirname;

const reportPages = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(DIR, entry.name, 'page.tsx'))
  .filter((file) => {
    try {
      return readFileSync(file, 'utf8').includes('<table');
    } catch {
      return false;
    }
  });

describe('laporan — header tabel sticky', () => {
  it('memberi tinggi tetap pada setiap wrapper tabel yang bisa digulir', () => {
    // `thead sticky top-0` hanya bekerja bila scroll container terdekat
    // benar-benar punya scroll vertikal. `overflow-x-auto` saja menjadikan
    // wrapper itu scroll container tanpa tinggi, jadi header ikut naik
    // bersama halaman. Semua tabel laporan memakai pola `max-h-[...] overflow-auto`.
    const offenders = reportPages.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((text, i) => ({ file: file.slice(DIR.length + 1), line: i + 1, text }))
        .filter(({ text }) => /\boverflow-(?:x-)?auto\b/.test(text))
        .filter(({ text }) => !/max-h-\[/.test(text)),
    );

    expect(offenders.map(({ file, line }) => `${file}:${line}`)).toEqual([]);
    expect(reportPages.length).toBeGreaterThan(0);

    // Self-check: guard harus menangkap pola lama yang memicu bug ini.
    const broken = '<div className="overflow-x-auto hidden lg:block">';
    expect(/\boverflow-(?:x-)?auto\b/.test(broken) && !/max-h-\[/.test(broken)).toBe(true);
  });
});
