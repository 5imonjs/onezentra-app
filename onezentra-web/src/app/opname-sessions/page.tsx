'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { opnameExpired, opnameSessions, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { formatDateId } from '@/lib/dates';
import { useAuthStore } from '@/store/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BarcodeScanner, { SCAN_FORMATS_1D, SCAN_FORMATS_QR } from '@/components/BarcodeScanner';
import { CreateSessionModal, type WaveOption } from '@/components/OpnameCreateSessionModal';
import { CONDITIONS } from '@/lib/condition';
import { conditionRequiresPhoto } from '@/lib/condition';

interface SessionItem {
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
  // hitung fisik. Null bila sumber tak ketemu (baris warisan).
  expected_crt?: number | null;
  expected_pcs?: number | null;
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

interface Session {
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
  items?: SessionItem[];
}

const STATUS_META: Record<string, string> = {
  OPEN: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-700',
};

const fmtDate = formatDateId;

export default function OpnameSessionsPage() {
  const { hasPermission, user } = useAuthStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [week, setWeek] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Session | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await opnameSessions.list({
        week_start: week || undefined,
        status: status || undefined,
        mine: mine || undefined,
        per_page: 25,
      }) as { data: { data: { data: Session[] } } };
      setSessions(res.data.data.data);
    } catch (e) {
      setLoadError(getErrorMessage(e, 'Gagal memuat sesi opname'));
    } finally {
      setLoading(false);
    }
  }, [week, status, mine]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await opnameSessions.get(id) as { data: { data: Session } };
      setDetail(res.data.data);
      setSelectedId(id);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat detail sesi'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const progress = useMemo(() => {
    if (!detail?.items?.length) return { done: 0, total: 0 };
    return { done: detail.items.filter((i) => i.verified_at).length, total: detail.items.length };
  }, [detail]);

  if (!hasPermission('opname.view')) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-gray-500">Anda tidak memiliki izin untuk melihat sesi opname.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Sesi Opname</h1>
            <p className="text-ink-fg-muted mt-0.5 text-sm">Penugasan verifikasi lapangan per minggu + depo — label batch terbit saat baris diverifikasi</p>
          </div>
          {hasPermission('opname.create') && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">+ Buat Sesi</button>
          )}
        </div>

        <div className="bg-surface-card rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="ss-week" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Minggu</label>
            <input id="ss-week" type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="input-field text-sm" />
          </div>
          <div>
            <label htmlFor="ss-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status</label>
            <select id="ss-status" value={status} onChange={(e) => setStatus(e.target.value)} className="input-field text-sm">
              <option value="">Semua</option>
              <option value="OPEN">Terbuka</option>
              <option value="IN_PROGRESS">Berjalan</option>
              <option value="COMPLETED">Selesai</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2.5 cursor-pointer">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="w-4 h-4 accent-primary-600" />
            Tugas saya
          </label>
          {(week || status || mine) && (
            <button onClick={() => { setWeek(''); setStatus(''); setMine(false); }} className="btn-secondary text-sm mb-0.5">Reset</button>
          )}
        </div>

        {loadError ? (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
          </div>
        ) : loading && sessions.length === 0 ? (
          <p className="text-sm text-gray-500">Memuat...</p>
        ) : sessions.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-2xl py-12 text-center">
            <p className="text-sm text-gray-500 font-medium">Belum ada sesi opname.</p>
            <p className="text-xs text-gray-400 mt-1">Buat sesi dari wave Batch Expired, tugaskan ke petugas lapangan.</p>
          </div>
        ) : (
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <caption className="sr-only">Daftar sesi opname</caption>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-300 bg-surface-raised">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Minggu</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Depo</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Petugas</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-overlay-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(s.week_start)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{s.nama_depo || s.kode_depo}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{s.assignee?.full_name || `#${s.assigned_to}`}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${STATUS_META[s.status] || STATUS_META.OPEN}`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => loadDetail(s.id)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">Buka</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showCreate && (
          <CreateSessionModal
            userDepo={{ kode_depo: user?.kode_depo || '', nama_depo: user?.nama_depo || '' }}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); load(); }}
          />
        )}

        {selectedId !== null && (
          <SessionDetailModal
            sessionId={selectedId}
            detail={detail}
            detailLoading={detailLoading}
            progress={progress}
            canEdit={hasPermission('opname.edit')}
            canAdd={hasPermission('opname.create')}
            onClose={() => { setSelectedId(null); setDetail(null); }}
            onChanged={async () => { await loadDetail(selectedId); load(); }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function SessionDetailModal({ sessionId, detail, detailLoading, progress, canEdit, canAdd, onClose, onChanged }: {
  sessionId: number;
  detail: Session | null;
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

  useEffect(() => {
    setBatchQuery('');
    setHighlightId(null);
    setIdentified({});
    setForms({});
  }, [sessionId]);
  const [forms, setForms] = useState<Record<number, { qty_fisik_crt: string; qty_fisik_pcs: string; condition: string; notes: string; photo: File | null }>>({});

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

  const verify = async (item: SessionItem) => {
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
    // Bersihkan form baris ini agar file/kondisi lama tak ikut terkirim ulang.
    setForms((p) => {
      const next = { ...p };
      delete next[item.id];
      return next;
    });
  };

  const open = detail?.status === 'OPEN' || detail?.status === 'IN_PROGRESS';

  const q = batchQuery.trim().toLowerCase();
  const matchCode = (it: SessionItem, needle: string): boolean => {
    if (!needle) return true;
    // Kode fisik yang di-scan adalah BARCODE label (LBL-xxx), sedangkan
    // nomor batch (BATCH-xxx) untuk identifikasi manual — cocokkan keduanya.
    return (it.batch?.batch_number || '').toLowerCase().includes(needle)
      || (it.batch?.barcode_label || '').toLowerCase().includes(needle)
      || (it.wave?.kode_barang || '').toLowerCase().includes(needle)
      || (it.wave?.nama_barang || '').toLowerCase().includes(needle);
  };
  const matchExact = (it: SessionItem, needle: string): boolean => {
    if (!needle) return false;
    const n = needle.toLowerCase();
    return (it.batch?.batch_number || '').toLowerCase() === n
      || (it.batch?.barcode_label || '').toLowerCase() === n;
  };
  const visibleItems = (detail?.items ?? []).filter((it) => matchCode(it, q));

  const focusItem = (id: number) => {
    setHighlightId(id);
    document.getElementById(`session-item-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2500);
  };

  return (
    <>
      <Modal open onClose={onClose} title={`Sesi #${sessionId}`} subtitle={detail ? `${fmtDate(detail.week_start)} · ${detail.nama_depo || detail.kode_depo} · ${detail.assignee?.full_name || ''} · ${progress.done}/${progress.total} terverifikasi` : ''} size="xl"
        footer={<button onClick={onClose} className="btn-secondary">Tutup</button>}>
        {detailLoading || !detail ? <p className="text-sm text-gray-500">Memuat...</p> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${STATUS_META[detail.status] || STATUS_META.OPEN}`}>{detail.status}</span>
              {canEdit && open && detail.status === 'OPEN' && (
                <button onClick={() => act(() => opnameSessions.start(sessionId), 'Sesi dimulai.')} disabled={busy} className="btn-primary text-sm disabled:opacity-50">Mulai Sesi</button>
              )}
              {canEdit && open && (
                <>
                  <button onClick={() => setConfirm('complete')} disabled={busy} className="btn-primary text-sm disabled:opacity-50">Selesaikan</button>
                  <button onClick={() => setConfirm('cancel')} disabled={busy} className="btn-secondary text-sm disabled:opacity-50">Batalkan</button>
                </>
              )}
              {canAdd && open && (
                <button onClick={() => setShowAddWaves(true)} disabled={busy} title="Tambah wave minggu+depo ini yang belum masuk sesi" className="btn-secondary text-sm disabled:opacity-50">+ Tambah wave</button>
              )}
            </div>
            <div className="border border-gray-300 rounded-xl divide-y divide-gray-100">
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 p-3 bg-surface-card/95 backdrop-blur border-b border-gray-100 rounded-t-xl">
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
                  <span className="text-xs text-slate-500">{visibleItems.length} cocok</span>
                )}
              </div>
              {visibleItems.map((it) => (
                <div key={it.id} id={`session-item-${it.id}`} className={`p-3 space-y-2 transition-colors ${highlightId === it.id ? 'bg-amber-50' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{it.wave?.kode_barang}</span>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-raised text-slate-600" title={`Batch ${it.batch?.batch_number || '-'} · Barcode ${it.batch?.barcode_label || '-'}`}>{it.batch?.batch_number || 'tanpa batch'}</span>
                    <span className="text-xs text-gray-500">
                      {it.wave?.nama_barang || ''} · exp {fmtDate(it.wave?.expired_date_ini)} · sistem {it.wave?.qty_ini_crt} CRT
                      {it.verified_at && it.expected_crt != null && (
                        <span className="font-semibold text-slate-700"> · batch ini {it.expected_crt} CRT{it.expected_pcs != null ? ` / ${it.expected_pcs} PCS` : ''}</span>
                      )}
                    </span>
                    {it.verified_at
                      ? <span className="ml-auto text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Terverifikasi{f(it.qty_fisik_crt)}</span>
                      : <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Belum</span>}
                  </div>
                  {!it.verified_at && canEdit && open && (
                    <>
                      {!identified[it.id] ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                          <span className="text-xs text-amber-800 font-medium">Scan label / cari kode batch dulu untuk membuka form hitung.</span>
                          <button
                            type="button"
                            onClick={() => setIdentified((p) => ({ ...p, [it.id]: 'manual' }))}
                            title="Hanya bila label fisik rusak tak terbaca — tercatat sebagai identifikasi manual"
                            className="text-xs font-semibold text-amber-700 underline hover:text-amber-900"
                          >
                            Label rusak — identifikasi manual
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-emerald-700">
                            Teridentifikasi ({identified[it.id] === 'scan' ? 'scan' : 'manual'})
                          </span>
                          <button
                            type="button"
                            onClick={() => setIdentified((p) => {
                              const n = { ...p };
                              delete n[it.id];
                              return n;
                            })}
                            className="text-slate-400 hover:text-red-500 underline"
                          >
                            Batalkan
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                        <div>
                          <label htmlFor={`vf-crt-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Fisik CRT *</label>
                          <input id={`vf-crt-${it.id}`} type="number" min="0" step="1" disabled={!identified[it.id]} value={forms[it.id]?.qty_fisik_crt || ''} onChange={(e) => setForm(it.id, { qty_fisik_crt: e.target.value })} className="input-field text-sm disabled:opacity-40" />
                        </div>
                        <div>
                          <label htmlFor={`vf-pcs-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Fisik PCS</label>
                          <input id={`vf-pcs-${it.id}`} type="number" min="0" step="1" disabled={!identified[it.id]} value={forms[it.id]?.qty_fisik_pcs || ''} onChange={(e) => setForm(it.id, { qty_fisik_pcs: e.target.value })} className="input-field text-sm disabled:opacity-40" />
                        </div>
                        <div>
                          <label htmlFor={`vf-cond-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Kondisi</label>
                          <select id={`vf-cond-${it.id}`} disabled={!identified[it.id]} value={forms[it.id]?.condition || 'FISIK_BAGUS'} onChange={(e) => setForm(it.id, { condition: e.target.value })} className="input-field text-sm disabled:opacity-40">
                            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`vf-photo-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Foto{conditionRequiresPhoto(forms[it.id]?.condition) ? ' *' : ''}</label>
                          <input id={`vf-photo-${it.id}`} type="file" accept="image/*" disabled={!identified[it.id]} onChange={(e) => setForm(it.id, { photo: e.target.files?.[0] ?? null })} className="text-xs disabled:opacity-40" />
                        </div>
                        <button onClick={() => verify(it)} disabled={busy || !identified[it.id]} className="btn-primary text-sm disabled:opacity-50">Verifikasi</button>
                      </div>
                    </>
                  )}
                  {it.verified_at && (
                    <p className="text-[11px] text-gray-500">Fisik: {it.qty_fisik_crt} CRT{it.qty_fisik_pcs != null ? ` / ${it.qty_fisik_pcs} PCS` : ''}{it.condition ? ` · ${it.condition}` : ''}</p>
                  )}
                </div>
              ))}
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
            setIdentified((p) => ({ ...p, [hit.id]: 'scan' }));
            focusItem(hit.id);
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
  session: Session;
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
      {loading ? <p className="text-sm text-gray-500">Memuat wave...</p> : waves.length === 0 ? (
        <p className="text-sm text-gray-500">Semua wave minggu ini sudah masuk sesi.</p>
      ) : (
        <div className="max-h-80 overflow-auto border border-gray-300 rounded-xl divide-y divide-gray-100">
          {waves.map((w) => (
            <label key={w.id} className="flex items-center gap-3 px-3 py-2 hover:bg-overlay-50 cursor-pointer">
              <input type="checkbox" checked={picked.has(w.id)} onChange={() => setPicked((p) => {
                const n = new Set(p);
                if (n.has(w.id)) n.delete(w.id);
                else n.add(w.id);
                return n;
              })} className="w-4 h-4 accent-primary-600" />
              <span className="font-mono text-sm">{w.kode_barang}</span>
              <span className="text-xs text-gray-500 truncate">{w.nama_barang || ''}</span>
              <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">{w.qty_ini_crt} CRT · {w.status_ini}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
