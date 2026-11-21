/**
 * Helpers + tipe formulir yang dipakai oleh halaman Biaya THL dan
 * modal create/edit-nya (`BiayaThlFormModal`). Dipisah berkas
 * terpisah dari `page` karena berkas page Next 16 tidak boleh
 * mengekspor nilai (ekspor tipe tetap diperbolehkan).
 */

export interface StoredPhoto {
  id: number;
  file_path: string;
  file_name?: string;
}

export type PhotoItem = File | StoredPhoto;

export const isStoredPhoto = (p: PhotoItem): p is StoredPhoto => !(p instanceof File);

export interface DetailRow {
  id?: number;
  detailId?: number;
  receiving_id?: number | null;
  no_surat_jalan: string;
  nama_thl: string;
  driver_name: string;
  nopol_kendaraan: string;
  type_kendaraan: string;
  nominal_biaya: number;
  kubikasi: number;
  droppoint: string;
  posisi: string;
  jam_datang: string;
  jam_pulang: string;
  kendaraan_tambahan: boolean;
  kendaraan_sj?: string;
  kendaraan_nopol?: string;
  kendaraan_type?: string;
  kendaraan?: Array<{ sj: string; nopol: string; type: string }>;
  // Bentuk mentah dari backend: relasi `vehicles` (kolom `no_sj`) — selalu
  // dinormalisasi ke `kendaraan` oleh normalizeBiayaThlItem agar seluruh
  // consumer (review, restore edit, PDF) membaca satu bentuk saja.
  vehicles?: Array<{ sj?: string; no_sj?: string; nopol?: string; type?: string }>;
  order: number;
  photos: PhotoItem[];
  photos_remove?: number[];
}

export interface FormDetailRow extends DetailRow {
  groupId: string;
  detailId?: number;
}

export const VEHICLE_TYPES = ['CDD', 'CDE', 'L300', 'Fuso', 'Container 20', 'Container 40', 'Box', 'Pickup'];
export const POSITIONS = ['THL HELPER', 'THL DRIVER', 'THL GUDANG'];

// Identitas visual per grup SJ: warna + nomor selalu tampil berpasangan agar
// grup mudah dibedakan sekilas tanpa mengandalkan warna saja (aksesibilitas).
// Kelas ditulis statis penuh agar terdeteksi Tailwind JIT.
export const GROUP_ACCENTS = [
  { solid: 'bg-primary-600', soft: 'bg-chip-primary', text: 'text-accent-text', bar: 'from-primary-600 to-primary-300' },
  { solid: 'bg-emerald-600', soft: 'bg-emerald-50', text: 'text-emerald-700', bar: 'from-emerald-600 to-emerald-300' },
  { solid: 'bg-amber-600', soft: 'bg-amber-50', text: 'text-amber-700', bar: 'from-amber-600 to-amber-300' },
  { solid: 'bg-rose-600', soft: 'bg-rose-50', text: 'text-rose-700', bar: 'from-rose-600 to-rose-300' },
  { solid: 'bg-sky-600', soft: 'bg-sky-50', text: 'text-sky-700', bar: 'from-sky-600 to-sky-300' },
  { solid: 'bg-violet-600', soft: 'bg-violet-50', text: 'text-violet-700', bar: 'from-violet-600 to-violet-300' },
];

export const generateId = (prefix = 'id'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback jika browser melempar exception pada insecure context
    }
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const requiresDriverName = (position: string) => {
  const normalizedPosition = position.trim().toUpperCase();
  return normalizedPosition === 'THL HELPER' || normalizedPosition === 'THL DRIVER';
};

export const requiresWorkHours = (position: string) => {
  const normalizedPosition = position.trim().toUpperCase();
  return normalizedPosition === 'THL HELPER'
    || normalizedPosition === 'THL DRIVER'
    || normalizedPosition === 'THL GUDANG';
};

export const getMissingFields = (detail: FormDetailRow): string[] => {
  const position = detail.posisi?.trim().toUpperCase();
  const missing: string[] = [];
  if (!detail.nama_thl.trim()) missing.push('Nama THL');
  if (!detail.posisi) missing.push('Posisi');
  // Dokumentasi: plat + type kendaraan diisi per baris untuk SEMUA posisi,
  // termasuk THL GUDANG.
  if (!detail.nopol_kendaraan.trim()) missing.push('Plat Kendaraan');
  if (!detail.type_kendaraan) missing.push('Type Kendaraan');
  if (!Number.isFinite(Number(detail.nominal_biaya)) || Number(detail.nominal_biaya) < 1) missing.push('Nominal Biaya');
  // Dokumentasi §2.1 langkah 6: satu baris valid wajib memiliki satu foto
  // bukti. Draft tetap boleh disimpan tanpa foto (jalur draft tak dicek di sini).
  if (detail.photos.length === 0) missing.push('Foto Bukti');
  if (requiresDriverName(position)) {
    if (!detail.driver_name.trim()) missing.push('Nama Driver');
    if (Number(detail.kubikasi) <= 0) missing.push('Kubikasi');
    if (!detail.droppoint.trim()) missing.push('Droppoint');
  }
  if (requiresWorkHours(position)) {
    if (!detail.jam_datang) missing.push('Jam Datang');
    if (!detail.jam_pulang) missing.push('Jam Pulang');
    if (detail.jam_datang && detail.jam_pulang) {
      if (detail.jam_pulang <= detail.jam_datang) {
        missing.push('Jam Pulang harus setelah Jam Datang');
      } else {
        const diffMs = new Date(detail.jam_pulang).getTime() - new Date(detail.jam_datang).getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours > 18) {
          missing.push('Durasi kerja melebihi 18 jam — periksa kembali jam datang/pulang');
        }
      }
    }
  }

  return missing;
};

export const isDetailReady = (detail: FormDetailRow): boolean => getMissingFields(detail).length === 0;

export const formatCurrency = (amount: number | string | null | undefined) => {
  const numericAmount = Number(amount || 0);
  return `Rp ${Number.isFinite(numericAmount) ? numericAmount.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '0'}`;
};

/**
 * Kompresi foto lapangan (HP 8–12MP) ke JPEG ≤1280px kualitas 0.8 sebelum
 * upload: hemat kuota sinyal gudang tanpa mengorbankan keterbacaan bukti.
 */
export const compressImage = (file: File): Promise<File> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      if (scale >= 1 && file.type === 'image/jpeg' && file.size <= 2 * 1024 * 1024) {
        resolve(file);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });

export const formatRibuan = (value: number | string): string => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';

  // Nilai decimal dari Laravel dapat diterima sebagai string, misalnya
  // "131000.00". Jangan menganggap angka desimal tersebut sebagai digit rupiah.
  const numericValue = typeof value === 'string' && /^\d+\.\d{2}$/.test(rawValue)
    ? Number(rawValue)
    : Number(rawValue.replace(/\./g, '').replace(',', '.'));

  if (!Number.isFinite(numericValue)) return '';
  return Math.trunc(numericValue).toLocaleString('id-ID');
};

export const parseRibuan = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

export const toDateInputValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};
