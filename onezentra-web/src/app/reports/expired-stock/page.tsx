'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import Link from 'next/link';
import { reports, depo, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';

type Grain = 'ledger' | 'wave';

interface ExpiredRow {
  id: number;
  grain: Grain;
  qty_sumber: string;
  row_no: number | null;
  cluster: string | null;
  sku: string | null;
  satuan: string | null;
  kode_barang: string;
  nama_barang: string;
  kode_depo: string;
  nama_depo: string;
  sumber_material: string | null;
  tanggal_penerimaan: string | null;
  tanggal_expired: string | null;
  sisa_hari: number | null;
  sisa_simpan: string | null;
  qty_crt: number;
  qty_pcs: number;
  qty_lalu_crt: number | null;
  qty_lalu_pcs: number | null;
  qty_koreksi_crt: number | null;
  qty_koreksi_pcs: number | null;
  status_kode: string;
  status_tier: string | null;
  is_expired: boolean;
  status_lalu: string | null;
  perubahan: string | null;
  rekomendasi: string | null;
  week_start: string | null;
  week_end: string | null;
  principal_1: string | null;
  principal_2: string | null;
}

interface Meta {
  grain: Grain;
  qty_sumber: string;
  status_options: string[];
  cluster_options: string[];
}

interface Summary {
  total_item: number;
  total_qty_crt: number;
  total_qty_pcs: number;
  total_koreksi?: number;
}

const STATUS_LABEL: Record<string, string> = {
  FUTURE: 'Berlaku',
  EXPIRED: 'Kedaluwarsa',
  KRITIS: 'Kritis',
  PERHATIAN: 'Perhatian',
  AMAN: 'Aman',
};

function fmtDate(value: string | null): string {
  if (!value) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

function fmtNum(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : Number(value).toLocaleString('id-ID');
}

const PER_PAGE = 25;

export default function ExpiredStockReportPage() {
  const { hasPermission } = useAuthStore();
  const canBatch = hasPermission('reports.penerimaan_batch_expired');
  const canMonitor = hasPermission('reports.view') && hasPermission('opname.view');
  const canView = canBatch || canMonitor;

  const [grain, setGrain] = useState<Grain>('ledger');
  const [rows, setRows] = useState<ExpiredRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
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
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('grain');
    if (fromUrl === 'ledger' || fromUrl === 'wave') setGrain(fromUrl);
  }, []);

  const buildParams = useCallback((): Record<string, unknown> => {
    const params: Record<string, unknown> = { grain, page, per_page: PER_PAGE };
    if (dateFrom) params.tanggal_from = dateFrom;
    if (dateTo) params.tanggal_to = dateTo;
    if (kodeDepo) params.kode_depo = kodeDepo;
    if (cluster && grain === 'ledger') params.cluster = cluster;
    if (status) params.status = status;
    if (searchApply) params.search = searchApply;
    return params;
  }, [grain, dateFrom, dateTo, kodeDepo, cluster, status, searchApply, page]);

  const load = useCallback(async () => {
    if (!canView) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await reports.expiredStock(buildParams());
      if (reqIdRef.current !== reqId) return;
      setRows(res.data.data);
      setSummary(res.data.summary);
      setMeta(res.data.meta);
      setLastPage(res.data.last_page ?? 1);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(getErrorMessage(e, 'Gagal memuat laporan stok kedaluwarsa'));
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [buildParams, canView]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    depo.list()
      .then((res) => setDepots(res.data?.data ?? []))
      .catch(() => setDepots([]));
  }, []);

  const switchGrain = (next: Grain) => {
    setGrain(next);
    setStatus('');
    setSearch('');
    setSearchApply('');
    setCluster('');
    setPage(1);
    window.history.replaceState(null, '', `?grain=${next}`);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      delete params.page;
      delete params.per_page;
      const res = await reports.expiredStockExport(params);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `laporan-stok-kedaluwarsa-${grain}-${todayLocal()}.xlsx`);
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

  const isWave = grain === 'wave';
  const statusOptions = useMemo(() => meta?.status_options ?? (isWave
    ? ['EXPIRED', 'KRITIS', 'PERHATIAN', 'AMAN']
    : ['FUTURE', 'EXPIRED']), [meta, isWave]);

  if (!canView) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-foreground">
          Anda tidak memiliki izin untuk melihat Laporan Kedaluwarsa.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-slide-up">
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm shrink-0">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-fg-muted">Laporan · satu data, dua tahap</p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight">Laporan Stok Kedaluwarsa</h1>
              <p className="text-ink-fg-muted mt-0.5 text-sm">Satu sumber data untuk data dasar penerimaan dan hasil monitoring mingguan.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white border border-white/10 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
              {fmtNum(summary?.total_item ?? 0)} baris
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-ink-fg border border-white/10 tabular-nums">
              Qty {isWave ? 'efektif' : 'mentah'} • {meta?.qty_sumber ?? (isWave ? 'efektif' : 'mentah')}
            </span>
            <Link
              href="/opname-expired"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Buka Monitoring Operasional
            </Link>
          </div>
        </div>

        <section aria-label="Penjelasan alur data" className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">Satu data, dua tahap</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Penerimaan barang → Snapshot mingguan → Opname & koreksi → Tindak lanjut.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Tab <span className="font-bold text-foreground">Data Dasar</span> memakai qty ledger mentah. Tab
            {' '}<span className="font-bold text-foreground">Hasil Monitoring</span> memakai qty efektif setelah koreksi opname, jadi angkanya bisa berbeda.
          </p>
        </section>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100" role="tablist" aria-label="Tahap laporan">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isWave}
                  onClick={() => switchGrain('ledger')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!isWave ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Data Dasar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isWave}
                  onClick={() => switchGrain('wave')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isWave ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Hasil Monitoring
                </button>
              </div>
              <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-secondary text-sm disabled:opacity-50 flex items-center gap-2">
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
              <div>
                <label htmlFor="es-from" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Dari</label>
                <input id="es-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="input-field text-sm py-2" />
              </div>
              <div>
                <label htmlFor="es-to" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Sampai</label>
                <input id="es-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="input-field text-sm py-2" />
              </div>
              <div>
                <label htmlFor="es-depo" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Depo</label>
                <select id="es-depo" value={kodeDepo} onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2">
                  <option value="">Semua Depo</option>
                  {depots.map((d) => <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="es-status" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Status</label>
                <select id="es-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2">
                  <option value="">Semua Status</option>
                  {statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="es-search" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cari</label>
                <input id="es-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setSearchApply(search.trim()); setPage(1); } }} placeholder="Kode / nama barang" className="input-field text-sm py-2" />
              </div>
            </div>
            {!isWave && (
              <div className="mt-3">
                <label htmlFor="es-cluster" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cluster</label>
                <select id="es-cluster" value={cluster} onChange={(e) => { setCluster(e.target.value); setPage(1); }} className="select-field w-full text-sm py-2">
                  <option value="">Semua Cluster</option>
                  {(meta?.cluster_options ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[1280px] border-collapse">
              <caption className="sr-only">Laporan stok kedaluwarsa</caption>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border">
                  <th scope="col" className="table-header">No</th>
                  <th scope="col" className="table-header">Produk</th>
                  <th scope="col" className="table-header">Nama</th>
                  {!isWave && <th scope="col" className="table-header">Cluster</th>}
                  <th scope="col" className="table-header">Depo</th>
                  {isWave && <th scope="col" className="table-header">Minggu</th>}
                  <th scope="col" className="table-header text-right">Qty CRT</th>
                  <th scope="col" className="table-header text-right">Qty PCS</th>
                  {isWave && <th scope="col" className="table-header text-right">Koreksi</th>}
                  <th scope="col" className="table-header">Expired</th>
                  <th scope="col" className="table-header text-right">Sisa Hari</th>
                  {!isWave && <th scope="col" className="table-header">Masa Simpan</th>}
                  <th scope="col" className="table-header">Status</th>
                  {isWave && <th scope="col" className="table-header">Perubahan</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={isWave ? 14 : 13} className="table-cell text-center py-12 text-sm text-muted-foreground">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={isWave ? 14 : 13} className="table-cell text-center py-12 text-sm text-muted-foreground">Tidak ada data.</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={`${row.grain}-${row.id}`} className="even:bg-overlay-60">
                      <td className="table-cell text-sm tabular-nums text-foreground">{row.row_no ?? fmtDate(row.week_start)}</td>
                      <td className="table-cell text-sm font-mono text-foreground">{row.sku ?? row.kode_barang}</td>
                      <td className="table-cell text-sm text-foreground">{row.nama_barang}</td>
                      {!isWave && <td className="table-cell text-sm text-foreground">{row.cluster ?? '-'}</td>}
                      <td className="table-cell text-sm text-foreground">{row.nama_depo}</td>
                      {isWave && <td className="table-cell text-sm font-mono text-foreground">{fmtDate(row.week_start)}</td>}
                      <td className="table-cell text-sm text-right font-semibold tabular-nums text-foreground">{fmtNum(row.qty_crt)}</td>
                      <td className="table-cell text-sm text-right tabular-nums text-foreground">{fmtNum(row.qty_pcs)}</td>
                      {isWave && <td className="table-cell text-sm text-right tabular-nums text-foreground">{fmtNum(row.qty_koreksi_crt)}</td>}
                      <td className="table-cell text-sm font-mono text-foreground">{fmtDate(row.tanggal_expired)}</td>
                      <td className="table-cell text-sm text-right tabular-nums text-foreground">{row.sisa_hari ?? '-'}</td>
                      {!isWave && <td className="table-cell text-sm text-foreground">{row.sisa_simpan ?? '-'}</td>}
                      <td className="table-cell text-sm text-foreground">
                        <span className="inline-flex rounded-full border border-border bg-popover px-2.5 py-1 text-xs font-semibold text-foreground">
                          {STATUS_LABEL[row.status_tier ?? row.status_kode] ?? row.status_kode}
                        </span>
                      </td>
                      {isWave && <td className="table-cell text-sm text-foreground">{row.perubahan ?? '-'}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {lastPage > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between gap-3">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-sm disabled:opacity-50">Sebelumnya</button>
              <span className="text-xs text-muted-foreground tabular-nums">Halaman {page} dari {lastPage}</span>
              <button onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page === lastPage} className="btn-secondary text-sm disabled:opacity-50">Selanjutnya</button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
