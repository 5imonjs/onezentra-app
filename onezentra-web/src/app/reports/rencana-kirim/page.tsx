'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';

interface ReportItem {
  id: number;
  rkh_date: string | null;
  po_transporter: string;
  driver_name: string;
  nopol: string;
  expedisi: string;
  jenis_kendaraan: string;
  destination_name: string;
  kode_depo: string;
  nama_depo: string;
  total_qty: number;
  total_kubikasi: number;
  item_count: number;
  status: string;
}

interface StatusCount {
  count: number;
  label: string;
}

interface ReportSummary {
  total: number;
  total_qty: number;
  total_kubikasi: number;
  completed_count: number;
  cancelled_count: number;
  status_counts: Record<string, StatusCount>;
}

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  DRAFT: { color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300', dot: 'bg-slate-400' },
  SCHEDULED: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500' },
  CHECKED_IN: { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-100', dot: 'bg-yellow-500' },
  VERIFIED: { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-100', dot: 'bg-purple-500' },
  IN_PROGRESS: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100', dot: 'bg-orange-500' },
  COMPLETED: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-500' },
  CANCELLED: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-100', dot: 'bg-red-500' },
};

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: 'month', label: 'Bulan Ini' },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Dijadwalkan' },
  { value: 'CHECKED_IN', label: 'Check In' },
  { value: 'VERIFIED', label: 'Terverifikasi' },
  { value: 'IN_PROGRESS', label: 'Diproses' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(v: string | null): string {
  if (!v) return '-';
  // Parse tekstual (bukan new Date) agar tidak bergeser antar timezone.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}

function fmtNum(v: number): string {
  return v.toLocaleString('id-ID');
}

const PER_PAGE = 25;

export default function RencanaKirimReportPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<ReportItem[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [depotError, setDepotError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rangePreset, setRangePreset] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const reqIdRef = useRef(0);

  const selectedDepo = depots.find((d) => d.kode_depo === kodeDepo);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (dateFrom || dateTo) n += 1;
    if (status) n += 1;
    if (kodeDepo) n += 1;
    if (debouncedSearch) n += 1;
    return n;
  }, [dateFrom, dateTo, status, kodeDepo, debouncedSearch]);

  const completionRate = useMemo(() => {
    const total = summary?.total ?? 0;
    if (!total) return 0;
    return Math.round(((summary?.completed_count ?? 0) / total) * 100);
  }, [summary]);

  const rangeText = useMemo(() => {
    const total = summary?.total ?? 0;
    if (total === 0) return '0 dokumen ditemukan';
    const from = (page - 1) * PER_PAGE + 1;
    const to = (page - 1) * PER_PAGE + items.length;
    return `Menampilkan ${fmtNum(from)}–${fmtNum(to)} dari ${fmtNum(total)} dokumen`;
  }, [items.length, page, summary?.total]);

  const pageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, Math.min(page - 2, lastPage - windowSize + 1));
    const pages: number[] = [];
    for (let p = start; p <= Math.min(lastPage, start + windowSize - 1); p += 1) pages.push(p);
    return pages;
  }, [page, lastPage]);

  const buildParams = useCallback((): Record<string, unknown> => {
    const params: Record<string, unknown> = { page, per_page: PER_PAGE };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (status) params.status = status;
    if (kodeDepo) params.kode_depo = kodeDepo;
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [dateFrom, dateTo, status, kodeDepo, debouncedSearch, page]);

  const fetchData = useCallback(async () => {
    if (!hasPermission('reports.view')) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await reports.rencanaKirim(buildParams());
      if (reqIdRef.current !== reqId) return;
      setItems(res.data.data);
      setSummary(res.data.summary);
      setLastPage(res.data.last_page ?? 1);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(getErrorMessage(e, 'Gagal memuat laporan'));
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [buildParams, hasPermission]);

  const loadDepots = useCallback(async () => {
    try {
      const res = await depo.list();
      setDepots(res.data?.data ?? []);
      // User scoped hanya punya 1 opsi depo: kunci langsung agar
      // 'Semua Depo' tidak menyesatkan (backend tetap mengembalikan
      // depo sendiri untuknya). Master (banyak opsi) tidak tersentuh.
      const list = res.data?.data ?? [];
      if (list.length === 1) setKodeDepo(list[0].kode_depo);
      setDepotError('');
    } catch (e) {
      console.error('[Depo]', e);
      setDepotError(getErrorMessage(e, 'Gagal memuat daftar depo.'));
    }
  }, []);

  useEffect(() => {
    loadDepots();
  }, [loadDepots]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyRange = (key: string) => {
    const today = new Date();
    setRangePreset(key);
    setPage(1);
    if (key === 'today') {
      setDateFrom(toLocalISODate(today));
      setDateTo(toLocalISODate(today));
    } else if (key === '7d') {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      setDateFrom(toLocalISODate(from));
      setDateTo(toLocalISODate(today));
    } else if (key === 'month') {
      setDateFrom(toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1)));
      setDateTo(toLocalISODate(today));
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  const resetFilters = () => {
    setRangePreset('');
    setDateFrom('');
    setDateTo('');
    setStatus('');
    setKodeDepo('');
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  };

  // Debounce pencarian: tanpa ini tiap ketikan menembak API.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage((p) => (p === 1 ? p : 1));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Terapkan = paksa sinkron + refetch langsung bila filter tak berubah.
  const handleApply = () => {
    const term = search.trim();
    if (term === debouncedSearch) {
      fetchData();
      return;
    }
    setPage(1);
    setDebouncedSearch(term);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Export selalu mencakup seluruh baris terfilter, bukan halaman aktif.
      const exportParams = buildParams();
      delete exportParams.page;
      delete exportParams.per_page;
      const res = await reports.rencanaKirimExport(exportParams);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-rencana-kirim-${todayLocal()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal export laporan'));
    } finally {
      setExporting(false);
    }
  };

  const canExport = hasPermission('reports.view') && !loading && items.length > 0;

  if (!hasPermission('reports.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Laporan Replenishment.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-slide-up">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm shrink-0">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-fg-muted">Laporan</p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight">Laporan Replenishment</h1>
              <p className="text-ink-fg-muted mt-0.5 text-sm">Rekap pengiriman • qty, kubikasi, dan status per depo</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur text-white px-3 py-1.5 text-xs font-semibold border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
              {fmtNum(summary?.total ?? 0)} dokumen
              {activeFilterCount > 0 && <span className="text-white/60">• {activeFilterCount} filter</span>}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-emerald-500/30 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              {fmtNum(summary?.completed_count ?? 0)} selesai
              {summary && summary.total > 0 && <span className="text-emerald-400/80 tabular-nums">• {completionRate}%</span>}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full backdrop-blur px-3 py-1.5 text-xs font-semibold border ${(summary?.cancelled_count ?? 0) > 0 ? 'bg-red-500/15 border-red-500/30 text-red-300' : 'bg-white/10 border-white/10 text-ink-fg'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${(summary?.cancelled_count ?? 0) > 0 ? 'bg-red-400' : 'bg-gray-400'}`} aria-hidden="true" />
              {fmtNum(summary?.cancelled_count ?? 0)} batal
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-white/10 text-ink-fg">
              <svg className="w-3.5 h-3.5 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              {selectedDepo ? selectedDepo.nama_depo : 'Semua Depo'}
            </span>
          </div>
        </div>

        {depotError && !error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <span className="flex-1">{depotError}</span>
            <button onClick={loadDepots} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold hover:bg-red-100">
              Coba lagi
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            {error}
          </div>
        )}

        {/* Filter */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-slate-50 to-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-ink-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Rentang tanggal RKH, status, depo, dan pencarian</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100" role="group" aria-label="Preset rentang tanggal">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} aria-pressed={rangePreset === r.key} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-surface-card text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
              <div>
                <label htmlFor="rf-from" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari Tanggal</label>
                <input id="rf-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-surface-raised focus:bg-surface-card" />
              </div>
              <div>
                <label htmlFor="rf-to" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai Tanggal</label>
                <input id="rf-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-surface-raised focus:bg-surface-card" />
              </div>
              <div>
                <label htmlFor="rf-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status</label>
                <select id="rf-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card">
                  {STATUS_FILTERS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="rf-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label>
                <select id="rf-depo" value={kodeDepo} onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card">
                  <option value="">Semua Depo</option>
                  {depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="rf-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cari</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  </span>
                  <input id="rf-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }} placeholder="PO / driver / nopol / tujuan" className="input-field text-sm py-2 pl-9 bg-surface-raised focus:bg-surface-card" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400 tabular-nums" aria-live="polite">
                {activeFilterCount > 0 ? `${activeFilterCount} filter aktif` : 'Tanpa filter — seluruh data'}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-surface-card border border-gray-300 text-sm font-semibold text-slate-600 hover:bg-surface-raised hover:border-slate-300 transition-all">Reset</button>
                <button onClick={handleApply} disabled={loading} className="px-5 py-2 rounded-xl bg-linear-to-r from-ink-900 to-ink-800 text-white text-sm font-semibold hover:from-ink-800 hover:to-slate-700 shadow-lg disabled:opacity-50 transition-all">{loading ? 'Memuat...' : 'Terapkan Filter'}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-ink-900 text-white flex items-center justify-center shadow-lg shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Qty</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{fmtNum(summary.total_qty)}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">dari {fmtNum(summary.total)} dokumen</p>
                </div>
              </div>
            </div>
            <div className="bg-linear-to-br from-teal-600 to-teal-500 rounded-2xl shadow-lg p-5 text-white card-hover relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-teal-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total Kubikasi</p>
                  <p className="text-2xl font-black tabular-nums">{Number(summary.total_kubikasi ?? 0).toFixed(2)} <span className="text-sm font-medium">m³</span></p>
                  <p className="text-[11px] text-white/60 tabular-nums">rata-rata {summary.total ? (Number(summary.total_kubikasi ?? 0) / summary.total).toFixed(2) : '0.00'} m³/dok</p>
                </div>
              </div>
            </div>
            <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/20 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Selesai</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">{fmtNum(summary.completed_count)}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">{completionRate}% dari total</p>
                </div>
              </div>
            </div>
            <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-red-500/20 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dibatalkan</p>
                  <p className="text-2xl font-black text-red-600 tabular-nums">{fmtNum(summary.cancelled_count)}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">{summary.total ? Math.round((summary.cancelled_count / summary.total) * 100) : 0}% dari total</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center shadow shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Detail Replenishment</h2>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{rangeText}</p>
                </div>
              </div>
              <button onClick={handleExport} disabled={!canExport || exporting} title={!canExport ? 'Tidak ada data untuk diexport' : 'Export seluruh baris terfilter ke Excel'} aria-label="Export laporan ke Excel" className="btn-secondary text-sm disabled:opacity-50 flex items-center gap-2">
                <svg className={`w-4 h-4 ${exporting ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full min-w-[1140px] border-collapse">
              <caption className="sr-only">Laporan rencana kirim</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-300">
                  <th scope="col" className="table-header whitespace-nowrap">Tgl RKH</th>
                  <th scope="col" className="table-header whitespace-nowrap">PO Transporter</th>
                  <th scope="col" className="table-header whitespace-nowrap">Driver</th>
                  <th scope="col" className="table-header whitespace-nowrap">Nopol</th>
                  <th scope="col" className="table-header whitespace-nowrap">Expedisi</th>
                  <th scope="col" className="table-header whitespace-nowrap">Jenis</th>
                  <th scope="col" className="table-header whitespace-nowrap">Tujuan</th>
                  <th scope="col" className="table-header text-center whitespace-nowrap">Item</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Qty</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Kubikasi (m³)</th>
                  <th scope="col" className="table-header whitespace-nowrap">Status</th>
                  <th scope="col" className="table-header whitespace-nowrap">Depo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse" aria-hidden="true">
                      {Array.from({ length: 12 }).map((__, j) => (
                        <td key={j} className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 font-bold">Tidak ada data rencana kirim</p>
                          <p className="text-xs text-slate-400 mt-1">Coba ubah filter tanggal, status, atau depo</p>
                        </div>
                        {activeFilterCount > 0 && (
                          <button onClick={resetFilters} className="mt-1 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold hover:bg-ink-800 transition-colors">Reset filter</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const st = STATUS_STYLE[item.status];
                    return (
                      <tr key={item.id} className="even:bg-overlay-60 hover:bg-surface-raised transition-colors">
                        <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{fmtDate(item.rkh_date)}</td>
                        <td className="table-cell text-sm font-mono font-medium text-slate-800 whitespace-nowrap">{item.po_transporter}</td>
                        <td className="table-cell text-sm text-slate-700 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-black uppercase shrink-0" aria-hidden="true">{(item.driver_name || '?').charAt(0)}</span>
                            {item.driver_name}
                          </span>
                        </td>
                        <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{item.nopol}</td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.expedisi}</td>
                        <td className="table-cell whitespace-nowrap">
                          {item.jenis_kendaraan !== '-' ? <span className="inline-flex rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{item.jenis_kendaraan}</span> : <span className="text-sm text-slate-400">-</span>}
                        </td>
                        <td className="table-cell text-sm text-slate-700 whitespace-nowrap">{item.destination_name}</td>
                        <td className="table-cell text-sm text-center tabular-nums text-slate-600 whitespace-nowrap">{item.item_count}</td>
                        <td className="table-cell text-sm text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtNum(item.total_qty)}</td>
                        <td className="table-cell text-sm text-right font-semibold text-teal-700 tabular-nums whitespace-nowrap">{Number(item.total_kubikasi).toFixed(2)}</td>
                        <td className="table-cell whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${st?.bg || 'bg-surface-card'} ${st?.color || 'text-gray-600'} ${st?.border || 'border-gray-300'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-gray-400'}`} aria-hidden="true" />
                            {summary?.status_counts[item.status]?.label || item.status}
                          </span>
                        </td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.nama_depo || item.kode_depo}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — daftar wajib tetap tampil di layar kecil */}
          <div className="lg:hidden divide-y divide-gray-100">
            {loading && (
              <div className="p-4 space-y-3" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-overlay-60 p-4 space-y-2">
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                    <div className="h-3 w-48 bg-slate-200 rounded" />
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="h-12 bg-slate-200 rounded-xl" />
                      <div className="h-12 bg-slate-200 rounded-xl" />
                      <div className="h-12 bg-slate-200 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="p-10 text-center">
                <p className="text-sm text-slate-600 font-bold">Tidak ada data rencana kirim</p>
                <p className="text-xs text-slate-400 mt-1">Coba ubah filter tanggal, status, atau depo</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="mt-3 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold">Reset filter</button>
                )}
              </div>
            )}
            {!loading && items.map((item) => {
              const st = STATUS_STYLE[item.status];
              return (
                <article key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-slate-800 truncate">{item.po_transporter}</p>
                      <p className="mt-0.5 text-xs text-slate-400">RK {fmtDate(item.rkh_date)} • Tujuan {item.destination_name}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${st?.bg || 'bg-surface-card'} ${st?.color || 'text-gray-600'} ${st?.border || 'border-gray-300'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-gray-400'}`} aria-hidden="true" />
                      {summary?.status_counts[item.status]?.label || item.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-surface-raised p-2 text-center border border-slate-100">
                      <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Qty</p>
                      <p className="font-black text-slate-900 text-sm tabular-nums">{fmtNum(item.total_qty)}</p>
                    </div>
                    <div className="rounded-xl bg-teal-50 p-2 text-center border border-teal-100">
                      <p className="font-bold tracking-widest text-teal-600/70 uppercase text-[9px]">m³</p>
                      <p className="font-black text-teal-700 text-sm tabular-nums">{Number(item.total_kubikasi).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-raised p-2 text-center border border-slate-100">
                      <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Item</p>
                      <p className="font-black text-slate-900 text-sm tabular-nums">{item.item_count}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[9px] font-black uppercase" aria-hidden="true">{(item.driver_name || '?').charAt(0)}</span><span className="font-medium text-slate-700">{item.driver_name}</span></span>
                    <span className="font-mono">{item.nopol}</span>
                    <span>{item.jenis_kendaraan}</span>
                    <span>{item.expedisi}</span>
                    <span className="ml-auto">{item.nama_depo || item.kode_depo}</span>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination — ringkasan di atas selalu mencakup seluruh filter */}
          {lastPage > 1 && (
            <div className="p-4 border-t border-gray-100 bg-overlay-50">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1 || loading} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman sebelumnya">
                  <span className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    Sebelumnya
                  </span>
                </button>
                <nav className="flex items-center gap-1" aria-label="Navigasi halaman">
                  {pageNumbers.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      aria-label={`Halaman ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                      className={`min-w-9 h-9 px-2 rounded-lg text-sm font-bold tabular-nums transition-colors ${p === page ? 'bg-ink-900 text-white shadow' : 'text-slate-500 hover:bg-slate-200/70'}`}
                    >
                      {p}
                    </button>
                  ))}
                </nav>
                <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage || loading} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman berikutnya">
                  <span className="flex items-center gap-2 text-sm">
                    Selanjutnya
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </span>
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-slate-400 tabular-nums">Halaman {page} dari {lastPage} • {rangeText}</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
