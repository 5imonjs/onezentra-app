'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

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

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: 'month', label: 'Bulan Ini' },
];

export default function SelisihQtyReportPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<SelisihItem[]>([]);
  const [summary, setSummary] = useState<SelisihSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [rangePreset, setRangePreset] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);

  const selectedDepo = depots.find((d) => d.kode_depo === kodeDepo);

  const fetchData = useCallback(async () => {
    if (!hasPermission('reports.view')) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      const res = await reports.selisihQty(params);
      setItems(res.data.data);
      setSummary(res.data.summary);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat laporan'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, kodeDepo, hasPermission]);

  useEffect(() => {
    depo.list().then((res) => setDepots(res.data.data)).catch(() => {});
  }, []);

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
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      const res = await reports.selisihQtyExport(params);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-selisih-qty-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal export'));
    }
  };

  const selisihTone = !summary ? 'neutral'
    : summary.total_selisih < 0 ? 'red'
      : summary.total_selisih > 0 ? 'green' : 'neutral';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Laporan</p>
              <h1 className="text-2xl font-bold leading-tight">Laporan Selisih Qty</h1>
              <p className="text-gray-400 mt-0.5 text-sm">Rekaman otomatis selisih qty antara plan dan aktual</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {summary && (
              <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border ${selisihTone === 'red' ? 'bg-red-500/15 text-red-300 border-red-500/30' : selisihTone === 'green' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-gray-300 border-white/10'}`}>
                {summary.total_selisih > 0 ? '+' : ''}{summary.total_selisih} total selisih
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-white/20 text-gray-300">
              <svg className="w-3.5 h-3.5 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              {selectedDepo ? selectedDepo.nama_depo : 'Semua Depo'}
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Filter berdasarkan tanggal dan depo</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px]"><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari Tanggal</label><input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" /></div>
              <div className="flex-1 min-w-[150px]"><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai Tanggal</label><input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" /></div>
              <div className="flex-1 min-w-[180px]"><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label><select value={kodeDepo} onChange={(e) => setKodeDepo(e.target.value)} className="select-field text-sm py-2 bg-slate-50 focus:bg-white"><option value="">Semua Depo</option>{depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}</select></div>
              <button onClick={fetchData} disabled={loading} className="btn-primary text-sm disabled:opacity-50">{loading ? 'Memuat...' : 'Terapkan'}</button>
              <button onClick={resetFilters} className="btn-secondary text-sm disabled:opacity-50">Reset</button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m16.5 0V6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v.75" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Item</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_item}</p>
                </div>
              </div>
            </div>
            <div className="bg-linear-to-br from-primary-600 to-indigo-600 rounded-2xl shadow-lg p-4 text-white card-hover relative overflow-hidden group">
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total Selisih</p>
                  <p className="text-2xl font-black tabular-nums">{summary.total_selisih > 0 ? '+' : ''}{summary.total_selisih}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-red-500/20 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Item Kurang</p>
                  <p className="text-2xl font-black text-red-600 tabular-nums">{summary.item_kurang}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/20 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Item Lebih</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">{summary.item_lebih}</p>
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
                  <h2 className="text-base font-bold text-slate-900">Detail Selisih</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{items.length} item selisih ditemukan</p>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <caption className="sr-only">Laporan selisih kuantitas</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-200">
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
                    <tr key={i} className="animate-pulse">
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-28 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-44 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-5 w-12 bg-slate-100 rounded-full ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-32 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        <div>
                          <p className="text-sm text-slate-500 font-medium">Tidak ada data selisih</p>
                          <p className="text-xs text-slate-400 mt-1">Semua qty sesuai dengan rencana</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const minus = item.selisih_qty < 0;
                    const plus = item.selisih_qty > 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap font-mono">{formatTanggal(item.created_at)}</td>
                        <td className="table-cell text-sm font-mono text-slate-800 whitespace-nowrap">{item.po_transporter}</td>
                        <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{item.kode_barang}</td>
                        <td className="table-cell text-sm text-slate-800 min-w-[220px] max-w-[300px]">
                          <span className="block line-clamp-2 break-words" title={item.nama_barang}>{item.nama_barang}</span>
                        </td>
                        <td className="table-cell text-sm text-right text-slate-600 tabular-nums">{item.expected_qty}</td>
                        <td className="table-cell text-sm text-right text-slate-600 tabular-nums">{item.actual_qty}</td>
                        <td className="table-cell text-sm text-right whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${minus ? 'bg-red-50 text-red-700' : plus ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            <svg className={`w-3 h-3 ${plus ? 'order-last' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d={minus ? 'M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3' : 'M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18'} />
                            </svg>
                            {item.selisih_qty > 0 ? '+' : ''}{item.selisih_qty}
                          </span>
                        </td>
                        <td className="table-cell text-sm text-slate-600 min-w-[160px] max-w-[220px]">
                          <span className="block break-words" title={item.selisih_reason}>{item.selisih_reason}</span>
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
        </div>
      </div>
    </DashboardLayout>
  );
}
