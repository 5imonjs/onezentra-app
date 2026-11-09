'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/app/dashboard/layout';
import { opnameSessions, depo, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { formatDateId, mondayOfWeek } from '@/lib/dates';
import { useAuthStore } from '@/store/auth';
import { CreateSessionModal } from '@/components/OpnameCreateSessionModal';
import { SessionDetailModal, type SessionDetail } from '@/components/OpnameSessionDetailModal';

const STATUS_META: Record<string, string> = {
  OPEN: 'bg-slate-100 text-foreground',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  REVISI: 'bg-orange-50 text-orange-700',
  CANCELLED: 'bg-red-50 text-red-700',
};

const fmtDate = formatDateId;

export default function OpnameSessionsPage() {
  const { hasPermission, user } = useAuthStore();
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{ current_page: number; last_page: number; total: number; from: number | null; to: number | null } | null>(null);
  const [week, setWeek] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Filter depo hanya untuk user global (depot.view_all); user depot-scoped
  // terkunci ke depo sendiri oleh backend (index() mengabaikan kode_depo).
  const canFilterDepo = hasPermission('depot.view_all');
  const [kodeDepo, setKodeDepo] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [initialSessionId, setInitialSessionId] = useState<number | null>(null);
  const queryApplied = useRef(false);

  // Deep link dari Monitoring Kedaluwarsa: minggu, depo, dan aksi (buat sesi
  // atau buka sesi tertentu) dibawa lewat query string agar user tidak perlu
  // memfilter ulang setelah pindah halaman.
  useEffect(() => {
    if (queryApplied.current) return;
    queryApplied.current = true;

    const params = new URLSearchParams(window.location.search);
    const weekParam = params.get('week_start');
    if (weekParam) {
      const normalizedWeek = mondayOfWeek(weekParam);
      setWeek(normalizedWeek);
      params.set('week_start', normalizedWeek);
    }

    const depoParam = params.get('kode_depo');
    if (depoParam) setKodeDepo(depoParam);

    const statusParam = params.get('status');
    if (statusParam) setStatus(statusParam.toUpperCase());

    const searchParam = params.get('search');
    if (searchParam) {
      setSearchInput(searchParam);
      setSearch(searchParam);
    }

    if (params.get('mine') === '1') setMine(true);

    const sessionParam = Number(params.get('session_id'));
    if (Number.isInteger(sessionParam) && sessionParam > 0) {
      setInitialSessionId(sessionParam);
    }

    if (params.get('create') === '1' && hasPermission('opname.session.create')) {
      setShowCreate(true);
    }

    // Jangan biarkan reload membuka modal lagi setelah user menutupnya.
    params.delete('create');
    params.delete('session_id');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [hasPermission]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await opnameSessions.list({
        week_start: week || undefined,
        status: status || undefined,
        mine: mine || undefined,
        search: search || undefined,
        kode_depo: kodeDepo || undefined,
        page,
        per_page: 25,
      }) as {
        data: {
          data: {
            data: SessionDetail[];
            current_page: number;
            last_page: number;
            total: number;
            from: number | null;
            to: number | null;
          };
        };
      };
      setSessions(res.data.data.data);
      setPagination(res.data.data);
    } catch (e) {
      setLoadError(getErrorMessage(e, 'Gagal memuat sesi opname'));
    } finally {
      setLoading(false);
    }
  }, [week, status, mine, kodeDepo, search, page]);

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

  useEffect(() => {
    if (initialSessionId === null) return;
    if (!hasPermission('opname.session.view')) {
      setInitialSessionId(null);
      return;
    }
    void loadDetail(initialSessionId);
    setInitialSessionId(null);
  }, [hasPermission, initialSessionId, loadDetail]);

  const progress = useMemo(() => {
    if (!detail?.items?.length) return { done: 0, total: 0 };
    return { done: detail.items.filter((i) => i.verified_at).length, total: detail.items.length };
  }, [detail]);

  const createDepo = kodeDepo || user?.kode_depo || '';
  const createNamaDepo = depots.find((d) => d.kode_depo === createDepo)?.nama_depo
    || (createDepo === (user?.kode_depo || '') ? (user?.nama_depo || '') : '');

  if (!hasPermission('opname.session.view')) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-muted-foreground">Anda tidak memiliki izin untuk melihat Stock Opname.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Stock Opname</h1>
            <p className="text-ink-fg-muted mt-0.5 text-sm">Penugasan hitung fisik per minggu + depo — label lot terbit saat baris diverifikasi</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasPermission('opname.view') && (
              <Link href="/opname-expired" className="btn-secondary text-sm">
                Monitoring Kedaluwarsa
              </Link>
            )}
            {hasPermission('opname.session.create') && (
              <button onClick={() => setShowCreate(true)} className="btn-primary">+ Buat Sesi</button>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="ss-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cari</label>
            <input
              id="ss-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput.trim()); setPage(1); } }}
              placeholder="Kode/nama depo, catatan, petugas, atau #ID..."
              className="input-field text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => { setSearch(searchInput.trim()); setPage(1); }}
            className="btn-secondary text-sm mb-0.5"
          >
            Cari
          </button>
          <div>
            <label htmlFor="ss-week" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Minggu</label>
            <input
              id="ss-week"
              type="date"
              value={week}
              onChange={(e) => {
                const value = e.target.value;
                setWeek(value ? mondayOfWeek(value) : '');
                setPage(1);
              }}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label htmlFor="ss-status" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Status</label>
            <select id="ss-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="select-field-sm">
              <option value="">Semua</option>
              <option value="OPEN">Terbuka</option>
              <option value="IN_PROGRESS">Berjalan</option>
              <option value="PENDING_APPROVAL">Menunggu Persetujuan</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REVISI">Revisi</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>
          </div>
          {canFilterDepo && depots.length > 1 && (
            <div>
              <label htmlFor="ss-depo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Depo</label>
              <select
                id="ss-depo"
                value={kodeDepo}
                onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
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
          <label className="inline-flex items-center gap-2 text-sm text-foreground pb-2.5 cursor-pointer">
            <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} className="w-4 h-4 accent-primary-600" />
            Tugas saya
          </label>
          {(week || status || mine || kodeDepo || search) && (
            <button onClick={() => { setWeek(''); setStatus(''); setMine(false); setKodeDepo(''); setSearchInput(''); setSearch(''); setPage(1); }} className="btn-secondary text-sm mb-0.5">Reset</button>
          )}
        </div>

        {loadError ? (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
          </div>
        ) : loading && sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : sessions.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl py-12 text-center">
            <p className="text-sm text-muted-foreground font-medium">Belum ada sesi Stock Opname.</p>
            <p className="text-xs text-gray-400 mt-1">Buat sesi dari baris monitoring kedaluwarsa, tugaskan ke petugas lapangan.</p>
            {hasPermission('opname.view') && (
              <Link href="/opname-expired" className="btn-secondary text-xs mt-4 inline-flex">
                Buka Monitoring Kedaluwarsa
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="max-h-[560px] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <caption className="sr-only">Daftar sesi Stock Opname</caption>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-popover">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Minggu</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Depo</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Petugas</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progres</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((s) => {
                    const done = s.items?.filter((i) => i.verified_at).length ?? 0;
                    const total = s.items?.length ?? 0;
                    return (
                      <tr key={s.id} className="hover:bg-overlay-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{fmtDate(s.week_start)}</td>
                        <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{s.nama_depo || s.kode_depo}</td>
                        <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{s.assignee?.full_name || `#${s.assigned_to}`}</td>
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
                              <span className="text-xs text-muted-foreground">{done}/{total}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => loadDetail(s.id)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-foreground hover:bg-slate-200 transition-colors">Buka</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pagination && pagination.last_page > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Menampilkan {pagination.from ?? 0}–{pagination.to ?? 0} dari {pagination.total} sesi
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.current_page <= 1}
                    aria-label="Halaman sebelumnya"
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ‹
                  </button>
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    Halaman {pagination.current_page} / {pagination.last_page}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                    disabled={pagination.current_page >= pagination.last_page}
                    aria-label="Halaman berikutnya"
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {showCreate && (
          <CreateSessionModal
            userDepo={{ kode_depo: createDepo, nama_depo: createNamaDepo }}
            initialWeekStart={week || undefined}
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
            canApprove={hasPermission('opname.session.approve')}
            onClose={() => { setSelectedId(null); setDetail(null); }}
            onChanged={async () => { await loadDetail(selectedId); load(); }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}