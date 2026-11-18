export type ExpiredReportKind = 'batch' | 'monitoring';

export interface ExpiredReportInfo {
  stage: string;
  source: string;
  grain: string;
  qty: string;
  status: string;
  note: string;
  relatedHref: string;
  relatedLabel: string;
}

/**
 * Definisi bersama untuk satu alur pengendalian stok kedaluwarsa.
 *
 * Kedua menu adalah satu tujuan yang sama, bukan dua laporan yang berdiri
 * sendiri. `receiving_items` adalah data dasar; `opname_expired_waves` adalah
 * hasil lanjutan dari data yang sama setelah diagregasi per minggu dan
 * dikoreksi lewat opname. Teks di sini dipakai kedua halaman supaya narasinya
 * tidak bisa berbeda antar menu.
 */
export const EXPIRED_REPORT_FLOW = 'Penerimaan barang → Snapshot mingguan → Opname & koreksi → Tindak lanjut';

export const EXPIRED_REPORT_INFO: Record<ExpiredReportKind, ExpiredReportInfo> = {
  batch: {
    stage: 'Tahap 1 · Data dasar',
    source: 'Ledger penerimaan (mentah) — receiving_items',
    grain: 'Satu baris = satu batch penerimaan',
    qty: 'Qty ledger apa adanya (belum dikoreksi)',
    status: 'Dua status: Berlaku / Kedaluwarsa',
    note: 'Ini bahan baku untuk laporan monitoring, bukan laporan yang berdiri sendiri. Belum diagregasi atau dikoreksi, jadi angkanya bisa berbeda dari hasil monitoring.',
    relatedHref: '/reports/opname-expired',
    relatedLabel: 'Lihat Hasil Monitoring',
  },
  monitoring: {
    stage: 'Tahap 2 · Hasil monitoring',
    source: 'Snapshot mingguan — opname_expired_waves',
    grain: 'Satu baris = produk per depo per tanggal expired per minggu',
    qty: 'Qty efektif = qty awal + koreksi opname yang disetujui',
    status: 'Empat status: EXPIRED / KRITIS / PERHATIAN / AMAN',
    note: 'Ini hasil lanjut dari data penerimaan yang sama: diagregasi per minggu lalu dikoreksi lewat sesi opname. Satu alur, satu tujuan—yang beda hanya tahapnya.',
    relatedHref: '/reports/penerimaan-batch-expired',
    relatedLabel: 'Lihat Data Dasar Batch',
  },
};
