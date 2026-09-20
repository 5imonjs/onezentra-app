import axios from 'axios';
import type { AxiosError } from 'axios';
import { notifyPermissionDenied } from '@/store/globalToast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
export const API_ROOT = API_URL.replace(/\/api\/v1\/?$/, '');

type ApiErrorResponse = {
  message?: string;
  errors?: Record<string, string | string[]>;
};

export function getErrorMessage(e: unknown, fallback = 'Terjadi kesalahan'): string {
  const err = e as AxiosError<ApiErrorResponse>;
  if (err.response?.status === 403) return err.response?.data?.message || 'Anda tidak memiliki izin untuk melakukan aksi ini.';
  const validationErrors = err.response?.data?.errors;
  if (validationErrors) {
    const details = Object.values(validationErrors)
      .flatMap((messages) => Array.isArray(messages) ? messages : [messages])
      .filter(Boolean)
      .join(' ');
    if (details) return details;
  }
  return err.response?.data?.message || (err.message ?? fallback);
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 422 && process.env.NODE_ENV !== 'production') {
      console.warn('[API 422]', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        params: error.config?.params,
        data: error.config?.data,
        response: error.response?.data,
      });
    }
    if (error.response?.status === 401 || error.response?.status === 419) {
      // Sesi kedaluwarsa/CSRF mismatch: state auth hanya di memori, jadi reload penuh ke
      // /login otomatis membersihkannya. Jangan redirect jika sudah di /login.
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        // Hard navigation disengaja: state auth hanya di memori, dan interceptor axios
        // berada di luar React sehingga router Next tidak tersedia di sini.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login?expired=1';
      }
    } else if (error.response?.status === 403) {
      if (typeof window !== 'undefined') {
        notifyPermissionDenied(error.response?.data?.message);
      }
    }
    return Promise.reject(error);
  }
);

export const auth = {
  csrf: () => api.get(`${API_ROOT}/sanctum/csrf-cookie`),
  login: async (email: string, password: string) => {
    await api.get(`${API_ROOT}/sanctum/csrf-cookie`);
    return api.post('/login', { email, password });
  },
  register: (data: Record<string, unknown>) => api.post('/register', data),
  logout: () => api.post('/logout'),
  getUser: () => api.get('/user'),
  updateProfile: (data: Record<string, unknown>) => api.put('/user', data),
  changePassword: (data: Record<string, unknown>) => api.put('/user/password', data),
};

export const dashboard = {
  activity: (days = 30) => api.get('/dashboard/activity', { params: { days } }),
};

export const roles = {
  list: (search?: string) => api.get('/roles', { params: { search } }),
  get: (id: number) => api.get(`/roles/${id}`),
  create: (data: Record<string, unknown>) => api.post('/roles', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/roles/${id}`, data),
  delete: (id: number) => api.delete(`/roles/${id}`),
  getPermissions: (id: number) => api.get(`/roles/${id}/permissions`),
  syncPermissions: (id: number, permissionIds: number[]) => api.put(`/roles/${id}/permissions`, { permission_ids: permissionIds }),
};

export const permissions = {
  list: (search?: string, group?: string) => api.get('/permissions', { params: { search, menu_group: group } }),
  get: (id: number) => api.get(`/permissions/${id}`),
  create: (data: Record<string, unknown>) => api.post('/permissions', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/permissions/${id}`, data),
  delete: (id: number) => api.delete(`/permissions/${id}`),
};

export const npn = {
  list: (params?: Record<string, unknown>) => api.get('/npn', { params }),
  get: (id: number) => api.get(`/npn/${id}`),
  create: (data: Record<string, unknown>) => api.post('/npn', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/npn/${id}`, data),
  delete: (id: number) => api.delete(`/npn/${id}`),
  bulkDelete: (ids: number[]) => api.post('/npn/bulk-delete', { ids }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/npn/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  export: (params?: Record<string, unknown>) => api.get('/npn/export', { params, responseType: 'blob' }),
  template: () => api.get('/npn/template', { responseType: 'blob' }),
  searchProduct: (q: string) => api.get('/npn/search-product', { params: { q } }),
};

export const penerimaan = {
  list: (params?: Record<string, unknown>) => api.get('/penerimaan', { params }),
  get: (id: number) => api.get(`/penerimaan/${id}`),
  create: (data: Record<string, unknown>) => api.post('/penerimaan', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/penerimaan/${id}`, data),
  delete: (id: number) => api.delete(`/penerimaan/${id}`),
};

