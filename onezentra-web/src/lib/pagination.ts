/**
 * Jendela nomor halaman ala Excel/tabular: halaman besar tidak me-render
 * ratusan tombol (overflow di layar kecil). Selalu tampilkan halaman 1,
 * terakhir, dan ±2 di sekitar halaman aktif, sisanya ellipsis.
 */
export function pageWindow(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const keep = new Set<number>([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]);
  const pages = Array.from(keep).filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }

  return out;
}
