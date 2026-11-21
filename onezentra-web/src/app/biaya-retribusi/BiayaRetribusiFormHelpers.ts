/**
 * Helpers + tipe formulir yang dipakai oleh halaman Biaya Retribusi dan
 * modal create/edit-nya (`BiayaRetribusiFormModal`). Dipisah berkas
 * terpisah dari `page` karena berkas page Next 16 tidak boleh
 * mengekspor nilai (ekspor tipe tetap diperbolehkan).
 */

export interface ReceivingCandidate {
  id: number;
  receiving_id: number;
  tanggal_selesai: string;
  nopol_kendaraan: string;
  type_kendaraan: string;
  po_transporter: string;
  driver_name: string;
  checker_name: string;
  kode_depo: string;
  nama_depo: string;
  no_surat_jalan: string;
  /** Hasil bersih penerimaan — otomatis dari receiving, bukan input. */
  qty_zak: number;
  qty_crt: number;
}

export interface DetailRow {
  biaya_thl_id: number;
  biaya_thl_detail_id: number;
  receiving_id?: number | null;
  nopol_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  qty_zak?: number;
  qty_crt?: number;
  nominal_biaya: number;
  order: number;
  biaya_thl_detail?: {
    nama_thl?: string;
    driver_name?: string;
    kubikasi?: number;
    droppoint?: string;
    posisi?: string;
    jam_datang?: string;
    jam_pulang?: string;
    photos?: { file_path?: string; file_name?: string }[];
  } | null;
}

export interface ManualDetailRow {
  nopol_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  qty_zak: number;
  qty_crt: number;
  nominal_biaya: number;
}

export interface DocumentRow {
  id?: number;
  document_type: string;
  file: File | null;
  file_name: string;
  file_path?: string;
  file_size?: number;
}

export const DOCUMENT_TYPES = [
  { value: 'BA', label: 'BA (Berita Acara)' },
  { value: 'SJ', label: 'Surat Jalan' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'manifest', label: 'Manifest' },
  { value: 'lainnya', label: 'Dokumen Lain' },
];

export const VEHICLE_TYPES = ['CDD', 'CDE', 'L300', 'Fuso', 'Container 20', 'Container 40'];

/** Plat/SJ/type kendaraan selalu kapital (ketikan user dinormalkan saat input). */
export const upper = (value: string | null | undefined): string => (value || '').toString().trim().toUpperCase();

export const formatCurrency = (amount: number | string | null | undefined) => {
  const numericAmount = Number(amount || 0);
  return `Rp ${Number.isFinite(numericAmount) ? numericAmount.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '0'}`;
};

export const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatBytes = (bytes?: number | null): string => {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};
