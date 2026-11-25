'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { depo, dashboard, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface ActivityLog {
  id: number;
  user_id: number | null;
  user_name: string;
  level: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  method: string;
  route: string;
  module: string;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  device_name: string | null;
  occurred_at: string;
}

interface DepoOption {
  kode_depo: string;
  nama_depo: string;
}

const MODULE_OPTIONS = [
  'Rencana Kirim',
  'Gate Check',
  'Validasi SJ',
  'Receiving',
  'Penerimaan',
  'NPN',
  'Standar Umur',
  'Standarisasi',
  'Opname Expired',
  'Biaya',
  'Laporan',
  'Pengguna',
  'Role & Permission',
  'Dashboard',
  'Login & Logout',
  'Lainnya',
];

const PER_PAGE = 25;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '-';
  }

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Ringkas User-Agent panjang agar tidak merusak tabel. */
function shortAgent(agent: string | null): string {
  if (!agent?.trim()) {
    return '';
  }
  const value = agent.trim();
  return value.length > 34 ? `${value.slice(0, 34)}…` : value;
}

/**
 * Jejak perangkat: mobile memakai nama token (device_name), web/curl memakai
 * User-Agent + IP. Semua disimpan supaya aksi bisa ditelusuri per perangkat.
 */
function deviceInfo(log: ActivityLog): { main: string; sub: string; title: string } {
  const agent = shortAgent(log.user_agent);
  const main = log.device_name?.trim() || agent || log.ip_address || '-';
  const sub = log.device_name?.trim()
    ? (log.ip_address || agent)
    : (log.ip_address || '');
  const title = [log.device_name, log.ip_address, log.user_agent]
    .filter(Boolean)
    .join(' | ') || 'Tidak tercatat';

  return { main, sub, title };
}

function methodTone(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20';
    case 'PUT':
    case 'PATCH':
      return 'bg-amber-500/10 text-amber-700 ring-amber-500/20';
    case 'DELETE':
      return 'bg-red-500/10 text-red-700 ring-red-500/20';
    case 'LOGIN':
      return 'bg-primary-500/10 text-accent-text ring-primary-500/20';
    case 'LOGOUT':
      return 'bg-slate-500/10 text-slate-600 ring-slate-500/20';
    default:
      return 'bg-popover text-muted-foreground ring-border/70';
  }
}

/**
 * Riwayat Aktivitas — audit trail lintas modul.
 *
 * Sumbernya `GET /dashboard/activity/history` yang mencatat semua request API
 * (web & mobile), termasuk LOGIN/LOGOUT. Halaman di-gate dengan izin yang sama
 * seperti API (`activity.view`) agar kunjungan langsung tanpa izin tidak
 * memicu 403.
 */
