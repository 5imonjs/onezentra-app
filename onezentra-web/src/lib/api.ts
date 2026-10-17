import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { notifyPermissionDenied } from '@/store/globalToast';

const CSRF_URL = '/sanctum/csrf-cookie';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const normalizedApiUrl = API_URL.replace(/\/$/, '');
export const API_ROOT = normalizedApiUrl;

type RowError = { row?: number; errors?: string };

type ApiErrorResponse = {
  message?: string;
  /** Alias envelope ringkas yang dipakai sebagian endpoint: `msg` / `error`. */
  msg?: string;
  error?: string;
  /**
   * Dua bentuk yang keduanya muncul dari backend:
   *  - validasi Laravel: `{ field: ['pesan', ...] }`
   *  - import per-baris:   `[{ row: 3, errors: 'pesan' }]`
   */
  errors?: Record<string, string | string[]> | RowError[];
};

/**
 * Rawat baris import jadi "Baris 3: PO tidak ditemukan".
 *
 * Backend mengirim `errors: [{ row, errors }]` — bentuk ARRAY OF OBJECT.
 * Kalau dilewatkan ke Object.values() lalu di-join, hasilnya literal
 * "[object Object] [object Object]" karena bukan string. Bentuk itu diproses
 * terpisah supaya user melihat nomor baris yang perlu diperbaiki, bukan
 * output JavaScript mentah.
 */
function formatRowErrors(rows: RowError[]): string[] {
  return rows
    .map((r) => {
      const detail = typeof r?.errors === 'string' ? r.errors : '';
      return typeof r?.row === 'number' ? `Baris ${r.row}: ${detail}` : detail;
    })
    .filter(Boolean);
}

