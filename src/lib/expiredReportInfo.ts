export type ExpiredReportKind = 'batch' | 'monitoring';

export interface ExpiredReportInfo {
  source: string;
  grain: string;
  qty: string;
  status: string;
  note: string;
  relatedHref: string;
  relatedLabel: string;
}

/**
 * Definisi bersama untuk dua laporan kedaluwarsa.
 *
 * Keduanya berasal dari `receiving_items`, tetapi laporan batch membaca ledger
 * mentah sedangkan laporan monitoring membaca snapshot mingguan yang sudah
 * diagregasi dan dikoreksi. Teks di sini dipakai kedua halaman supaya
 * penjelasannya tidak bisa berbeda antar menu.
 */
export const EXPIRED_REPORT_INFO: Record<ExpiredReportKind, ExpiredReportInfo> = {
  batch: {
    source: 'Ledger penerimaan (mentah) — receiving_items',
    grain: 'Satu baris = satu batch penerimaan',
    qty: 'Qty ledger apa adanya (belum dikoreksi)',
    status: 'Dua status: Berlaku / Kedaluwarsa',
    note: 'Diambil langsung dari baris penerimaan, tanpa agregasi per minggu dan tanpa koreksi opname. Batch yang dibatalkan atau stok yang sudah dikoreksi tetap tampil apa adanya, sehingga angkanya bisa berbeda dari laporan monitoring.',
    relatedHref: '/reports/opname-expired',
    relatedLabel: 'Lihat Monitoring Kedaluwarsa',
  },
  monitoring: {
    source: 'Snapshot mingguan — opname_expired_waves',
    grain: 'Satu baris = produk per depo per tanggal expired per minggu',
    qty: 'Qty efektif = qty awal + koreksi opname yang disetujui',
    status: 'Empat status: EXPIRED / KRITIS / PERHATIAN / AMAN',
    note: 'Data dibekukan tiap minggu dan bisa dikoreksi melalui sesi opname. Batch yang dibatalkan dan baseline yang sudah tercakup tidak dihitung ulang, sehingga angkanya bisa berbeda dari laporan batch.',
    relatedHref: '/reports/penerimaan-batch-expired',
    relatedLabel: 'Lihat Batch Kedaluwarsa',
  },
};
