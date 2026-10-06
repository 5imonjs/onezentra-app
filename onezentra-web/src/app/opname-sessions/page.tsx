'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { opnameExpired, opnameSessions, users, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { formatDateId } from '@/lib/dates';
import { useAuthStore } from '@/store/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { CONDITIONS } from '@/lib/condition';

interface SessionItem {
  id: number;
  wave_id: number;
  batch_id: number | null;
  batch?: { batch_number: string } | null;
  qty_fisik_crt: number | null;
  qty_fisik_pcs: number | null;
  condition: string | null;
  photo: string | null;
  notes: string | null;
  verified_at: string | null;
  verified_by: number | null;
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

interface WaveOption {
  id: number;
  kode_barang: string;
  nama_barang: string | null;
  expired_date_ini: string;
  qty_ini_crt: number;
  status_ini: string;
}

const STATUS_META: Record<string, string> = {
  OPEN: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-700',
};

const fmtDate = formatDateId;

const todayMonday = (): string => {
  const d = new Date();
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
            canPickUser={hasPermission('users.view')}
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
            onClose={() => { setSelectedId(null); setDetail(null); }}
            onChanged={async () => { await loadDetail(selectedId); load(); }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function CreateSessionModal({ userDepo, canPickUser, onClose, onCreated }: {
  userDepo: { kode_depo: string; nama_depo: string };
  canPickUser: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [weekStart, setWeekStart] = useState(todayMonday());
  const [kodeDepo, setKodeDepo] = useState(userDepo.kode_depo);
  const [namaDepo, setNamaDepo] = useState(userDepo.nama_depo);
  const [assignedTo, setAssignedTo] = useState('');
  const [userOptions, setUserOptions] = useState<{ id: number; full_name: string; email: string }[]>([]);
  const [waves, setWaves] = useState<WaveOption[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loadingWaves, setLoadingWaves] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canPickUser) return;
    users.list({ per_page: 100 }).then((res) => {
      const items = (res.data?.data ?? []) as { id: number; full_name: string; email: string }[];
      setUserOptions(Array.isArray(items) ? items : []);
    }).catch(() => undefined);
  }, [canPickUser]);

  const loadWaves = useCallback(async () => {
    setLoadingWaves(true);
    try {
      const res = await opnameExpired.list({ week_start: weekStart || undefined, per_page: 200 }) as {
        data: { data: { data: WaveOption[] } };
      };
      const list = res.data.data.data.filter((w) => !kodeDepo || (w as unknown as { kode_depo?: string }).kode_depo === kodeDepo);
      setWaves(list);
      setPicked(new Set(list.map((w) => w.id)));
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat wave'));
    } finally {
      setLoadingWaves(false);
    }
  }, [weekStart, kodeDepo]);

  useEffect(() => { loadWaves(); }, [loadWaves]);

  const save = async () => {
    if (!assignedTo || picked.size === 0) {
      notifyGlobal('Pilih petugas dan minimal satu baris wave.', 'error');
      return;
    }
    setSaving(true);
    try {
      await opnameSessions.create({
        week_start: weekStart,
        kode_depo: kodeDepo,
        nama_depo: namaDepo || undefined,
        assigned_to: Number(assignedTo),
        wave_ids: Array.from(picked),
      });
      notifyGlobal('Sesi opname dibuat.', 'success');
      onCreated();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal membuat sesi'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Buat Sesi Opname" subtitle="Pilih minggu + depo, tugaskan wave ke petugas lapangan" size="xl"
      footer={<><button onClick={onClose} className="btn-secondary">Batal</button><button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Menyimpan...' : 'Buat Sesi'}</button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cs-week" className="block text-sm font-medium text-gray-700 mb-1.5">Minggu (Senin) *</label>
          <input id="cs-week" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label htmlFor="cs-depo" className="block text-sm font-medium text-gray-700 mb-1.5">Kode Depo *</label>
          <input id="cs-depo" value={kodeDepo} onChange={(e) => setKodeDepo(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label htmlFor="cs-nama-depo" className="block text-sm font-medium text-gray-700 mb-1.5">Nama Depo</label>
          <input id="cs-nama-depo" value={namaDepo} onChange={(e) => setNamaDepo(e.target.value)} className="input-field" />
        </div>
        <div>
          <label htmlFor="cs-assigned" className="block text-sm font-medium text-gray-700 mb-1.5">Petugas *</label>
          {canPickUser ? (
            <select id="cs-assigned" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="input-field" required>
              <option value="">— Pilih petugas —</option>
              {userOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          ) : (
            <input id="cs-assigned" type="number" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="input-field" placeholder="ID user petugas" required />
          )}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Baris wave ({picked.size}/{waves.length})</p>
        {loadingWaves ? <p className="text-sm text-gray-500">Memuat wave...</p> : waves.length === 0 ? (
          <p className="text-sm text-gray-500">Tidak ada wave minggu ini — Generate dulu di Batch Expired.</p>
        ) : (
          <div className="max-h-64 overflow-auto border border-gray-300 rounded-xl divide-y divide-gray-100">
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
      </div>
    </Modal>
  );
}

function SessionDetailModal({ sessionId, detail, detailLoading, progress, canEdit, onClose, onChanged }: {
  sessionId: number;
  detail: Session | null;
  detailLoading: boolean;
  progress: { done: number; total: number };
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'complete' | 'cancel'>(null);
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
    const fd = new FormData();
    fd.append('qty_fisik_crt', f.qty_fisik_crt);
    if (f.qty_fisik_pcs) fd.append('qty_fisik_pcs', f.qty_fisik_pcs);
    if (f.condition) fd.append('condition', f.condition);
    if (f.notes) fd.append('notes', f.notes);
    if (f.photo) fd.append('photo', f.photo);
    await act(() => opnameSessions.verifyItem(sessionId, item.id, fd), 'Baris terverifikasi, label diterbitkan bila perlu.');
    // Bersihkan form baris ini agar file/kondisi lama tak ikut terkirim ulang.
    setForms((p) => {
      const next = { ...p };
      delete next[item.id];
      return next;
    });
  };

  const open = detail?.status === 'OPEN' || detail?.status === 'IN_PROGRESS';

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
            </div>
            <div className="border border-gray-300 rounded-xl divide-y divide-gray-100">
              {(detail.items ?? []).map((it) => (
                <div key={it.id} className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{it.wave?.kode_barang}</span>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-raised text-slate-600" title="Batch yang diverifikasi baris ini">{it.batch?.batch_number || 'tanpa batch'}</span>
                    <span className="text-xs text-gray-500">{it.wave?.nama_barang || ''} · exp {fmtDate(it.wave?.expired_date_ini)} · sistem {it.wave?.qty_ini_crt} CRT</span>
                    {it.verified_at
                      ? <span className="ml-auto text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Terverifikasi{f(it.qty_fisik_crt)}</span>
                      : <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Belum</span>}
                  </div>
                  {!it.verified_at && canEdit && open && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                      <div>
                        <label htmlFor={`vf-crt-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Fisik CRT *</label>
                        <input id={`vf-crt-${it.id}`} type="number" min="0" step="1" value={forms[it.id]?.qty_fisik_crt || ''} onChange={(e) => setForm(it.id, { qty_fisik_crt: e.target.value })} className="input-field text-sm" />
                      </div>
                      <div>
                        <label htmlFor={`vf-pcs-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Fisik PCS</label>
                        <input id={`vf-pcs-${it.id}`} type="number" min="0" step="1" value={forms[it.id]?.qty_fisik_pcs || ''} onChange={(e) => setForm(it.id, { qty_fisik_pcs: e.target.value })} className="input-field text-sm" />
                      </div>
                      <div>
                        <label htmlFor={`vf-cond-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Kondisi</label>
                        <select id={`vf-cond-${it.id}`} value={forms[it.id]?.condition || 'FISIK_BAGUS'} onChange={(e) => setForm(it.id, { condition: e.target.value })} className="input-field text-sm">
                          {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`vf-photo-${it.id}`} className="block text-[11px] font-semibold text-gray-500 mb-1">Foto</label>
                        <input id={`vf-photo-${it.id}`} type="file" accept="image/*" onChange={(e) => setForm(it.id, { photo: e.target.files?.[0] ?? null })} className="text-xs" />
                      </div>
                      <button onClick={() => verify(it)} disabled={busy} className="btn-primary text-sm disabled:opacity-50">Verifikasi</button>
                    </div>
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
    </>
  );

  function f(v: number | null) {
    return v != null ? `: ${v}` : '';
  }
}
