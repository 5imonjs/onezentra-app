'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

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
  DRAFT: { color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200', dot: 'bg-slate-400' },
  SCHEDULED: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500' },
  CHECKED_IN: { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-100', dot: 'bg-yellow-500' },
  VERIFIED: { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-100', dot: 'bg-purple-500' },
  IN_PROGRESS: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100', dot: 'bg-orange-500' },
  COMPLETED: { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-100', dot: 'bg-green-500' },
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

  useEffect(() => {
    depo.list().then((res) => setDepots(res.data?.data ?? [])).catch(() => {});
  }, []);

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
      setPage(1);
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
      link.setAttribute('download', `laporan-rencana-kirim-${new Date().toISOString().split('T')[0]}.xlsx`);
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
          Anda tidak memiliki izin untuk melihat Laporan Rencana Kirim.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header — bento gelap konsisten dengan halaman kerja Rencana Kirim */}
        <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white text-slate-900 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Laporan</p>
                <h1 className="text-2xl font-black tracking-tight">Laporan Rencana Kirim</h1>
                <p className="text-slate-300 text-sm">Rekap pengiriman • qty, kubikasi, dan status per depo</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 px-3 py-1.5 text-xs font-black shadow">
                Total <span className="bg-slate-900 text-white rounded-lg px-1.5 py-0.5 tabular-nums">{summary?.total ?? 0}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold border border-white/20">
                Selesai <span className="bg-emerald-500 text-white rounded-full px-1.5 py-0.5 text-[11px]">{summary?.completed_count ?? 0}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold border border-white/20">
                Batal <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[11px]">{summary?.cancelled_count ?? 0}</span>
              </span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold border border-white/10">
                <svg className="w-3.5 h-3.5 mr-1.5 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                {selectedDepo ? selectedDepo.nama_depo : 'Semua Depo'}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            {error}
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-slate-50 to-white">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Rentang tanggal RKH, status, depo, dan pencarian</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[140px]">
                <label htmlFor="rf-from" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari Tanggal</label>
                <input id="rf-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label htmlFor="rf-to" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai Tanggal</label>
                <input id="rf-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label htmlFor="rf-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status</label>
                <select id="rf-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="select-field text-sm py-2 bg-slate-50 focus:bg-white">
                  {STATUS_FILTERS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                </select>
              </div>
              <div className="flex-1 min-w-[170px]">
                <label htmlFor="rf-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label>
                <select id="rf-depo" value={kodeDepo} onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }} className="select-field text-sm py-2 bg-slate-50 focus:bg-white">
                  <option value="">Semua Depo</option>
                  {depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label htmlFor="rf-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cari</label>
                <input id="rf-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PO / driver / nopol / tujuan" className="input-field text-sm py-2 bg-slate-50 focus:bg-white" />
              </div>
              <button onClick={handleApply} disabled={loading} className="btn-primary text-sm disabled:opacity-50">{loading ? 'Memuat...' : 'Terapkan'}</button>
              <button onClick={resetFilters} className="btn-secondary text-sm">Reset</button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Qty</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{fmtNum(summary.total_qty)}</p>
                </div>
              </div>
            </div>
            <div className="bg-linear-to-br from-teal-600 to-teal-500 rounded-2xl shadow-lg p-4 text-white card-hover relative overflow-hidden group">
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <svg className="w-5 h-5 text-teal-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total Kubikasi</p>
                  <p className="text-2xl font-black tabular-nums">{Number(summary.total_kubikasi ?? 0).toFixed(2)} <span className="text-sm font-medium">m³</span></p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/20 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Selesai</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">{fmtNum(summary.completed_count)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-red-500/20 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dibatalkan</p>
                  <p className="text-2xl font-black text-red-600 tabular-nums">{fmtNum(summary.cancelled_count)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Detail Rencana Kirim</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{fmtNum(summary?.total ?? items.length)} dokumen ditemukan</p>
                </div>
              </div>
              <button onClick={handleExport} disabled={!canExport || exporting} title={!canExport ? 'Tidak ada data untuk diexport' : undefined} className="btn-secondary text-sm disabled:opacity-50 flex items-center gap-2">
                <svg className={`w-4 h-4 ${exporting ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full min-w-[1140px] border-collapse">
              <caption className="sr-only">Laporan rencana kirim</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-200">
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
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 12 }).map((__, j) => (
                        <td key={j} className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        <div>
                          <p className="text-sm text-slate-500 font-medium">Tidak ada data rencana kirim</p>
                          <p className="text-xs text-slate-400 mt-1">Coba ubah filter tanggal, status, atau depo</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const st = STATUS_STYLE[item.status];
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{fmtDate(item.rkh_date)}</td>
                        <td className="table-cell text-sm font-mono font-medium text-slate-800 whitespace-nowrap">{item.po_transporter}</td>
                        <td className="table-cell text-sm text-slate-700 whitespace-nowrap">{item.driver_name}</td>
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
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${st?.bg || 'bg-white'} ${st?.color || 'text-gray-600'} ${st?.border || 'border-gray-200'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-gray-400'}`} />
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
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-4 w-32 bg-slate-100 rounded" />
                    <div className="h-3 w-48 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="p-10 text-center">
                <p className="text-sm text-slate-500 font-medium">Tidak ada data rencana kirim</p>
                <p className="text-xs text-slate-400 mt-1">Coba ubah filter tanggal, status, atau depo</p>
              </div>
            )}
            {!loading && items.map((item) => {
              const st = STATUS_STYLE[item.status];
              return (
                <div key={item.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-slate-800 truncate">{item.po_transporter}</p>
                      <p className="mt-0.5 text-xs text-slate-400">RK {fmtDate(item.rkh_date)} • Tujuan {item.destination_name}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${st?.bg || 'bg-white'} ${st?.color || 'text-gray-600'} ${st?.border || 'border-gray-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-gray-400'}`} />
                      {summary?.status_counts[item.status]?.label || item.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div><span className="text-slate-400">Driver: </span><span className="font-medium text-slate-700">{item.driver_name}</span></div>
                    <div><span className="text-slate-400">Nopol: </span><span className="font-mono font-medium text-slate-700">{item.nopol}</span></div>
                    <div><span className="text-slate-400">Item: </span><span className="font-medium text-slate-700 tabular-nums">{item.item_count}</span></div>
                    <div><span className="text-slate-400">Jenis: </span><span className="font-medium text-slate-700">{item.jenis_kendaraan}</span></div>
                    <div><span className="text-slate-400">Depo: </span><span className="font-medium text-slate-700">{item.nama_depo || item.kode_depo}</span></div>
                    <div><span className="text-slate-400">Qty: </span><span className="font-bold text-slate-800 tabular-nums">{fmtNum(item.total_qty)}</span></div>
                    <div><span className="text-slate-400">Kubikasi: </span><span className="font-bold text-teal-700 tabular-nums">{Number(item.total_kubikasi).toFixed(2)} m³</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination — ringkasan di atas selalu mencakup seluruh filter */}
          {lastPage > 1 && (
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <div className="flex justify-between items-center">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman sebelumnya">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    Sebelumnya
                  </span>
                </button>
                <span className="text-sm text-gray-600 font-medium">
                  Halaman {page} dari {lastPage}
                </span>
                <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman berikutnya">
                  <span className="flex items-center gap-2">
                    Selanjutnya
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