export default function ActivityHistoryPage() {
  const { hasPermission, user } = useAuthStore();
  const canView = hasPermission('activity.view');

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [depots, setDepots] = useState<DepoOption[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeDepo, setKodeDepo] = useState('');

  // Debounce pencarian supaya mengetik tidak membanjiri API.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!canView) {
      return;
    }

    let cancelled = false;
    depo.list()
      .then((res) => {
        if (!cancelled) {
          setDepots((res.data?.data ?? []) as DepoOption[]);
        }
      })
      .catch(() => {
        // Filter depo opsional: kegagalan memuat daftar tidak memblokir riwayat.
      });

    return () => {
      cancelled = true;
    };
  }, [canView]);

  const load = useCallback(async () => {
    if (!canView) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await dashboard.history({
        page,
        per_page: PER_PAGE,
        ...(search ? { search } : {}),
        ...(module ? { module } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(kodeDepo ? { kode_depo: kodeDepo } : {}),
      });
      const payload = res.data ?? {};
      setLogs((payload.data ?? []) as ActivityLog[]);
      setLastPage(Math.max(1, Number(payload.last_page) || 1));
      setTotal(Number(payload.total) || 0);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat riwayat aktivitas.'));
    } finally {
      setLoading(false);
    }
  }, [canView, page, search, module, dateFrom, dateTo, kodeDepo]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void load();
  }, [canView, load]);

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  const hasFilter = Boolean(search || module || dateFrom || dateTo || kodeDepo);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setModule('');
    setDateFrom('');
    setDateTo('');
    setKodeDepo('');
    setPage(1);
  };

  const depoLabel = useMemo(
    () => (option: DepoOption) => `${option.nama_depo} (${option.kode_depo})`,
    [],
  );

  if (!canView) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">Anda tidak memiliki izin untuk melihat riwayat aktivitas.</p>
          <p className="mt-1 text-xs text-muted-foreground">Minta admin memberikan izin “Lihat Log Aktivitas” pada role Anda.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
              <svg aria-hidden="true" className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Riwayat Aktivitas</h1>
              <p className="mt-1 text-sm text-white/70">Semua aksi web &amp; mobile, termasuk login/logout — lengkap dengan pengguna dan modulnya.</p>
            </div>
          </div>
        </header>

        <section aria-label="Filter riwayat aktivitas" className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <label htmlFor="activity-search" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cari</label>
              <input
                id="activity-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nama/email pengguna atau path API..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="activity-module" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Modul</label>
              <select
                id="activity-module"
                value={module}
                onChange={(e) => { setModule(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              >
                <option value="">Semua modul</option>
                {MODULE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="activity-from" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dari tanggal</label>
              <input
                id="activity-from"
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="activity-to" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sampai tanggal</label>
              <input
                id="activity-to"
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
            </div>
            {depots.length > 1 && (
              <div className="xl:col-span-2">
                <label htmlFor="activity-depo" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Depo</label>
                <select
                  id="activity-depo"
                  value={kodeDepo}
                  onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
                >
                  <option value="">Semua depo</option>
                  {depots.map((option) => (
                    <option key={option.kode_depo} value={option.kode_depo}>{depoLabel(option)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {total === 0 ? 'Tidak ada aktivitas.' : `Menampilkan ${from}–${to} dari ${total.toLocaleString('id-ID')} aktivitas.`}
              {user?.kode_depo ? ' Data dibatasi ke depo Anda.' : ''}
            </p>
            {hasFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-popover"
              >
                Reset filter
              </button>
            )}
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="whitespace-nowrap font-semibold hover:underline">Coba lagi</button>
          </div>
        )}

        <section aria-label="Daftar riwayat aktivitas" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] border-collapse">
              <caption className="sr-only">Riwayat aktivitas pengguna</caption>
              <thead className="bg-popover">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Waktu</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Pengguna</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Depo</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Modul</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Aksi</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Perangkat / IP</th>
                  <th scope="col" className="px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Metode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && logs.length === 0 && (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`activity-skeleton-${i}`} className="animate-pulse">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5"><div className="h-4 w-24 rounded bg-muted" /></td>
                      ))}
                    </tr>
                  ))
                )}
                {!loading && logs.length === 0 && !error && (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <p className="text-sm font-medium text-foreground">Belum ada aktivitas pada filter ini.</p>
                      <p className="mt-1 text-xs text-muted-foreground">Coba longgarkan filter tanggal atau modul.</p>
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-overlay-70">
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap"><span className="font-mono text-xs">{formatDateTime(log.occurred_at)}</span></td>
                    <td className="px-5 py-3.5 text-sm text-foreground">
                      <span className="block font-semibold">{log.user_name}</span>
                      <span className="block text-xs text-muted-foreground">{log.level || '-'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">{log.nama_depo || log.kode_depo || '-'}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="inline-flex rounded-lg bg-chip-primary px-2.5 py-1 text-[11px] font-semibold text-accent-text ring-1 ring-chip-primary-border">{log.module}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-foreground">
                      <span className="block">{log.action}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground" title={log.route}>{log.route}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-foreground" title={deviceInfo(log).title}>
                      <span className="block max-w-[220px] truncate font-medium">{deviceInfo(log).main}</span>
                      {deviceInfo(log).sub && (
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">{deviceInfo(log).sub}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${methodTone(log.method)}`}>{log.method}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border lg:hidden">
            {loading && logs.length === 0 && (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={`activity-skeleton-m-${i}`} className="animate-pulse space-y-2 p-4">
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-1/3 rounded bg-muted" />
                </div>
              ))
            )}
            {!loading && logs.length === 0 && !error && (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-foreground">Belum ada aktivitas pada filter ini.</p>
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{log.user_name}</p>
                    <p className="text-xs text-muted-foreground">{log.level || '-'} · {log.nama_depo || log.kode_depo || '-'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${methodTone(log.method)}`}>{log.method}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex rounded-lg bg-chip-primary px-2 py-0.5 text-[11px] font-semibold text-accent-text ring-1 ring-chip-primary-border">{log.module}</span>
                  <span className="text-sm text-foreground">{log.action}</span>
                </div>
                <p className="text-xs text-foreground" title={deviceInfo(log).title}>
                  <span className="font-semibold">Perangkat:</span> {deviceInfo(log).main}
                  {deviceInfo(log).sub ? ` · ${deviceInfo(log).sub}` : ''}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">{formatDateTime(log.occurred_at)}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">Halaman {page} dari {lastPage}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-popover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage || loading}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-popover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