export const standarUmurProduk = {
  list: (params?: Record<string, unknown>) => api.get('/standar-umur-produk', { params }),
  get: (id: number) => api.get(`/standar-umur-produk/${id}`),
  create: (data: Record<string, unknown>) => api.post('/standar-umur-produk', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/standar-umur-produk/${id}`, data),
  delete: (id: number) => api.delete(`/standar-umur-produk/${id}`),
  bulkDelete: (ids: number[]) => api.post('/standar-umur-produk/bulk-delete', { ids }),
  export: (params?: Record<string, unknown>) => api.get('/standar-umur-produk/export', { params, responseType: 'blob' }),
  template: () => api.get('/standar-umur-produk/template', { responseType: 'blob' }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/standar-umur-produk/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const standarisasiTumpukan = {
  list: (params?: Record<string, unknown>) => api.get('/standarisasi-tumpukan', { params }),
  get: (id: number) => api.get(`/standarisasi-tumpukan/${id}`),
  create: (data: Record<string, unknown>) => api.post('/standarisasi-tumpukan', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/standarisasi-tumpukan/${id}`, data),
  delete: (id: number) => api.delete(`/standarisasi-tumpukan/${id}`),
  approve: (id: number) => api.post(`/standarisasi-tumpukan/${id}/approve`),
  reject: (id: number) => api.post(`/standarisasi-tumpukan/${id}/reject`),
};

export const depo = {
  list: () => api.get('/depo'),
};

export const receivingItems = {
  list: (params?: Record<string, unknown>) => api.get('/receiving-items', { params }),
  /**
   * Daftar group penerimaan (pagination per group: satu receiving / satu
   * tanggal manual = satu group utuh, tidak pernah terpotong halaman).
   * Shape: { data: Group[], meta: { total, per_page, current_page, ... } }
   */
  groups: (params?: Record<string, unknown>) => api.get('/receiving-items/groups', { params }),
  create: (data: Record<string, unknown>) => api.post('/receiving-items', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/receiving-items/${id}`, data),
  searchProduct: (q: string) => api.get('/receiving-items/search-product', { params: { q } }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/receiving-items/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  template: () => api.get('/receiving-items/template', { responseType: 'blob' }),
  delete: (id: number) => api.delete(`/receiving-items/${id}`),
};

export const opnameExpired = {
  list: (params?: Record<string, unknown>) => api.get('/opname-expired', { params }),
  generate: (weekStart?: string) => api.post('/opname-expired/generate', weekStart ? { week_start: weekStart } : {}),
  settings: () => api.get('/opname-expired/settings'),
  updateSettings: (data: Record<string, unknown>) => api.put('/opname-expired/settings', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/opname-expired/${id}`, data),
  export: (params?: Record<string, unknown>) => api.get('/opname-expired/export', { params, responseType: 'blob' }),
  manualItems: (params?: Record<string, unknown>) => api.get('/receiving-items', { params: { source: 'IMPORT_MANUAL', ...params } }),
  manualCreate: (data: Record<string, unknown>) => api.post('/receiving-items', data),
  manualUpdate: (id: number, data: Record<string, unknown>) => api.put(`/receiving-items/${id}`, data),
  manualImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/receiving-items/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  manualTemplate: () => api.get('/receiving-items/template', { responseType: 'blob' }),
  manualDelete: (id: number) => api.delete(`/receiving-items/${id}`),
};

