import { apiClient } from './api';

export interface BiayaConfig {
  rfah_name: string;
  thl_rfah_threshold: number;
  retribusi_rfah_threshold: number;
}

export const BIAYA_CONFIG_FALLBACK: BiayaConfig = {
  rfah_name: 'Umi Marzuqoh',
  thl_rfah_threshold: 750000,
  retribusi_rfah_threshold: 1000000,
};

const cache = new Map<string, Promise<BiayaConfig>>();

/**
 * Nilai runtime terpusat modul biaya (sumber: config/biaya.php + assignment
 * RFAH per depo, via GET /api/v1/biaya-config). Di-cache per depo per sesi;
 * fallback bila gagal.
 */
export function getBiayaConfig(kodeDepo?: string): Promise<BiayaConfig> {
  const key = kodeDepo || '';
  if (!cache.has(key)) {
    cache.set(
      key,
      apiClient
        .get('/biaya-config', { params: key ? { kode_depo: key } : {} })
        .then((res) => ({ ...BIAYA_CONFIG_FALLBACK, ...(res.data?.data ?? {}) }))
        .catch(() => ({ ...BIAYA_CONFIG_FALLBACK }))
    );
  }
  return cache.get(key) as Promise<BiayaConfig>;
}
