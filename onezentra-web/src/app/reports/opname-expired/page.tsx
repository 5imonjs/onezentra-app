'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { opnameExpired, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface Wave {
  id: number;
  kode_depo: string;
  nama_depo: string;
  kode_barang: string;
  nama_barang: string;
  sumber_material: string;
  tanggal_penerimaan: string | null;
  qty_ini_crt: number;
  qty_ini_pcs: number;
  qty_lalu_crt: number;
  qty_lalu_pcs: number;
  expired_date_ini: string;
  expired_date_lalu: string | null;
  sisa_hari: number;
  status_ini: string;
  status_lalu: string | null;
  perubahan: string;
  selisih_expired_date: number | null;
  qty_koreksi_crt: number;
  qty_koreksi_pcs: number;
}

interface StatusCount {
  count: number;
  qty_crt: number;
}

type StatusSummary = Partial<Record<string, StatusCount>>;

interface DepotSummaryRow {
  kode_depo: string;
  nama_depo: string;
  status: string;
  count: number;
  qty_crt: number;
}

interface ListMeta {
  weeks: string[];
  status_summary: StatusSummary;
  depot_summary: DepotSummaryRow[];
}

interface ListResponse {
  data: {
    data: Wave[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
  meta: ListMeta;
}

const ITEMS_PER_PAGE = 50;

const STATUS_ORDER = ['EXPIRED', 'KRITIS', 'PERHATIAN', 'AMAN'] as const;

const STATUS_META: Record<string, { label: string; badge: string; dot: string; text: string; chip: string }> = {
  EXPIRED: {
    label: 'Expired',
    badge: 'bg-red-50 text-red-700 ring-red-200',
    dot: 'bg-red-500',
    text: 'text-red-600',
    chip: 'bg-red-50 text-red-700 border border-red-200',
  },
  KRITIS: {
    label: 'Kritis',
    badge: 'bg-orange-50 text-orange-700 ring-orange-200',
    dot: 'bg-orange-500',
    text: 'text-orange-700',
    chip: 'bg-orange-50 text-orange-700 border border-orange-200',
  },
  PERHATIAN: {
    label: 'Perhatian',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    chip: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  AMAN: {
    label: 'Aman',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
};

const num = (v: unknown): number => Number(v ?? 0);

export default function OpnameExpiredReportPage() {
  const { hasPermission } = useAuthStore();
  const [waves, setWaves] = useState<Wave[]>([]);
  const [pagination, setPagination] = useState<ListResponse['data'] | null>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [statusSummary, setStatusSummary] = useState<StatusSummary>({});
  const [depotSummary, setDepotSummary] = useState<DepotSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const selectedDepo = useMemo(
    () => depots.find((d) => d.kode_depo === kodeDepo) ?? null,
    [depots, kodeDepo],
  );

  const load = useCallback(async () => {
    if (!hasPermission('reports.view')) return;
    setLoading(true);
    setError('');
    try {
      const res = await opnameExpired.list({
        week_start: weekStart || undefined,
        kode_depo: kodeDepo || undefined,
        status: statusFilter || undefined,
        per_page: ITEMS_PER_PAGE,
        page,
      }) as { data: ListResponse };
      setWaves(res.data.data.data);
      setPagination(res.data.data);
      setWeeks(res.data.meta.weeks ?? []);
      setStatusSummary(res.data.meta.status_summary ?? {});
      setDepotSummary(res.data.meta.depot_summary ?? []);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat laporan'));
    } finally {
      setLoading(false);
    }
  }, [weekStart, kodeDepo, statusFilter, page, hasPermission]);

  useEffect(() => {
    depo.list().then((res) => setDepots(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (weeks.length > 0 && !weekStart) setWeekStart(weeks[0]);
  }, [weeks, weekStart]);

  const summary = useMemo(() => {
    const totalBatch = STATUS_ORDER.reduce((a, s) => a + (statusSummary[s]?.count ?? 0), 0);
    const berisikoCount = ['EXPIRED', 'KRITIS', 'PERHATIAN'].reduce((a, s) => a + (statusSummary[s]?.count ?? 0), 0);
    const berisikoCrt = ['EXPIRED', 'KRITIS', 'PERHATIAN'].reduce((a, s) => a + (statusSummary[s]?.qty_crt ?? 0), 0);
    const totalCrt = STATUS_ORDER.reduce((a, s) => a + (statusSummary[s]?.qty_crt ?? 0), 0);
    return {
      totalBatch,
      berisikoCount,
      berisikoCrt,
      totalCrt,
      pctBerisiko: totalBatch > 0 ? Math.round((berisikoCount / totalBatch) * 100) : 0,
    };
  }, [statusSummary]);

  const depotRows = useMemo(() => {
    const map = new Map<string, { kode: string; nama: string; status: Record<string, StatusCount> }>();
    for (const r of depotSummary) {
      if (!map.has(r.kode_depo)) {
        map.set(r.kode_depo, { kode: r.kode_depo, nama: r.nama_depo, status: {} });
      }
      map.get(r.kode_depo)!.status[r.status] = { count: r.count, qty_crt: r.qty_crt };
    }
    return Array.from(map.values());
  }, [depotSummary]);

  const resetFilters = () => {
    setKodeDepo('');
    setStatusFilter('');
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, unknown> = {};
      if (weekStart) params.week_start = weekStart;
      if (kodeDepo) params.kode_depo = kodeDepo;
      if (statusFilter) params.status = statusFilter;
      const res = await opnameExpired.export(params);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-opname-expired-${weekStart || 'now'}.xlsx`);
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

  const fmtDate = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const fnum = (v: number) => v.toLocaleString('id-ID');

  const badge = (status?: string | null, meta?: { label: string; badge: string; dot: string }) => {
    const s = status || '-';
    const m = meta || STATUS_META[s] || { label: s, badge: 'bg-gray-50 text-gray-600 ring-gray-200', dot: 'bg-gray-400' };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
        {m.label}
      </span>
    );
  };

  const weekEnd = (w: string) =>
    new Date(new Date(w).getTime() + 6 * 86400000).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

  const renderQtyCell = (w: Wave) => {
    const crt = num(w.qty_ini_crt);
    const pcs = num(w.qty_ini_pcs);
    const koreksiCrt = num(w.qty_koreksi_crt);
    const koreksiPcs = num(w.qty_koreksi_pcs);
    const laluCrt = num(w.qty_lalu_crt);
    const laluPcs = num(w.qty_lalu_pcs);

    return (
      <td className="table-cell text-right whitespace-nowrap tabular-nums">
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-slate-800">{fnum(crt)} CRT</span>
          {pcs > 0 && <span className="text-xs text-slate-400">/ {fnum(pcs)} PCS</span>}
          {koreksiCrt !== 0 && (
            <span className="text-xs text-primary-600 tabular-nums mt-0.5">koreksi {fnum(koreksiCrt)} CRT / {fnum(koreksiPcs)} PCS</span>
          )}
          {(laluCrt > 0 || laluPcs > 0) && (
            <span className="text-xs text-slate-400 tabular-nums">sebelumnya {fnum(laluCrt)} CRT / {fnum(laluPcs)} PCS</span>
          )}
        </div>
      </td>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Laporan operasional · read-only</p>
              <h1 className="text-2xl font-bold leading-tight">Laporan Opname Expired</h1>
              <p className="text-gray-400 mt-0.5 text-sm">Ringkasan mingguan kedaluwarsa batch per status & depo</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" /></svg>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-400">Total Batch</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{fnum(summary.totalBatch)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-400">Batch Berisiko</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{fnum(summary.berisikoCount)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-400">% Berisiko</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{summary.pctBerisiko}%</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m16.5 0V6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v.75" /></svg>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-400">Total CRT</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{fnum(summary.totalCrt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rekap per depo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ringkasan distribusi</p>
            <h2 className="text-base font-bold text-slate-900">Rekap per Depo</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <caption className="sr-only">Rekap per depo</caption>
              <thead className="sticky top-0 z-10">
<tr className="bg-gray-50 border-b border-gray-200">
                       <th scope="col" className="table-header">Depo</th>
                  {STATUS_ORDER.map((s) => (
                    <th key={s} scope="col" className="table-header text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />
                        {STATUS_META[s].label}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="table-header text-right">Total</th>
                  <th scope="col" className="table-header text-right">Total CRT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {depotRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-cell text-center py-12 text-sm text-slate-400">
                      {loading ? 'Memuat…' : 'Belum ada data untuk periode ini.'}
                    </td>
                  </tr>
                ) : (
                  depotRows.map((row) => {
                    const totalCount = STATUS_ORDER.reduce((a, s) => a + (row.status[s]?.count ?? 0), 0);
                    const totalCrt = STATUS_ORDER.reduce((a, s) => a + (row.status[s]?.qty_crt ?? 0), 0);
                    return (
                      <tr key={row.kode} className="hover:bg-slate-50/50 transition-colors">
                        <td className="table-cell whitespace-nowrap">
                          <span className="text-sm font-semibold text-slate-700">{row.nama}</span>
                          <span className="ml-1.5 text-xs text-slate-400 font-mono">{row.kode}</span>
                        </td>
                        {STATUS_ORDER.map((s) => {
                          const c = row.status[s];
                          return (
                            <td key={s} className="table-cell text-right whitespace-nowrap tabular-nums">
                              {c ? (
                                <span className="text-sm font-medium text-slate-700">{fnum(c.count)}</span>
                              ) : (
                                <span className="text-sm text-slate-200">0</span>
                              )}
                              <span className={`block text-xs ${c ? 'text-slate-400' : 'text-slate-200'}`}>{fnum(c?.qty_crt ?? 0)} CRT</span>
                            </td>
                          );
                        })}
                        <td className="table-cell text-right text-sm font-semibold tabular-nums text-slate-800 whitespace-nowrap">{fnum(totalCount)}</td>
                        <td className="table-cell text-right text-sm font-semibold tabular-nums text-slate-800 whitespace-nowrap">{fnum(totalCrt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Filter panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Minggu opname, depo, dan status batch</p>
                </div>
              </div>
              {(kodeDepo || statusFilter) && (
                <button onClick={resetFilters} className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">Reset filter</button>
              )}
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(190px,1fr)_minmax(180px,1fr)_auto]">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Minggu Opname</label>
                <select
                  value={weekStart}
                  onChange={(e) => { setWeekStart(e.target.value); setPage(1); }}
                  className="select-field text-sm py-2.5 bg-slate-50 focus:bg-white"
                >
                  <option value="">— Pilih Minggu —</option>
                  {weeks.map((w) => (
                    <option key={w} value={w}>{w} s.d. {weekEnd(w)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Depo</label>
                <select
                  value={kodeDepo}
                  onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
                  className="select-field text-sm py-2.5 bg-slate-50 focus:bg-white"
                  aria-label="Filter depo laporan"
                >
                  <option value="">Semua Depo</option>
                  {depots.map((d) => (
                    <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="select-field text-sm py-2.5 bg-slate-50 focus:bg-white"
                >
                  <option value="">Semua Status</option>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting || loading}
                className="btn-primary self-end py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2">
                  {exporting ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  )}
                  {exporting ? 'Exporting...' : 'Export Excel'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Detail batch */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Data detail</p>
              <h2 className="text-base font-bold text-slate-900">Detail Batch</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {statusFilter ? `Status: ${STATUS_META[statusFilter].label}` : 'Semua status'}
                {selectedDepo ? ` · ${selectedDepo.nama_depo}` : ''}
              </p>
            </div>
            {pagination && (
              <span className="inline-flex items-center px-3 py-1 rounded bg-gray-100 text-xs font-medium text-slate-600 tabular-nums">
                {fnum(pagination.total)} batch
              </span>
            )}
          </div>
          {loading && waves.length === 0 ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-6 w-20 bg-slate-100 rounded animate-pulse" />
                  <div className="h-6 w-32 bg-slate-100 rounded animate-pulse" />
                  <div className="h-6 w-24 bg-slate-100 rounded animate-pulse" />
                  <div className="h-6 w-28 bg-slate-100 rounded animate-pulse flex-1" />
                </div>
              ))}
            </div>
          ) : waves.length === 0 ? (
            <div className="py-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-sm text-slate-500 font-medium">Belum ada data batch pada kombinasi filter ini.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <caption className="sr-only">Laporan opname expired</caption>
                  <thead className="sticky top-0 z-10">
<tr className="bg-gray-50 border-b border-gray-200">
                       <th scope="col" className="table-header">Status</th>
                      <th scope="col" className="table-header">Produk</th>
                      <th scope="col" className="table-header">Depo</th>
                      <th scope="col" className="table-header text-right">Qty</th>
                      <th scope="col" className="table-header">Tgl Penerimaan</th>
                      <th scope="col" className="table-header">Expired</th>
<th scope="col" className="table-header">Perubahan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {waves.map((w) => {
const meta = STATUS_META[w.status_ini];
                       return (
                        <tr key={w.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="table-cell whitespace-nowrap">{badge(w.status_ini)}</td>
                          <td className="table-cell min-w-[200px] max-w-[300px]">
                            <span className="block font-mono text-sm font-medium text-slate-800">{w.kode_barang}</span>
                            <span className="block text-xs text-slate-500 line-clamp-1 break-words" title={w.nama_barang || undefined}>{w.nama_barang || '-'}</span>
                          </td>
                          <td className="table-cell whitespace-nowrap text-sm text-slate-600">{w.nama_depo || w.kode_depo || '-'}</td>
                          {renderQtyCell(w)}
                          <td className="table-cell whitespace-nowrap text-sm text-slate-700">{w.tanggal_penerimaan ? fmtDate(w.tanggal_penerimaan) : '-'}</td>
                          <td className="table-cell whitespace-nowrap">
                            <span className="text-sm text-slate-700">{fmtDate(w.expired_date_ini)}</span>
                            <span className={`block mt-0.5 inline-flex px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${meta ? meta.chip : 'bg-slate-100 text-slate-600'}`}>
                              {w.sisa_hari} hr
                            </span>
                          </td>
<td className="table-cell max-w-[200px] text-xs text-slate-600 break-words">{w.perubahan || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pagination && pagination.total > ITEMS_PER_PAGE && (
                <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 tabular-nums">
                    Menampilkan {pagination.from ?? 0}–{pagination.to ?? 0} dari {pagination.total} baris
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.current_page <= 1}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs text-slate-600 tabular-nums px-2">Hal {pagination.current_page} / {pagination.last_page}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                      disabled={pagination.current_page >= pagination.last_page}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
