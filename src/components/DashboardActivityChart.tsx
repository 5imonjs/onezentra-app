'use client';

import { useCallback, useEffect, useState } from 'react';
import { dashboard, getErrorMessage } from '@/lib/api';

type UsageDay = { date: string; requests: number; active_users: number };
type TopUser = { id: number; name: string; level: string; requests: number };
type UsagePayload = { from: string; to: string; days: number; daily: UsageDay[]; top_users: TopUser[] };
type UsageResponse = { data?: { data?: UsagePayload } };

const PERIODS = [
  { days: 7, label: '7 hari' },
  { days: 30, label: '30 hari' },
  { days: 90, label: '90 hari' },
] as const;

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function DashboardActivityChart() {
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError('');
    try {
      const response = await dashboard.activity(days) as UsageResponse;
      const payload = response.data?.data;
      if (!payload || !Array.isArray(payload.daily) || !Array.isArray(payload.top_users)) {
        throw new Error('Format data penggunaan sistem tidak valid.');
      }
      setUsage(payload);
    } catch (exception) {
      setError(getErrorMessage(exception, 'Gagal memuat penggunaan sistem.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(periodDays);
  }, [load, periodDays]);

  const daily = Array.isArray(usage?.daily) ? usage.daily : [];
  const topUsers = Array.isArray(usage?.top_users) ? usage.top_users : [];
  const totalRequests = daily.reduce((sum, day) => sum + day.requests, 0);
  const peakUsers = Math.max(...daily.map((day) => day.active_users), 0);
  const maxRequests = Math.max(...daily.map((day) => day.requests), 1);
  const isEmpty = totalRequests === 0;
  // Label tanggal hanya ditampilkan pada sebagian bar agar tidak sesak di layar kecil.
  const labelStep = daily.length > 45 ? 7 : daily.length > 20 ? 3 : daily.length > 10 ? 2 : 1;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Mobilitas Penggunaan Sistem</h2>
          <p className="text-sm text-gray-500">{usage ? `${formatDate(usage.from)} - ${formatDate(usage.to)}` : `${periodDays} hari terakhir`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Pilih periode" className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setPeriodDays(p.days)}
                aria-pressed={periodDays === p.days}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px] ${
                  periodDays === p.days ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => load(periodDays)} disabled={loading} aria-label="Muat ulang penggunaan sistem" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          </button>
        </div>
      </div>

      <div className="p-6">
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="h-20 bg-gray-50 rounded-xl animate-pulse" />
              <div className="h-20 bg-gray-50 rounded-xl animate-pulse" />
              <div className="h-20 bg-gray-50 rounded-xl animate-pulse" />
            </div>
            <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
          </div>
        )}
        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => load(periodDays)} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
          </div>
        )}
        {!loading && !error && usage && isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Belum ada aktivitas pada periode ini</p>
            <p className="mt-1 text-xs text-gray-400 max-w-xs">Aktivitas penggunaan sistem akan muncul di sini setelah sistem mulai dipakai.</p>
          </div>
        )}
        {!loading && !error && usage && !isEmpty && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs text-gray-500">Total aktivitas</p>
                <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{totalRequests.toLocaleString('id-ID')}</p>
              </div>
              <div className="rounded-xl bg-cyan-50 px-4 py-3">
                <p className="text-xs text-cyan-700">Puncak user aktif</p>
                <p className="mt-1 text-xl font-bold text-cyan-900 tabular-nums">{peakUsers}</p>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-700">User teratas</p>
                <p className="mt-1 text-sm font-bold text-amber-900 truncate">{topUsers[0]?.name ?? 'Belum ada data'}</p>
              </div>
            </div>

            <div className="h-56 flex items-end gap-1 sm:gap-1.5 border-b border-gray-100" role="group" aria-label={`Grafik aktivitas harian: total ${totalRequests.toLocaleString('id-ID')} aktivitas dalam ${daily.length} hari`}>
              {daily.map((day, index) => (
                <div
                  key={day.date}
                  tabIndex={0}
                  role="img"
                  aria-label={`${formatDate(day.date)}: ${day.requests.toLocaleString('id-ID')} aktivitas, ${day.active_users} user aktif`}
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

            <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" aria-hidden="true" />
              Aktivitas API per hari
            </div>

            {topUsers.length > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">User paling aktif</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {topUsers.slice(0, 4).map((user) => (
                    <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors">
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
    </section>
  );
}