export const rencanaKirim = {
  list: (params?: Record<string, unknown>) => api.get('/rencana-kirim', { params }),
  stats: () => api.get('/rencana-kirim/stats'),
  get: (id: number) => api.get(`/rencana-kirim/${id}`),
  create: (data: Record<string, unknown>) => api.post('/rencana-kirim', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/rencana-kirim/${id}`, data),
  delete: (id: number) => api.delete(`/rencana-kirim/${id}`),
  schedule: (id: number) => api.post(`/rencana-kirim/${id}/schedule`),
  verify: (id: number) => api.post(`/rencana-kirim/${id}/verify`),
  cancel: (id: number) => api.post(`/rencana-kirim/${id}/cancel`),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/rencana-kirim/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  template: () => api.get('/rencana-kirim/template', { responseType: 'blob' }),
  importItems: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/rencana-kirim/import-items', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  itemTemplate: () => api.get('/rencana-kirim/item-template', { responseType: 'blob' }),
};

export const docks = {
  list: (params?: Record<string, unknown>) => api.get('/docks', { params }),
  get: (id: number) => api.get(`/docks/${id}`),
  create: (data: Record<string, unknown>) => api.post('/docks', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/docks/${id}`, data),
  delete: (id: number) => api.delete(`/docks/${id}`),
};

export const gateTransactions = {
  list: (params?: Record<string, unknown>) => api.get('/gate-transactions', { params }),
  get: (id: number) => api.get(`/gate-transactions/${id}`),
  create: (data: Record<string, unknown>) => api.post('/gate-transactions', data),
  byNoDokumen: (poTransporter: string) => api.get('/gate-transactions/search/by-dokumen', { params: { po_transporter: poTransporter } }),
};

export const receivings = {
  list: (params?: Record<string, unknown>) => api.get('/receivings', { params }),
  get: (id: number) => api.get(`/receivings/${id}`),
  create: (data: Record<string, unknown>) => api.post('/receivings', data),
  start: (id: number) => api.post(`/receivings/${id}/start`),
  scan: (id: number, data: Record<string, unknown>) => api.post(`/receivings/${id}/scan`, data),
  complete: (id: number, data?: Record<string, unknown>) => api.post(`/receivings/${id}/complete`, data ?? {}),
  cancel: (id: number) => api.post(`/receivings/${id}/cancel`),
  delete: (id: number) => api.delete(`/receivings/${id}`),
};

export const batches = {
  list: (params?: Record<string, unknown>) => api.get('/batches', { params }),
  get: (id: number) => api.get(`/batches/${id}`),
  byNumber: (batchNumber: string) => api.get('/batches/search/by-number', { params: { batch_number: batchNumber } }),
};