export function getErrorMessage(e: unknown, fallback = 'Terjadi kesalahan'): string {
  const err = e as AxiosError<ApiErrorResponse>;
  const data = err.response?.data;
  // Alias envelope ringkas: sebagian endpoint memakai `msg` / `error` string.
  const alias = typeof data?.msg === 'string' && data.msg ? data.msg
    : typeof data?.error === 'string' && data.error ? data.error
    : undefined;
  if (err.response?.status === 403) return data?.message ?? alias ?? 'Anda tidak memiliki izin untuk melakukan aksi ini.';

  // Timeout upload (ECONNABORTED): beri tahu user apa yang terjadi dan apa
  // yang bisa dilakukan, bukan pesan teknis mentah dari axios.
  if (err.code === 'ECONNABORTED' || /timeout of .* exceeded|timeout/i.test(err.message ?? '')) {
    return 'Upload terputus karena timeout. File besar butuh koneksi stabil — coba lagi, atau perkecil lampiran bila masih gagal.';
  }

  const errors = data?.errors;
  const summary = data?.message ?? alias;

  if (errors) {
    if (Array.isArray(errors)) {
      // Format import per-baris. Ringkasan backend ("Import gagal: 2 baris
      // tidak valid") dipertahankan di atas daftar supaya user tahu hasil
      // akhirnya di-ROLLBACK, bukan sekadar daftar kesalahan.
      const details = formatRowErrors(errors);
      if (details.length > 0) {
        return summary ? `${summary}\n${details.join('\n')}` : details.join('\n');
      }
    } else {
      // Gabung nama field: "email: Email tidak valid" agar user tahu kolom mana.
      const details = Object.entries(errors)
        .flatMap(([field, messages]) => {
          const list = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
          return list.map((m) => `${field}: ${m}`);
        })
        .join(' ');
      if (details) return details;
    }
  }
  return summary || (err.message ?? fallback);
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

/**
 * Timeout khusus upload multipart (lampiran banyak/besar): 15 dtk bawaan
 * terlalu cepat habis di koneksi lambat sehingga user hanya melihat
 * "timeout" tanpa tahu harus apa.
 */
export const UPLOAD_TIMEOUT_MS = 120000;

/**
 * Status respons yang berarti sesi bermasalah (auth hilang / token tak valid).
 * 401 = sesi kadaluwarsa/dihentikan; 419 = CSRF mismatch.
*/
/**
 * Helper kompresi gambar JPEG yang tertanam di dalam file PDF (misal hasil scan atau foto dokumen).
 */
async function compressEmbeddedJpeg(
  bytes: Uint8Array,
  maxDimension = 1600,
  quality = 0.75
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  try {
    const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' });
    let origWidth = 0;
    let origHeight = 0;
    let imgBitmap: ImageBitmap | HTMLImageElement | null = null;

    if (typeof createImageBitmap === 'function') {
      imgBitmap = await createImageBitmap(blob);
      origWidth = imgBitmap.width;
      origHeight = imgBitmap.height;
    } else if (typeof window.Image !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      imgBitmap = img;
      origWidth = img.width;
      origHeight = img.height;
    }

    if (!imgBitmap || origWidth <= 0 || origHeight <= 0) return null;

    const scale = Math.min(1, maxDimension / Math.max(origWidth, origHeight));
    const targetWidth = Math.max(1, Math.round(origWidth * scale));
    const targetHeight = Math.max(1, Math.round(origHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(imgBitmap, 0, 0, targetWidth, targetHeight);
    if ('close' in imgBitmap && typeof (imgBitmap as ImageBitmap).close === 'function') {
      (imgBitmap as ImageBitmap).close();
    }

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!compressedBlob) return null;

    const buffer = await compressedBlob.arrayBuffer();
    const newBytes = new Uint8Array(buffer);
    if (newBytes.length < bytes.length) {
      return { bytes: newBytes, width: targetWidth, height: targetHeight };
    }
    return null;
  } catch (err) {
    console.warn('[compressEmbeddedJpeg] Gagal kompresi embedded JPEG:', err);
    return null;
  }
}

/**
 * Kompresi PDF otomatis:
 * 1. Mengoptimalkan gambar raster JPEG (hasil foto HP / scan) di dalam PDF.
 * 2. Mengaktifkan object streams (useObjectStreams: true) untuk memadatkan metadata & struktur PDF.
 */
export async function compressPdf(file: File, maxSize: number): Promise<File> {
  const fileArrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(fileArrayBuffer, { ignoreEncryption: true });

  // Kompresi gambar yang tertanam jika ada
  try {
    const objects = pdfDoc.context.enumerateIndirectObjects();
    for (const [, obj] of objects) {
      if (obj instanceof PDFRawStream) {
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of('Subtype'))?.toString();
        const filter = dict.get(PDFName.of('Filter'))?.toString();

        if (subtype === '/Image' && filter === '/DCTDecode' && obj.contents && obj.contents.length > 50 * 1024) {
          const res = await compressEmbeddedJpeg(obj.contents, 1600, 0.75);
          if (res) {
            (obj as unknown as { contents: Uint8Array }).contents = res.bytes;
            obj.dict.set(PDFName.of('Width'), PDFNumber.of(res.width));
            obj.dict.set(PDFName.of('Height'), PDFNumber.of(res.height));
          }
        }
      }
    }
  } catch (imgErr) {
    console.warn('[compressPdf] Gagal mengoptimalkan gambar di dalam PDF, fallback ke stream compression:', imgErr);
  }

  // Gunakan object streams → pdf-lib akan memadatkan streams
  const savedBytes = await pdfDoc.save({ useObjectStreams: true });
  const arrayBuffer = new Uint8Array(savedBytes).buffer;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const compressed = new File([blob], file.name, { type: 'application/pdf' });

  // Gunakan file terkecil di antara hasil kompresi dan file asli
  const bestFile = compressed.size < file.size ? compressed : file;

  if (bestFile.size > maxSize) {
    const limitMb = (maxSize / (1024 * 1024)).toFixed(0);
    const actualMb = (bestFile.size / (1024 * 1024)).toFixed(1);
    throw new Error(`PDF masih > ${limitMb} MB setelah kompresi (${actualMb} MB). Perkecil resolusi scan sebelum upload.`);
  }
  return bestFile;
}



export function isSessionLossStatus(status?: number): boolean {
  return status === 401;
}

/** Reload penuh ke /login — state auth hanya di memori, jadi reload otomatis membersihkannya. */
function redirectToLogin(): void {
  // Jangan redirect jika sudah di /login.
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    // Hard navigation disengaja: state auth hanya di memori, dan interceptor axios
    // berada di luar React sehingga router Next tidak tersedia di sini.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login?expired=1';
  }
}

