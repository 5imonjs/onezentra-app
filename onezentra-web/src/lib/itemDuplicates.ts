/**
 * Deteksi barang terduplikasi di daftar barang rencana kirim.
 *
 * Satu produk hanya boleh muncul sekali per rencana. Kuncinya adalah KODE
 * barang, bukan nama: nama bisa ditulis berbeda ejaan atau berbeda kata
 * ("Indomie Goreng 85g" vs "Indomie Goreng 85 gr") padahal produknya sama,
 * sedangkan kode barang bersifat unik per master NPN.
 */

export interface DuplicableItem {
  kode_barang: string;
}

/**
 * Mengembalikan indeks setiap baris yang kodenya sudah dipakai baris lain.
 * Baris PERTAMA dari tiap kode sengaja tidak ditandai: itu baris aslinya,
 * dan hanya身分anya yang perlu diperbaiki.
 */
export function findDuplicateIndexes(items: readonly DuplicableItem[]): Set<number> {
  const firstByCode = new Map<string, number>();
  const duplicates = new Set<number>();

  items.forEach((item, index) => {
    // Trim supaya " 1234" dan "1234" dianggap sama, dan kode kosong diabaikan
    // karena baris yang belum dipilih barang memang belum punya kode.
    const code = item.kode_barang?.trim();
    if (!code) return;

    if (firstByCode.has(code)) {
      duplicates.add(index);
    } else {
      firstByCode.set(code, index);
    }
  });

  return duplicates;
}

/** Indeks baris pertama yang memakai `code`, atau -1. */
export function firstIndexOfCode(items: readonly DuplicableItem[], code: string): number {
  const target = code.trim();
  return items.findIndex((item) => item.kode_barang?.trim() === target);
}

/**
 * Kode barang yang terpakai baris LAIN than `index`.
 * Dipakai untuk menonaktifkan opsi yang sudah terpakai di dropdown pencarian,
 * sehingga duplikat tidak bisa terjadi sejak awal, bukan baru ketahuan setelahnya.
 */
export function takenCodesExcept(
  items: readonly DuplicableItem[],
  index: number,
): string[] {
  return items.flatMap((item, i) => (i === index ? [] : [item.kode_barang ?? '']));
}