export const users = {
  list: (params?: Record<string, unknown>) => api.get('/users', { params }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/users/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  get: (id: number) => api.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => api.post('/users', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
};

export const emailSettings = {
  get: () => api.get('/email-settings'),
  update: (data: Record<string, unknown>) => api.put('/email-settings', data),
  test: (to: string) => api.post('/email-settings/test', { to }),
};

export const emailRecipients = {
  list: (params?: Record<string, unknown>) => api.get('/email-recipients', { params }),
  create: (data: Record<string, unknown>) => api.post('/email-recipients', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/email-recipients/${id}`, data),
  delete: (id: number) => api.delete(`/email-recipients/${id}`),
  options: () => api.get('/email-recipients/options'),
};

export const sjValidations = {
  list: (params?: Record<string, unknown>) => api.get('/sj-validations', { params }),
  stats: () => api.get('/sj-validations/stats'),
  get: (id: number) => api.get(`/sj-validations/${id}`),
  lookup: (scanCode: string) => api.get('/sj-validations/lookup', { params: { scan_code: scanCode } }),
  startByCode: (scanCode: string) => api.post('/sj-validations/start-by-code', { scan_code: scanCode }),
  scan: (id: number, data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    return api.post(`/sj-validations/${id}/scan`, data, config);
  },
  deleteItem: (id: number, itemId: number) => api.delete(`/sj-validations/${id}/items/${itemId}`),
  complete: (id: number) => api.post(`/sj-validations/${id}/complete`),
  cancel: (id: number) => api.post(`/sj-validations/${id}/cancel`),
};

export const reports = {
  selisihQty: (params?: Record<string, unknown>) => api.get('/reports/selisih-qty', { params }),
  selisihQtyExport: (params?: Record<string, unknown>) => api.get('/reports/selisih-qty/export', { params, responseType: 'blob' }),
  penerimaan: (params?: Record<string, unknown>) => api.get('/reports/penerimaan', { params }),
  penerimaanExport: (params?: Record<string, unknown>) => api.get('/reports/penerimaan/export', { params, responseType: 'blob' }),
};

export const biayaThl = {
  list: (params?: Record<string, unknown>) => api.get('/biaya-thl', { params }),
  get: (id: number) => api.get(`/biaya-thl/${id}`),
  create: (data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    return api.post('/biaya-thl', data, config);
  },
  update: (id: number, data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    return api.put(`/biaya-thl/${id}`, data, config);
  },
  delete: (id: number) => api.delete(`/biaya-thl/${id}`),
  export: (params?: Record<string, unknown>) => api.get('/biaya-thl/export', { params, responseType: 'blob' }),
  pdf: (id: number) => api.get(`/biaya-thl/${id}/pdf`, { responseType: 'blob' }),
  submit: (id: number) => api.post(`/biaya-thl/${id}/submit`),
  check: (id: number) => api.post(`/biaya-thl/${id}/check`),
  approve: (id: number) => api.post(`/biaya-thl/${id}/approve`),
  rfahApprove: (id: number) => api.post(`/biaya-thl/${id}/rfah-approve`),
  reject: (id: number, reason: string) => api.post(`/biaya-thl/${id}/reject`, { reason }),
  revise: (id: number, reason: string) => api.post(`/biaya-thl/${id}/revise`, { reason }),
};

export const biayaRetribusi = {
  list: (params?: Record<string, unknown>) => api.get('/biaya-retribusi', { params }),
  candidates: (params?: Record<string, unknown>) => api.get('/biaya-retribusi/candidates', { params }),
  get: (id: number) => api.get(`/biaya-retribusi/${id}`),
  pdf: (id: number) => api.get(`/biaya-retribusi/${id}/pdf`, { responseType: 'blob' }),
  create: (data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    return api.post('/biaya-retribusi', data, config);
  },
  update: (id: number, data: Record<string, unknown> | FormData) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    return api.put(`/biaya-retribusi/${id}`, data, config);
  },
  delete: (id: number) => api.delete(`/biaya-retribusi/${id}`),
  export: (params?: Record<string, unknown>) => api.get('/biaya-retribusi/export', { params, responseType: 'blob' }),
   submit: (id: number) => api.post(`/biaya-retribusi/${id}/submit`),
   check: (id: number) => api.post(`/biaya-retribusi/${id}/check`),
   approve: (id: number) => api.post(`/biaya-retribusi/${id}/approve`),
   rfahApprove: (id: number) => api.post(`/biaya-retribusi/${id}/rfah-approve`),
   reject: (id: number, reason: string) => api.post(`/biaya-retribusi/${id}/reject`, { reason }),
   revise: (id: number, reason: string) => api.post(`/biaya-retribusi/${id}/revise`, { reason }),
 };

export const biayaThlPdfSettings = {
  get: (kodeDepo?: string) => api.get('/settings/biaya-thl-pdf', { params: kodeDepo ? { kode_depo: kodeDepo } : {} }),
  save: (data: { kode_depo: string; approval_sections: unknown[] }) => api.post('/settings/biaya-thl-pdf', data),
};

export const approvalAssignments = {
  get: (kodeDepo?: string) => api.get('/approval-assignments', { params: kodeDepo ? { kode_depo: kodeDepo } : {} }),
  save: (data: { kode_depo: string; assignments: { approval_level: string; user_id: number }[] }) => api.post('/approval-assignments', data),
};

export default api;