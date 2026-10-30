'use client';

import { Fragment, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BarcodeScanner, { SCAN_FORMATS_1D, SCAN_FORMATS_QR } from '@/components/BarcodeScanner';
import { opnameExpired, opnameSessions, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { formatDateId } from '@/lib/dates';
import { CONDITIONS, conditionRequiresPhoto } from '@/lib/condition';

export interface SessionDetailItem {
  id: number;
  wave_id: number;
  batch_id: number | null;
  batch?: { batch_number: string; barcode_label?: string | null } | null;
  qty_fisik_crt: number | null;
  qty_fisik_pcs: number | null;
  condition: string | null;
  photo: string | null;
  notes: string | null;
  verified_at: string | null;
  verified_by: number | null;
  // Qty acuan sistem untuk batch ini (diisi backend show) — pembanding
  // hitung fisik. Null bila sumber tak ketemu (baris warisan). Di JSON
  // Laravel decimal:2 tiba sebagai string, karenanya number | string.
  expected_crt?: number | string | null;
  expected_pcs?: number | string | null;
  wave?: {
    id: number;
    kode_barang: string;
    nama_barang: string | null;
    kode_depo: string;
    nama_depo: string | null;
    expired_date_ini: string;
    qty_ini_crt: number;
    qty_ini_pcs: number;
    status_ini: string;
  } | null;
}

export interface SessionDetail {
  id: number;
  week_start: string;
  week_end: string;
  kode_depo: string;
  nama_depo: string | null;
  assigned_to: number;
  status: string;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  assignee?: { id: number; full_name: string; email: string } | null;
  items?: SessionDetailItem[];
}

const STATUS_META: Record<string, string> = {
  OPEN: 'bg-slate-100 text-foreground',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-700',
};

const fmtDate = formatDateId;

// Alur baku sesi dalam 4 langkah (dihilangkan untuk CANCELLED):
// Buat & tugaskan → Mulai → Hitung fisik → Selesai (& label terbit).
// Titik alur saat ini: OPEN → 2, IN_PROGRESS → 3, COMPLETED → 4.
const FLOW_STEPS = [
  { key: 'create', label: 'Buat & tugaskan' },
  { key: 'start', label: 'Mulai' },
  { key: 'count', label: 'Hitung fisik' },
  { key: 'finish', label: 'Selesai & label' },
] as const;

function FlowStepper({ status }: { status: string }) {
  const current = status === 'COMPLETED' ? 4 : status === 'IN_PROGRESS' ? 3 : 2;
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {FLOW_STEPS.map((s, i) => {
        const idx = i + 1;
        const state = idx < current ? 'done' : idx === current ? 'current' : 'next';
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={[
                'inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-bold leading-none',
                state === 'done' ? 'bg-emerald-100 text-emerald-700' : state === 'current' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400',
              ].join(' ')}
            >
              {state === 'done' ? '✓' : idx}
            </span>
            <span className={state === 'current' ? 'font-bold text-foreground' : state === 'done' ? 'text-foreground' : 'text-slate-400'}>
              {s.label}
            </span>
            {idx < FLOW_STEPS.length && <span className="text-slate-300" aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

// Panduan langkah berikutnya per status — menghilangkan tebakan user.
const STATUS_HINTS: Record<string, string> = {
  OPEN: 'Belum dimulai — klik "Mulai Sesi" dulu; setelah itu petugas bisa scan label & verifikasi tiap baris.',
  IN_PROGRESS: 'Scan label tiap batch → isi qty fisik → verifikasi. "Selesaikan" aktif setelah semua baris terverifikasi.',
  COMPLETED: 'Sesi selesai: selisih tiap batch tercatat di wave, label diterbitkan, dan e-mail konfirmasi terkirim.',
  CANCELLED: 'Sesi dibatalkan — tidak ada hasil yang ditulis ke wave.',
};

export function SessionDetailModal({ sessionId, detail, detailLoading, progress, canEdit, canAdd, onClose, onChanged }: {
  sessionId: number;
  detail: SessionDetail | null;
  detailLoading: boolean;
  progress: { done: number; total: number };
  canEdit: boolean;
  canAdd: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'complete' | 'cancel'>(null);
  const [showAddWaves, setShowAddWaves] = useState(false);
  // Cari batch: ketik kode / scan kamera. Daftar tersaring ke yang cocok.
  const [batchQuery, setBatchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  // Identifikasi batch: scan kamera (via=scan) atau tombol manual untuk
  // label rusak (via=manual). Form verifikasi terkunci sampai salah satunya.
  const [identified, setIdentified] = useState<Record<number, 'scan' | 'manual'>>({});
  // Hanya satu baris yang form hitungnya terbuka pada satu waktu (= item yang
  // sedang dihitung), sisanya baris ringkas sebagai antrean.
  const [activeId, setActiveId] = useState<number | null>(null);
  // Hitung buta secara default (praktik WMS: angka acuan disembunyikan agar
  // petugas menghitung sungguhan, bukan menyamakan). Bisa di-opt-in per sesi,
  // pola "Show Expected Quantity" di Odoo. Preferensi tidak di-reset saat
  // pindah sesi.
  const [showExpected, setShowExpected] = useState(false);
  const [forms, setForms] = useState<Record<number, { qty_fisik_crt: string; qty_fisik_pcs: string; condition: string; notes: string; photo: File | null }>>({});

  useEffect(() => {
    setBatchQuery('');
    setHighlightId(null);
    setIdentified({});
    setActiveId(null);
    setForms({});
  }, [sessionId]);

  const setForm = (id: number, patch: Partial<{ qty_fisik_crt: string; qty_fisik_pcs: string; condition: string; notes: string; photo: File | null }>) =>
    setForms((p) => {
      const prev = p[id] ?? { qty_fisik_crt: '', qty_fisik_pcs: '', condition: 'FISIK_BAGUS', notes: '', photo: null };
      return { ...p, [id]: { ...prev, ...patch } };
    });

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      notifyGlobal(okMsg, 'success');
      await onChanged();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (item: SessionDetailItem) => {
    const f = forms[item.id];
    if (!f?.qty_fisik_crt) {
      notifyGlobal('Isi qty fisik CRT dulu.', 'error');
      return;
    }
    const via = identified[item.id];
    if (!via) {
      notifyGlobal('Scan / identifikasi batch dulu sebelum verifikasi.', 'error');
      return;
    }
    // Sejajar validasi penerimaan: kondisi bermasalah wajib foto.
    if (conditionRequiresPhoto(f.condition) && !f.photo) {
      notifyGlobal('Kondisi ini wajib disertai foto bukti.', 'error');
      return;
    }
    const fd = new FormData();
    fd.append('qty_fisik_crt', f.qty_fisik_crt);
    if (f.qty_fisik_pcs) fd.append('qty_fisik_pcs', f.qty_fisik_pcs);
    if (f.condition) fd.append('condition', f.condition);
    if (f.notes) fd.append('notes', f.notes);
    if (f.photo) fd.append('photo', f.photo);
    fd.append('identified_via', via);
    await act(() => opnameSessions.verifyItem(sessionId, item.id, fd), 'Baris terverifikasi, label diterbitkan bila perlu.');

    // Kembalikan fokus ke antrean: form yang sudah terverifikasi tertutup,
    // baris berikutnya tinggal di-scan.
    setIdentified((p) => {
      const n = { ...p };
      delete n[item.id];
      return n;
    });
    setActiveId((a) => (a === item.id ? null : a));
    // Bersihkan form baris ini agar file/kondisi lama tak ikut terkirim ulang.
    setForms((p) => {
      const next = { ...p };
      delete next[item.id];
      return next;
    });
  };

  const open = detail?.status === 'OPEN' || detail?.status === 'IN_PROGRESS';
  // Form hitung & scan hanya saat sesi BERJALAN — "Mulai Sesi" wajib dulu
  // (backend 422 bila belum; alur baku OPEN → IN_PROGRESS → COMPLETED).
  const canCount = detail?.status === 'IN_PROGRESS';
  const remaining = progress.total - progress.done;

  const q = batchQuery.trim().toLowerCase();
  const matchCode = (it: SessionDetailItem, needle: string): boolean => {
    if (!needle) return true;
    // Kode fisik yang di-scan adalah BARCODE label (LBL-xxx), sedangkan
    // nomor batch (BATCH-xxx) untuk identifikasi manual — cocokkan keduanya.
    return (it.batch?.batch_number || '').toLowerCase().includes(needle)
      || (it.batch?.barcode_label || '').toLowerCase().includes(needle)
      || (it.wave?.kode_barang || '').toLowerCase().includes(needle)
      || (it.wave?.nama_barang || '').toLowerCase().includes(needle);
  };
  const matchExact = (it: SessionDetailItem, needle: string): boolean => {
    if (!needle) return false;
    const n = needle.toLowerCase();
    return (it.batch?.batch_number || '').toLowerCase() === n
      || (it.batch?.barcode_label || '').toLowerCase() === n;
  };
  const visibleItems = (detail?.items ?? []).filter((it) => matchCode(it, q));

  const focusItem = (id: number) => {
    setHighlightId(id);
    const el = document.getElementById(`session-item-${id}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2500);
  };

  const identify = (id: number, via: 'scan' | 'manual') => {
    setIdentified((p) => ({ ...p, [id]: via }));
    setActiveId(id);
    focusItem(id);
  };

  const clearIdentification = (id: number) => {
    setIdentified((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setActiveId((a) => (a === id ? null : a));
  };

  return (
    <>
      <Modal open onClose={onClose} title={`Sesi #${sessionId}`} subtitle={detail ? `${fmtDate(detail.week_start)} · ${detail.nama_depo || detail.kode_depo} · ${detail.assignee?.full_name || ''}` : ''} size="xl"
        footer={<button onClick={onClose} className="btn-secondary">Tutup</button>}>
        {detailLoading || !detail ? <p className="text-sm text-muted-foreground">Memuat...</p> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${STATUS_META[detail.status] || STATUS_META.OPEN}`}>{detail.status}</span>
              {canEdit && open && detail.status === 'OPEN' && (
                <button onClick={() => act(() => opnameSessions.start(sessionId), 'Sesi dimulai.')} disabled={busy} className="btn-primary text-sm disabled:opacity-50">Mulai Sesi</button>
              )}
              {canEdit && open && (
                <>
                  <button
                    onClick={() => setConfirm('complete')}
                    disabled={busy || remaining > 0}
                    title={remaining > 0 ? `Masih ada ${remaining} baris belum terverifikasi.` : undefined}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {remaining > 0 ? `Selesaikan (sisa ${remaining})` : 'Selesaikan'}
                  </button>
                  <button onClick={() => setConfirm('cancel')} disabled={busy} className="btn-secondary text-sm disabled:opacity-50">Batalkan</button>
                </>
              )}
              {canAdd && open && (
                <button onClick={() => setShowAddWaves(true)} disabled={busy} title="Tambah wave minggu+depo ini yang belum masuk sesi" className="btn-secondary text-sm disabled:opacity-50">+ Tambah wave</button>
              )}
              {canCount && remaining > 0 && (
                <label
                  className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer ml-auto"
                  title="Hitung buta: angka acuan disembunyikan agar petugas menghitung sungguhan. Centang untuk menampilkannya di baris yang sedang dihitung (pola Show Expected Quantity)."
                >
                  <input type="checkbox" checked={showExpected} onChange={(e) => setShowExpected(e.target.checked)} className="w-4 h-4 accent-primary-600" />
                  Tampilkan qty acuan sistem
                </label>
              )}
            </div>

            {detail.status !== 'CANCELLED' && <FlowStepper status={detail.status} />}

            {STATUS_HINTS[detail.status] && (
              <p className="text-xs text-foreground bg-popover/70 border border-border rounded-lg px-3 py-2">
                {STATUS_HINTS[detail.status]}
              </p>
            )}

            {progress.total > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                  <div
                    className={`h-full rounded-full transition-all ${progress.done === progress.total ? 'bg-emerald-500' : 'bg-primary-600'}`}
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {progress.done}/{progress.total} terverifikasi
                  {remaining > 0 ? ` · sisa ${remaining}` : ''}
                </span>
              </div>
            )}

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 p-3 bg-card/95 backdrop-blur border-b border-border">
                <div className="relative flex-1 min-w-[200px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  <input
                    value={batchQuery}
                    onChange={(e) => setBatchQuery(e.target.value)}
                    placeholder="Cari kode batch / produk..."
                    className="input-field pl-9 py-2 text-sm"
                    aria-label="Cari kode batch atau produk"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="btn-secondary text-sm"
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zm9.75 0c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM3.75 13.125c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zm9.75 0c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" /></svg>
                    Scan
                  </span>
                </button>
                {q && (
                  <span className="text-xs text-muted-foreground">{visibleItems.length} cocok</span>
                )}
              </div>

              {(detail.items ?? []).length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada baris dalam sesi ini.</p>
              ) : (
                <div className="max-h-[560px] overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[900px] border-collapse">
                    <caption className="sr-only">Daftar batch sesi opname</caption>
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-popover">
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kode Barang</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produk</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hasil</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visibleItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Tidak ada baris cocok dengan pencarian.</td>
                        </tr>
                      ) : visibleItems.map((it) => {
                        const isVerified = Boolean(it.verified_at);
                        const via = identified[it.id];
                        const formOpen = via && activeId === it.id;
                        const expectedCrt = it.expected_crt != null ? Number(it.expected_crt) : null;
                        const expectedPcs = it.expected_pcs != null ? Number(it.expected_pcs) : null;

                        let diffCrt: number | null = null;
                        if (isVerified && it.qty_fisik_crt != null && expectedCrt != null) {
                          diffCrt = Number(it.qty_fisik_crt) - expectedCrt;
                        }

                        return (
                          <Fragment key={it.id}>
                            <tr id={`session-item-${it.id}`} className={`transition-colors ${highlightId === it.id ? 'bg-amber-50' : 'hover:bg-overlay-50'}`}>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="font-mono text-sm font-semibold">{it.wave?.kode_barang}</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className="font-mono text-xs px-1.5 py-0.5 rounded bg-popover text-foreground"
                                  title={`Batch ${it.batch?.batch_number || '-'} · Barcode ${it.batch?.barcode_label || '-'}`}
                                >
                                  {it.batch?.batch_number || 'tanpa batch'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-foreground max-w-[280px]">
                                <span className="block truncate">{it.wave?.nama_barang || '-'}</span>
                                <span className="text-gray-400">exp {fmtDate(it.wave?.expired_date_ini)}</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {isVerified
                                  ? <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Terverifikasi{f(it.qty_fisik_crt)}</span>
                                  : <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Belum</span>}
                              </td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                {isVerified && expectedCrt != null ? (
                                  <div className="space-y-0.5">
                                    <span className="block text-foreground">
                                      Fisik {it.qty_fisik_crt} CRT{it.qty_fisik_pcs != null ? ` / ${it.qty_fisik_pcs} PCS` : ''}{it.condition ? ` · ${it.condition}` : ''}
                                    </span>
                                    <span className="block text-muted-foreground">Acuan {expectedCrt} CRT{expectedPcs != null ? ` / ${expectedPcs} PCS` : ''}</span>
                                    <span className={`block ${diffCrt === 0 ? 'text-muted-foreground' : diffCrt != null && diffCrt < 0 ? 'text-red-600 font-semibold' : diffCrt != null ? 'text-emerald-600 font-semibold' : ''}`}>
                                      {diffCrt === 0 ? 'Sesuai' : diffCrt != null ? (diffCrt < 0 ? `Selisih ${diffCrt}` : `Selisih +${diffCrt}`) : ''}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {!isVerified && canEdit && canCount ? (
                                  via
                                    ? (formOpen
                                        ? <span className="text-xs font-semibold text-emerald-700">Form terbuka</span>
                                        : (
                                          <div className="text-right">
                                            <span className="text-xs font-semibold text-emerald-700">Teridentifikasi ({via === 'scan' ? 'scan' : 'manual'})</span>
                                            <div className="mt-1 flex justify-end gap-2">
                                              <button type="button" onClick={() => setActiveId(it.id)} className="font-semibold text-primary-700 underline hover:text-primary-900">Isi form</button>
                                              <button type="button" onClick={() => clearIdentification(it.id)} className="text-slate-400 hover:text-red-500 underline">Batalkan</button>
                                            </div>
                                          </div>
                                        ))
                                    : (
                                      <div className="text-right">
                                        <button type="button" onClick={() => setShowScanner(true)} className="btn-secondary text-xs">Scan label</button>
                                        <div className="mt-1.5">
                                          <button
                                            type="button"
                                            onClick={() => identify(it.id, 'manual')}
                                            title="Hanya bila label fisik rusak tak terbaca — tercatat sebagai identifikasi manual"
                                            className="text-xs font-semibold text-muted-foreground underline hover:text-foreground"
                                          >
                                            Label rusak — identifikasi manual
                                          </button>
                                        </div>
                                      </div>
                                    )
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                            {formOpen && (
                              <tr className="bg-popover/50">
                                <td colSpan={6} className="px-4 py-3">
                                  {showExpected && expectedCrt != null && (
                                    <p className="text-xs text-muted-foreground">
                                      Acuan sistem: {expectedCrt} CRT{expectedPcs != null ? ` / ${expectedPcs} PCS` : ''}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-semibold text-emerald-700">Teridentifikasi ({via === 'scan' ? 'scan' : 'manual'})</span>
                                    <button type="button" onClick={() => clearIdentification(it.id)} className="text-slate-400 hover:text-red-500 underline">Tutup form</button>
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                                    <div>
                                      <label htmlFor={`vf-crt-${it.id}`} className="block text-[11px] font-semibold text-muted-foreground mb-1">Fisik CRT *</label>
                                      <input id={`vf-crt-${it.id}`} min="0" step="1" type="number" value={forms[it.id]?.qty_fisik_crt || ''} onChange={(e) => setForm(it.id, { qty_fisik_crt: e.target.value })} className="input-field text-sm" />
                                    </div>
                                    <div>
                                      <label htmlFor={`vf-pcs-${it.id}`} className="block text-[11px] font-semibold text-muted-foreground mb-1">Fisik PCS</label>
                                      <input id={`vf-pcs-${it.id}`} min="0" step="1" type="number" value={forms[it.id]?.qty_fisik_pcs || ''} onChange={(e) => setForm(it.id, { qty_fisik_pcs: e.target.value })} className="input-field text-sm" />
                                    </div>
                                    <div>
                                      <label htmlFor={`vf-cond-${it.id}`} className="block text-[11px] font-semibold text-muted-foreground mb-1">Kondisi</label>
                                      <select id={`vf-cond-${it.id}`} value={forms[it.id]?.condition || 'FISIK_BAGUS'} onChange={(e) => setForm(it.id, { condition: e.target.value })} className="input-field text-sm">
                                        {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label htmlFor={`vf-photo-${it.id}`} className="block text-[11px] font-semibold text-muted-foreground mb-1">Foto{conditionRequiresPhoto(forms[it.id]?.condition) ? ' *' : ''}</label>
                                      <input id={`vf-photo-${it.id}`} type="file" accept="image/*" onChange={(e) => setForm(it.id, { photo: e.target.files?.[0] ?? null })} className="text-xs" />
                                    </div>
                                    <button onClick={() => verify(it)} disabled={busy} className="btn-primary text-sm disabled:opacity-50">Verifikasi</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        formats={[...SCAN_FORMATS_1D, ...SCAN_FORMATS_QR]}
        onDetected={(code) => {
          setShowScanner(false);
          const needle = code.trim().toLowerCase();
          setBatchQuery(code.trim());
          const hit = (detail?.items ?? []).find((it) => matchExact(it, needle));
          if (hit) {
            identify(hit.id, 'scan');
          } else {
            notifyGlobal('Kode tidak ada di sesi ini — tampilkan hasil pencarian.', 'error');
          }
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c === 'complete') act(() => opnameSessions.complete(sessionId), 'Sesi selesai.');
          if (c === 'cancel') act(() => opnameSessions.cancel(sessionId), 'Sesi dibatalkan.');
        }}
        title={confirm === 'complete' ? 'Selesaikan Sesi' : 'Batalkan Sesi'}
        message={confirm === 'complete'
          ? `Semua ${progress.total} baris harus terverifikasi (kini ${progress.done}). Lanjutkan?`
          : 'Sesi dibatalkan tanpa menulis hasil. Lanjutkan?'}
        confirmLabel={confirm === 'complete' ? 'Ya, selesaikan' : 'Ya, batalkan'}
        variant={confirm === 'complete' ? 'info' : 'danger'}
      />

      {showAddWaves && detail && (
        <AddWavesModal
          session={detail}
          onClose={() => setShowAddWaves(false)}
          onAdded={async () => { setShowAddWaves(false); await onChanged(); }}
        />
      )}
    </>
  );

  function f(v: number | null) {
    return v != null ? `: ${v}` : '';
  }
}

function AddWavesModal({ session, onClose, onAdded }: {
  session: SessionDetail;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [waves, setWaves] = useState<WaveOption[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const inSession = new Set((session.items ?? []).map((i) => i.wave_id));
        const all: WaveOption[] = [];
        let page = 1;
        for (;;) {
          const res = await opnameExpired.list({ week_start: session.week_start, per_page: 100, page }) as {
            data: { data: { data: (WaveOption & { kode_depo?: string })[] } };
          };
          const rows = res.data.data.data.filter(
            (w) => w.kode_depo === session.kode_depo && !inSession.has(w.id)
          );
          all.push(...rows);
          if (rows.length < 100 || all.length >= 2000) break;
          page++;
        }
        setWaves(all);
        setPicked(new Set(all.map((w) => w.id)));
      } catch (e) {
        notifyGlobal(getErrorMessage(e, 'Gagal memuat wave'));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [session]);

  const save = async () => {
    if (picked.size === 0) {
      notifyGlobal('Pilih minimal satu wave.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await opnameSessions.addWaves(session.id, Array.from(picked)) as { data: { message?: string } };
      notifyGlobal(res.data.message ?? 'Wave ditambahkan.', 'success');
      onAdded();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menambah wave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Tambah Wave ke Sesi" subtitle={`Wave minggu ${session.week_start} depo ${session.nama_depo || session.kode_depo} yang belum masuk sesi`} size="lg"
      footer={<><button onClick={onClose} className="btn-secondary">Batal</button><button onClick={save} disabled={saving || picked.size === 0} className="btn-primary disabled:opacity-50">{saving ? 'Menyimpan...' : `Tambah (${picked.size})`}</button></>}>
      {loading ? <p className="text-sm text-muted-foreground">Memuat wave...</p> : waves.length === 0 ? (
        <p className="text-sm text-muted-foreground">Semua wave minggu ini sudah masuk sesi.</p>
      ) : (
        <div className="max-h-80 overflow-auto border border-border rounded-xl divide-y divide-gray-100">
          {waves.map((w) => (
            <label key={w.id} className="flex items-center gap-3 px-3 py-2 hover:bg-overlay-50 cursor-pointer">
              <input type="checkbox" checked={picked.has(w.id)} onChange={() => setPicked((p) => {
                const n = new Set(p);
                if (n.has(w.id)) n.delete(w.id);
                else n.add(w.id);
                return n;
              })} className="w-4 h-4 accent-primary-600" />
              <span className="font-mono text-sm">{w.kode_barang}</span>
              <span className="text-xs text-muted-foreground truncate">{w.nama_barang || ''}</span>
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{w.qty_ini_crt} CRT · {w.status_ini}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

interface WaveOption {
  id: number;
  kode_barang: string;
  nama_barang: string | null;
  kode_depo?: string;
  expired_date_ini: string;
  qty_ini_crt: number;
  status_ini: string;
}