export interface NpnProduct {
  id: number;
  BOSnetszProductId: string | null;
  SAPszProductId: string | null;
  szNickName: string | null;
  szNickNameNew: string | null;
  szShortDescription: string | null;
  szBarcode: string | null;
}

export interface StandarisasiItem {
  id: number;
  npn_id: number | null;
  npn?: NpnProduct | null;
  tier: number | null;
  tinggi_tumpukan: number | null;
  total_tier_tinggi: number | null;
  status: string;
  requested_by: number | null;
  requested_by_email: string | null;
  approved_by: number | null;
  approved_by_email: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  created_at: string;
  updated_at: string;
}

export interface StandarisasiStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * Hanya kolom yang benar-benar boleh dikirim ke API.
 * Status tidak termasuk: perubahannya hanya lewat approve/reject.
 */
export interface StandarisasiFormValues {
  npn_id: number | null;
  tier: number;
  tinggi_tumpukan: number;
}

export interface ListFilters {
  search: string;
  status: string;
  kodeDepo: string;
}

export interface DepoOption {
  kode_depo: string;
  nama_depo: string;
}

export interface StatusFilterOption {
  key: string;
  label: string;
  value: string;
}

/** Callback baris tabel — dipisah agar tabel & baris tidak menerima belasan prop. */
export interface StandarisasiRowHandlers {
  onView: (item: StandarisasiItem) => void;
  onEdit: (item: StandarisasiItem) => void;
  onDelete: (item: StandarisasiItem) => void;
  onApprove: (item: StandarisasiItem) => void;
  onReject: (item: StandarisasiItem) => void;
  onNotify: (item: StandarisasiItem) => void;
}

export const PER_PAGE = 20;

/** Disamakan dengan MAX_DIMENSION pada StandarisasiTumpukanController. */
export const MAX_DIMENSION = 100;

export const EMPTY_STATS: StandarisasiStats = { total: 0, pending: 0, approved: 0, rejected: 0 };

export const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Approved', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
};

export function emptyFormValues(): StandarisasiFormValues {
  return { npn_id: null, tier: 1, tinggi_tumpukan: 1 };
}

/** Urutan label produk dipakai konsisten di tabel, picker, dan modal detail. */
export function productLabel(product: NpnProduct | null | undefined): string {
  if (!product) return '-';
  return product.szShortDescription || product.szNickName || product.szNickNameNew || '-';
}

export function toFormValues(item: StandarisasiItem): StandarisasiFormValues {
  return {
    npn_id: item.npn_id ?? null,
    tier: item.tier ?? 1,
    tinggi_tumpukan: item.tinggi_tumpukan ?? 1,
  };
}

/** Clamp nilai input agar selalu 1..MAX_DIMENSION walau user mengetik sampah. */
export function clampDimension(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, Math.min(MAX_DIMENSION, parsed));
}
