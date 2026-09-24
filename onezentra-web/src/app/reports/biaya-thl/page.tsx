'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface BiayaThlReportRow {
  id: number;
  tanggal_pengajuan: string;
  kode_depo: string;
  nama_depo: string;
  no_surat_jalan: string;
  nama_thl: string;
  posisi: string;
  nopol_kendaraan: string;
  type_kendaraan: string;
  droppoint: string;
  kubikasi: number;
  nominal_biaya: number;
  status: string;
}

interface BiayaThlReportSummary {
  total_pengajuan: number;
  total_detail: number;
  total_nominal: number;
  total_tenaga_kerja: number;
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: 'month', label: 'Bulan Ini' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'checked', label: 'Checked' },
  { value: 'rlh_approved', label: 'Disetujui RLH' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'revisi', label: 'Revisi' },
];

const statusTone = (status: string): string => {
  switch (status) {
    case 'approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
    case 'revisi': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'checked': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'rlh_approved': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

const PER_PAGE = 25;

export default function BiayaThlReportPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<BiayaThlReportRow[]>([]);
  const [summary, setSummary] = useState<BiayaThlReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchApply, setSearchApply] = useState('');
  const [rangePreset, setRangePreset] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const reqIdRef = useRef(0);

  const selectedDepo = depots.find((d) => d.kode_depo === kodeDepo);

  const fetchData = useCallback(async () => {
    if (!hasPermission('reports.biaya_thl')) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = { page, per_page: PER_PAGE };
      if (dateFrom) params.tanggal_from = dateFrom;
      if (dateTo) params.tanggal_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      if (status) params.status = status;
      if (searchApply) params.search = searchApply;
      const res = await reports.biayaThl(params);
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
  }, [dateFrom, dateTo, kodeDepo, status, searchApply, page, hasPermission]);

  useEffect(() => {
    depo.list().then((res) => setDepots(res.data.data)).catch(() => {});
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
    setKodeDepo('');
    setStatus('');
    setSearch('');
    setSearchApply('');
    setPage(1);
  };

  const handleExport = async () => {
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.tanggal_from = dateFrom;
      if (dateTo) params.tanggal_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      if (status) params.status = status;
      if (searchApply) params.search = searchApply;
      const res = await reports.biayaThlExport(params);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-biaya-thl-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal export'));
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { setSearchApply(search.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const submit = () => {
    setSearchApply(search.trim());
    setPage(1);
  };

  const formatCurrency = (n: number) => `Rp ${Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;

  if (!hasPermission('reports.biaya_thl')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Laporan Biaya THL.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-slide-up">
        {/* Header */}
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Laporan</p>
              <h1 className="text-2xl font-bold leading-tight">Laporan Biaya THL</h1>
              <p className="text-gray-400 mt-0.5 text-sm">Rincian upah tenaga kerja lepas per surat jalan</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {summary && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur text-white px-3 py-1.5 text-xs font-semibold border border-white/10">{summary.total_pengajuan} pengajuan • {summary.total_detail} baris • {summary.total_tenaga_kerja} tenaga kerja</span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-emerald-500/30 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{selectedDepo ? selectedDepo.nama_depo : 'Semua Depo'}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-slate-50 to-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="text-xs text-slate-500">Tanggal • Depo • Status • Cari</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
              <div><label htmlFor="bt-from" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari</label><input id="bt-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" /></div>
              <div><label htmlFor="bt-to" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai</label><input id="bt-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" /></div>
              <div><label htmlFor="bt-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label><select id="bt-depo" value={kodeDepo} onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }} className="select-field text-sm py-2 bg-slate-50 focus:bg-white"><option value="">Semua Depo</option>{depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}</select></div>
              <div><label htmlFor="bt-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status</label><select id="bt-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="select-field text-sm py-2 bg-slate-50 focus:bg-white">{STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></div>
              <div className="lg:col-span-2"><label htmlFor="bt-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cari</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></span><input id="bt-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Nama THL, SJ, nopol, depo…" className="input-field text-sm py-2 pl-9 bg-slate-50 focus:bg-white" /></div></div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">Reset</button>
              <button onClick={submit} disabled={loading} className="px-5 py-2 rounded-xl bg-linear-to-r from-slate-900 to-slate-800 text-white text-sm font-semibold hover:from-slate-800 hover:to-slate-700 shadow-lg disabled:opacity-50 transition-all">{loading ? 'Memuat...' : 'Terapkan Filter'}</button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pengajuan</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_pengajuan}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tenaga Kerja</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_tenaga_kerja}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Baris Detail</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_detail}</p>
                </div>
              </div>
            </div>
            <div className="bg-linear-to-br from-primary-600 to-indigo-600 rounded-2xl shadow-lg p-5 text-white card-hover relative overflow-hidden group">
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur text-primary-300 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total Nominal</p>
                  <p className="text-xl font-black tabular-nums">{formatCurrency(summary.total_nominal)}</p>
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
                  <h2 className="text-base font-bold text-slate-900">Detail Biaya THL</h2>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                    {summary ? `Menampilkan ${items.length > 0 ? (page - 1) * PER_PAGE + 1 : 0}–${(page - 1) * PER_PAGE + items.length} dari ${summary.total_detail} baris` : `${items.length} baris ditemukan`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleExport}
                disabled={loading || items.length === 0}
                className="btn-secondary text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Export
              </button>
            </div>
          </div>
          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full min-w-[1200px] border-collapse">
              <caption className="sr-only">Laporan biaya THL</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-200">
                  <th scope="col" className="table-header whitespace-nowrap">Tgl Pengajuan</th>
                  <th scope="col" className="table-header whitespace-nowrap">Depo</th>
                  <th scope="col" className="table-header whitespace-nowrap">No SJ</th>
                  <th scope="col" className="table-header whitespace-nowrap">Nama THL</th>
                  <th scope="col" className="table-header whitespace-nowrap">Posisi</th>
                  <th scope="col" className="table-header whitespace-nowrap">Nopol</th>
                  <th scope="col" className="table-header whitespace-nowrap">Type</th>
                  <th scope="col" className="table-header whitespace-nowrap">Droppoint</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Kubikasi</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Nominal</th>
                  <th scope="col" className="table-header whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-28 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-16 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-12 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-16 bg-slate-100 rounded" /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        <div>
                          <p className="text-sm text-slate-500 font-medium">Tidak ada data biaya THL</p>
                          <p className="text-xs text-slate-400 mt-1">Belum ada detail pada rentang filter ini</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.tanggal_pengajuan}</td>
                      <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.nama_depo} <span className="text-slate-400 text-xs">({item.kode_depo})</span></td>
                      <td className="table-cell text-sm font-mono text-slate-800 whitespace-nowrap">{item.no_surat_jalan}</td>
                      <td className="table-cell text-sm font-medium text-slate-800 whitespace-nowrap">{item.nama_thl}</td>
                      <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.posisi}</td>
                      <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{item.nopol_kendaraan}</td>
                      <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.type_kendaraan}</td>
                      <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.droppoint}</td>
                      <td className="table-cell text-sm text-right text-slate-600 tabular-nums whitespace-nowrap">{Number(item.kubikasi || 0).toLocaleString('id-ID')}</td>
                      <td className="table-cell text-sm text-right text-slate-800 tabular-nums font-semibold whitespace-nowrap">{formatCurrency(item.nominal_biaya)}</td>
                      <td className="table-cell"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${statusTone(item.status)}`}>{item.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{item.nama_thl}</p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">{item.no_surat_jalan} • {item.nopol_kendaraan}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${statusTone(item.status)}`}>{item.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2 text-center border border-slate-100">
                    <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Posisi</p>
                    <p className="font-black text-slate-900 text-xs">{item.posisi.replace('THL ', '')}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 text-center border border-slate-100">
                    <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Type</p>
                    <p className="font-black text-slate-900 text-xs">{item.type_kendaraan}</p>
                  </div>
                  <div className="rounded-xl bg-slate-900 text-white p-2 text-center">
                    <p className="font-bold tracking-widest text-white/60 uppercase text-[9px]">Nominal</p>
                    <p className="font-black text-xs">{formatCurrency(item.nominal_biaya)}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{item.nama_depo} • {item.tanggal_pengajuan}{item.droppoint && item.droppoint !== '-' ? ` • ${item.droppoint}` : ''}{Number(item.kubikasi || 0) > 0 ? ` • ${Number(item.kubikasi).toLocaleString('id-ID')} m³` : ''}</p>
              </div>
            ))}
            {items.length === 0 && !loading && <p className="p-8 text-center text-sm text-slate-400">Tidak ada data</p>}
          </div>
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
