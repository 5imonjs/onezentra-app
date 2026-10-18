'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { gateTransactions, rencanaKirim, depo, getErrorMessage } from '@/lib/api';
import SearchInput from '@/components/SearchInput';
import BarcodeScanner, { SCAN_FORMATS_1D } from '@/components/BarcodeScanner';
import Modal from '@/components/Modal';
import { useAuthStore } from '@/store/auth';

interface GateTransaction {
  id: number;
  rencana_kirim_id: number;
  gate_type: string;
  nopol: string;
  driver_name: string;
  po_transporter: string;
  status: string;
  notes: string;
  scan_time: string;
  rencana_kirim: Record<string, unknown>;
}

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Dijadwalkan',
  CHECKED_IN: 'Check In',
  VERIFIED: 'Terverifikasi',
  IN_PROGRESS: 'Diproses',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

// Panduan saat hasil scan tidak punya aksi gate (status atau izin).
const STATUS_GUIDE: Record<string, string> = {
  DRAFT: 'Dokumen masih Draft. Jadwalkan terlebih dahulu di menu Replenishment.',
  VERIFIED: 'Dokumen sudah diverifikasi dan menunggu proses bongkar. Tidak ada aksi gate saat ini.',
  IN_PROGRESS: 'Bongkar sedang berjalan. Tidak ada aksi gate saat ini.',
  CANCELLED: 'Dokumen dibatalkan dan tidak dapat diproses di gate.',
};

