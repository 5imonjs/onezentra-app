'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
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

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: 'month', label: 'Bulan Ini' },
];

const conditionTone = conditionMeta;

export default function PenerimaanReportPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<PenerimaanRow[]>([]);
  const [summary, setSummary] = useState<PenerimaanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [sumber, setSumber] = useState('');
  const [search, setSearch] = useState('');
  const [searchApply, setSearchApply] = useState('');
  const [rangePreset, setRangePreset] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);

  const selectedDepo = depots.find((d) => d.kode_depo === kodeDepo);

  const fetchData = useCallback(async () => {
    if (!hasPermission('reports.view')) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.tanggal_from = dateFrom;
      if (dateTo) params.tanggal_to = dateTo;
      if (kodeDepo) params.kode_depo = kodeDepo;
      if (sumber) params.sumber = sumber;
      if (searchApply) params.search = searchApply;
      const res = await reports.penerimaan(params);
      setItems(res.data.data);
      setSummary(res.data.summary);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat laporan'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, kodeDepo, sumber, searchApply, hasPermission]);

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
    setSumber('');
    setSearch('');
    setSearchApply('');
  };

  const handleExport = async () => {
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
      link.setAttribute('download', `laporan-penerimaan-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal export'));
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearchApply(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const submit = () => {
    setSearchApply(search.trim());
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-slide-up">
        {/* Header */}
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Laporan</p>
              <h1 className="text-2xl font-bold leading-tight">Laporan Penerimaan</h1>
              <p className="text-gray-400 mt-0.5 text-sm">Ledger receiving • SJ + manual • sumber opname</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {summary && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur text-white px-3 py-1.5 text-xs font-semibold border border-white/10">{summary.total_item} item • {summary.item_sj} SJ • {summary.item_manual} manual</span>
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

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Item</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_item}</p>
                </div>
              </div>
            </div>
            <div className="bg-linear-to-br from-primary-600 to-indigo-600 rounded-2xl shadow-lg p-5 text-white card-hover relative overflow-hidden group">
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur text-primary-300 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Qty CRT</p>
                  <p className="text-2xl font-black tabular-nums">{summary.total_qty_crt.toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Qty PCS</p>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.total_qty_pcs.toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>
            <div className={`rounded-2xl shadow-sm border p-5 card-hover relative overflow-hidden group ${summary.total_selisih === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className={`absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 ${summary.total_selisih === 0 ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`} />
              <div className="relative flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow ${summary.total_selisih === 0 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Selisih</p>
                  <p className={`text-2xl font-black tabular-nums ${summary.total_selisih === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{summary.total_selisih > 0 ? '+' : ''}{summary.total_selisih}</p>
                </div>
              </div>
            </div>
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
                  <p className="text-xs text-slate-500">Tanggal • Depo • Sumber • Cari</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => applyRange(r.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${rangePreset === r.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
              <div><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Dari</label><input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" /></div>
              <div><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sampai</label><input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); }} className="input-field text-sm py-2 bg-slate-50 focus:bg-white" /></div>
              <div><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label><select value={kodeDepo} onChange={(e) => setKodeDepo(e.target.value)} className="select-field text-sm py-2 bg-slate-50 focus:bg-white"><option value="">Semua Depo</option>{depots.map((d) => (<option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>))}</select></div>
              <div><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sumber</label><select value={sumber} onChange={(e) => setSumber(e.target.value)} className="select-field text-sm py-2 bg-slate-50 focus:bg-white"><option value="">Semua</option><option value="VALIDASI_SJ">Validasi SJ</option><option value="IMPORT_MANUAL">Manual</option></select></div>
              <div className="lg:col-span-2"><label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cari</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></span><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Kode, nama, PO, driver…" className="input-field text-sm py-2 pl-9 bg-slate-50 focus:bg-white" /></div></div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">Reset</button>
              <button onClick={submit} disabled={loading} className="px-5 py-2 rounded-xl bg-linear-to-r from-slate-900 to-slate-800 text-white text-sm font-semibold hover:from-slate-800 hover:to-slate-700 shadow-lg disabled:opacity-50 transition-all">{loading ? 'Memuat...' : 'Terapkan Filter'}</button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Detail Penerimaan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{items.length} item ditemukan</p>
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
              <caption className="sr-only">Laporan penerimaan</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-200">
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
                    <tr key={i} className="animate-pulse">
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-28 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-44 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                      <td className="table-cell"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-16 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-14 bg-slate-100 rounded" /></td>
                      <td className="table-cell"><div className="h-3.5 w-10 bg-slate-100 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        <div>
                          <p className="text-sm text-slate-500 font-medium">Tidak ada data penerimaan</p>
                          <p className="text-xs text-slate-400 mt-1">Belum ada receiving pada rentang filter ini</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const tone = conditionTone(item.condition);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap font-mono">{item.tanggal_penerimaan}</td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.nama_depo} <span className="text-slate-400 text-xs">({item.kode_depo})</span></td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.sumber_material}</td>
                        <td className="table-cell text-sm font-mono text-slate-800 whitespace-nowrap">{item.po_transporter}</td>
                        <td className="table-cell text-sm font-mono text-slate-600 whitespace-nowrap">{item.kode_barang}</td>
                        <td className="table-cell text-sm text-slate-800 min-w-[220px] max-w-[300px]">
                          <span className="block line-clamp-2 break-words" title={item.nama_barang}>{item.nama_barang}</span>
                        </td>
                        <td className="table-cell text-sm text-right text-slate-600 tabular-nums font-semibold">{item.qty_crt.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-sm text-right text-slate-600 tabular-nums">{item.qty_pcs.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{item.expired_date}</td>
                        <td className="table-cell"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${tone.badge}`}>{tone.label}</span></td>
                        <td className="table-cell"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${item.sumber === 'VALIDASI_SJ' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}`}>{item.sumber === 'VALIDASI_SJ' ? 'SJ' : 'Manual'}</span></td>
                        <td className="table-cell text-sm text-right whitespace-nowrap">
                          {item.selisih_qty !== 0 ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${item.selisih_qty < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {item.selisih_qty > 0 ? '+' : ''}{item.selisih_qty}
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
            {items.map((item) => (
              <div key={item.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{item.nama_barang}</p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">{item.kode_barang} • {item.po_transporter}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${conditionTone(item.condition).badge}`}>{conditionTone(item.condition).label}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2 text-center border border-slate-100">
                    <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">CRT</p>
                    <p className="font-black text-slate-900 text-sm">{item.qty_crt}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 text-center border border-slate-100">
                    <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">PCS</p>
                    <p className="font-black text-slate-900 text-sm">{item.qty_pcs}</p>
                  </div>
                  <div className="rounded-xl bg-slate-900 text-white p-2 text-center">
                    <p className="font-bold tracking-widest text-white/60 uppercase text-[9px]">Selisih</p>
                    <p className="font-black text-sm">{item.selisih_qty || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 text-center border border-slate-100">
                    <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Tgl</p>
                    <p className="font-black text-slate-900 text-sm">{item.tanggal_penerimaan.split('-')[2]}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{item.nama_depo} • {item.sumber_material}</p>
                {item.notes && <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 mt-1">📝 {item.notes}</p>}
              </div>
            ))}
            {items.length === 0 && !loading && <p className="p-8 text-center text-sm text-slate-400">Tidak ada data</p>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
