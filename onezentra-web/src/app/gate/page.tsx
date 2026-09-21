'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { gateTransactions, rencanaKirim, getErrorMessage } from '@/lib/api';
import SearchInput from '@/components/SearchInput';
import BarcodeScanner from '@/components/BarcodeScanner';
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
  DRAFT: 'Dokumen masih Draft. Jadwalkan terlebih dahulu di menu Rencana Kirim.',
  VERIFIED: 'Dokumen sudah diverifikasi dan menunggu proses bongkar. Tidak ada aksi gate saat ini.',
  IN_PROGRESS: 'Bongkar sedang berjalan. Gate OUT tersedia setelah status Selesai.',
  CANCELLED: 'Dokumen dibatalkan dan tidak dapat diproses di gate.',
};

// Pil status dokumen — pola yang sama dengan halaman laporan.
const RK_STATUS_STYLE: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  DRAFT: { color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200', dot: 'bg-slate-400' },
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
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${st?.bg || 'bg-slate-100'} ${st?.color || 'text-slate-600'} ${st?.border || 'border-slate-200'}`}>
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
  const [confirmAction, setConfirmAction] = useState<null | 'IN' | 'OUT' | 'VERIFY'>(null);

  const [stats, setStats] = useState<{ hariIni: number; terjadwal: number; selesai: number; total: number } | null>(null);

  const loadItems = useCallback(async () => {
    if (!hasPermission('gate.view')) return;
    setLoading(true);
    try {
      const res = await gateTransactions.list({ search: debouncedSearch, page, per_page: 20 });
      setItems(res.data.data);
      setLastPage(res.data.last_page ?? 1);
      setTotalRows(res.data.total ?? 0);
      setListError('');
    } catch (e) {
      console.error(e);
      setListError(getErrorMessage(e, 'Gagal memuat riwayat gate.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, hasPermission]);

  const loadStats = useCallback(async () => {
    if (!hasPermission('gate.view')) {
      setStats(null);
      return;
    }
    try {
      const res = await gateTransactions.stats();
      setStats({
        total: (res.data.data.total ?? 0) as number,
        hariIni: (res.data.data.hari_ini ?? 0) as number,
        terjadwal: (res.data.data.terjadwal ?? 0) as number,
        selesai: (res.data.data.selesai ?? 0) as number,
      });
    } catch {
      setStats(null);
    }
  }, [hasPermission]);

  // Debounce pencarian riwayat: tanpa ini tiap ketikan menembak API.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadStats(); }, [loadStats]);

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
      loadStats();
    } catch (e) {
      setScanResult({ success: false, message: getErrorMessage(e, 'Error') });
    } finally {
      setScanning(false);
    }
  };

  const handleGateOut = async () => {
    if (!foundRencanaKirim) return;
    setScanning(true);
    try {
      await gateTransactions.create({
        rencana_kirim_id: foundRencanaKirim.id as number,
        gate_type: 'OUTBOUND',
        nopol: foundRencanaKirim.nopol as string,
        driver_name: foundRencanaKirim.driver_name as string,
        po_transporter: foundRencanaKirim.po_transporter as string,
      });
      setScanResult({ success: true, message: 'Gate OUT berhasil dicatat. Status: Selesai' });
      setFoundRencanaKirim(null);
      setScanNoDokumen('');
      loadItems();
      loadStats();
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
      loadStats();
    } catch (e) {
      setScanResult({ success: false, message: getErrorMessage(e, 'Error') });
    } finally {
      setScanning(false);
    }
  };

  // Aksi gate tercatat permanen — selalu lewat dialog konfirmasi dulu.
  const requestConfirm = (type: 'IN' | 'OUT' | 'VERIFY') => {
    if (!foundRencanaKirim || scanning) return;
    setConfirmAction(type);
  };

  const executeConfirm = async () => {
    if (!confirmAction) return;
    setConfirmAction(null);
    if (confirmAction === 'IN') await handleGateIn();
    else if (confirmAction === 'OUT') await handleGateOut();
    else await handleVerify();
  };

  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;

  if (!hasPermission('gate.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Gate Check.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header — premium bento */}
        <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white text-slate-900 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Gate Check</h1>
              <p className="text-slate-300 text-sm">Scan PO / Nopol — IN ↔ OUT • auto status</p>
            </div>
            <div className="hidden sm:flex flex-wrap items-center gap-2 ml-auto">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white text-slate-900 px-3 py-1.5 text-xs font-black shadow">Hari ini <span className="bg-slate-900 text-white rounded-lg px-1.5 py-0.5">{stats?.hariIni ?? 0}</span></span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-bold border border-white/20">RKH Terjadwal <span className="bg-blue-500 text-white rounded-full px-1.5 py-0.5 text-[11px]">{stats?.terjadwal ?? 0}</span></span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-bold border border-white/20">RKH Selesai <span className="bg-emerald-500 text-white rounded-full px-1.5 py-0.5 text-[11px]">{stats?.selesai ?? 0}</span></span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold border border-white/10">Total <span className="text-white ml-1">{stats?.total ?? 0}</span></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 lg:sticky lg:top-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight text-slate-900">Quick Scan</h3>
                  <p className="text-xs text-slate-500">PO / Nopol • Enter untuk cari</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></span>
                  <input type="text" value={scanNoDokumen} onChange={(e) => setScanNoDokumen(e.target.value)} placeholder="PO / Nopol..." className="input-field pl-9 text-sm py-2.5 bg-slate-50 focus:bg-white" onKeyDown={(e) => e.key === 'Enter' && handleLookup()} aria-label="Nomor PO transporter" />
                </div>
                <button onClick={() => handleLookup()} disabled={lookupBusy || !hasPermission('gate.view')} className="px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 shadow shadow-primary-600/20 disabled:opacity-50">
                  {lookupBusy ? '...' : 'Cari'}
                </button>
                <button onClick={() => setShowScanner(true)} className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>
              </div>

              {foundRencanaKirim && (
                <div className="mt-4 rounded-2xl bg-slate-900 text-white p-4 shadow-lg border border-white/10">
                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div className="rounded-xl bg-white/10 backdrop-blur p-2.5 border border-white/10"><p className="text-[11px] font-bold tracking-widest text-white/60 uppercase">PO</p><p className="text-sm font-black truncate">{foundRencanaKirim.po_transporter as string}</p></div>
                    <div className="rounded-xl bg-white text-slate-900 p-2.5"><p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Nopol</p><p className="text-sm font-black font-mono truncate">{foundRencanaKirim.nopol as string}</p></div>
                    <div className="rounded-xl bg-white/10 backdrop-blur p-2.5 border border-white/10 col-span-2"><p className="text-[11px] font-bold tracking-widest text-white/60 uppercase">Driver • Status</p><p className="text-sm font-bold truncate">{foundRencanaKirim.driver_name as string} • {statusLabels[foundRencanaKirim.status as string] || (foundRencanaKirim.status as string)}</p></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {foundRencanaKirim.status === 'SCHEDULED' && hasPermission('gate.create') && (<button onClick={() => requestConfirm('IN')} disabled={scanning} className="flex-1 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-black hover:bg-slate-100 disabled:opacity-50">Gate IN →</button>)}
                    {foundRencanaKirim.status === 'CHECKED_IN' && hasPermission('rencana_kirim.edit') && (<button onClick={() => requestConfirm('VERIFY')} disabled={scanning} className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 disabled:opacity-50">Verify ✓</button>)}
                    {foundRencanaKirim.status === 'COMPLETED' && hasPermission('gate.create') && (<button onClick={() => requestConfirm('OUT')} disabled={scanning} className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white text-sm font-bold hover:bg-white/20 disabled:opacity-50">Gate OUT</button>)}
                  </div>
                  {typeof foundRencanaKirim.status === 'string' && !['SCHEDULED', 'CHECKED_IN', 'COMPLETED'].includes(foundRencanaKirim.status) && (
                    <p className="mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs leading-5 text-slate-300">
                      {STATUS_GUIDE[foundRencanaKirim.status] ?? 'Status ini tidak memiliki aksi gate.'}
                    </p>
                  )}
                  {typeof foundRencanaKirim.status === 'string' && ['SCHEDULED', 'CHECKED_IN', 'COMPLETED'].includes(foundRencanaKirim.status) &&
                    ((foundRencanaKirim.status === 'CHECKED_IN' && !hasPermission('rencana_kirim.edit')) ||
                      (foundRencanaKirim.status !== 'CHECKED_IN' && !hasPermission('gate.create'))) && (
                    <p className="mt-3 rounded-xl bg-amber-500/10 border border-amber-400/30 px-3 py-2.5 text-xs leading-5 text-amber-200">
                      Anda tidak memiliki izin untuk aksi ini. Minta akses ke admin.
                    </p>
                  )}
                </div>
              )}

          {scanResult && (
            <div className={`mt-4 p-3 rounded-xl text-sm font-medium border ${scanResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`} role={scanResult.success ? undefined : "alert"}>
              {scanResult.message}
            </div>
          )}
            </div>
          </div>
          <div className="lg:col-span-3">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {listError && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{listError}</div>
          )}
          <div className="p-4 border-b border-gray-100">
            <SearchInput
              value={search}
              onChange={(v) => setSearch(v)}
              placeholder="Cari nopol/dokumen..."
              resultCount={totalRows}
              resultLabel="transaksi"
            />
          </div>

          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full border-collapse">
              <caption className="sr-only">Riwayat transaksi gate</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-200 shadow-sm">
                  <th className="table-header w-12" scope="col">No</th>
                  <th className="table-header" scope="col">Gate Type</th>
                  <th className="table-header" scope="col">PO Transporter</th>
                  <th className="table-header" scope="col">Nopol</th>
                  <th className="table-header" scope="col">Driver</th>
                  <th className="table-header" scope="col">Status</th>
                  <th className="table-header" scope="col">Scan Time</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="animate-pulse">
                      <td className="table-cell"><div className="h-4 w-6 mx-auto rounded bg-gray-200" /></td>
                      <td className="table-cell"><div className="h-5 w-16 rounded bg-gray-200" /></td>
                      <td className="table-cell"><div className="h-4 w-28 rounded bg-gray-200" /></td>
                      <td className="table-cell"><div className="h-4 w-20 rounded bg-gray-200" /></td>
                      <td className="table-cell"><div className="h-4 w-20 rounded bg-gray-200" /></td>
                      <td className="table-cell"><div className="h-5 w-20 rounded-full bg-gray-200" /></td>
                      <td className="table-cell"><div className="h-4 w-32 rounded bg-gray-200" /></td>
                    </tr>
                  ))
                ) : items.map((item, index) => (
                  <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-primary-50/30 transition-colors`}>
                    <td className="table-cell text-center">{(page - 1) * 20 + index + 1}</td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${item.gate_type === 'INBOUND' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {item.gate_type}
                      </span>
                    </td>
                    <td className="table-cell"><span className="text-sm font-mono">{fmt(item.po_transporter)}</span></td>
                    <td className="table-cell"><span className="text-sm font-mono">{fmt(item.nopol)}</span></td>
                    <td className="table-cell"><span className="text-sm">{fmt(item.driver_name)}</span></td>
                    <td className="table-cell whitespace-nowrap">
                      <StatusPill status={item.rencana_kirim?.status as string} />
                    </td>
                    <td className="table-cell"><span className="text-sm tabular-nums">{fmtDateTime(item.scan_time)}</span></td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="table-cell text-center py-12" role="status">
                      <p className="text-gray-500 font-medium">Tidak ada transaksi gate</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={`skel-m-${i}`} className="p-4 animate-pulse">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-36 rounded bg-gray-200" />
                      <div className="h-3 w-28 rounded bg-gray-200" />
                    </div>
                    <div className="h-5 w-16 rounded-full bg-gray-200" />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="h-3 w-32 rounded bg-gray-200" />
                    <div className="h-5 w-20 rounded-full bg-gray-200" />
                  </div>
                </div>
              ))
            ) : items.map((item) => (
              <div key={item.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900">{item.po_transporter as string || '-'}</p>
                    <p className="text-xs font-mono text-slate-500">{item.nopol as string} • {item.driver_name as string}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${item.gate_type === 'INBOUND' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>{item.gate_type}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500 tabular-nums">{fmtDateTime(item.scan_time)}</p>
                  <StatusPill status={item.rencana_kirim?.status as string} />
                </div>
              </div>
            ))}
            {!loading && items.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Tidak ada transaksi</p>}
          </div>

          {lastPage > 1 && (
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <div className="flex justify-between items-center">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary disabled:opacity-50" aria-label="Halaman sebelumnya">
                  Sebelumnya
                </button>
                <span className="text-sm text-gray-600">Halaman {page} dari {lastPage}</span>
                <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary disabled:opacity-50" aria-label="Halaman berikutnya">
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
        </div>

        <BarcodeScanner
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onDetected={handleDetected}
        />

        <Modal
          open={confirmAction !== null}
          onClose={() => setConfirmAction(null)}
          title={confirmAction === 'IN' ? 'Catat Gate IN?' : confirmAction === 'OUT' ? 'Catat Gate OUT?' : 'Verifikasi Dokumen?'}
          subtitle="Periksa kembali data sebelum mencatat — aksi ini tersimpan permanen."
          size="md"
          footer={
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button type="button" onClick={() => setConfirmAction(null)} className="btn-secondary w-full sm:w-auto">Batal</button>
              <button
                type="button"
                onClick={executeConfirm}
                disabled={scanning}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 sm:w-auto ${
                  confirmAction === 'OUT' ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20' : 'btn-primary'
                }`}
              >
                {confirmAction === 'IN' ? 'Ya, Catat IN' : confirmAction === 'OUT' ? 'Ya, Catat OUT' : 'Ya, Verifikasi'}
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
                  <div key={row.label} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{row.label}</p>
                    <p className={`mt-0.5 truncate text-sm font-bold text-slate-800 ${row.mono ? 'font-mono' : ''}`}>{row.value}</p>
                  </div>
                ))}
              </div>
              <p className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs leading-5 text-slate-600">
                {confirmAction === 'IN' && 'Kendaraan masuk dicatat dan status rencana kirim berubah menjadi Check In.'}
                {confirmAction === 'OUT' && 'Pastikan kendaraan benar-benar keluar dari area depo.'}
                {confirmAction === 'VERIFY' && 'Dokumen dinyatakan terverifikasi dan status berubah menjadi Terverifikasi.'}
              </p>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
