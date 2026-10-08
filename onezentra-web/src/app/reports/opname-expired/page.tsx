'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [depotError, setDepotError] = useState('');
  const reqIdRef = useRef(0);

  const selectedDepo = useMemo(
    () => depots.find((d) => d.kode_depo === kodeDepo) ?? null,
    [depots, kodeDepo],
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (kodeDepo) n += 1;
    if (statusFilter) n += 1;
    return n;
  }, [kodeDepo, statusFilter]);

  const pageNumbers = useMemo(() => {
    const lastPage = pagination?.last_page ?? 1;
    const current = pagination?.current_page ?? 1;
    const windowSize = 5;
    const start = Math.max(1, Math.min(current - 2, lastPage - windowSize + 1));
    const pages: number[] = [];
    for (let p = start; p <= Math.min(lastPage, start + windowSize - 1); p += 1) pages.push(p);
    return pages;
  }, [pagination]);

  const load = useCallback(async () => {
    if (!hasPermission('reports.view')) return;
    const reqId = ++reqIdRef.current;
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
      if (reqIdRef.current !== reqId) return;
      setWaves(res.data.data.data);
      setPagination(res.data.data);
      setWeeks(res.data.meta.weeks ?? []);
      setStatusSummary(res.data.meta.status_summary ?? {});
      setDepotSummary(res.data.meta.depot_summary ?? []);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(getErrorMessage(e, 'Gagal memuat laporan'));
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [weekStart, kodeDepo, statusFilter, page, hasPermission]);

  const loadDepots = useCallback(async () => {
    try {
      const res = await depo.list();
      setDepots(res.data?.data ?? []);
      setDepotError('');
    } catch (e) {
      console.error('[Depo]', e);
      setDepotError(getErrorMessage(e, 'Gagal memuat daftar depo.'));
    }
  }, []);

  useEffect(() => {
    loadDepots();
  }, [loadDepots]);

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

  // Parse tanggal YYYY-MM-DD secara tekstual agar tidak bergeser timezone.
  const fmtDate = (v?: string | null) => {
    if (!v) return '-';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fnum = (v: number) => v.toLocaleString('id-ID');

  const badge = (status?: string | null, meta?: { label: string; badge: string; dot: string }) => {
    const s = status || '-';
    const m = meta || STATUS_META[s] || { label: s, badge: 'bg-surface-raised text-gray-600 ring-gray-200', dot: 'bg-gray-400' };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-sm ${m.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} aria-hidden="true" />
        {m.label}
      </span>
    );
  };

  const weekEnd = (w: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(w);
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + 6 * 86400000);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const weekLabel = weekStart ? `${fmtDate(weekStart)} s.d. ${weekEnd(weekStart)}` : '';

  const canExport = !loading && !exporting && waves.length > 0;

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
            <span className="text-xs text-accent-text tabular-nums mt-0.5">koreksi {fnum(koreksiCrt)} CRT / {fnum(koreksiPcs)} PCS</span>
          )}
          {(laluCrt > 0 || laluPcs > 0) && (
            <span className="text-xs text-slate-400 tabular-nums">sebelumnya {fnum(laluCrt)} CRT / {fnum(laluPcs)} PCS</span>
          )}
        </div>
      </td>
    );
  };

  if (!hasPermission('reports.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Monitoring Batch Expired.
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
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-fg-muted">Laporan operasional · read-only</p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight">Monitoring Batch Expired</h1>
              <p className="text-ink-fg-muted mt-0.5 text-sm">Ringkasan mingguan kedaluwarsa batch per status & depo</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur text-white px-3 py-1.5 text-xs font-semibold border border-white/10 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
              {fnum(summary.totalBatch)} batch
              {activeFilterCount > 0 && <span className="text-white/60">• {activeFilterCount} filter</span>}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full backdrop-blur px-3 py-1.5 text-xs font-semibold border tabular-nums ${summary.berisikoCount > 0 ? 'bg-red-500/15 text-red-300 border-red-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${summary.berisikoCount > 0 ? 'bg-red-400' : 'bg-emerald-400'}`} aria-hidden="true" />
              {fnum(summary.berisikoCount)} berisiko • {summary.pctBerisiko}%
            </span>
            {weekLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-white/10 text-ink-fg tabular-nums">
                {weekLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-emerald-500/30 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
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
            <span className="flex-1">{error}</span>
            <button onClick={load} disabled={loading} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
              Coba lagi
            </button>
            <button onClick={() => setError('')} aria-label="Tutup pesan error" className="text-red-500 hover:text-red-700">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Filter panel */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-slate-50 to-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-ink-900 to-slate-700 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Laporan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Minggu opname, depo, dan status batch</p>
                </div>
              </div>
              {(kodeDepo || statusFilter) && (
                <button onClick={resetFilters} className="text-xs font-bold text-accent-text hover:text-accent-text transition-colors">Reset filter</button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(190px,1fr)_minmax(180px,1fr)_auto] mt-4">
              <div>
                <label htmlFor="oe-week" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Minggu Opname</label>
                <select
                  id="oe-week"
                  value={weekStart}
                  onChange={(e) => { setWeekStart(e.target.value); setPage(1); }}
                  className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card"
                >
                  <option value="">— Pilih Minggu —</option>
                  {weeks.map((w) => (
                    <option key={w} value={w}>{w} s.d. {weekEnd(w)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="oe-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label>
                <select
                  id="oe-depo"
                  value={kodeDepo}
                  onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
                  className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card"
                >
                  <option value="">Semua Depo</option>
                  {depots.map((d) => (
                    <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="oe-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status</label>
                <select
                  id="oe-status"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="select-field w-full text-sm py-2 bg-surface-raised focus:bg-surface-card"
                >
                  <option value="">Semua Status</option>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-surface-card border border-gray-300 text-sm font-semibold text-slate-600 hover:bg-surface-raised hover:border-slate-300 transition-all">Reset</button>
                <button
                  onClick={handleExport}
                  disabled={!canExport}
                  title={!canExport ? 'Tidak ada data untuk diexport' : 'Export seluruh baris terfilter ke Excel'}
                  aria-label="Export laporan ke Excel"
                  className="btn-primary py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <svg className={`w-4 h-4 ${exporting ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    {exporting ? 'Mengekspor...' : 'Export Excel'}
                  </span>
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400 tabular-nums" aria-live="polite">
                {activeFilterCount > 0 ? `${activeFilterCount} filter aktif` : 'Tanpa filter depo/status — seluruh batch minggu ini'}
              </p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className={`grid grid-cols-2 gap-4 xl:grid-cols-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-slate-100 transition-colors" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-ink-900 text-white flex items-center justify-center shadow-lg shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Batch</p>
                <p className="text-2xl font-black text-slate-900 tabular-nums">{fnum(summary.totalBatch)}</p>
                <p className="text-[11px] text-slate-400 tabular-nums">{fnum(summary.totalCrt)} CRT</p>
              </div>
            </div>
          </div>
          <div className="bg-linear-to-br from-red-600 to-orange-500 rounded-2xl shadow-lg p-5 text-white card-hover relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Batch Berisiko</p>
                <p className="text-2xl font-black tabular-nums">{fnum(summary.berisikoCount)}</p>
                <p className="text-[11px] text-white/60 tabular-nums">{fnum(summary.berisikoCrt)} CRT • {summary.pctBerisiko}%</p>
              </div>
            </div>
          </div>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/20 transition-colors" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">% Berisiko</p>
                <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.pctBerisiko}%</p>
                <p className="text-[11px] text-slate-400">dari total batch</p>
              </div>
            </div>
          </div>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 card-hover relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary-500/20 transition-colors" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-chip-primary text-accent-text flex items-center justify-center shadow-sm shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m16.5 0V6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v.75" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total CRT</p>
                <p className="text-2xl font-black text-slate-900 tabular-nums">{fnum(summary.totalCrt)}</p>
                <p className="text-[11px] text-slate-400 tabular-nums">{fnum(summary.totalBatch)} batch</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rekap per depo */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ringkasan distribusi</p>
                <h2 className="text-base font-bold text-slate-900">Rekap per Depo</h2>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{fnum(depotRows.length)} depo • {fnum(summary.totalBatch)} batch</p>
              </div>
            </div>
          </div>
          {/* Desktop */}
          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full min-w-190 border-collapse">
              <caption className="sr-only">Rekap per depo</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-300">
                  <th scope="col" className="table-header">Depo</th>
                  {STATUS_ORDER.map((s) => (
                    <th key={s} scope="col" className="table-header text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} aria-hidden="true" />
                        {STATUS_META[s].label}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="table-header text-right">Total</th>
                  <th scope="col" className="table-header text-right">Total CRT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && depotRows.length === 0 ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse" aria-hidden="true">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="table-cell"><div className="h-3.5 w-16 bg-slate-100 rounded ml-auto" /></td>
                      ))}
                    </tr>
                  ))
                ) : depotRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-cell text-center py-12">
                      <p className="text-sm text-slate-600 font-bold">Belum ada data untuk periode ini.</p>
                      {activeFilterCount > 0 && (
                        <button onClick={resetFilters} className="mt-2 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold hover:bg-ink-800 transition-colors">Reset filter</button>
                      )}
                    </td>
                  </tr>
                ) : (
                  depotRows.map((row) => {
                    const totalCount = STATUS_ORDER.reduce((a, s) => a + (row.status[s]?.count ?? 0), 0);
                    const totalCrt = STATUS_ORDER.reduce((a, s) => a + (row.status[s]?.qty_crt ?? 0), 0);
                    return (
                      <tr key={row.kode} className="even:bg-overlay-60 hover:bg-surface-raised transition-colors">
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
          {/* Mobile */}
          <div className="lg:hidden divide-y divide-gray-100">
            {loading && depotRows.length === 0 && (
              <div className="p-4 space-y-3" aria-hidden="true">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-overlay-60 p-4 space-y-2">
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      <div className="h-12 bg-slate-200 rounded-xl" />
                      <div className="h-12 bg-slate-200 rounded-xl" />
                      <div className="h-12 bg-slate-200 rounded-xl" />
                      <div className="h-12 bg-slate-200 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && depotRows.length === 0 && (
              <div className="p-10 text-center">
                <p className="text-sm text-slate-600 font-bold">Belum ada data untuk periode ini.</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="mt-3 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold">Reset filter</button>
                )}
              </div>
            )}
            {!loading && depotRows.map((row) => {
              const totalCount = STATUS_ORDER.reduce((a, s) => a + (row.status[s]?.count ?? 0), 0);
              const totalCrt = STATUS_ORDER.reduce((a, s) => a + (row.status[s]?.qty_crt ?? 0), 0);
              return (
                <div key={row.kode} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 truncate">{row.nama} <span className="ml-1 text-xs font-mono font-medium text-slate-400">{row.kode}</span></p>
                    <p className="text-xs text-slate-500 tabular-nums shrink-0">{fnum(totalCount)} batch • {fnum(totalCrt)} CRT</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {STATUS_ORDER.map((s) => {
                      const c = row.status[s];
                      return (
                        <div key={s} className="rounded-xl bg-surface-raised p-2 text-center border border-slate-100">
                          <p className="font-bold tracking-widest uppercase text-[9px] text-slate-400 inline-flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} aria-hidden="true" />
                            {STATUS_META[s].label}
                          </p>
                          <p className="font-black text-slate-900 text-sm tabular-nums">{fnum(c?.count ?? 0)}</p>
                          <p className="text-[10px] text-slate-400 tabular-nums">{fnum(c?.qty_crt ?? 0)} CRT</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail batch */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-surface-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Data detail</p>
              <h2 className="text-base font-bold text-slate-900">Detail Batch</h2>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                {statusFilter ? `Status: ${STATUS_META[statusFilter].label}` : 'Semua status'}
                {selectedDepo ? ` · ${selectedDepo.nama_depo}` : ''}
                {pagination ? ` • Menampilkan ${pagination.from ?? 0}–${pagination.to ?? 0} dari ${pagination.total} baris` : ''}
              </p>
            </div>
            {pagination && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-600 tabular-nums">
                {fnum(pagination.total)} batch
              </span>
            )}
          </div>
          {loading && waves.length === 0 ? (
            <div className="p-5 space-y-3" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-6 w-20 bg-slate-100 rounded-full" />
                  <div className="h-6 w-32 bg-slate-100 rounded" />
                  <div className="h-6 w-24 bg-slate-100 rounded" />
                  <div className="h-6 w-28 bg-slate-100 rounded flex-1" />
                </div>
              ))}
            </div>
          ) : waves.length === 0 ? (
            <div className="py-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <p className="text-sm text-slate-600 font-bold">Belum ada data batch pada kombinasi filter ini.</p>
                  <p className="text-xs text-slate-400 mt-1">Coba ubah minggu, depo, atau status</p>
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="mt-1 px-4 py-2 rounded-xl bg-ink-900 text-white text-xs font-bold hover:bg-ink-800 transition-colors">Reset filter</button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="overflow-x-auto hidden lg:block">
                <table className="w-full min-w-225 border-collapse">
                  <caption className="sr-only">Laporan opname expired</caption>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-linear-to-b from-slate-50 to-gray-100 border-b border-gray-300">
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
                        <tr key={w.id} className="even:bg-overlay-60 hover:bg-surface-raised transition-colors">
                          <td className="table-cell whitespace-nowrap">{badge(w.status_ini)}</td>
                          <td className="table-cell min-w-50 max-w-75">
                            <span className="block font-mono text-sm font-medium text-slate-800">{w.kode_barang}</span>
                            <span className="block text-xs text-slate-500 line-clamp-1 wrap-break-word" title={w.nama_barang || undefined}>{w.nama_barang || '-'}</span>
                          </td>
                          <td className="table-cell whitespace-nowrap text-sm text-slate-600">{w.nama_depo || w.kode_depo || '-'}</td>
                          {renderQtyCell(w)}
                          <td className="table-cell whitespace-nowrap text-sm text-slate-700 font-mono">{w.tanggal_penerimaan ? fmtDate(w.tanggal_penerimaan) : '-'}</td>
                          <td className="table-cell whitespace-nowrap">
                            <span className="text-sm text-slate-700 font-mono">{fmtDate(w.expired_date_ini)}</span>
                            <span className={`mt-0.5 inline-flex px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums border ${meta ? meta.chip : 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                              {w.sisa_hari} hr
                            </span>
                          </td>
                          <td className="table-cell max-w-50 text-xs text-slate-600 wrap-break-word">{w.perubahan || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards — daftar wajib tetap tampil di layar kecil */}
              <div className="lg:hidden divide-y divide-gray-100">
                {waves.map((w) => {
                  const meta = STATUS_META[w.status_ini];
                  return (
                    <article key={w.id} className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate" title={w.nama_barang || undefined}>{w.nama_barang || '-'}</p>
                          <p className="text-xs font-mono text-slate-500 mt-0.5 truncate">{w.kode_barang}</p>
                        </div>
                        {badge(w.status_ini)}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-surface-raised p-2 text-center border border-slate-100">
                          <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Qty</p>
                          <p className="font-black text-slate-900 text-sm tabular-nums">{fnum(num(w.qty_ini_crt))} <span className="text-[10px] font-bold text-slate-400">CRT</span></p>
                          {num(w.qty_ini_pcs) > 0 && <p className="text-[10px] text-slate-400 tabular-nums">/ {fnum(num(w.qty_ini_pcs))} PCS</p>}
                        </div>
                        <div className="rounded-xl bg-surface-raised p-2 text-center border border-slate-100">
                          <p className="font-bold tracking-widest text-slate-400 uppercase text-[9px]">Sisa</p>
                          <p className="font-black text-slate-900 text-sm tabular-nums">{w.sisa_hari} <span className="text-[10px] font-bold text-slate-400">hr</span></p>
                        </div>
                        <div className={`rounded-xl p-2 text-center border ${meta ? meta.chip : 'bg-surface-raised border-slate-100'}`}>
                          <p className="font-bold tracking-widest uppercase text-[9px] opacity-70">Expired</p>
                          <p className="font-black text-xs">{fmtDate(w.expired_date_ini)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div><span className="text-slate-400">Depo: </span><span className="font-medium text-slate-700">{w.nama_depo || w.kode_depo || '-'}</span></div>
                        <div><span className="text-slate-400">Diterima: </span><span className="font-mono font-medium text-slate-700">{w.tanggal_penerimaan ? fmtDate(w.tanggal_penerimaan) : '-'}</span></div>
                        <div className="col-span-2"><span className="text-slate-400">Perubahan: </span><span className="font-medium text-slate-700">{w.perubahan || '-'}</span></div>
                        {(num(w.qty_lalu_crt) > 0 || num(w.qty_lalu_pcs) > 0) && (
                          <div className="col-span-2"><span className="text-slate-400">Sebelumnya: </span><span className="font-medium text-slate-700 tabular-nums">{fnum(num(w.qty_lalu_crt))} CRT / {fnum(num(w.qty_lalu_pcs))} PCS</span></div>
                        )}
                        {num(w.qty_koreksi_crt) !== 0 && (
                          <div className="col-span-2"><span className="text-slate-400">Koreksi: </span><span className="font-medium text-accent-text tabular-nums">{fnum(num(w.qty_koreksi_crt))} CRT / {fnum(num(w.qty_koreksi_pcs))} PCS</span></div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {pagination && pagination.total > ITEMS_PER_PAGE && (
                <div className="p-4 border-t border-gray-100 bg-overlay-50">
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.current_page <= 1 || loading} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman sebelumnya">
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
                          aria-current={p === pagination.current_page ? 'page' : undefined}
                          className={`min-w-9 h-9 px-2 rounded-lg text-sm font-bold tabular-nums transition-colors ${p === pagination.current_page ? 'bg-ink-900 text-white shadow' : 'text-slate-500 hover:bg-slate-200/70'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </nav>
                    <button onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))} disabled={pagination.current_page >= pagination.last_page || loading} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman berikutnya">
                      <span className="flex items-center gap-2 text-sm">
                        Selanjutnya
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </span>
                    </button>
                  </div>
                  <p className="mt-2 text-center text-xs text-slate-400 tabular-nums">
                    Halaman {pagination.current_page} dari {pagination.last_page} • Menampilkan {pagination.from ?? 0}–{pagination.to ?? 0} dari {pagination.total} baris
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
