'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { depo, getErrorMessage, reports } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface Row {
  id: number;
  no: number;
  cluster: string;
  sku?: string | null;
  principal_1?: string | null;
  principal_2?: string | null;
  kode_barang: string;
  nama_barang: string;
  qty_dus_ball: number;
  qty_pcs: number;
  satuan: string;
  tanggal_expired: string | null;
  tanggal_penerimaan: string | null;
  weekday: 'Future' | 'Past' | '-';
  sisa_simpan: string;
  sisa_hari: number | null;
  is_expired: boolean;
  kode_depo: string;
  nama_depo: string;
  sumber_material: string;
}

interface Summary {
  total_item: number;
  total_qty_dus: number;
  total_qty_pcs: number;
  total_cluster: number;
  item_expired: number;
  item_future: number;
  item_tanpa_expired: number;
}

const PER_PAGE = 25;

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const [y, m, d] = v.split('-');
  return `${d}-${m}-${y}`;
}

function fmtNumber(v: number): string {
  return v.toLocaleString('id-ID');
}

export default function PenerimaanBatchExpiredReportPage() {
  const { hasPermission } = useAuthStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clusterOptions, setClusterOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [cluster, setCluster] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchApply, setSearchApply] = useState('');
  const [rangePreset, setRangePreset] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const reqIdRef = useRef(0);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (dateFrom || dateTo) n += 1;
    if (kodeDepo) n += 1;
    if (cluster) n += 1;
    if (status) n += 1;
    if (searchApply) n += 1;
    return n;
  }, [dateFrom, dateTo, kodeDepo, cluster, status, searchApply]);

  const rangeText = useMemo(() => {
    const total = summary?.total_item ?? 0;
    if (total === 0) return '0 item ditemukan';
    const from = (page - 1) * PER_PAGE + 1;
    const to = (page - 1) * PER_PAGE + rows.length;
    return `Menampilkan ${fmtNumber(from)}–${fmtNumber(to)} dari ${fmtNumber(total)} item`;
  }, [rows.length, page, summary?.total_item]);

  const buildParams = useCallback(() => {
    const params: Record<string, unknown> = { page, per_page: PER_PAGE };
    if (dateFrom) params.tanggal_from = dateFrom;
    if (dateTo) params.tanggal_to = dateTo;
    if (kodeDepo) params.kode_depo = kodeDepo;
    if (cluster) params.cluster = cluster;
    if (status) params.status = status;
    if (searchApply) params.search = searchApply;
    return params;
  }, [dateFrom, dateTo, kodeDepo, cluster, status, searchApply, page]);

  const fetchData = useCallback(async () => {
    if (!hasPermission('reports.view')) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await reports.penerimaanBatchExpired(buildParams());
      // Anti race: respons basi (filter sudah berubah) dibuang.
      if (reqIdRef.current !== reqId) return;
      setRows(res.data.data);
      setSummary(res.data.summary);
      setClusterOptions(res.data.cluster_options ?? []);
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
    setKodeDepo('');
    setCluster('');
    setStatus('');
    setSearch('');
    setSearchApply('');
    setPage(1);
  };

  const submit = () => {
    setSearchApply(search.trim());
    setPage(1);
  };

  useEffect(() => {
    const t = setTimeout(() => { setSearchApply(search.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { page: _page, per_page: _perPage, ...filters } = buildParams();
      const res = await reports.penerimaanBatchExpiredExport(filters);
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-penerimaan-expired-produk-${toLocalISODate(new Date())}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal export'));
    } finally {
      setExporting(false);
    }
  };

  const canExport = !loading && !exporting && rows.length > 0;

  if (!hasPermission('reports.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Laporan Penerimaan &amp; Expired Produk.
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
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-black tracking-tight">Laporan Penerimaan &amp; Expired Produk</h1>
              <p className="text-primary-200 text-sm mt-0.5">
                Satu baris = satu penerimaan produk. Dikelompokkan per cluster, dengan status Future/Past dan sisa simpan.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            {error}
          </div>
        )}
        {/* Filter Laporan */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-slate-50 to-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Tanggal • Cluster • Status • Depo • Cari</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100" role="group" aria-label="Preset rentang tanggal">
                {[
                  { key: 'today', label: 'Hari Ini' },
                  { key: '7d', label: '7 Hari' },
                  { key: 'month', label: 'Bulan Ini' },
                ].map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} aria-pressed={rangePreset === r.key} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-surface-card text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
              <div>
                <label htmlFor="pe-from" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari Tanggal</label>
                <input id="pe-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-surface-raised focus:bg-surface-card" />
              </div>
              <div>
                <label htmlFor="pe-to" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai Tanggal</label>
                <input id="pe-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-surface-raised focus:bg-surface-card" />
              </div>
              <div>
                <label htmlFor="pe-cluster" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cluster</label>
                <select id="pe-cluster" value={cluster} onChange={(e) => { setCluster(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card">
                  <option value="">Semua Cluster</option>
                  {clusterOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="pe-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status Expired</label>
                <select id="pe-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card">
                  <option value="">Semua</option>
                  <option value="FUTURE">Future</option>
                  <option value="EXPIRED">Past / Expired</option>
                </select>
              </div>
              <div>
                <label htmlFor="pe-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label>
                <select id="pe-depo" value={kodeDepo} onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card">
                  <option value="">Semua Depo</option>
                  {depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="pe-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cari</label>
                <input id="pe-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Produk, cluster…" className="input-field text-sm py-2 bg-surface-raised focus:bg-surface-card" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400 tabular-nums" aria-live="polite">
                {activeFilterCount > 0 ? `${activeFilterCount} filter aktif` : 'Tanpa filter — seluruh data'}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-surface-card border border-gray-300 text-sm font-semibold text-slate-600 hover:bg-surface-raised hover:border-slate-300 transition-all">Reset</button>
                <button onClick={submit} disabled={loading} className="px-5 py-2 rounded-xl bg-linear-to-r from-ink-900 to-ink-800 text-white text-sm font-semibold hover:from-ink-800 hover:to-slate-700 shadow-lg disabled:opacity-50 transition-all">{loading ? 'Memuat...' : 'Terapkan Filter'}</button>
              </div>
            </div>
          </div>
        </div>
        {summary && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="rounded-2xl shadow-sm border p-5 card-hover bg-surface-card border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Penerimaan</p>
              <p className="text-2xl font-black tabular-nums text-slate-900 mt-1">{fmtNumber(summary.total_item)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{fmtNumber(summary.total_cluster)} cluster</p>
            </div>
            <div className="rounded-2xl shadow-sm border p-5 card-hover bg-surface-card border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Qty Dus/Ball</p>
              <p className="text-2xl font-black tabular-nums text-slate-900 mt-1">{fmtNumber(summary.total_qty_dus)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">satuan CRT/ZAK</p>
            </div>
            <div className="rounded-2xl shadow-sm border p-5 card-hover bg-surface-card border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Qty PCS</p>
              <p className="text-2xl font-black tabular-nums text-slate-900 mt-1">{fmtNumber(summary.total_qty_pcs)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">pcs-equivalent</p>
            </div>
            <div className={`rounded-2xl shadow-sm border p-5 card-hover ${summary.item_expired > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sudah Expired</p>
              <p className={`text-2xl font-black tabular-nums mt-1 ${summary.item_expired > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmtNumber(summary.item_expired)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{fmtNumber(summary.item_future)} masih future</p>
            </div>
          </div>
        )}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center shadow shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25A2.25 2.25 0 018.25 10.5H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Detail Penerimaan &amp; Expired</h2>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{rangeText}</p>
                </div>
              </div>
              <button
                onClick={handleExport}
                disabled={!canExport}
                title={!canExport ? 'Tidak ada data untuk diexport' : 'Export seluruh baris terfilter ke Excel'}
                aria-label="Export laporan ke Excel"
                className="btn-secondary text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <svg className={`w-4 h-4 ${exporting ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full min-w-325 border-collapse">
              <caption className="sr-only">Laporan penerimaan produk dan status batch expired, dikelompokkan per cluster</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-300">
                  <th scope="col" className="table-header text-right whitespace-nowrap">No</th>
                  <th scope="col" className="table-header whitespace-nowrap">Cluster</th>
                  <th scope="col" className="table-header whitespace-nowrap">Produk</th>
                  <th scope="col" className="table-header whitespace-nowrap">Nama Produk</th>
                  <th scope="col" className="table-header whitespace-nowrap">Principal 1</th>
                  <th scope="col" className="table-header whitespace-nowrap">Principal 2</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Dus/Ball</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">PCS</th>
                  <th scope="col" className="table-header whitespace-nowrap">Tgl Expired</th>
                  <th scope="col" className="table-header whitespace-nowrap">Tgl Penerimaan</th>
                  <th scope="col" className="table-header whitespace-nowrap">Weekday</th>
                  <th scope="col" className="table-header whitespace-nowrap">Sisa Simpan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse" aria-hidden="true">
                    <td className="table-cell"><div className="h-3.5 w-8 bg-slate-100 rounded ml-auto" /></td>
                    <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    <td className="table-cell"><div className="h-3.5 w-32 bg-slate-100 rounded" /></td>
                    <td className="table-cell"><div className="h-3.5 w-44 bg-slate-100 rounded" /></td>
                    <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    <td className="table-cell"><div className="h-3.5 w-12 bg-slate-100 rounded ml-auto" /></td>
                    <td className="table-cell"><div className="h-3.5 w-14 bg-slate-100 rounded ml-auto" /></td>
                    <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    <td className="table-cell"><div className="h-5 w-16 bg-slate-100 rounded-full" /></td>
                    <td className="table-cell"><div className="h-3.5 w-28 bg-slate-100 rounded" /></td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-10 text-center">
                      <p className="text-sm text-slate-600 font-bold">Tidak ada data</p>
                      <p className="text-xs text-slate-400 mt-1">Belum ada penerimaan pada filter ini</p>
                      {activeFilterCount > 0 && (
                        <button onClick={resetFilters} className="mt-3 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold">Reset filter</button>
                      )}
                    </td>
                  </tr>
                )}
                {!loading && rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={row.is_expired ? 'bg-red-50/70' : 'hover:bg-gray-50/60'}
                    title={row.is_expired ? `EXPIRED — lewat ${Math.abs(row.sisa_hari ?? 0)} hari` : undefined}
                  >
                    <td className="table-cell text-right text-sm text-slate-400 tabular-nums">{row.no ?? index + 1}</td>
                    <td className="table-cell text-sm whitespace-nowrap">
                      {index === 0 || rows[index - 1].cluster !== row.cluster ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-chip-primary text-accent-text border border-chip-primary-border">
                          {row.cluster}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400" aria-hidden="true">〃</span>
                      )}
                    </td>
                    <td className="table-cell text-sm text-slate-800 font-mono whitespace-nowrap" title={row.kode_barang}>{row.sku ?? row.kode_barang}</td>
                    <td className="table-cell text-sm text-slate-600 min-w-55 max-w-75">
                      <span className="block line-clamp-2 wrap-break-word" title={row.nama_barang}>{row.nama_barang}</span>
                    </td>
                    <td className="table-cell text-sm text-slate-700 whitespace-nowrap">{row.principal_1 ?? '-'}</td>
                    <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{row.principal_2 ?? '-'}</td>
                    <td className="table-cell text-sm text-right text-slate-800 tabular-nums font-bold">{fmtNumber(row.qty_dus_ball)}</td>
                    <td className="table-cell text-sm text-right text-slate-600 tabular-nums">{fmtNumber(row.qty_pcs)}</td>
                    <td className={`table-cell text-sm tabular-nums whitespace-nowrap ${row.is_expired ? 'text-red-700 font-bold' : 'text-slate-600'}`}>
                      {fmtDate(row.tanggal_expired)}
                    </td>
                    <td className="table-cell text-sm text-slate-600 tabular-nums whitespace-nowrap">{fmtDate(row.tanggal_penerimaan)}</td>
                    <td className="table-cell whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${row.weekday === 'Future' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : row.weekday === 'Past' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {row.weekday}
                      </span>
                    </td>
                    <td className="table-cell text-sm text-slate-600 tabular-nums whitespace-nowrap">
                      <span className="block">{row.sisa_simpan}</span>
                      <span className={`block text-[11px] ${(row.sisa_hari ?? 0) < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {(row.sisa_hari ?? 0) < 0 ? `lewat ${Math.abs(row.sisa_hari ?? 0)} hari` : `${row.sisa_hari ?? 0} hari lagi`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden divide-y divide-gray-100">
            {!loading && rows.length === 0 && (
              <div className="p-10 text-center">
                <p className="text-sm text-slate-600 font-bold">Tidak ada data</p>
                <p className="text-xs text-slate-400 mt-1">Belum ada penerimaan pada filter ini</p>
              </div>
            )}
            {rows.map((row) => (
              <div key={row.id} className={`p-4 space-y-2 ${row.is_expired ? 'bg-red-50/70' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500">{row.cluster}</p>
                    <p className="text-sm font-bold text-slate-900 font-mono truncate" title={row.kode_barang}>{row.sku ?? row.kode_barang}</p>
                    <p className="text-[11px] text-slate-500 truncate">{row.principal_1 ?? '-'}{(row.principal_2 ?? '-') !== '-' ? ` / ${row.principal_2}` : ''}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${row.weekday === 'Future' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : row.weekday === 'Past' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {row.weekday}
                  </span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{row.nama_barang}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-surface-raised p-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Dus/Ball</p>
                    <p className="text-sm font-black tabular-nums text-slate-900">{fmtNumber(row.qty_dus_ball)}</p>
                  </div>
                  <div className="rounded-xl bg-surface-raised p-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">PCS</p>
                    <p className="text-sm font-black tabular-nums text-slate-900">{fmtNumber(row.qty_pcs)}</p>
                  </div>
                  <div className="rounded-xl bg-surface-raised p-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Sisa Simpan</p>
                    <p className="text-sm font-black tabular-nums text-slate-900">{row.sisa_simpan}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                  <span>Expired: <span className={row.is_expired ? 'text-red-700 font-bold' : ''}>{fmtDate(row.tanggal_expired)}</span></span>
                  <span>Diterima: {fmtDate(row.tanggal_penerimaan)}</span>
                </div>
              </div>
            ))}
          </div>

          {lastPage > 1 && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500 tabular-nums">Halaman {page} dari {lastPage}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-card border border-gray-300 text-slate-600 hover:bg-surface-raised disabled:opacity-40 transition-all"
                >
                  Sebelumnya
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  disabled={page >= lastPage || loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-card border border-gray-300 text-slate-600 hover:bg-surface-raised disabled:opacity-40 transition-all"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}