'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { receivings, depo, getErrorMessage } from '@/lib/api';
import { AUTHENTICATED_FILE_REL, storageFileUrl } from '@/lib/storageFile';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import Toast from '@/components/Toast';
import BarcodeScanner, { SCAN_FORMATS_1D } from '@/components/BarcodeScanner';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';

interface ReceivingItem {
  id: number;
  barcode: string;
  kode_barang: string;
  nama_barang: string;
  expected_qty: number;
  actual_qty: number;
  satuan: string;
  condition: string;
  expired_date?: string | null;
  notes: string | null;
  photo: string | null;
  scan_time: string;
}

interface Receiving {
  id: number;
  rencana_kirim_id: number;
  dock_id: number;
  status: string;
  total_expected_qty: number;
  total_received_qty: number;
  notes: string;
  actual_arrival_time: string;
  actual_start_time: string;
  actual_end_time: string;
  rencana_kirim: {
    id: number;
    po_transporter: string;
    driver_name: string;
    nopol?: string | null;
    items: RencanaRItem[];
  };
  dock: { id: number; name: string };
  items: ReceivingItem[];
}

interface RencanaRItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  jumlah: number;
  satuan: string;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  PENDING: { label: 'Menunggu', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  IN_PROGRESS: { label: 'Diproses', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  COMPLETED: { label: 'Selesai', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Dibatalkan', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const conditionLabels: Record<string, string> = {
  FISIK_BAGUS: 'Fisik Bagus',
  FISIK_RUSAK: 'Fisik Rusak',
  QTY_KURANG: 'Qty Kurang',
  ISI_KEMASAN_KURANG: 'Isi Kemasan Kurang',
  EXPIRED_TIDAK_STANDAR: 'Expired / Tidak Standar',
  LAINNYA: 'Lainnya',
};

const conditionStyle: Record<string, string> = {
  FISIK_BAGUS: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  QTY_KURANG: 'bg-amber-50 text-amber-700 ring-amber-200',
  FISIK_RUSAK: 'bg-red-50 text-red-700 ring-red-200',
  ISI_KEMASAN_KURANG: 'bg-red-50 text-red-700 ring-red-200',
  EXPIRED_TIDAK_STANDAR: 'bg-red-50 text-red-700 ring-red-200',
  LAINNYA: 'bg-slate-100 text-slate-600 ring-slate-200',
};

// Format tanggal deterministik id-ID (sama seperti Validasi — data expired yang sama mengalir ke sini).
function fmtDate(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ProgressCell({ received, expected }: { received: number; expected: number }) {
  const pct = expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0;
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-slate-300';
  return (
    <div className="inline-flex flex-col items-end gap-1 w-28">
      <span className="text-sm tabular-nums text-slate-600">
        <b className="font-semibold text-slate-900">{received}</b>
        <span className="text-slate-300"> / </span>
        {expected}
      </span>
      <span className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${received} dari ${expected} diterima (${pct}%)`}>
        <span className={`block h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

export default function ReceivingPage() {
  const { hasPermission } = useAuthStore();
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<Receiving[]>([]);
  const [loading, setLoading] = useState(true);
  // Statistik header dihitung dari total server (bukan hanya halaman aktif).
  const [statusTotals, setStatusTotals] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [kodeDepo, setKodeDepo] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [lastPage, setLastPage] = useState(1);
  const [viewItem, setViewItem] = useState<Receiving | null>(null);
  const [scanNoDokumen, setScanNoDokumen] = useState('');
  const [foundReceiving, setFoundReceiving] = useState<Receiving | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [notifiedRecipients, setNotifiedRecipients] = useState<{ to: string[]; cc: string[] } | null>(null);

  // Anti race: respons basi (filter/search sudah berubah) dibuang agar tidak
  // menimpa hasil permintaan terbaru.
  const reqIdRef = useRef(0);

  const loadItems = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const params = { search, page, per_page: 20, ...(kodeDepo ? { kode_depo: kodeDepo } : {}) };
      const res = await receivings.list(params);
      if (reqIdRef.current !== reqId) return;
      setItems(res.data.data);
      setLastPage(res.data.last_page);
      // Total per status diambil terpisah agar statistik header akurat
      // (tidak terbatas pada 20 baris halaman aktif).
      const [pending, inProgress, completed] = await Promise.all([
        receivings.list({ search, status: 'PENDING', per_page: 1, ...(kodeDepo ? { kode_depo: kodeDepo } : {}) }),
        receivings.list({ search, status: 'IN_PROGRESS', per_page: 1, ...(kodeDepo ? { kode_depo: kodeDepo } : {}) }),
        receivings.list({ search, status: 'COMPLETED', per_page: 1, ...(kodeDepo ? { kode_depo: kodeDepo } : {}) }),
      ]);
      if (reqIdRef.current !== reqId) return;
      setStatusTotals({
        total: res.data.total ?? res.data.data?.length ?? 0,
        pending: pending.data.total ?? 0,
        inProgress: inProgress.data.total ?? 0,
        completed: completed.data.total ?? 0,
      });
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setToast({ message: getErrorMessage(e, 'Gagal memuat daftar receiving.'), type: 'error' });
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [search, page, kodeDepo]);

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

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadDepots(); }, [loadDepots]);

  const handleImport = async () => {
    if (!importFile) {
      notifyGlobal('Pilih file terlebih dahulu', 'info');
      return;
    }
    setImporting(true);
    try {
      await receivings.import(importFile);
      setShowImportModal(false);
      setImportFile(null);
      notifyGlobal('Import berhasil', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Import gagal'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await receivings.export({ ...(kodeDepo ? { kode_depo: kodeDepo } : {}) });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receivings-${todayLocal()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Export dimulai', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Export gagal'), 'error');
    }
  };

  const handleTemplate = async () => {
    try {
      const res = await receivings.template();
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'receivings_template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Template diunduh', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Template gagal'), 'error');
    }
  };

  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;

  const handleSelect = (item: Receiving) => {
    if (!['PENDING', 'IN_PROGRESS'].includes(item.status)) {
      handleView(item);
      return;
    }
    setFoundReceiving(item);
    setScanNoDokumen('');
    setScanResult(null);
  };

  const handleView = async (item: Receiving) => {
    try {
      const res = await receivings.get(item.id);
      setViewItem(res.data.data);
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal memuat detail receiving.'), type: 'error' });
    }
  };

  const handleLookup = async (code?: string) => {
    const value = (code?.trim() || scanNoDokumen.trim());
    if (!value || scanning) return;
    setScanning(true);
    try {
      const res = await receivings.list({ search: value, per_page: 20 });
      const candidates: Receiving[] = res.data.data || [];
      const normalized = value.toLowerCase();
      const exact = candidates.find(
        (r) => (r.rencana_kirim?.po_transporter || '').toLowerCase() === normalized
      );
      // Scan barcode = identitas: wajib exact match. Fallback "ambil kandidat
      // pertama" berisiko menyelesaikan bongkar pada transaksi yang salah.
      const found = exact ?? null;
      setFoundReceiving(found);
      setScanResult(found
        ? null
        : { success: false, message: `Tidak ada receiving berjalan dengan barcode "${value}".` });
    } catch (e) {
      setFoundReceiving(null);
      setScanResult({ success: false, message: getErrorMessage(e, 'Receiving not found') });
    } finally {
      setScanning(false);
    }
  };

  const handleDetected = (code: string) => {
    setShowScanner(false);
    setScanNoDokumen(code);
    handleLookup(code);
  };

  const handleFinish = async () => {
    if (!foundReceiving) return;
    setScanning(true);
    try {
      const barcode = foundReceiving.rencana_kirim?.po_transporter || scanNoDokumen.trim();
      const res = await receivings.complete(foundReceiving.id, { barcode });
      const message = `${res.data.message || 'Receiving selesai.'} Notifikasi dikirim ke BLC (TO) & Admin Distribusi (CC).`;
      setScanResult({ success: true, message });
      setNotifiedRecipients({ to: ['BLC'], cc: ['Admin Distribusi'] });
      setFoundReceiving(null);
      setShowFinishConfirm(false);
      setScanNoDokumen('');
      loadItems();
    } catch (e) {
      setScanResult({ success: false, message: getErrorMessage(e, 'Error') });
      setNotifiedRecipients(null);
    } finally {
      setScanning(false);
    }
  };

  const finishSelisih = foundReceiving ? Number(foundReceiving.total_received_qty) - Number(foundReceiving.total_expected_qty) : 0;
  const foundExpected = Number(foundReceiving?.total_expected_qty ?? 0);
  const foundPct = foundExpected > 0 ? Math.min(100, Math.round((Number(foundReceiving?.total_received_qty ?? 0) / foundExpected) * 100)) : 0;
  const finishSummary = foundReceiving
    ? `PO ${foundReceiving.rencana_kirim?.po_transporter} — diterima ${foundReceiving.total_received_qty} dari ${foundReceiving.total_expected_qty} (selisih ${finishSelisih.toFixed(2)}). Aksi ini menyelesaikan receiving, melepas dock, dan mengirim notifikasi email; tidak dapat dibatalkan.`
    : '';

  const canFinish = hasPermission('receiving.edit');
  const hasSearch = search.trim().length > 0;

  if (!hasPermission('receiving.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Check Out Point.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-5">
        {/* Header — reflektif; angka status dari total server */}
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <svg className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Check Out Point</h1>
                <p className="mt-0.5 text-ink-fg-muted">Konfirmasi selesai bongkar dengan scan barcode PO transporter.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: 'Total', value: statusTotals.total, badge: 'bg-white/20 text-white', dot: 'bg-card' },
                { label: 'Menunggu', value: statusTotals.pending, badge: 'bg-amber-400 text-amber-950', dot: 'bg-amber-400' },
                { label: 'Diproses', value: statusTotals.inProgress, badge: 'bg-blue-400 text-blue-950', dot: 'bg-blue-400' },
                { label: 'Selesai', value: statusTotals.completed, badge: 'bg-emerald-400 text-emerald-950', dot: 'bg-emerald-400' },
              ].map((stat) => (
                <span key={stat.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                  <span className={`h-1.5 w-1.5 rounded-full ${stat.dot}`} />
                  {stat.label}
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums ${stat.badge}`}>{stat.value}</span>
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Konfirmasi Selesai Bongkar */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Konfirmasi Selesai Bongkar</h2>
              <p className="mt-0.5 text-xs text-slate-400">Pilih data aktif di tabel, atau scan barcode PO transporter.</p>
            </div>
            {!foundReceiving && (
              <button onClick={() => setShowScanner(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-ink-800 active:scale-[0.98]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
                Scan Barcode
              </button>
            )}
          </div>
          <div className="p-5">
            {!foundReceiving ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-linear-to-br from-slate-50/80 to-brand-wash/40 px-6 py-10 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-sm ring-1 ring-slate-200">
                  <svg className="h-6 w-6 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-slate-800">Belum ada receiving dipilih</h3>
                <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-500">
                  Scan barcode pada dokumen PO transporter, atau pilih receiving berstatus <b>Menunggu</b> / <b>Diproses</b> pada daftar di bawah.
                </p>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 p-5 text-white shadow-xl sm:p-6">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary-500/10 blur-2xl" />
                <div className="relative mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-fg-muted">PO Transporter</p>
                    <p className="mt-0.5 break-all font-mono text-sm font-semibold text-white">{foundReceiving.rencana_kirim?.po_transporter || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-fg-muted">Driver</p>
                    <p className="mt-0.5 text-sm font-medium text-white">{foundReceiving.rencana_kirim?.driver_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-fg-muted">Nopol</p>
                    <p className="mt-0.5 text-sm font-medium text-white">{foundReceiving.rencana_kirim?.nopol || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-fg-muted">Status</p>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white ring-1 ring-white/15">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusConfig[foundReceiving.status]?.dot || 'bg-slate-400'}`} />{statusConfig[foundReceiving.status]?.label || foundReceiving.status}
                    </span>
                  </div>
                </div>
                <div className="relative mb-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-fg-muted">Progres bongkar</span>
                    <span className="font-bold tabular-nums text-white">{foundReceiving.total_received_qty}<span className="text-slate-400"> / {foundReceiving.total_expected_qty}</span></span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${foundPct}%` }} />
                  </div>
                  {finishSelisih !== 0 && (
                    <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${finishSelisih > 0 ? 'bg-amber-400/20 text-amber-300' : 'bg-red-400/20 text-red-300'}`}>
                      {finishSelisih > 0 ? `Selisih +${finishSelisih.toFixed(2)}` : `Selisih ${finishSelisih.toFixed(2)}`}
                    </span>
                  )}
                </div>
                <div className="relative flex flex-wrap gap-2">
                  {['PENDING', 'IN_PROGRESS'].includes(foundReceiving.status) && canFinish && (
                    <button onClick={() => setShowFinishConfirm(true)} disabled={scanning} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-card px-4 py-2.5 text-sm font-bold text-slate-900 shadow-sm transition-all hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50">
                      {scanning ? 'Memproses...' : 'Selesai Bongkar'}
                    </button>
                  )}
                  <button onClick={() => { setFoundReceiving(null); setScanResult(null); setScanNoDokumen(''); setNotifiedRecipients(null); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 active:scale-[0.98]">
                    Pilih Lain
                  </button>
                </div>
              </div>
            )}

            {scanResult && (
              <div className={`mt-4 rounded-xl border overflow-hidden ${scanResult.success ? 'border-emerald-200' : 'border-red-200'}`}>
                <div className={`px-4 py-3 ${scanResult.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {scanResult.success ? (
                      <svg className="w-5 h-5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"/></svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" /></svg>
                    )}
                    <p className={`text-sm font-semibold ${scanResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                      {scanResult.success ? 'Bongkar Selesai' : 'Gagal'}
                    </p>
                  </div>
                  <p className={`text-sm ${scanResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                    {scanResult.message}
                  </p>
                </div>
                {scanResult.success && notifiedRecipients && (
                  <div className="border-t border-emerald-100 px-4 py-3 bg-card">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Email dikirim ke:</p>
                    <div className="flex flex-wrap gap-2">
                      {notifiedRecipients.to.map((r) => (
                        <span key={`to-${r}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                          TO: {r}
                        </span>
                      ))}
                      {notifiedRecipients.cc.map((r) => (
                        <span key={`cc-${r}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                          CC: {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Daftar Receiving */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Daftar Receiving</h2>
              <p className="mt-0.5 text-xs text-slate-400">{statusTotals.total} entri ditemukan</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari PO transporter..." resultCount={statusTotals.total} resultLabel="receiving" />
              {depots.length > 1 && (
                <div className="relative shrink-0">
                  <label htmlFor="receiving-depo" className="sr-only">Filter depo</label>
                  <select
                    id="receiving-depo"
                    value={kodeDepo}
                    onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
                    className="appearance-none py-2 pl-3 pr-9 border border-slate-300 rounded-xl bg-card text-gray-900 text-sm leading-tight shadow-sm cursor-pointer focus:outline-none focus:ring-primary-500 focus:border-primary-500 min-w-[160px]"
                  >
                    <option value="">Semua Depo</option>
                    {depots.map((d) => (
                      <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                </div>
              )}
              {hasPermission('receiving.import') && (
                <button onClick={() => setShowImportModal(true)} className="btn-secondary shrink-0">
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Import
                  </span>
                </button>
              )}
              {hasPermission('receiving.export') && (
                <button onClick={handleExport} className="btn-secondary shrink-0">
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 18v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>
                    Export
                  </span>
                </button>
              )}
              {hasPermission('receiving.template') && (
                <button onClick={handleTemplate} className="btn-secondary shrink-0">
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Template
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Table - Desktop (badan tabel scroll, header sticky) */}
          <div className="hidden md:block">
            <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
              <table className="w-full min-w-[720px] border-collapse">
                <caption className="sr-only">Daftar receiving</caption>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-300 bg-popover">
                    <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">No</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">No. PO Transporter</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Driver</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Progres</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`skel-${i}`} className="animate-pulse">
                        <td className="px-5 py-3"><div className="h-4 w-8 rounded bg-slate-100" /></td>
                        <td className="px-5 py-3"><div className="h-4 w-28 rounded bg-slate-100" /></td>
                        <td className="px-5 py-3"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                        <td className="px-5 py-3"><div className="ml-auto h-4 w-24 rounded bg-slate-100" /></td>
                        <td className="px-5 py-3"><div className="mx-auto h-5 w-16 rounded-full bg-slate-100" /></td>
                        <td className="px-5 py-3" />
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                            {hasSearch ? (
                              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                            ) : (
                              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                            )}
                          </div>
                          {hasSearch ? (
                            <>
                              <p className="text-sm font-medium">Tidak ada hasil untuk &quot;{search}&quot;</p>
                              <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                            </>
                          ) : (
                            <p className="text-sm font-medium">Belum ada receiving</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const cfg = statusConfig[item.status] || { label: item.status, bg: 'bg-popover', text: 'text-gray-600', dot: 'bg-gray-400' };
                      const isActive = foundReceiving?.id === item.id;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          className={`cursor-pointer transition-colors duration-150 ${isActive ? 'bg-chip-primary ring-1 ring-inset ring-brand-wash-strong' : 'hover:bg-overlay-50'}`}
                        >
                          <td className="px-5 py-3 text-xs font-mono text-slate-400">{(page - 1) * 20 + index + 1}</td>
                          <td className="px-5 py-3"><span className="font-mono text-sm font-semibold text-slate-900">{fmt(item.rencana_kirim?.po_transporter)}</span></td>
                          <td className="px-5 py-3 text-sm text-slate-600">{fmt(item.rencana_kirim?.driver_name)}</td>
                          <td className="px-5 py-3 text-right"><ProgressCell received={item.total_received_qty} expected={item.total_expected_qty} /></td>
                          <td className="px-5 py-3 text-center"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.text}`}><span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span></td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={(e) => { e.stopPropagation(); handleView(item); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-chip-primary hover:text-accent-text">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards - Mobile */}
          <div className="space-y-3 p-4 md:hidden max-h-[560px] overflow-y-auto">
            {loading ? (
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`skel-m-${i}`} className="rounded-2xl border border-slate-100 bg-card p-4 shadow-sm">
                    <div className="h-4 w-28 rounded bg-slate-100" />
                    <div className="mt-3 h-4 w-40 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-card p-10 text-center text-sm text-slate-400">
                {hasSearch ? 'Tidak ada hasil untuk pencarian Anda.' : 'Belum ada receiving'}
              </div>
            ) : (
              items.map((item) => {
                const cfg = statusConfig[item.status] || { label: item.status, bg: 'bg-popover', text: 'text-gray-600', dot: 'bg-gray-400' };
                const isActive = foundReceiving?.id === item.id;
                return (
                  <div key={item.id} onClick={() => handleSelect(item)} className={`cursor-pointer rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-md ${isActive ? 'border-chip-primary-border ring-1 ring-brand-wash-strong' : 'border-slate-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-bold text-slate-800">{fmt(item.rencana_kirim?.po_transporter)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {fmt(item.rencana_kirim?.driver_name)}
                          {item.rencana_kirim?.nopol ? ` · ${item.rencana_kirim.nopol}` : ''}
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.text}`}><span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <ProgressCell received={item.total_received_qty} expected={item.total_expected_qty} />
                      <button onClick={(e) => { e.stopPropagation(); handleView(item); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-chip-primary hover:text-accent-text" aria-label="Lihat detail">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          <div className="border-t border-gray-100 bg-overlay-60 px-4 py-3.5 sm:px-5">
            <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary w-full text-sm disabled:opacity-50 sm:w-auto" aria-label="Halaman sebelumnya">Sebelumnya</button>
              <span className="text-xs text-slate-500 sm:text-sm">Halaman <strong className="text-slate-800">{page}</strong> dari {lastPage}</span>
              <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary w-full text-sm disabled:opacity-50 sm:w-auto" aria-label="Halaman berikutnya">Selanjutnya</button>
            </div>
          </div>
        </section>

        <BarcodeScanner open={showScanner} onClose={() => setShowScanner(false)} formats={SCAN_FORMATS_1D} onDetected={handleDetected} />

        <ConfirmDialog
          open={showFinishConfirm}
          onClose={() => setShowFinishConfirm(false)}
          onConfirm={handleFinish}
          title="Selesaikan Bongkar?"
          message={finishSummary}
          confirmLabel="Ya, Selesaikan"
          variant={finishSelisih !== 0 ? 'warning' : 'info'}
          loading={scanning}
        />

        {/* Detail Modal — bersih, putih, fokus pada data */}
        <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Check Out Point" subtitle="Rincian barang yang diterima per PO transporter." size="xl" footer={
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => setViewItem(null)} className="btn-secondary text-sm">Tutup</button>
          </div>
        }>
          {viewItem && (
            <div className="space-y-5">
              {/* Ringkasan */}
              <div className="rounded-2xl border border-slate-300 bg-popover p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">PO Transporter</p>
                    <h3 className="text-lg font-bold tracking-tight font-mono text-slate-900">{viewItem.rencana_kirim?.po_transporter}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{viewItem.rencana_kirim?.driver_name || '-'} · {viewItem.rencana_kirim?.nopol || '-'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-card border border-slate-300 p-3 text-center min-w-[76px]">
                      <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Expected</p>
                      <p className="text-lg font-bold mt-0.5 text-slate-700 tabular-nums">{viewItem.total_expected_qty}</p>
                    </div>
                    <div className="rounded-xl bg-card border border-slate-300 p-3 text-center min-w-[76px]">
                      <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Received</p>
                      <p className="text-lg font-bold mt-0.5 text-emerald-600 tabular-nums">{viewItem.total_received_qty}</p>
                    </div>
                    {Number(viewItem.total_received_qty) - Number(viewItem.total_expected_qty) !== 0 && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center min-w-[76px]">
                        <p className="text-[9px] font-bold tracking-widest text-red-400 uppercase">Selisih</p>
                        <p className="text-lg font-bold mt-0.5 text-red-600 tabular-nums">{(Number(viewItem.total_received_qty) - Number(viewItem.total_expected_qty)).toFixed(2)}</p>
                      </div>
                    )}
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${statusConfig[viewItem.status]?.bg} ${statusConfig[viewItem.status]?.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[viewItem.status]?.dot}`} />{statusConfig[viewItem.status]?.label || viewItem.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-card rounded-2xl border border-slate-300 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Daftar Barang</h3>
                  <span className="text-[11px] text-slate-400">{viewItem.items?.length ?? 0} item</span>
                </div>
                {viewItem.items && viewItem.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1020px] border-collapse">
                      <caption className="sr-only">Detail item receiving</caption>
                      <thead>
                        <tr className="bg-popover border-b border-slate-300">
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Kode</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Nama</th>
                          <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Expected</th>
                          <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Actual</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Expired</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Catatan</th>
                          <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Foto</th>
                          <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Condition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewItem.items.map((item) => {
                          const selisih = Number(item.actual_qty) - Number(item.expected_qty);
                          return (
                          <tr key={item.id} className="even:bg-overlay-40 hover:bg-popover transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.kode_barang}</td>
                            <td className="px-4 py-3 text-sm text-slate-800 font-medium">{item.nama_barang}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-600 tabular-nums">{item.expected_qty}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900 tabular-nums">
                              {item.actual_qty}
                              {selisih !== 0 && (
                                <span className={`block text-[11px] font-bold tabular-nums ${selisih < 0 ? 'text-red-500' : 'text-amber-500'}`}>
                                  {selisih > 0 ? `+${selisih.toFixed(2)}` : selisih.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {item.expired_date ? fmtDate(item.expired_date) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                                  Belum diisi
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={item.notes || ''}>{item.notes || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {item.photo ? (
                                <a href={storageFileUrl(item.photo) ?? '#'} target="_blank" rel={AUTHENTICATED_FILE_REL} className="inline-flex items-center gap-1 text-xs text-accent-text hover:text-accent-text-strong font-medium">
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                                  Lihat
                                </a>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${conditionStyle[item.condition] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}><span className={`h-1.5 w-1.5 rounded-full ${item.condition === 'FISIK_BAGUS' ? 'bg-emerald-500' : item.condition === 'QTY_KURANG' ? 'bg-amber-500' : 'bg-red-500'}`} />{conditionLabels[item.condition] || item.condition}</span></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-4 py-12 text-center text-slate-400 text-sm">Tidak ada item</div>
                )}
              </div>
            </div>
          )}
        </Modal>

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={() => { setShowImportModal(false); setImportFile(null); }}
        title="Import Check Out Point"
        subtitle="Upload file Excel/CSV untuk mengimpor data Check Out Point"
        size="md"
        footer={
          <>
            <button onClick={() => { setShowImportModal(false); setImportFile(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleImport} disabled={importing || !importFile} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {importing ? 'Mengimpor...' : 'Import'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1" htmlFor="pilih-file">Pilih File</label>
            <input id="pilih-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-chip-primary file:text-accent-text hover:file:bg-chip-primary"
            />
            <p className="text-xs text-slate-400 mt-1">Format: xlsx, xls, csv. Kolom wajib: no_surat_jalan, nama_thl</p>
          </div>
        </div>
      </Modal>
      </div>
    </DashboardLayout>
  );
}
