'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { receivings, getErrorMessage, API_ROOT } from '@/lib/api';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import Toast from '@/components/Toast';
import BarcodeScanner from '@/components/BarcodeScanner';
import { useAuthStore } from '@/store/auth';

interface ReceivingItem {
  id: number;
  barcode: string;
  kode_barang: string;
  nama_barang: string;
  expected_qty: number;
  actual_qty: number;
  satuan: string;
  condition: string;
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
  const [items, setItems] = useState<Receiving[]>([]);
  // Statistik header dihitung dari total server (bukan hanya halaman aktif).
  const [statusTotals, setStatusTotals] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [viewItem, setViewItem] = useState<Receiving | null>(null);
  const [scanNoDokumen, setScanNoDokumen] = useState('');
  const [foundReceiving, setFoundReceiving] = useState<Receiving | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await receivings.list({ search, page, per_page: 20 });
      setItems(res.data.data);
      setLastPage(res.data.last_page);
      // Total per status diambil terpisah agar statistik header akurat
      // (tidak terbatas pada 20 baris halaman aktif).
      const [pending, inProgress, completed] = await Promise.all([
        receivings.list({ search, status: 'PENDING', per_page: 1 }),
        receivings.list({ search, status: 'IN_PROGRESS', per_page: 1 }),
        receivings.list({ search, status: 'COMPLETED', per_page: 1 }),
      ]);
      setStatusTotals({
        total: res.data.total ?? res.data.data?.length ?? 0,
        pending: pending.data.total ?? 0,
        inProgress: inProgress.data.total ?? 0,
        completed: completed.data.total ?? 0,
      });
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal memuat daftar receiving.'), type: 'error' });
    }
  }, [search, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

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
      setScanResult({ success: true, message: res.data.message || 'Receiving selesai.' });
      setFoundReceiving(null);
      setScanNoDokumen('');
      loadItems();
    } catch (e) {
      setScanResult({ success: false, message: getErrorMessage(e, 'Error') });
    } finally {
      setScanning(false);
    }
  };

  const canFinish = hasPermission('receiving.edit');
  const hasSearch = search.trim().length > 0;

  return (
    <DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-6">
        {/* Header — tenang, tanpa ornament; angka dari total server */}
        <header className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Receiving</h1>
                <p className="text-slate-400 text-sm mt-0.5">Konfirmasi selesai bongkar dengan scan barcode PO transporter.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {[
                { label: 'Total', value: statusTotals.total, badge: 'bg-white/15 text-white' },
                { label: 'Menunggu', value: statusTotals.pending, badge: 'bg-amber-500/90 text-white' },
                { label: 'Diproses', value: statusTotals.inProgress, badge: 'bg-blue-500/90 text-white' },
                { label: 'Selesai', value: statusTotals.completed, badge: 'bg-emerald-500/90 text-white' },
              ].map((stat) => (
                <span key={stat.label} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300">
                  {stat.label}
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${stat.badge}`}>{stat.value}</span>
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Konfirmasi Selesai Bongkar — satu-satunya titik fokus warna di halaman ini */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Konfirmasi Selesai Bongkar</h2>
              <p className="text-xs text-slate-400">Pilih data aktif di tabel, atau scan barcode PO transporter.</p>
            </div>
            {!foundReceiving && (
              <button onClick={() => setShowScanner(true)} className="btn-primary text-sm inline-flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
                Scan Barcode
              </button>
            )}
          </div>
          <div className="p-5">
            {!foundReceiving ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-center">
                <p className="text-sm leading-6 text-slate-500 max-w-xl mx-auto">
                  Scan barcode pada dokumen PO transporter, atau pilih receiving berstatus <b>Menunggu</b> / <b>Diproses</b> pada daftar di bawah.
                </p>
              </div>
            ) : (
              <div className="p-4 sm:p-5 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">PO Transporter</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5 font-mono">{foundReceiving.rencana_kirim?.po_transporter}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Driver</span>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">{foundReceiving.rencana_kirim?.driver_name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Nopol</span>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">{foundReceiving.rencana_kirim?.nopol || '-'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Status</span>
                    <span className={`inline-flex items-center gap-1.5 mt-1 rounded-full px-2.5 py-1 text-xs font-bold ${statusConfig[foundReceiving.status]?.bg} ${statusConfig[foundReceiving.status]?.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[foundReceiving.status]?.dot}`} />{statusConfig[foundReceiving.status]?.label || foundReceiving.status}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['PENDING', 'IN_PROGRESS'].includes(foundReceiving.status) && canFinish && (
                    <button onClick={handleFinish} disabled={scanning} className="btn-primary disabled:opacity-50 text-sm">
                      {scanning ? 'Memproses...' : 'Selesai Bongkar'}
                    </button>
                  )}
                  <button onClick={() => { setFoundReceiving(null); setScanResult(null); setScanNoDokumen(''); }} className="btn-secondary text-sm">Pilih Lain</button>
                  <button onClick={() => handleView(foundReceiving)} className="btn-secondary text-sm">Detail</button>
                </div>
              </div>
            )}

            {scanResult && (
              <div className={`mt-4 p-4 rounded-xl ${scanResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                <p className={`text-sm font-medium ${scanResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                  {scanResult.message}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Daftar Receiving */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Daftar Receiving</h2>
              <p className="text-xs text-slate-400">{statusTotals.total} entri ditemukan</p>
            </div>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari PO transporter..." resultCount={statusTotals.total} resultLabel="receiving" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <caption className="sr-only">Daftar receiving</caption>
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider opacity-60">No</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">No. PO Transporter</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">Driver</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider">Progres</th>
                  <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const cfg = statusConfig[item.status] || { label: item.status, bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' };
                  const isActive = foundReceiving?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className={`cursor-pointer transition-colors duration-150 ${isActive ? 'bg-primary-50 ring-1 ring-inset ring-primary-200' : 'even:bg-slate-50/40 hover:bg-slate-50'}`}
                    >
                      <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">{(page - 1) * 20 + index + 1}</td>
                      <td className="px-4 py-3"><span className="text-sm font-semibold text-slate-900 font-mono">{fmt(item.rencana_kirim?.po_transporter)}</span></td>
                      <td className="px-4 py-3 text-sm text-slate-600">{fmt(item.rencana_kirim?.driver_name)}</td>
                      <td className="px-4 py-3 text-right"><ProgressCell received={item.total_received_qty} expected={item.total_expected_qty} /></td>
                      <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.text}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span></td>
                      <td className="px-4 py-3 text-right"><button onClick={(e) => { e.stopPropagation(); handleView(item); }} className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Detail</button></td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          {hasSearch ? (
                            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                          ) : (
                            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                          )}
                        </div>
                        {hasSearch ? (
                          <>
                            <p className="text-sm font-medium">Tidak ada hasil untuk &quot;{search}&quot;</p>
                            <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="text-xs font-semibold text-primary-600 hover:underline">Hapus pencarian</button>
                          </>
                        ) : (
                          <p className="text-sm font-medium">Belum ada receiving</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3.5 sm:px-5 border-t border-slate-100 bg-slate-50/60">
            <div className="flex flex-col-reverse sm:flex-row gap-3 justify-between items-center">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary w-full sm:w-auto text-sm disabled:opacity-50" aria-label="Halaman sebelumnya">Sebelumnya</button>
              <span className="text-xs sm:text-sm text-slate-500">Halaman <strong className="text-slate-800">{page}</strong> dari {lastPage}</span>
              <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary w-full sm:w-auto text-sm disabled:opacity-50" aria-label="Halaman berikutnya">Selanjutnya</button>
            </div>
          </div>
        </section>

        <BarcodeScanner open={showScanner} onClose={() => setShowScanner(false)} onDetected={handleDetected} />

        {/* Detail Modal — bersih, putih, fokus pada data */}
        <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Receiving" size="xl" footer={
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => setViewItem(null)} className="btn-secondary text-sm">Tutup</button>
          </div>
        }>
          {viewItem && (
            <div className="space-y-5">
              {/* Ringkasan */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">PO Transporter</p>
                    <h3 className="text-lg font-bold tracking-tight font-mono text-slate-900">{viewItem.rencana_kirim?.po_transporter}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{viewItem.rencana_kirim?.driver_name || '-'} · {viewItem.rencana_kirim?.nopol || '-'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white border border-slate-200 p-3 text-center min-w-[76px]">
                      <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Expected</p>
                      <p className="text-lg font-bold mt-0.5 text-slate-700 tabular-nums">{viewItem.total_expected_qty}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-3 text-center min-w-[76px]">
                      <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Received</p>
                      <p className="text-lg font-bold mt-0.5 text-emerald-600 tabular-nums">{viewItem.total_received_qty}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${statusConfig[viewItem.status]?.bg} ${statusConfig[viewItem.status]?.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[viewItem.status]?.dot}`} />{statusConfig[viewItem.status]?.label || viewItem.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Daftar Barang</h3>
                  <span className="text-[11px] text-slate-400">{viewItem.items?.length ?? 0} item</span>
                </div>
                {viewItem.items && viewItem.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse">
                      <caption className="sr-only">Detail item receiving</caption>
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">Kode</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">Nama</th>
                          <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider">Expected</th>
                          <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider">Actual</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">Catatan</th>
                          <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Foto</th>
                          <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Condition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewItem.items.map((item) => (
                          <tr key={item.id} className="even:bg-slate-50/40 hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.kode_barang}</td>
                            <td className="px-4 py-3 text-sm text-slate-800 font-medium">{item.nama_barang}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-600 tabular-nums">{item.expected_qty}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900 tabular-nums">{item.actual_qty}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={item.notes || ''}>{item.notes || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {item.photo ? (
                                <a href={item.photo.startsWith('http') ? item.photo : `${API_ROOT}/storage/${item.photo}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                                  Lihat
                                </a>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center"><span className="inline-flex px-2 py-0.5 rounded text-xs font-medium">{item.condition}</span></td>
                          </tr>
                        ))}
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
      </div>
    </DashboardLayout>
  );
}