// Pil status dokumen — pola yang sama dengan halaman laporan.
const RK_STATUS_STYLE: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  DRAFT: { color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300', dot: 'bg-slate-400' },
  SCHEDULED: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500' },
  CHECKED_IN: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100', dot: 'bg-amber-500' },
  VERIFIED: { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-100', dot: 'bg-purple-500' },
  IN_PROGRESS: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100', dot: 'bg-orange-500' },
  COMPLETED: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-500' },
  CANCELLED: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-100', dot: 'bg-red-500' },
};

function StatusPill({ status }: { status: string | null | undefined }) {
  const st = (status && RK_STATUS_STYLE[status]) || null;
  const label = (status && statusLabels[status]) || status || '-';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${st?.bg || 'bg-slate-100'} ${st?.color || 'text-slate-600'} ${st?.border || 'border-slate-300'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-slate-400'}`} />
      {label}
    </span>
  );
}

// Format waktu deterministik id-ID — toLocaleString() polos mengikuti locale browser.
function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

export default function GatePage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<GateTransaction[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [scanNoDokumen, setScanNoDokumen] = useState('');
  const [foundRencanaKirim, setFoundRencanaKirim] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [loading, setLoading] = useState(true);
  const [kodeDepo, setKodeDepo] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [confirmAction, setConfirmAction] = useState<null | 'IN' | 'VERIFY'>(null);

  // Anti race: respons basi (filter sudah berubah) dibuang.
  const reqIdRef = useRef(0);
  // Cermin lastPage agar clamp bisa baca nilai terbaru tanpa jadi dep fetch.
  const lastPageRef = useRef(1);

  const loadItems = useCallback(async () => {
    if (!hasPermission('gate.view')) return;
    const reqId = ++reqIdRef.current;
    // Clamp sebelum request — jangan setPage di dalam fetch (picu double fetch).
    const requestPage = Math.min(Math.max(1, page), Math.max(1, lastPageRef.current));
    setLoading(true);
    try {
      const res = await gateTransactions.list({ search: debouncedSearch, page: requestPage, per_page: 20, ...(kodeDepo ? { kode_depo: kodeDepo } : {}) });
      if (reqIdRef.current !== reqId) return;
      setItems(res.data.data);
      const nextLast = res.data.last_page ?? 1;
      setLastPage(nextLast);
      lastPageRef.current = nextLast;
      setTotalRows(res.data.total ?? 0);
      setListError('');
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      console.error('[Gate]', e);
      setListError(getErrorMessage(e, 'Gagal memuat riwayat gate.'));
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [debouncedSearch, page, kodeDepo, hasPermission]);

  const loadDepots = useCallback(async () => {
    try {
      const res = await depo.list();
      const list = res.data?.data ?? [];
      setDepots(list);
      // User scoped hanya punya 1 opsi depo: kunci langsung.
      if (list.length === 1) setKodeDepo(list[0].kode_depo);
    } catch (e) {
      console.error('[Depo]', e);
    }
  }, []);

  // Debounce pencarian riwayat: tanpa ini tiap ketikan menembak API.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage((p) => (p === 1 ? p : 1));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Koreksi halaman keluar-jarak setelah lastPage diketahui (di luar fetch
  // agar tak memicu double fetch dari dalam callback fetch itu sendiri).
  useEffect(() => {
    if (page > lastPage) setPage(Math.max(1, lastPage));
  }, [page, lastPage]);

  useEffect(() => { loadDepots(); }, [loadDepots]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleLookup = async (code?: string) => {
    const value = (code?.trim() || scanNoDokumen.trim());
    if (!value || lookupBusy) return;
    setLookupBusy(true);
    try {
      const res = await gateTransactions.byNoDokumen(value);
      setFoundRencanaKirim(res.data.data);
      setScanResult(null);
    } catch (e) {
      setFoundRencanaKirim(null);
      setScanResult({ success: false, message: getErrorMessage(e, 'Rencana kirim tidak ditemukan') });
    } finally {
      setLookupBusy(false);
    }
  };

  const handleDetected = (code: string) => {
    setShowScanner(false);
    setScanNoDokumen(code);
    handleLookup(code);
  };

  const handleGateIn = async () => {
    if (!foundRencanaKirim) return;
    setScanning(true);
    try {
      await gateTransactions.create({
        rencana_kirim_id: foundRencanaKirim.id as number,
        gate_type: 'INBOUND',
        nopol: foundRencanaKirim.nopol as string,
        driver_name: foundRencanaKirim.driver_name as string,
        po_transporter: foundRencanaKirim.po_transporter as string,
      });
      setScanResult({ success: true, message: 'Gate IN berhasil dicatat. Status: Check In' });
      setFoundRencanaKirim(null);
      setScanNoDokumen('');
      loadItems();
    } catch (e) {
      setScanResult({ success: false, message: getErrorMessage(e, 'Error') });
    } finally {
      setScanning(false);
    }
  };

  const handleVerify = async () => {
    if (!foundRencanaKirim) return;
    setScanning(true);
    try {
      const res = await rencanaKirim.verify(foundRencanaKirim.id as number);
      setScanResult({ success: true, message: 'Verifikasi berhasil. Status: ' + (statusLabels[res.data.data.status as string] || res.data.data.status) });
      setFoundRencanaKirim(null);
      setScanNoDokumen('');
      loadItems();
    } catch (e) {
      setScanResult({ success: false, message: getErrorMessage(e, 'Error') });
    } finally {
      setScanning(false);
    }
  };

  // Aksi gate tercatat permanen — selalu lewat dialog konfirmasi dulu.
  const requestConfirm = (type: 'IN' | 'VERIFY') => {
    if (!foundRencanaKirim || scanning) return;
    setConfirmAction(type);
  };

  const executeConfirm = async () => {
    if (!confirmAction) return;
    setConfirmAction(null);
    if (confirmAction === 'IN') await handleGateIn();
    else await handleVerify();
  };

  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;
  // Dipakai empty-state: apakah pencarian aktif (UI saja).
  const hasSearch = search.trim().length > 0;

  if (!hasPermission('gate.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Check In Point.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Quick Scan — panel pencarian + aksi gate */}
          <div className="lg:col-span-2">
            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white shadow-sm">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Quick Scan</h2>
                    <p className="mt-0.5 text-xs text-slate-400">Scan barcode atau ketik PO / Nopol, lalu Enter</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></span>
                    <input type="text" value={scanNoDokumen} onChange={(e) => setScanNoDokumen(e.target.value)} placeholder="PO / Nopol..." className="input-field pl-9 text-sm py-2.5 bg-surface-raised focus:bg-surface-card" onKeyDown={(e) => e.key === 'Enter' && handleLookup()} aria-label="Nomor PO transporter" />
                  </div>
                  <button onClick={() => handleLookup()} disabled={lookupBusy || !hasPermission('gate.view')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-ink-800 active:scale-[0.98] disabled:opacity-50">
                    {lookupBusy ? '...' : 'Cari'}
                  </button>
                  <button onClick={() => setShowScanner(true)} aria-label="Buka scanner barcode" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-surface-card px-3 py-2.5 text-slate-700 transition-colors hover:bg-surface-raised">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>

                {foundRencanaKirim && (
                  <div className="relative mt-4 overflow-hidden rounded-2xl bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 p-4 text-white shadow-xl sm:p-5">
                    <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary-500/10 blur-2xl" />
                    <div className="relative mb-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-fg-muted">PO</p>
                        <p className="mt-0.5 break-all font-mono text-sm font-semibold text-white">{foundRencanaKirim.po_transporter as string}</p>
                      </div>
                      <div className="rounded-xl bg-surface-card p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-fg-muted">Nopol</p>
                        <p className="mt-0.5 break-all font-mono text-sm font-semibold text-slate-900">{foundRencanaKirim.nopol as string}</p>
                      </div>
                      <div className="col-span-2 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-fg-muted">Driver • Status</p>
                        <p className="mt-0.5 truncate text-sm font-semibold text-white">{foundRencanaKirim.driver_name as string} • {statusLabels[foundRencanaKirim.status as string] || (foundRencanaKirim.status as string)}</p>
                      </div>
                    </div>
                    <div className="relative flex flex-wrap gap-2">
                      {foundRencanaKirim.status === 'SCHEDULED' && hasPermission('gate.create') && (<button onClick={() => requestConfirm('IN')} disabled={scanning} className="min-h-11 flex-1 px-4 py-2.5 rounded-xl bg-surface-card text-slate-900 text-sm font-bold hover:bg-slate-100 transition-colors disabled:opacity-50">Gate IN →</button>)}
                      {foundRencanaKirim.status === 'CHECKED_IN' && hasPermission('rencana_kirim.edit') && (<button onClick={() => requestConfirm('VERIFY')} disabled={scanning} className="min-h-11 flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50">Verify ✓</button>)}
                    </div>
                    {typeof foundRencanaKirim.status === 'string' && !['SCHEDULED', 'CHECKED_IN', 'COMPLETED'].includes(foundRencanaKirim.status) && (
                        <p className="relative mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-5 text-ink-fg">
                          {STATUS_GUIDE[foundRencanaKirim.status] ?? 'Status ini tidak memiliki aksi gate.'}
                        </p>
                    )}
                    {typeof foundRencanaKirim.status === 'string' &&
                      ((foundRencanaKirim.status === 'SCHEDULED' && !hasPermission('gate.create')) ||
                        (foundRencanaKirim.status === 'CHECKED_IN' && !hasPermission('rencana_kirim.edit'))) && (
                      <p className="relative mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-200">
                        Anda tidak memiliki izin untuk aksi ini. Minta akses ke admin.
                      </p>
                    )}
                  </div>
                )}

                {scanResult && (
                  <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm font-medium ${scanResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`} role={scanResult.success ? undefined : "alert"}>
                    {scanResult.success ? (
                      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>
                    ) : (
                      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" /></svg>
                    )}
                    <span>{scanResult.message}</span>
                  </div>
                )}
              </div>
            </section>
          </div>
          <div className="lg:col-span-3">
            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-chip-primary">
                    <svg className="h-5 w-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Riwayat Gate</h2>
                    <p className="mt-0.5 text-xs text-slate-400">{totalRows} transaksi tercatat</p>
                  </div>
                </div>
                <div className="w-full sm:w-72">
                  <SearchInput
                    value={search}
                    onChange={(v) => setSearch(v)}
                    placeholder="Cari nopol/dokumen..."
                    resultCount={totalRows}
                    resultLabel="transaksi"
                  />
                </div>
                {depots.length > 1 && (
                  <div className="relative w-full sm:w-56">
                    <label htmlFor="gate-depo" className="sr-only">Filter depo</label>
                    <select
                      id="gate-depo"
                      value={kodeDepo}
                      onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
                      className="w-full appearance-none rounded-xl border border-gray-300 bg-surface-card px-3 pr-9 py-2 text-sm text-gray-900 leading-tight shadow-sm cursor-pointer focus:border-primary-500 focus:outline-none focus:ring-primary-500"
                    >
                      <option value="">Semua Depo</option>
                      {depots.map((d) => (
                        <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                  </div>
                )}
              </div>

              {listError && (
                <div role="alert" className="m-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span className="flex-1">{listError}</span>
                  <button onClick={loadItems} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold hover:bg-red-100">
                    Coba lagi
                  </button>
                </div>
              )}

              {/* Table - Desktop */}
              <div className="overflow-x-auto overflow-y-auto hidden lg:block max-h-[560px]">
                <table className="w-full min-w-190 border-collapse">
                  <caption className="sr-only">Riwayat transaksi gate</caption>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-300 bg-surface-raised">
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">No</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Gate Type</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">PO Transporter</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Nopol</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Driver</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">RK Status</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Scan Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`skel-${i}`} className="animate-pulse">
                          <td className="px-5 py-3"><div className="h-4 w-8 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="h-5 w-20 rounded-full bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="h-4 w-28 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="mx-auto h-5 w-20 rounded-full bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="ml-auto h-4 w-32 rounded bg-slate-100" /></td>
                        </tr>
                      ))
                    ) : items.map((item, index) => (
                      <tr key={item.id} className="transition-colors hover:bg-overlay-70">
                        <td className="px-5 py-3 text-sm tabular-nums text-slate-500">{(page - 1) * 20 + index + 1}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 bg-blue-50 text-blue-700 ring-blue-200">
                            {item.gate_type}
                          </span>
                        </td>
                        <td className="px-5 py-3"><span className="font-mono text-sm text-slate-700">{fmt(item.po_transporter)}</span></td>
                        <td className="px-5 py-3"><span className="font-mono text-sm text-slate-700">{fmt(item.nopol)}</span></td>
                        <td className="px-5 py-3"><span className="text-sm text-slate-700">{fmt(item.driver_name)}</span></td>
                        <td className="px-5 py-3 text-center whitespace-nowrap">
                          <StatusPill status={item.rencana_kirim?.status as string} />
                        </td>
                        <td className="px-5 py-3 text-right"><span className="text-sm tabular-nums text-slate-600">{fmtDateTime(item.scan_time)}</span></td>
                      </tr>
                    ))}
                    {!loading && items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-400">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                              {hasSearch ? (
                                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                              ) : (
                                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                              )}
                            </div>
                            {hasSearch ? (
                              <>
                                <p className="text-sm font-medium">Tidak ada hasil untuk &quot;{search}&quot;</p>
                                <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-medium">Belum ada transaksi gate</p>
                                <p className="text-xs text-slate-400">Gunakan panel Quick Scan untuk mencatat transaksi pertama.</p>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

                {/* Penjelasan untuk menghindari ambiguitas */}
                <p className="text-xs text-slate-500 mt-2">
                  <strong>Catatan:</strong> Semua transaksi gate adalah check-in kedatangan (INBOUND). <span className="font-medium ml-2">Status</span> = Status Rencana Kirim (COMPLETED = semua item sudah diverifikasi & diterima di depo).
                </p>

              {/* Mobile cards */}
              <div className="divide-y divide-gray-100 lg:hidden max-h-[560px] overflow-y-auto">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-m-${i}`} className="animate-pulse p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-36 rounded bg-slate-100" />
                          <div className="h-3 w-28 rounded bg-slate-100" />
                        </div>
                        <div className="h-5 w-16 rounded-full bg-slate-100" />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="h-3 w-32 rounded bg-slate-100" />
                        <div className="h-5 w-20 rounded-full bg-slate-100" />
                      </div>
                    </div>
                  ))
                ) : items.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                          <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .414.336.75.75.75z" /></svg>
                        </div>
                        <div>
                          <p className="font-mono text-sm font-bold text-slate-900">{item.po_transporter as string || '-'}</p>
                          <p className="text-xs text-slate-500">{item.nopol as string} • {item.driver_name as string}</p>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 bg-blue-50 text-blue-700 ring-blue-200">{item.gate_type}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs tabular-nums text-slate-500">{fmtDateTime(item.scan_time)}</p>
                      <StatusPill status={item.rencana_kirim?.status as string} />
                    </div>
                  </div>
                ))}
                {!loading && items.length === 0 && (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-slate-400">{hasSearch ? `Tidak ada hasil untuk "${search}"` : 'Belum ada transaksi gate'}</p>
                    {hasSearch && (
                      <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="mt-1 text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                    )}
                  </div>
                )}
              </div>

              {lastPage > 1 && (
                <div className="border-t border-gray-100 bg-overlay-50 px-5 py-4">
                  <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary w-full text-sm disabled:opacity-50 sm:w-auto" aria-label="Halaman sebelumnya">
                      Sebelumnya
                    </button>
                    <span className="text-xs text-slate-500 sm:text-sm">Halaman <strong className="text-slate-800">{page}</strong> dari {lastPage}</span>
                    <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary w-full text-sm disabled:opacity-50 sm:w-auto" aria-label="Halaman berikutnya">
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <BarcodeScanner
          open={showScanner}
          onClose={() => setShowScanner(false)}
          formats={SCAN_FORMATS_1D}
          onDetected={handleDetected}
        />

        <Modal
          open={confirmAction !== null}
          onClose={() => setConfirmAction(null)}
          title={confirmAction === 'IN' ? 'Catat Gate IN?' : 'Verifikasi Dokumen?'}
          subtitle="Periksa kembali data sebelum mencatat — aksi ini tersimpan permanen."
          size="md"
          footer={
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button type="button" onClick={() => setConfirmAction(null)} className="btn-secondary w-full sm:w-auto">Batal</button>
              <button
                type="button"
                onClick={executeConfirm}
                disabled={scanning}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 sm:w-auto btn-primary"
              >
                {confirmAction === 'IN' ? 'Ya, Catat IN' : 'Ya, Verifikasi'}
              </button>
            </div>
          }
        >
          {foundRencanaKirim && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'PO Transporter', value: String(foundRencanaKirim.po_transporter ?? '-'), mono: true },
                  { label: 'Nopol', value: String(foundRencanaKirim.nopol ?? '-'), mono: true },
                  { label: 'Driver', value: String(foundRencanaKirim.driver_name ?? '-'), mono: false },
                  { label: 'Status', value: statusLabels[foundRencanaKirim.status as string] || String(foundRencanaKirim.status ?? '-'), mono: false },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl bg-surface-raised border border-slate-100 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{row.label}</p>
                    <p className={`mt-0.5 truncate text-sm font-bold text-slate-800 ${row.mono ? 'font-mono' : ''}`}>{row.value}</p>
                  </div>
                ))}
              </div>
              <p className="rounded-xl bg-surface-raised border border-slate-100 px-3 py-2.5 text-xs leading-5 text-slate-600">
                {confirmAction === 'IN' && 'Kendaraan masuk dicatat dan status rencana kirim berubah menjadi Check In.'}
                {confirmAction === 'VERIFY' && 'Dokumen dinyatakan terverifikasi dan status berubah menjadi Terverifikasi.'}
              </p>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
