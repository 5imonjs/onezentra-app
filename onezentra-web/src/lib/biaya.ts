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

const cacheKey = (kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): string => `${module}|${kodeDepo || ''}`;

/** Hapus cache agar perubahan tarif di halaman pengaturan langsung terbaca. */
export function clearBiayaConfigCache(kodeDepo?: string, module?: ApprovalModule): void {
  if (kodeDepo === undefined && module === undefined) {
    cache.clear();
  } else {
    cache.delete(cacheKey(kodeDepo, module));
  }
}

/** Ambil config dengan cache (mengambil dari cache jika tersedia, atau fetch baru). */
export function getBiayaConfigFresh(kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): Promise<BiayaConfig> {
  const key = cacheKey(kodeDepo, module);
  const req = apiClient
    .get('/biaya-config', { params: { ...(kodeDepo ? { kode_depo: kodeDepo } : {}), module } })
    .then((res) => ({ ...BIAYA_CONFIG_FALLBACK, ...(res.data?.data ?? {}) }))
    .catch(() => ({ ...BIAYA_CONFIG_FALLBACK }));
  cache.set(key, req);
  return req;
}

/**
 * Nilai runtime terpusat modul biaya (sumber: config/biaya.php + assignment
 * RFAH per depo, via GET /api/v1/biaya-config). Di-cache per depo per sesi;
 * fallback bila gagal.
 */
export function getBiayaConfig(kodeDepo?: string, module: ApprovalModule = 'biaya_thl'): Promise<BiayaConfig> {
  const key = cacheKey(kodeDepo, module);
  if (!cache.has(key)) {
    cache.set(
      key,
      apiClient
        .get('/biaya-config', { params: { ...(kodeDepo ? { kode_depo: kodeDepo } : {}), module } })
        .then((res) => ({ ...BIAYA_CONFIG_FALLBACK, ...(res.data?.data ?? {}) }))
        .catch(() => ({ ...BIAYA_CONFIG_FALLBACK }))
    );
  }
  return cache.get(key) as Promise<BiayaConfig>;
}
