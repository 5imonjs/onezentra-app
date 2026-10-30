'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';
import { useReportRowDelete } from '@/lib/useReportRowDelete';
import { ReportDeleteBar, ReportSelectCheckbox } from '@/components/ReportDeleteControls';

interface SelisihItem {
  id: number;
  created_at: string;
  po_transporter: string;
  kode_barang: string;
  nama_barang: string;
  expected_qty: number;
  actual_qty: number;
  selisih_qty: number;
  selisih_reason: string;
  notes: string;
  condition: string;
  validator_name: string;
}

interface SelisihSummary {
  total_item: number;
  total_selisih: number;
  item_kurang: number;
  item_lebih: number;
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTanggal(s: string): string {
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s;
  const tanggal = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tanggal} · ${jam}`;
}

function fmtNum(v: number): string {
  return v.toLocaleString('id-ID');
}

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: 'month', label: 'Bulan Ini' },
];

export default function SelisihQtyReportPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<SelisihItem[]>([]);
  const [summary, setSummary] = useState<SelisihSummary | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [depotError, setDepotError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [rangePreset, setRangePreset] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const reqIdRef = useRef(0);
  const canDelete = hasPermission('reports.delete');

  const selectedDepo = depots.find((d) => d.kode_depo === kodeDepo);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (dateFrom || dateTo) n += 1;
    if (kodeDepo) n += 1;
    return n;
  }, [dateFrom, dateTo, kodeDepo]);

  const fetchData = useCallback(async () => {
    if (!hasPermission('reports.selisih_qty')) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      const res = await reports.selisihQty(params);
      if (reqIdRef.current !== reqId) return;
      setItems(res.data.data);
      setSummary(res.data.summary);
      setTruncated(Boolean(res.data.meta?.truncated));
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(getErrorMessage(e, 'Gagal memuat laporan'));
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [dateFrom, dateTo, kodeDepo, hasPermission]);

  const { selectedIds, toggle, toggleAll, clear, deleting, removeSelected } = useReportRowDelete('receiving_item', () => fetchData());

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
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      const res = await reports.selisihQtyExport(params);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-selisih-qty-${todayLocal()}.xlsx`);
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

  const selisihTone = !summary ? 'neutral'
    : summary.total_selisih < 0 ? 'red'
      : summary.total_selisih > 0 ? 'green' : 'neutral';

  const canExport = !loading && !exporting && items.length > 0;
  const kurangPct = summary && summary.total_item > 0
    ? Math.round((summary.item_kurang / summary.total_item) * 100) : 0;
  const lebihPct = summary && summary.total_item > 0
    ? Math.round((summary.item_lebih / summary.total_item) * 100) : 0;

  if (!hasPermission('reports.selisih_qty')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Laporan Selisih Qty.
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
              <h1 className="text-2xl font-bold leading-tight tracking-tight">Laporan Selisih Qty</h1>
              <p className="text-ink-fg-muted mt-0.5 text-sm">Rekaman otomatis selisih qty antara plan dan aktual</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {summary && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur text-white px-3 py-1.5 text-xs font-semibold border border-white/10 tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
                {fmtNum(summary.total_item)} item
                {activeFilterCount > 0 && <span className="text-white/60">• {activeFilterCount} filter</span>}
              </span>
            )}
            {summary && (
              <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border tabular-nums ${selisihTone === 'red' ? 'bg-red-500/15 text-red-300 border-red-500/30' : selisihTone === 'green' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-ink-fg border-white/10'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${selisihTone === 'red' ? 'bg-red-400' : selisihTone === 'green' ? 'bg-emerald-400' : 'bg-gray-400'}`} aria-hidden="true" />
                {summary.total_selisih > 0 ? '+' : ''}{fmtNum(summary.total_selisih)} total selisih
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-white/20 text-ink-fg">
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

        {/* Filters */}
        <div className="bg-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-slate-50 to-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-ink-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Filter berdasarkan tanggal dan depo</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100" role="group" aria-label="Preset rentang tanggal">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} aria-pressed={rangePreset === r.key} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-card text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <div>
                <label htmlFor="sq-from" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari Tanggal</label>
                <input id="sq-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); }} className="input-field text-sm py-2 bg-popover focus:bg-card" />
              </div>
              <div>
                <label htmlFor="sq-to" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai Tanggal</label>
                <input id="sq-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); }} className="input-field text-sm py-2 bg-popover focus:bg-card" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="sq-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label>
                <select id="sq-depo" value={kodeDepo} onChange={(e) => setKodeDepo(e.target.value)} className="select-field w-full text-sm py-2 bg-popover focus:bg-card"><option value="">Semua Depo</option>{depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}</select>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400 tabular-nums" aria-live="polite">
                {activeFilterCount > 0 ? `${activeFilterCount} filter aktif` : 'Tanpa filter — seluruh data'}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-card border border-gray-300 text-sm font-semibold text-slate-600 hover:bg-popover hover:border-slate-300 transition-all">Reset</button>
                <button onClick={fetchData} disabled={loading} className="px-5 py-2 rounded-xl bg-linear-to-r from-ink-900 to-ink-800 text-white text-sm font-semibold hover:from-ink-800 hover:to-slate-700 shadow-lg disabled:opacity-50 transition-all">{loading ? 'Memuat...' : 'Terapkan Filter'}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="bg-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-ink-900 text-white flex items-center justify-center shadow-lg shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m16.5 0V6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v.75" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Item</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{fmtNum(summary.total_item)}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">item berselisih</p>
                </div>
              </div>
            </div>
            <div className="bg-linear-to-br from-primary-600 to-primary-600 rounded-2xl shadow-lg p-5 text-white card-hover relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total Selisih</p>
                  <p className="text-2xl font-black tabular-nums">{summary.total_selisih > 0 ? '+' : ''}{fmtNum(summary.total_selisih)}</p>
                  <p className="text-[11px] text-white/60">{selisihTone === 'neutral' ? 'Aman — sesuai rencana' : selisihTone === 'red' ? 'Dominan kurang' : 'Dominan lebih'}</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-red-500/20 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Item Kurang</p>
                  <p className="text-2xl font-black text-red-600 tabular-nums">{fmtNum(summary.item_kurang)}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">{kurangPct}% dari total</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/20 transition-colors" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Item Lebih</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">{fmtNum(summary.item_lebih)}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">{lebihPct}% dari total</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center shadow shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Detail Selisih</h2>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{fmtNum(items.length)} item selisih ditemukan{truncated ? ' (dibatasi 2000 terbaru — persempit rentang atau unduh export)' : ''}</p>
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
          {/* Desktop table */}
          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full min-w-[1100px] border-collapse">
              <caption className="sr-only">Laporan selisih kuantitas</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-300">
                  {canDelete && (
                    <th scope="col" className="table-header w-10 text-center">
                      <ReportSelectCheckbox
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={() => toggleAll(items.map((i) => i.id))}
                        label="Pilih semua baris laporan"
                      />
                    </th>
                  )}
                  <th scope="col" className="table-header whitespace-nowrap">Tanggal</th>
                  <th scope="col" className="table-header whitespace-nowrap">PO Transporter</th>
                  <th scope="col" className="table-header whitespace-nowrap">Kode Barang</th>
                  <th scope="col" className="table-header whitespace-nowrap">Nama Barang</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Plan</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Aktual</th>
                  <th scope="col" className="table-header text-right whitespace-nowrap">Selisih</th>
                  <th scope="col" className="table-header whitespace-nowrap">Alasan</th>
                  <th scope="col" className="table-header whitespace-nowrap">Catatan</th>
                  <th scope="col" className="table-header whitespace-nowrap">Divalidasi Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse" aria-hidden="true">
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-28 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-44 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-5 w-12 bg-slate-100 rounded-full ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-32 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={canDelete ? 11 : 10} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                          <svg className="w-7 h-7 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 font-bold">Tidak ada data selisih</p>
                          <p className="text-xs text-slate-400 mt-1">Semua qty sesuai dengan rencana</p>
                        </div>
                        {activeFilterCount > 0 && (
                          <button onClick={resetFilters} className="mt-1 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold hover:bg-ink-800 transition-colors">Reset filter</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const minus = item.selisih_qty < 0;
                    const plus = item.selisih_qty > 0;
                    return (
                      <tr key={item.id} className="even:bg-overlay-60 hover:bg-popover transition-colors">
                        {canDelete && (
                          <td className="table-cell text-center">
                            <ReportSelectCheckbox
                              checked={selectedIds.includes(item.id)}
                              onChange={() => toggle(item.id)}
                              label={`Pilih selisih qty ${item.kode_barang}`}
                            />
                          </td>
                        )}
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap font-mono">{formatTanggal(item.created_at)}</td>
                        <td className="table-cell text-sm font-mono font-medium text-slate-800 whitespace-nowrap">{item.po_transporter}</td>
                        <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{item.kode_barang}</td>
                        <td className="table-cell text-sm text-slate-800 min-w-55 max-w-75">
                          <span className="block line-clamp-2 wrap-break-word" title={item.nama_barang}>{item.nama_barang}</span>
                        </td>
                        <td className="table-cell text-sm text-right text-slate-600 tabular-nums">{fmtNum(item.expected_qty)}</td>
                        <td className="table-cell text-sm text-right text-slate-800 tabular-nums font-bold">{fmtNum(item.actual_qty)}</td>
                        <td className="table-cell text-sm text-right whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm tabular-nums ${minus ? 'bg-red-50 text-red-700' : plus ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            <svg className={`w-3 h-3 ${plus ? 'order-last' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d={minus ? 'M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3' : 'M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18'} />
                            </svg>
                            {item.selisih_qty > 0 ? '+' : ''}{fmtNum(item.selisih_qty)}
                          </span>
                        </td>
                        <td className="table-cell text-sm text-slate-600 min-w-[160px] max-w-[220px]">
                          <span className="block wrap-break-word" title={item.selisih_reason}>{item.selisih_reason}</span>
                        </td>
                        <td className="table-cell text-xs text-slate-500 max-w-[160px] truncate" title={item.notes || ''}>{item.notes || '-'}</td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.validator_name}</td>
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
                <p className="text-sm text-slate-600 font-bold">Tidak ada data selisih</p>
                <p className="text-xs text-slate-400 mt-1">Semua qty sesuai dengan rencana</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="mt-3 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold">Reset filter</button>
                )}
              </div>
            )}
            {!loading && items.map((item) => {
              const minus = item.selisih_qty < 0;
              const plus = item.selisih_qty > 0;
              return (
                <article key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate" title={item.nama_barang}>{item.nama_barang}</p>
                      <p className="mt-0.5 text-xs font-mono text-slate-500 truncate">{item.kode_barang} • {item.po_transporter}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 px-2 py-1 rounded-full text-xs font-bold shadow-sm tabular-nums ${minus ? 'bg-red-50 text-red-700' : plus ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      <svg className={`w-3 h-3 ${plus ? 'order-last' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d={minus ? 'M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3' : 'M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18'} />
                      </svg>
                      {item.selisih_qty > 0 ? '+' : ''}{fmtNum(item.selisih_qty)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-popover p-2 text-center border border-slate-100">
                      <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Plan</p>
                      <p className="font-black text-slate-600 text-sm tabular-nums">{fmtNum(item.expected_qty)}</p>
                    </div>
                    <div className="rounded-xl bg-popover p-2 text-center border border-slate-100">
                      <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Aktual</p>
                      <p className="font-black text-slate-900 text-sm tabular-nums">{fmtNum(item.actual_qty)}</p>
                    </div>
                    <div className={`rounded-xl p-2 text-center border ${minus ? 'bg-red-50 border-red-200' : plus ? 'bg-emerald-50 border-emerald-200' : 'bg-popover border-slate-100'}`}>
                      <p className={`font-bold tracking-widest uppercase text-[9px] ${minus ? 'text-red-500' : plus ? 'text-emerald-600' : 'text-slate-400'}`}>Selisih</p>
                      <p className={`font-black text-sm tabular-nums ${minus ? 'text-red-700' : plus ? 'text-emerald-700' : 'text-slate-500'}`}>{item.selisih_qty > 0 ? '+' : ''}{fmtNum(item.selisih_qty)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div className="col-span-2"><span className="text-slate-400">Waktu: </span><span className="font-mono font-medium text-slate-700">{formatTanggal(item.created_at)}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Alasan: </span><span className="font-medium text-slate-700">{item.selisih_reason || '-'}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Validator: </span><span className="font-medium text-slate-700">{item.validator_name || '-'}</span></div>
                  </div>
                  {item.notes && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">Catatan: {item.notes}</p>}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {canDelete && (
        <ReportDeleteBar count={selectedIds.length} deleting={deleting} onDelete={removeSelected} onClear={clear} />
      )}
    </DashboardLayout>
  );
}
