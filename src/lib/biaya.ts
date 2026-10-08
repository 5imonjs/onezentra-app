import { apiClient } from './api';

export interface BiayaConfig {
  rfah_name: string;
  thl_rfah_threshold: number;
  retribusi_rfah_threshold: number;
  /** borongan = nominal manual; koli = nominal otomatis qty x tarif */
  retribusi_calc_mode: 'borongan' | 'koli';
  retribusi_rate_zak: number;
  retribusi_rate_crt: number;
}

export const BIAYA_CONFIG_FALLBACK: BiayaConfig = {
  rfah_name: 'Umi Marzuqoh',
  thl_rfah_threshold: 750000,
  retribusi_rfah_threshold: 1000000,
  retribusi_calc_mode: 'borongan',
  retribusi_rate_zak: 0,
  retribusi_rate_crt: 0,
};

export type ApprovalModule = 'biaya_thl' | 'biaya_retribusi';

const cache = new Map<string, Promise<BiayaConfig>>();

/** Hasil fetch config beserta penanda apakah nilai fallback yang dipakai. */
export interface BiayaConfigResult {
  config: BiayaConfig;
  /** true bila request gagal dan BIAYA_CONFIG_FALLBACK yang dipakai. */
  isFallback: boolean;
}

const cacheKey = (kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): string => `${module}|${kodeDepo || ''}`;

/** Kunci cache yang terakhir diisi dari fallback (agar status cache akurat). */
const fallbackKeys = new Set<string>();

/** Fetch mentah yang menandai fallback agar caller bisa memberi sinyal ke user. */
function fetchBiayaConfig(kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): Promise<BiayaConfigResult> {
  const key = cacheKey(kodeDepo, module);
  return apiClient
    .get('/biaya-config', { params: { ...(kodeDepo ? { kode_depo: kodeDepo } : {}), module } })
    .then((res) => {
      fallbackKeys.delete(key);
      return { config: { ...BIAYA_CONFIG_FALLBACK, ...(res.data?.data ?? {}) }, isFallback: false };
    })
    .catch(() => {
      fallbackKeys.add(key);
      return { config: { ...BIAYA_CONFIG_FALLBACK }, isFallback: true };
    });
}

/** Varian WithStatus: kembalikan config + penanda fallback (fallback tidak lagi diam). */
export function getBiayaConfigFreshWithStatus(kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): Promise<BiayaConfigResult> {
  const key = cacheKey(kodeDepo, module);
  const req = fetchBiayaConfig(kodeDepo, module);
  // Simpan janji config agar cache per-depo tetap terisi untuk pemanggil lama.
  cache.set(
    key,
    req.then((r) => r.config)
  );
  return req;
}

/** Varian cache dari WithStatus: pakai cache bila ada, tandai fallback bila fetch gagal. */
export function getBiayaConfigWithStatus(kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): Promise<BiayaConfigResult> {
  const key = cacheKey(kodeDepo, module);
  if (cache.has(key)) {
    return (cache.get(key) as Promise<BiayaConfig>).then((config) => ({ config, isFallback: fallbackKeys.has(key) }));
  }
  return getBiayaConfigFreshWithStatus(kodeDepo, module);
}

/** Hapus cache agar perubahan tarif di halaman pengaturan langsung terbaca. */
export function clearBiayaConfigCache(kodeDepo?: string, module?: ApprovalModule): void {
  if (kodeDepo === undefined && module === undefined) {
    cache.clear();
    fallbackKeys.clear();
  } else {
    const key = cacheKey(kodeDepo, module);
    cache.delete(key);
    fallbackKeys.delete(key);
  }
}

/** Ambil config dengan cache (mengambil dari cache jika tersedia, atau fetch baru). */
export function getBiayaConfigFresh(kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): Promise<BiayaConfig> {
  return getBiayaConfigFreshWithStatus(kodeDepo, module).then((r) => r.config);
}

/**
 * Nilai runtime terpusat modul biaya (sumber: config/biaya.php + assignment
 * RFAH per depo, via GET /api/v1/biaya-config). Di-cache per depo per sesi;
 * fallback bila gagal.
 */
export function getBiayaConfig(kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): Promise<BiayaConfig> {
  return getBiayaConfigWithStatus(kodeDepo, module).then((r) => r.config);
}
