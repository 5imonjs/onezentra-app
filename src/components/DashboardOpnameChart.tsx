'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { opnameExpired, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface DepotProgress {
  kode_depo: string;
  nama_depo: string | null;
  total: number;
  validated: number;
  has_session: boolean;
  submitted: boolean;
}

/**
 * Chart progres opname expired per depo di dashboard utama: batang
 * tervalidasi/total + titik status kirim. Terlihat semua depo bagi pemegang
 * `opname.progress_all` (backend membuka scope), depo sendiri bila tidak.
 */
export default function DashboardOpnameChart() {
  const { hasPermission } = useAuthStore();
  const [depots, setDepots] = useState<DepotProgress[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await opnameExpired.progress() as {
        data: { data: { week_start: string; depots: DepotProgress[] } };
      };
      if (reqIdRef.current !== reqId) return;
      setWeekStart(res.data.data.week_start);
      setDepots(res.data.data.depots);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(getErrorMessage(e, 'Gagal memuat progres opname.'));
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!hasPermission('opname.view')) return null;

  const max = Math.max(...depots.map((d) => d.total), 1);
  const done = depots.filter((d) => d.submitted).length;

  return (
    <section aria-label="Progres opname expired" className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-surface-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Progres Opname Expired</h2>
          <p className="text-sm text-gray-500">
            {weekStart ? `Minggu ${weekStart} · ` : ''}{done}/{depots.length} depo sudah kirim
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Muat ulang progres opname"
            aria-describedby={error ? 'opname-chart-error' : undefined}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 min-w-11 min-h-11 flex items-center justify-center"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          </button>
          <Link href="/opname-expired" className="text-xs font-semibold text-accent-text hover:underline">Buka Batch Expired</Link>
        </div>
      </div>
      <div className="px-6 py-4">
        {loading && depots.length === 0 ? (
          <p className="text-sm text-gray-500">Memuat...</p>
        ) : error ? (
          <div id="opname-chart-error" role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="flex-1 text-sm text-red-700">{error}</span>
            <button onClick={() => load()} disabled={loading} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
              Coba lagi
            </button>
          </div>
        ) : depots.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada wave minggu ini — Generate dulu di Batch Expired.</p>
        ) : (
          <ul className="space-y-3">
            {depots.map((d) => {
              const pct = d.total > 0 ? Math.round((d.validated / d.total) * 100) : 100;
              return (
                <li key={d.kode_depo}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${d.submitted ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                      <span className="font-semibold text-slate-700 truncate">{d.nama_depo || d.kode_depo}</span>
                    </span>
                    <span className="text-xs tabular-nums text-slate-500 whitespace-nowrap">{d.validated}/{d.total} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${d.nama_depo || d.kode_depo}`}>
                    <div className={`h-full rounded-full transition-all duration-300 ${d.submitted ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