/**
 * Pasang interceptor respons untuk penanganan status HTTP.
 *
 * 419 (csrf-token-mismatch) ≠ sesi berakhir: token XSRF bisa basi tanpa sesi mati
 * (restart server, deploy, tab lain). Untuk 419 kami refresh cookie CSRF lalu
 * retry request yang sama SEKALI (simbol RETRY_ATTEMPTED di config agar retry
 * tetap bounded). Kalau retry masih gagal 419/401, barulah diperlakukan sebagai
 * kehilangan sesi.
 */
export function registerResponseInterceptors(
  client: AxiosInstance,
  refreshCsrf: () => Promise<unknown> = () => client.get(CSRF_URL),
): void {
  // Tanda retry ditaruh sebagai symbol property di config: axios `mergeConfig`
  // menyalin properti non-objek dari config asal ke config baru saat retry,
  // jadi tanda ini ikut terbawa dan mencegah retry berkali-kali (bounded).
  const RETRY_ATTEMPTED: unique symbol = Symbol('csrfRetryAttempted');
  type RetryableConfig = AxiosRequestConfig & { [RETRY_ATTEMPTED]?: boolean };
  // Pertahanan ekstra: request refresh CSRF sendiri jangan di-retry (kalau
  // endpoint itu pernah menjawab 419, langsung jatuh ke penanganan sesi).
  const isCsrfRefresh = (url?: string) => !!url?.includes('/sanctum/csrf-cookie');

  // Timeout longgar untuk SEMUA upload multipart (berlaku global, termasuk
  // modul yang tidak menyebut timeout eksplisit): lampiran besar di koneksi
  // lambat butuh waktu lebih dari 15 dtk bawaan.
  client.interceptors.request.use((config) => {
    const contentType = config.headers?.['Content-Type'] ?? config.headers?.['content-type'];
    if (typeof contentType === 'string' && contentType.includes('multipart/form-data')) {
      config.timeout = UPLOAD_TIMEOUT_MS;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorResponse>) => {
      if (error.response?.status === 422 && process.env.NODE_ENV !== 'production') {
        console.warn('[API 422]', {
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
        });
      }

      const config = error.config as RetryableConfig | undefined;

      if (
        error.response?.status === 419
        && config
        && !config[RETRY_ATTEMPTED]
        && !isCsrfRefresh(config.url)
      ) {
        config[RETRY_ATTEMPTED] = true;
        // Request ulang yang masih 419/401 — konfig-nya (hasil merge) masih
        // membawa tanda RETRY_ATTEMPTED — masuk lagi ke interceptor ini dan
        // ditangani sebagai kehilangan sesi, bukan di-retry lagi.
        return refreshCsrf()
          .then(() => client.request(config))
          .catch((retryError: AxiosError) => Promise.reject(retryError));
      }

      if (isSessionLossStatus(error.response?.status)) {
        redirectToLogin();
      } else if (error.response?.status === 403) {
        if (typeof window !== 'undefined') {
          notifyPermissionDenied(error.response?.data?.message);
        }
      }

      return Promise.reject(error);
    }
  );
}

registerResponseInterceptors(apiClient);

export const auth = {
  login: async (email: string, password: string) => {
    await apiClient.get(CSRF_URL);
    return apiClient.post('/login', { email, password });
  },
  logout: () => apiClient.post('/logout'),
  getUser: () => apiClient.get('/user'),
  updateProfile: (data: Record<string, unknown>) => apiClient.put('/user', data),
};

export const dashboard = {
  activity: (days = 30, kodeDepo?: string) => apiClient.get('/dashboard/activity', { params: { days, ...(kodeDepo ? { kode_depo: kodeDepo } : {}) } }),
  summary: (kodeDepo?: string) => apiClient.get('/dashboard/summary', { params: kodeDepo ? { kode_depo: kodeDepo } : {} }),
};

export const roles = {
  list: (search?: string) => apiClient.get('/roles', { params: { search } }),
  create: (data: Record<string, unknown>) => apiClient.post('/roles', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/roles/${id}`, data),
  delete: (id: number) => apiClient.delete(`/roles/${id}`),
  getPermissions: (id: number) => apiClient.get(`/roles/${id}/permissions`),
  syncPermissions: (id: number, permissionIds: number[]) => apiClient.put(`/roles/${id}/permissions`, { permission_ids: permissionIds }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/roles/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  export: () => apiClient.get('/roles/export', { responseType: 'blob' }),
  template: () => apiClient.get('/roles/template', { responseType: 'blob' }),
};

export const permissions = {
  list: (search?: string, group?: string) => apiClient.get('/permissions', { params: { search, menu_group: group } }),
  create: (data: Record<string, unknown>) => apiClient.post('/permissions', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/permissions/${id}`, data),
  delete: (id: number) => apiClient.delete(`/permissions/${id}`),
};

export const npn = {
  list: (params?: Record<string, unknown>) => apiClient.get('/npn', { params }),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/npn/${id}`, data),
  delete: (id: number) => apiClient.delete(`/npn/${id}`),
  bulkDelete: (ids: number[]) => apiClient.post('/npn/bulk-delete', { ids }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/npn/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  export: (params?: Record<string, unknown>) => apiClient.get('/npn/export', { params, responseType: 'blob' }),
  template: () => apiClient.get('/npn/template', { responseType: 'blob' }),
  searchProduct: (q: string) => apiClient.get('/npn/search-product', { params: { q } }),
};

export const clusterPrincipal = {
  list: (params?: Record<string, unknown>) => apiClient.get('/cluster-principal', { params }),
  filters: () => apiClient.get('/cluster-principal/filters'),
  create: (data: Record<string, unknown>) => apiClient.post('/cluster-principal', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/cluster-principal/${id}`, data),
  delete: (id: number) => apiClient.delete(`/cluster-principal/${id}`),
  bulkDelete: (ids: number[]) => apiClient.post('/cluster-principal/bulk-delete', { ids }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/cluster-principal/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  export: (params?: Record<string, unknown>) => apiClient.get('/cluster-principal/export', { params, responseType: 'blob' }),
  template: () => apiClient.get('/cluster-principal/template', { responseType: 'blob' }),
};

export const standarUmurProduk = {
  list: (params?: Record<string, unknown>) => apiClient.get('/standar-umur-produk', { params }),
  create: (data: Record<string, unknown>) => apiClient.post('/standar-umur-produk', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/standar-umur-produk/${id}`, data),
  delete: (id: number) => apiClient.delete(`/standar-umur-produk/${id}`),
  bulkDelete: (ids: number[]) => apiClient.post('/standar-umur-produk/bulk-delete', { ids }),
  export: (params?: Record<string, unknown>) => apiClient.get('/standar-umur-produk/export', { params, responseType: 'blob' }),
  template: () => apiClient.get('/standar-umur-produk/template', { responseType: 'blob' }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/standar-umur-produk/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const standarisasiTumpukan = {
  list: (params?: Record<string, unknown>) => apiClient.get('/standarisasi-tumpukan', { params }),
  /** Jumlah per status untuk seluruh depo user (bukan hanya halaman aktif). */
  stats: (params?: Record<string, unknown>) => apiClient.get('/standarisasi-tumpukan/stats', { params }),
  create: (data: Record<string, unknown>) => apiClient.post('/standarisasi-tumpukan', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/standarisasi-tumpukan/${id}`, data),
  delete: (id: number) => apiClient.delete(`/standarisasi-tumpukan/${id}`),
  bulkDelete: (ids: number[]) => apiClient.post('/standarisasi-tumpukan/bulk-delete', { ids }),
  approve: (id: number) => apiClient.post(`/standarisasi-tumpukan/${id}/approve`),
  reject: (id: number) => apiClient.post(`/standarisasi-tumpukan/${id}/reject`),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/standarisasi-tumpukan/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  export: (params?: Record<string, unknown>) => apiClient.get('/standarisasi-tumpukan/export', { params, responseType: 'blob' }),
  template: () => apiClient.get('/standarisasi-tumpukan/template', { responseType: 'blob' }),
};

export const depo = {
  list: () => apiClient.get('/depo'),
};

export const depotSettings = {
  list: () => apiClient.get('/depot-settings'),
  get: (kodeDepo: string) => apiClient.get(`/depot-settings/${kodeDepo}`),
  upsert: (kodeDepo: string, data: Record<string, unknown>) => apiClient.put(`/depot-settings/${kodeDepo}`, data),
};

export const retribusiRates = {
  list: () => apiClient.get('/retribusi-rates'),
  save: (data: Record<string, unknown>) => apiClient.post('/retribusi-rates', data),
  remove: (kodeDepo: string) => apiClient.delete(`/retribusi-rates/${kodeDepo}`),
};

export const receivingItems = {
  list: (params?: Record<string, unknown>) => apiClient.get('/receiving-items', { params }),
  /**
   * Daftar group penerimaan (pagination per group: satu receiving / satu
   * tanggal manual = satu group utuh, tidak pernah terpotong halaman).
   * Shape: { data: Group[], meta: { total, per_page, current_page, ... } }
   */
  groups: (params?: Record<string, unknown>) => apiClient.get('/receiving-items/groups', { params }),
};

export const opnameSessions = {
  list: (params?: Record<string, unknown>) => apiClient.get('/opname-sessions', { params }),
  officers: (kodeDepo: string) => apiClient.get('/opname-sessions/officers', { params: { kode_depo: kodeDepo } }),
  create: (data: Record<string, unknown>) => apiClient.post('/opname-sessions', data),
  get: (id: number) => apiClient.get(`/opname-sessions/${id}`),
  start: (id: number) => apiClient.post(`/opname-sessions/${id}/start`),
  addWaves: (id: number, waveIds: number[]) => apiClient.post(`/opname-sessions/${id}/waves`, { wave_ids: waveIds }),
  verifyItem: (id: number, itemId: number, data: FormData | Record<string, unknown>) => {
    const isForm = typeof FormData !== 'undefined' && data instanceof FormData;
    return apiClient.post(`/opname-sessions/${id}/items/${itemId}`, data, isForm ? {
      headers: { 'Content-Type': 'multipart/form-data' },
    } : undefined);
  },
  complete: (id: number) => apiClient.post(`/opname-sessions/${id}/complete`),
  cancel: (id: number, notes?: string) => apiClient.post(`/opname-sessions/${id}/cancel`, notes ? { notes } : {}),
};

export const opnameExpired = {
  list: (params?: Record<string, unknown>) => apiClient.get('/opname-expired', { params }),
  generate: (weekStart?: string) => apiClient.post('/opname-expired/generate', weekStart ? { week_start: weekStart } : {}),
  pending: (params?: Record<string, unknown>) => apiClient.get('/opname-expired/pending', { params }),
  progress: (params?: Record<string, unknown>) => apiClient.get('/opname-expired/progress', { params }),
  remind: (data: Record<string, unknown>) => apiClient.post('/opname-expired/remind', data),
  settings: () => apiClient.get('/opname-expired/settings'),
  updateSettings: (data: Record<string, unknown>) => apiClient.put('/opname-expired/settings', data),
  export: (params?: Record<string, unknown>) => apiClient.get('/opname-expired/export', { params, responseType: 'blob' }),
  manualItems: (params?: Record<string, unknown>) => apiClient.get('/receiving-items', { params: { source: 'IMPORT_MANUAL', ...params } }),
  manualCreate: (data: Record<string, unknown>) => apiClient.post('/receiving-items', data),
  manualUpdate: (id: number, data: Record<string, unknown>, photoFile?: File | null) => {
    if (photoFile) {
      const formData = new FormData();
      formData.append('_method', 'PUT');
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) formData.append(key, String(value));
      }
      formData.append('photo', photoFile);
      return apiClient.post(`/receiving-items/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return apiClient.put(`/receiving-items/${id}`, data);
  },
  manualImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/receiving-items/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  manualTemplate: () => apiClient.get('/receiving-items/template', { responseType: 'blob' }),
  manualDelete: (id: number) => apiClient.delete(`/receiving-items/${id}`),
  manualBulkDelete: (data: { ids?: number[]; all?: boolean }) => apiClient.delete('/receiving-items/bulk', { data }),
  delete: (id: number) => apiClient.delete(`/opname-expired/${id}`),
};

export const rencanaKirim = {
  list: (params?: Record<string, unknown>) => apiClient.get('/rencana-kirim', { params }),
  stats: (kodeDepo?: string) => apiClient.get('/rencana-kirim/stats', { params: kodeDepo ? { kode_depo: kodeDepo } : {} }),
  get: (id: number) => apiClient.get(`/rencana-kirim/${id}`),
  create: (data: Record<string, unknown>) => apiClient.post('/rencana-kirim', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/rencana-kirim/${id}`, data),
  delete: (id: number) => apiClient.delete(`/rencana-kirim/${id}`),
  schedule: (id: number) => apiClient.post(`/rencana-kirim/${id}/schedule`),
  verify: (id: number) => apiClient.post(`/rencana-kirim/${id}/verify`),
  cancel: (id: number) => apiClient.post(`/rencana-kirim/${id}/cancel`),
  importItems: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/rencana-kirim/import-items', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  itemTemplate: () => apiClient.get('/rencana-kirim/item-template', { responseType: 'blob' }),
};

export const docks = {
  list: (params?: Record<string, unknown>) => apiClient.get('/docks', { params }),
  create: (data: Record<string, unknown>) => apiClient.post('/docks', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/docks/${id}`, data),
  delete: (id: number) => apiClient.delete(`/docks/${id}`),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/docks/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  export: (params?: Record<string, unknown>) => apiClient.get('/docks/export', { params, responseType: 'blob' }),
  template: () => apiClient.get('/docks/template', { responseType: 'blob' }),
};

export const gateTransactions = {
  list: (params?: Record<string, unknown>) => apiClient.get('/gate-transactions', { params }),
  stats: (params?: Record<string, unknown>) => apiClient.get('/gate-transactions/stats', { params }),
  create: (data: Record<string, unknown>) => apiClient.post('/gate-transactions', data),
  byNoDokumen: (poTransporter: string) => apiClient.get('/gate-transactions/search/by-dokumen', { params: { po_transporter: poTransporter } }),
};

export const receivings = {
  list: (params?: Record<string, unknown>) => apiClient.get('/receivings', { params }),
  get: (id: number) => apiClient.get(`/receivings/${id}`),
  complete: (id: number, data?: Record<string, unknown>) => apiClient.post(`/receivings/${id}/complete`, data ?? {}),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/receivings/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  export: (params?: Record<string, unknown>) => apiClient.get('/receivings/export', { params, responseType: 'blob' }),
  template: () => apiClient.get('/receivings/template', { responseType: 'blob' }),
};

export const users = {
  list: (params?: Record<string, unknown>) => apiClient.get('/users', { params }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/users/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  create: (data: Record<string, unknown>) => apiClient.post('/users', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/users/${id}`, data),
  delete: (id: number) => apiClient.delete(`/users/${id}`),
};

export const emailSettings = {
  get: () => apiClient.get('/email-settings'),
  update: (data: Record<string, unknown>) => apiClient.put('/email-settings', data),
  test: (to: string) => apiClient.post('/email-settings/test', { to }),
  notificationLogs: (params?: Record<string, unknown>) => apiClient.get('/email-settings/notification-logs', { params }),
};

export const emailRecipients = {
  list: (params?: Record<string, unknown>) => apiClient.get('/email-recipients', { params }),
  create: (data: Record<string, unknown>) => apiClient.post('/email-recipients', data),
  update: (id: number, data: Record<string, unknown>) => apiClient.put(`/email-recipients/${id}`, data),
  delete: (id: number) => apiClient.delete(`/email-recipients/${id}`),
  options: () => apiClient.get('/email-recipients/options'),
};

export const batches = {
  markPrinted: (id: number) => apiClient.post(`/batches/${id}/mark-printed`),
};

export const sjValidations = {
  list: (params?: Record<string, unknown>) => apiClient.get('/sj-validations', { params }),
  stats: (params?: Record<string, unknown>) => apiClient.get('/sj-validations/stats', { params }),
  get: (id: number) => apiClient.get(`/sj-validations/${id}`),
  lookup: (scanCode: string) => apiClient.get('/sj-validations/lookup', { params: { scan_code: scanCode } }),
  startByCode: (scanCode: string) => apiClient.post('/sj-validations/start-by-code', { scan_code: scanCode }),
  scan: (id: number, data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    return apiClient.post(`/sj-validations/${id}/scan`, data, config);
  },
  deleteItem: (id: number, itemId: number) => apiClient.delete(`/sj-validations/${id}/items/${itemId}`),
  complete: (id: number) => apiClient.post(`/sj-validations/${id}/complete`),
  cancel: (id: number) => apiClient.post(`/sj-validations/${id}/cancel`),
};

export const reports = {
  selisihQty: (params?: Record<string, unknown>) => apiClient.get('/reports/selisih-qty', { params }),
  selisihQtyExport: (params?: Record<string, unknown>) => apiClient.get('/reports/selisih-qty/export', { params, responseType: 'blob' }),
  rencanaKirim: (params?: Record<string, unknown>) => apiClient.get('/reports/rencana-kirim', { params }),
  rencanaKirimExport: (params?: Record<string, unknown>) => apiClient.get('/reports/rencana-kirim/export', { params, responseType: 'blob' }),
  penerimaan: (params?: Record<string, unknown>) => apiClient.get('/reports/penerimaan', { params }),
  penerimaanExport: (params?: Record<string, unknown>) => apiClient.get('/reports/penerimaan/export', { params, responseType: 'blob' }),
  penerimaanBatchExpired: (params?: Record<string, unknown>) => apiClient.get('/reports/penerimaan-batch-expired', { params }),
  penerimaanBatchExpiredExport: (params?: Record<string, unknown>) => apiClient.get('/reports/penerimaan-batch-expired/export', { params, responseType: 'blob' }),
  biayaThl: (params?: Record<string, unknown>) => apiClient.get('/reports/biaya-thl', { params }),
  biayaThlExport: (params?: Record<string, unknown>) => apiClient.get('/reports/biaya-thl/export', { params, responseType: 'blob' }),
  biayaRetribusi: (params?: Record<string, unknown>) => apiClient.get('/reports/biaya-retribusi', { params }),
  biayaRetribusiExport: (params?: Record<string, unknown>) => apiClient.get('/reports/biaya-retribusi/export', { params, responseType: 'blob' }),
};

export const biayaThl = {
  list: (params?: Record<string, unknown>) => apiClient.get('/biaya-thl', { params }),
  candidates: (params?: Record<string, unknown>) => apiClient.get('/biaya-thl/candidates', { params }),
  get: (id: number) => apiClient.get(`/biaya-thl/${id}`),
  create: (data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS } : {};
    return apiClient.post('/biaya-thl', data, config);
  },
  update: (id: number, data: Record<string, unknown> | FormData) => {
    if (data instanceof FormData) {
      // PHP tidak mem-parse body multipart pada PUT: spoof method via POST.
      if (!data.has('_method')) data.append('_method', 'PUT');
      return apiClient.post(`/biaya-thl/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: UPLOAD_TIMEOUT_MS,
      });
    }
    return apiClient.put(`/biaya-thl/${id}`, data);
  },
  delete: (id: number) => apiClient.delete(`/biaya-thl/${id}`),
  export: (params?: Record<string, unknown>) => apiClient.get('/biaya-thl/export', { params, responseType: 'blob' }),
  submit: (id: number) => apiClient.post(`/biaya-thl/${id}/submit`),
  check: (id: number) => apiClient.post(`/biaya-thl/${id}/check`),
  approve: (id: number) => apiClient.post(`/biaya-thl/${id}/approve`),
  rfahApprove: (id: number) => apiClient.post(`/biaya-thl/${id}/rfah-approve`),
  reject: (id: number, reason: string) => apiClient.post(`/biaya-thl/${id}/reject`, { reason }),
  revise: (id: number, reason: string) => apiClient.post(`/biaya-thl/${id}/revise`, { reason }),
  import: (file: File) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (Next.js dev limit)
    if (file.size > MAX_FILE_SIZE) {
      return compressPdf(file, MAX_FILE_SIZE).then((compressed) => {
        const formData = new FormData();
        formData.append('file', compressed);
        return apiClient.post('/biaya-thl/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: UPLOAD_TIMEOUT_MS,
        });
      }).catch((err: unknown) => {
        throw err;
      });
    }

    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/biaya-thl/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const biayaRetribusi = {
  list: (params?: Record<string, unknown>) => apiClient.get('/biaya-retribusi', { params }),
  candidates: (params?: Record<string, unknown>) => apiClient.get('/biaya-retribusi/candidates', { params }),
  get: (id: number) => apiClient.get(`/biaya-retribusi/${id}`),
  create: (data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS } : {};
    return apiClient.post('/biaya-retribusi', data, config);
  },
  update: (id: number, data: Record<string, unknown> | FormData) => {
    if (data instanceof FormData) {
      // PHP tidak mem-parse body multipart pada PUT: spoof method via POST.
      if (!data.has('_method')) data.append('_method', 'PUT');
      return apiClient.post(`/biaya-retribusi/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: UPLOAD_TIMEOUT_MS,
      });
    }
    return apiClient.put(`/biaya-retribusi/${id}`, data);
  },
  delete: (id: number) => apiClient.delete(`/biaya-retribusi/${id}`),
  documentUrl: (docId: number) => `${API_URL}/biaya-retribusi/documents/${docId}`,
  export: (params?: Record<string, unknown>) => apiClient.get('/biaya-retribusi/export', { params, responseType: 'blob' }),
  submit: (id: number) => apiClient.post(`/biaya-retribusi/${id}/submit`),
  check: (id: number) => apiClient.post(`/biaya-retribusi/${id}/check`),
  approve: (id: number) => apiClient.post(`/biaya-retribusi/${id}/approve`),
  rfahApprove: (id: number) => apiClient.post(`/biaya-retribusi/${id}/rfah-approve`),
  reject: (id: number, reason: string) => apiClient.post(`/biaya-retribusi/${id}/reject`, { reason }),
  revise: (id: number, reason: string) => apiClient.post(`/biaya-retribusi/${id}/revise`, { reason }),
  import: (file: File) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (Next.js dev limit)
    if (file.size > MAX_FILE_SIZE) {
      return compressPdf(file, MAX_FILE_SIZE).then((compressed) => {
        const formData = new FormData();
        formData.append('file', compressed);
        return apiClient.post('/biaya-retribusi/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: UPLOAD_TIMEOUT_MS,
        });
      }).catch((err: unknown) => {
        throw err;
      });
    }

    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/biaya-retribusi/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const approvalAssignments = {
  get: (kodeDepo?: string, module: 'biaya_thl' | 'biaya_retribusi' = 'biaya_thl') => apiClient.get('/approval-assignments', { params: { ...(kodeDepo ? { kode_depo: kodeDepo } : {}), module } }),
  save: (data: { kode_depo: string; module?: 'biaya_thl' | 'biaya_retribusi'; assignments: { approval_level: string; user_id: number }[] }) => apiClient.post('/approval-assignments', data),
};

export const adminDatabase = {
  summary: () => apiClient.get('/admin/database/summary'),
  purge: (data: { modules: string[]; confirm: string; dry_run?: boolean }) => apiClient.post('/admin/database/purge', data),
};

export default apiClient;
