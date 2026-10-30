'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { opnameSessions, depo, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { formatDateId } from '@/lib/dates';
import { useAuthStore } from '@/store/auth';
import { CreateSessionModal } from '@/components/OpnameCreateSessionModal';
import { SessionDetailModal, type SessionDetail } from '@/components/OpnameSessionDetailModal';

const STATUS_META: Record<string, string> = {
  OPEN: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-700',
};

const fmtDate = formatDateId;

export default function OpnameSessionsPage() {
  const { hasPermission, user } = useAuthStore();
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [week, setWeek] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  // Filter depo hanya untuk user global (depot.view_all); user depot-scoped
  // terkunci ke depo sendiri oleh backend (index() mengabaikan kode_depo).
  const canFilterDepo = hasPermission('depot.view_all');
  const [kodeDepo, setKodeDepo] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await opnameSessions.list({
        week_start: week || undefined,
        status: status || undefined,
        mine: mine || undefined,
        kode_depo: kodeDepo || undefined,
        per_page: 25,
      }) as { data: { data: { data: SessionDetail[] } } };
      setSessions(res.data.data.data);
    } catch (e) {
      setLoadError(getErrorMessage(e, 'Gagal memuat sesi opname'));
    } finally {
      setLoading(false);
    }
  }, [week, status, mine, kodeDepo]);

  useEffect(() => { load(); }, [load]);

  // Daftar depo tersumber dari master user; user global dengan depot.view_all
  // melihat seluruh depo. Gagal memuat cukup mematikan dropdown, bukan halaman.
  const loadDepots = useCallback(async () => {
    if (!canFilterDepo) return;
    try {
      const res = await depo.list();
      setDepots(res.data?.data ?? []);
    } catch (e) {
      console.error('[Depo]', e);
    }
  }, [canFilterDepo]);

  useEffect(() => { loadDepots(); }, [loadDepots]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await opnameSessions.get(id) as { data: { data: SessionDetail } };
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

  if (!hasPermission('opname.session.view')) {
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
          {hasPermission('opname.session.create') && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">+ Buat Sesi</button>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="ss-week" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Minggu</label>
            <input id="ss-week" type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="input-field text-sm" />
          </div>
          <div>
            <label htmlFor="ss-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status</label>
            <select id="ss-status" value={status} onChange={(e) => setStatus(e.target.value)} className="select-field-sm">
              <option value="">Semua</option>
              <option value="OPEN">Terbuka</option>
              <option value="IN_PROGRESS">Berjalan</option>
              <option value="COMPLETED">Selesai</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>
          </div>
          {canFilterDepo && depots.length > 1 && (
            <div>
              <label htmlFor="ss-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label>
              <select
                id="ss-depo"
                value={kodeDepo}
                onChange={(e) => setKodeDepo(e.target.value)}
                aria-label="Filter depo"
                title="Saring sesi berdasarkan depo"
                className="select-field-sm min-w-[160px]"
              >
                <option value="">Semua Depo</option>
                {depots.map((d) => (
                  <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>
                ))}
              </select>
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2.5 cursor-pointer">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="w-4 h-4 accent-primary-600" />
            Tugas saya
          </label>
          {(week || status || mine || kodeDepo) && (
            <button onClick={() => { setWeek(''); setStatus(''); setMine(false); setKodeDepo(''); }} className="btn-secondary text-sm mb-0.5">Reset</button>
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
          <div className="bg-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="max-h-[560px] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <caption className="sr-only">Daftar sesi opname</caption>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-300 bg-popover">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Minggu</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Depo</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Petugas</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Progres</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((s) => {
                    const done = s.items?.filter((i) => i.verified_at).length ?? 0;
                    const total = s.items?.length ?? 0;
                    return (
                      <tr key={s.id} className="hover:bg-overlay-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(s.week_start)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{s.nama_depo || s.kode_depo}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{s.assignee?.full_name || `#${s.assigned_to}`}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${STATUS_META[s.status] || STATUS_META.OPEN}`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {total > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                                <div
                                  className={`h-full rounded-full ${done === total ? 'bg-emerald-500' : 'bg-primary-600'}`}
                                  style={{ width: `${Math.round((done / total) * 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">{done}/{total}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => loadDetail(s.id)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">Buka</button>
                        </td>
                      </tr>
                    );
                  })}
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
            canEdit={hasPermission('opname.session.edit')}
            canAdd={hasPermission('opname.session.create')}
            onClose={() => { setSelectedId(null); setDetail(null); }}
            onChanged={async () => { await loadDetail(selectedId); load(); }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}