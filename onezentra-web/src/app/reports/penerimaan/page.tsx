'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';
import { conditionMeta } from '@/lib/condition';

interface PenerimaanRow {
  id: number;
  tanggal_penerimaan: string;
  kode_depo: string;
  nama_depo: string;
  sumber_material: string;
  po_transporter: string;
  driver_name: string;
  kode_barang: string;
  nama_barang: string;
  qty_crt: number;
  qty_pcs: number;
  satuan: string;
  expired_date: string;
  condition: string;
  selisih_qty: number;
  selisih_reason: string;
  notes: string;
  sumber: string;
}

interface PenerimaanSummary {
  total_item: number;
  total_qty_crt: number;
  total_qty_pcs: number;
  item_sj: number;
  item_manual: number;
  total_selisih: number;
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? m[3] : v;
}

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: 'month', label: 'Bulan Ini' },
];

const conditionTone = conditionMeta;

const PER_PAGE = 25;

export default function PenerimaanReportPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<PenerimaanRow[]>([]);
  const [summary, setSummary] = useState<PenerimaanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [depotError, setDepotError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [sumber, setSumber] = useState('');
  const [search, setSearch] = useState('');
  const [searchApply, setSearchApply] = useState('');
  const [rangePreset, setRangePreset] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const reqIdRef = useRef(0);

  const selectedDepo = depots.find((d) => d.kode_depo === kodeDepo);
  const selectedSumberLabel = sumber === 'VALIDASI_SJ' ? 'Validasi SJ' : sumber === 'IMPORT_MANUAL' ? 'Manual' : '';

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (dateFrom || dateTo) n += 1;
    if (kodeDepo) n += 1;
    if (sumber) n += 1;
    if (searchApply) n += 1;
    return n;
  }, [dateFrom, dateTo, kodeDepo, sumber, searchApply]);

  const pageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, Math.min(page - 2, lastPage - windowSize + 1));
    const pages: number[] = [];
    for (let p = start; p <= Math.min(lastPage, start + windowSize - 1); p += 1) pages.push(p);
    return pages;
  }, [page, lastPage]);

  const rangeText = useMemo(() => {
    const total = summary?.total_item ?? 0;
    if (total === 0) return '0 item ditemukan';
    const from = (page - 1) * PER_PAGE + 1;
    const to = (page - 1) * PER_PAGE + items.length;
    return `Menampilkan ${from.toLocaleString('id-ID')}–${to.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} item`;
  }, [items.length, page, summary?.total_item]);

  const fetchData = useCallback(async () => {
    if (!hasPermission('reports.view')) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = { page, per_page: PER_PAGE };
      if (dateFrom) params.tanggal_from = dateFrom;
      if (dateTo) params.tanggal_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      if (sumber) params.sumber = sumber;
      if (searchApply) params.search = searchApply;
      const res = await reports.penerimaan(params);
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
  }, [dateFrom, dateTo, kodeDepo, sumber, searchApply, page, hasPermission]);

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
    setKodeDepo('');
    setSumber('');
    setSearch('');
    setSearchApply('');
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.tanggal_from = dateFrom;
      if (dateTo) params.tanggal_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      if (sumber) params.sumber = sumber;
      if (searchApply) params.search = searchApply;
      const res = await reports.penerimaanExport(params);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-penerimaan-${todayLocal()}.xlsx`);
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

  useEffect(() => {
    const t = setTimeout(() => { setSearchApply(search.trim()); setPage((p) => (p === 1 ? p : 1)); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const submit = () => {
    setSearchApply(search.trim());
    setPage(1);
  };

  const canExport = !loading && !exporting && items.length > 0;
  const selisihBad = (summary?.total_selisih ?? 0) !== 0;

  if (!hasPermission('reports.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Laporan Inbound.
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
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-fg-muted">Laporan</p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight">Laporan Inbound</h1>
              <p className="text-ink-fg-muted mt-0.5 text-sm">Ledger receiving • SJ + manual • sumber Batch Expired</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {summary && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur text-white px-3 py-1.5 text-xs font-semibold border border-white/10 tabular-nums">
                {summary.total_item.toLocaleString('id-ID')} item • {summary.item_sj.toLocaleString('id-ID')} SJ • {summary.item_manual.toLocaleString('id-ID')} manual
                {activeFilterCount > 0 && <span className="text-white/60">• {activeFilterCount} filter</span>}
              </span>
            )}
            {summary && (
              <span className={`inline-flex items-center gap-1.5 rounded-full backdrop-blur px-3 py-1.5 text-xs font-semibold border tabular-nums ${selisihBad ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${selisihBad ? 'bg-amber-400' : 'bg-emerald-400'}`} aria-hidden="true" />
                {selisihBad ? `${summary.total_selisih > 0 ? '+' : ''}${summary.total_selisih} selisih` : 'Selisih nol'}
              </span>
            )}
            {selectedSumberLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-white/10 text-ink-fg">
                Sumber: {selectedSumberLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-emerald-500/30 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />{selectedDepo ? selectedDepo.nama_depo : 'Semua Depo'}
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

        {/* Filters */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-slate-50 to-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-ink-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Tanggal • Depo • Sumber • Cari</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100" role="group" aria-label="Preset rentang tanggal">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} aria-pressed={rangePreset === r.key} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-surface-card text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
              <div><label htmlFor="pf-from" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari Tanggal</label><input id="pf-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-surface-raised focus:bg-surface-card" /></div>
              <div><label htmlFor="pf-to" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai Tanggal</label><input id="pf-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); setPage(1); }} className="input-field text-sm py-2 bg-surface-raised focus:bg-surface-card" /></div>
              <div><label htmlFor="pf-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label><select id="pf-depo" value={kodeDepo} onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card"><option value="">Semua Depo</option>{depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}</select></div>
              <div><label htmlFor="pf-sumber" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sumber</label><select id="pf-sumber" value={sumber} onChange={(e) => { setSumber(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card"><option value="">Semua</option><option value="VALIDASI_SJ">Validasi SJ</option><option value="IMPORT_MANUAL">Manual</option></select></div>
              <div className="sm:col-span-2 lg:col-span-2"><label htmlFor="pf-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cari</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></span><input id="pf-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Kode, nama, PO, driver…" className="input-field text-sm py-2 pl-9 bg-surface-raised focus:bg-surface-card" /></div></div>
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

        {/* Summary Cards */}
        {summary && (
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-ink-900 text-white flex items-center justify-center shadow-lg shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m16.5 0c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h16.5z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Item</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_item.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">{summary.item_sj.toLocaleString('id-ID')} SJ • {summary.item_manual.toLocaleString('id-ID')} manual</p>
                </div>
              </div>
            </div>
            <div className="bg-linear-to-br from-primary-600 to-primary-600 rounded-2xl shadow-lg p-5 text-white card-hover relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Qty CRT</p>
                  <p className="text-2xl font-black tabular-nums">{summary.total_qty_crt.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-white/60 tabular-nums">satuan karton</p>
                </div>
              </div>
            </div>
            <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/20 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Qty PCS</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_qty_pcs.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">satuan pcs</p>
                </div>
              </div>
            </div>
            <div className={`rounded-2xl shadow-sm border p-5 card-hover relative overflow-hidden group ${summary.total_selisih === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className={`absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 ${summary.total_selisih === 0 ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`} aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow shrink-0 ${summary.total_selisih === 0 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Selisih</p>
                  <p className={`text-2xl font-black tabular-nums ${summary.total_selisih === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{summary.total_selisih > 0 ? '+' : ''}{summary.total_selisih.toLocaleString('id-ID')}</p>
                  <p className="text-[11px] text-slate-500">{summary.total_selisih === 0 ? 'Aman — tidak ada selisih' : 'Perlu perhatian'}</p>
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
                  <h2 className="text-base font-bold text-slate-900">Detail Inbound</h2>
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
            <table className="w-full min-w-[1200px] border-collapse">
              <caption className="sr-only">Laporan penerimaan</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-300">
                  <th scope="col" className="table-header whitespace-nowrap">Tgl Penerimaan</th>
                  <th scope="col" className="table-header whitespace-nowrap">Depo</th>
                  <th scope="col" className="table-header whitespace-nowrap">Sumber Material</th>
                  <th scope="col" className="table-header whitespace-nowrap">PO Transporter</th>
                  <th scope="col" className="table-header whitespace-nowrap">Kode Barang</th>
                  <th scope="col" className="table-header whitespace-nowrap">Nama Barang</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Qty CRT</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Qty PCS</th>
                  <th scope="col" className="table-header whitespace-nowrap">Expired</th>
                  <th scope="col" className="table-header whitespace-nowrap">Kondisi</th>
                  <th scope="col" className="table-header whitespace-nowrap">Sumber</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Selisih</th>
                  <th scope="col" className="table-header whitespace-nowrap">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse" aria-hidden="true">
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-28 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-44 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-5 w-20 bg-slate-100 rounded-full" /></td>
                      <td className="table-cell"><div className="h-5 w-14 bg-slate-100 rounded-full" /></td>
                      <td className="table-cell"><div className="h-5 w-12 bg-slate-100 rounded-full ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 font-bold">Tidak ada data penerimaan</p>
                          <p className="text-xs text-slate-400 mt-1">Belum ada receiving pada rentang filter ini</p>
                        </div>
                        {activeFilterCount > 0 && (
                          <button onClick={resetFilters} className="mt-1 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold hover:bg-ink-800 transition-colors">Reset filter</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const tone = conditionTone(item.condition);
                    return (
                      <tr key={item.id} className="even:bg-overlay-60 hover:bg-surface-raised transition-colors">
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap font-mono">{item.tanggal_penerimaan}</td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.nama_depo} <span className="text-slate-400 text-xs">({item.kode_depo})</span></td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.sumber_material}</td>
                        <td className="table-cell text-sm font-mono font-medium text-slate-800 whitespace-nowrap">{item.po_transporter}</td>
                        <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{item.kode_barang}</td>
                        <td className="table-cell text-sm text-slate-800 min-w-55 max-w-75">
                          <span className="block line-clamp-2 wrap-break-word" title={item.nama_barang}>{item.nama_barang}</span>
                        </td>
                        <td className="table-cell text-sm text-right text-slate-800 tabular-nums font-bold">{item.qty_crt.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-sm text-right text-slate-600 tabular-nums">{item.qty_pcs.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap font-mono">{item.expired_date}</td>
                        <td className="table-cell whitespace-nowrap"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${tone.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />{tone.label}</span></td>
                        <td className="table-cell whitespace-nowrap"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${item.sumber === 'VALIDASI_SJ' ? 'bg-chip-primary text-accent-text border-chip-primary-border' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>{item.sumber === 'VALIDASI_SJ' ? 'SJ' : 'Manual'}</span></td>
                        <td className="table-cell text-sm text-right whitespace-nowrap">
                          {item.selisih_qty !== 0 ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${item.selisih_qty < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {item.selisih_qty > 0 ? '+' : ''}{item.selisih_qty.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="table-cell text-xs text-slate-500 max-w-[160px] truncate" title={item.notes || ''}>{item.notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-100">
            {loading && (
              <div className="p-4 space-y-3" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-overlay-60 p-4 space-y-2">
                    <div className="h-4 w-40 bg-slate-200 rounded" />
                    <div className="h-3 w-56 bg-slate-200 rounded" />
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
                <p className="text-sm text-slate-600 font-bold">Tidak ada data penerimaan</p>
                <p className="text-xs text-slate-400 mt-1">Belum ada receiving pada rentang filter ini</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="mt-3 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold">Reset filter</button>
                )}
              </div>
            )}
            {!loading && items.map((item) => {
              const tone = conditionTone(item.condition);
              const selisihTone = item.selisih_qty === 0
                ? 'bg-ink-900 text-white'
                : item.selisih_qty < 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200';
              return (
                <article key={item.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate" title={item.nama_barang}>{item.nama_barang}</p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5 truncate">{item.kode_barang} • {item.po_transporter}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold border shrink-0 ${tone.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />{tone.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-surface-raised p-2 text-center border border-slate-100">
                      <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">CRT</p>
                      <p className="font-black text-slate-900 text-sm tabular-nums">{item.qty_crt.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="rounded-xl bg-surface-raised p-2 text-center border border-slate-100">
                      <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">PCS</p>
                      <p className="font-black text-slate-900 text-sm tabular-nums">{item.qty_pcs.toLocaleString('id-ID')}</p>
                    </div>
                    <div className={`rounded-xl p-2 text-center ${selisihTone}`}>
                      <p className={`font-bold tracking-widest uppercase text-[9px] ${item.selisih_qty === 0 ? 'text-white/60' : 'text-current opacity-70'}`}>Selisih</p>
                      <p className="font-black text-sm tabular-nums">{item.selisih_qty === 0 ? '—' : `${item.selisih_qty > 0 ? '+' : ''}${item.selisih_qty.toLocaleString('id-ID')}`}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div><span className="text-slate-400">Tgl: </span><span className="font-mono font-medium text-slate-700">{item.tanggal_penerimaan} <span className="text-slate-300">({fmtDay(item.tanggal_penerimaan)})</span></span></div>
                    <div><span className="text-slate-400">Expired: </span><span className="font-mono font-medium text-slate-700">{item.expired_date || '-'}</span></div>
                    <div><span className="text-slate-400">Depo: </span><span className="font-medium text-slate-700">{item.nama_depo}</span></div>
                    <div><span className="text-slate-400">Sumber: </span><span className={`font-semibold ${item.sumber === 'VALIDASI_SJ' ? 'text-accent-text' : 'text-purple-700'}`}>{item.sumber === 'VALIDASI_SJ' ? 'SJ' : 'Manual'}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Material: </span><span className="font-medium text-slate-700">{item.sumber_material}</span></div>
                    {item.selisih_reason && <div className="col-span-2"><span className="text-slate-400">Alasan selisih: </span><span className="font-medium text-slate-700">{item.selisih_reason}</span></div>}
                  </div>
                  {item.notes && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">Catatan: {item.notes}</p>}
                </article>
              );
            })}
          </div>
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
