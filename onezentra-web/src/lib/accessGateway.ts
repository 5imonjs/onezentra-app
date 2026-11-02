import { apiClient, ensureCsrfCookie } from './api';

export type DepoOption = {
  id: number;
  kode_depo: string;
  nama_depo: string;
};

export type RegionValidation = {
  valid: boolean;
  region_id: string;
  region_code: string;
  region_name: string;
  message: string;
};

export type DepoValidation = {
  valid: boolean;
  depo_id: number;
  kode_depo: string;
  depo_name: string;
  message: string;
};

export type DepoOptionsResponse = {
  valid: boolean;
  region_code: string;
  region_name: string | null;
  depos: DepoOption[];
};

/**
 * Validasi Region Access ke backend (session server yang menyimpan konteks).
 * Region code bukan autentikasi — hanya penentu lingkungan operasional.
 */
export async function validateRegion(regionCode: string): Promise<RegionValidation> {
  await ensureCsrfCookie();
  const { data } = await apiClient.post<RegionValidation>('/region-validate', {
    region_code: regionCode,
  });
  return data;
}

/** Daftar depo aktif yang berada di region pada session server. */
export async function fetchDepoOptions(): Promise<DepoOptionsResponse> {
  const { data } = await apiClient.get<DepoOptionsResponse>('/depo-options');
  return data;
}

/** Validasi depo terhadap region yang sudah aktif di session server. */
export async function validateDepo(kodeDepo: string): Promise<DepoValidation> {
  await ensureCsrfCookie();
  const { data } = await apiClient.post<DepoValidation>('/depo-validate', {
    kode_depo: kodeDepo,
  });
  return data;
}
