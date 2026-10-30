'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboard, getErrorMessage } from '@/lib/api';
import { useDashboardSummary } from '@/lib/dashboardSummary';
import { useAuthStore } from '@/store/auth';
import DashboardPanel from '@/components/DashboardPanel';

const ACTIVITY_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />;

type UsageDay = { date: string; requests: number; active_users: number; logins?: number };
type TopUser = { id: number; name: string; level: string; requests: number };
type TopModule = { module: string; requests: number };
type UsagePayload = {
  from: string;
  to: string;
  days: number;
  daily: UsageDay[];
  top_users: TopUser[];
  top_modules?: TopModule[];
  totals?: {
    activities: number;
    logins: number;
    active_users: number;
    peak_active_users: number;
  };
};
type UsageResponse = { data?: { data?: UsagePayload } };

const PERIODS = [
  { days: 7, label: '7 hari' },
  { days: 30, label: '30 hari' },
  { days: 90, label: '90 hari' },
] as const;

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function DashboardActivityChart({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Tren 7 hari vs minggu sebelumnya dihitung backend di dashboard/summary
  // (field activity_trend) — dikambil lewat cache bersama, tanpa request ekstra.
  const { summary, loading: summaryLoading } = useDashboardSummary(kodeDepo);

  // Guard balapan: ganti periode berturut-turut bisa membuat respons lama
  // tiba setelah yang baru dan menimpa data. Setiap request memakai nomor urut
  // dan AbortController; respons usang dibatalkan dan diabaikan.
  const requestSeqRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (days: number, depot?: string) => {
    const seq = ++requestSeqRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await dashboard.activity(days, depot, controller.signal) as UsageResponse;
      if (seq !== requestSeqRef.current) return;
      const payload = response.data?.data;
      if (!payload || !Array.isArray(payload.daily) || !Array.isArray(payload.top_users)) {
        throw new Error('Format data penggunaan sistem tidak valid.');
      }
      setUsage(payload);
    } catch (exception) {
      // Permintaan usang/dibatalkan bukan kegagalan — jangan tampilkan error.
      if (seq !== requestSeqRef.current) return;
      setError(getErrorMessage(exception, 'Gagal memuat penggunaan sistem.'));
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => () => {
    // Batalkan request yang masih berjalan saat unmount agar tidak ada setState
    // setelah komponen hilang.
    requestSeqRef.current += 1;
    controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!hasPermission('users.view')) {
      return;
    }
    load(periodDays, kodeDepo);
  }, [load, periodDays, kodeDepo, hasPermission]);

  // Jejak aktivitas pengguna (login/logout + seluruh proses API) hanya
  // relevan untuk pengelola sistem. Peran operasional tidak dirender chart ini
  // agar dashboard fokus ke pekerjaan gudang.
  if (!hasPermission('users.view')) {
    return null;
  }

  const daily = Array.isArray(usage?.daily) ? usage.daily : [];
  const topUsers = Array.isArray(usage?.top_users) ? usage.top_users : [];
  const topModules = Array.isArray(usage?.top_modules) ? usage.top_modules : [];
  const totalRequests = usage?.totals?.activities ?? daily.reduce((sum, day) => sum + day.requests, 0);
  const totalLogins = usage?.totals?.logins ?? daily.reduce((sum, day) => sum + (day.logins ?? 0), 0);
  const activeUsers = usage?.totals?.active_users ?? 0;
  const peakUsers = usage?.totals?.peak_active_users ?? Math.max(...daily.map((day) => day.active_users), 0);
  const maxRequests = Math.max(...daily.map((day) => day.requests), 1);
  const maxModuleRequests = Math.max(...topModules.map((item) => item.requests), 1);
  const isEmpty = totalRequests === 0;
  // Label tanggal hanya ditampilkan pada sebagian bar agar tidak sesak di layar kecil.
  const labelStep = daily.length > 45 ? 7 : daily.length > 20 ? 3 : daily.length > 10 ? 2 : 1;
  const { current_7d: trendNow, prev_7d: trendPrev } = summary.activity_trend;
  const trendPct = trendPrev > 0 ? Math.round(((trendNow - trendPrev) / trendPrev) * 100) : null;
  const trendBaru = !summaryLoading && trendPrev === 0 && trendNow > 0;

  return (
    <DashboardPanel
      title="Mobilitas Penggunaan Sistem"
      icon={ACTIVITY_ICON}
      subtitle={
        <>
          <span>{usage ? `${formatDate(usage.from)} - ${formatDate(usage.to)}` : `${periodDays} hari terakhir`}</span>
          {trendPct !== null && (
            <span
              aria-label={`Aktivitas 7 hari terakhir ${trendPct >= 0 ? 'naik' : 'turun'} ${Math.abs(trendPct)} persen dibanding minggu sebelumnya`}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${trendPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
            >
              {trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct)}% vs minggu lalu
            </span>
          )}
          {trendBaru && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              Baru minggu ini
            </span>
          )}
        </>
      }
      actions={
        <>
          <div role="group" aria-label="Pilih periode" className="flex rounded-lg border border-gray-300 bg-card p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setPeriodDays(p.days)}
                aria-pressed={periodDays === p.days}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-9 ${
                  periodDays === p.days ? 'bg-ink-900 text-white shadow-sm' : 'text-muted-foreground hover:text-gray-800 hover:bg-popover'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => load(periodDays, kodeDepo)} disabled={loading} aria-label="Muat ulang penggunaan sistem" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 min-w-11 min-h-11 flex items-center justify-center">
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          </button>
        </>
      }
    >
      <div className="p-6">
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="h-20 bg-popover rounded-xl animate-pulse" />
              <div className="h-20 bg-popover rounded-xl animate-pulse" />
              <div className="h-20 bg-popover rounded-xl animate-pulse" />
              <div className="h-20 bg-popover rounded-xl animate-pulse" />
            </div>
            <div className="h-56 bg-popover rounded-xl animate-pulse" />
          </div>
        )}
        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => load(periodDays, kodeDepo)} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
          </div>
        )}
        {!loading && !error && usage && isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-popover flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Belum ada aktivitas pada periode ini</p>
            <p className="mt-1 text-xs text-gray-400 max-w-xs">Aktivitas penggunaan sistem akan muncul di sini setelah sistem mulai dipakai.</p>
          </div>
        )}
        {!loading && !error && usage && !isEmpty && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-xl bg-popover px-4 py-3">
                <p className="text-xs text-muted-foreground">Total aktivitas</p>
                <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{totalRequests.toLocaleString('id-ID')}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-gray-400">Aksi tercatat, bukan jumlah dokumen</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                <p className="text-xs text-emerald-700">Login berhasil</p>
                <p className="mt-1 text-xl font-bold text-emerald-900 tabular-nums">{totalLogins.toLocaleString('id-ID')}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-emerald-700/70">Jumlah login pada periode ini</p>
              </div>
              <div className="rounded-xl bg-cyan-50 px-4 py-3">
                <p className="text-xs text-cyan-700">Puncak user aktif</p>
                <p className="mt-1 text-xl font-bold text-cyan-900 tabular-nums">{peakUsers}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-cyan-700/70">Terbanyak dalam satu hari</p>
              </div>
              <div className="rounded-xl bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-700">User teratas</p>
                <p className="mt-1 text-sm font-bold text-amber-900 truncate">{topUsers[0]?.name ?? 'Belum ada data'}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-amber-700/70">Paling banyak aktivitas</p>
              </div>
            </div>

            <div className="h-56 flex items-end gap-1 sm:gap-1.5 border-b border-gray-100" role="group" aria-label={`Grafik aktivitas harian: total ${totalRequests.toLocaleString('id-ID')} aktivitas dalam ${daily.length} hari`}>
              {daily.map((day, index) => (
                <div
                  key={day.date}
                  tabIndex={0}
                  role="img"
                  aria-label={`${formatDate(day.date)}: ${day.requests.toLocaleString('id-ID')} aktivitas, ${(day.logins ?? 0).toLocaleString('id-ID')} login, ${day.active_users} user aktif`}
                  className="h-full flex-1 min-w-0 flex flex-col justify-end items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
                >
                  <div
                    className="w-full max-w-5 rounded-t bg-linear-to-t from-cyan-500 to-cyan-400 group-hover:from-cyan-600 group-hover:to-cyan-500 transition-all duration-200"
                    style={{ height: `${Math.max((day.requests / maxRequests) * 100, day.requests > 0 ? 3 : 0)}%` }}
                  />
                  <span className="text-[10px] text-gray-400 truncate max-w-full">
                    {index % labelStep === 0 ? new Date(`${day.date}T00:00:00`).getDate() : ''}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" aria-hidden="true" />
              Login + seluruh proses sistem per hari
              {activeUsers > 0 && (
                <span className="rounded-full bg-popover px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                  {activeUsers.toLocaleString('id-ID')} user aktif
                </span>
              )}
            </div>

            {topModules.length > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-800">Aktivitas per modul</h3>
                  <span className="text-[11px] text-gray-400">Jumlah aksi</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {topModules.slice(0, 8).map((item) => (
                    <div key={item.module}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-600 truncate">{item.module}</span>
                        <span className="font-bold text-gray-900 tabular-nums shrink-0">
                          {item.requests.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-popover overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-500"
                          style={{ width: `${Math.max((item.requests / maxModuleRequests) * 100, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topUsers.length > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-800">User paling aktif</h3>
                  <span className="text-[11px] text-gray-400">Jumlah aksi</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {topUsers.slice(0, 4).map((user) => (
                    <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl bg-popover px-3 py-2.5 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 bg-linear-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {user.name?.charAt(0) || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
                          <p className="text-xs text-gray-400 truncate">{user.level}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0">{user.requests.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardPanel>
  );
}
