'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { opnameExpired, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import DashboardPanel from '@/components/DashboardPanel';

const OPNAME_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />;

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

  const done = depots.filter((d) => d.submitted).length;

  return (
    <DashboardPanel
      ariaLabel="Progres opname expired"
      title="Progres Opname Expired"
      icon={OPNAME_ICON}
      subtitle={<>{weekStart ? `Minggu ${weekStart} · ` : ''}{done}/{depots.length} depo sudah kirim</>}
      actions={
        <>
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
          <Link href="/opname-expired" className="whitespace-nowrap text-xs font-semibold text-accent-text hover:underline">Buka Batch Expired</Link>
        </>
      }
    >
      <div className="px-6 py-4">
        {loading && depots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : error ? (
          <div id="opname-chart-error" role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="flex-1 text-sm text-red-700">{error}</span>
            <button onClick={() => load()} disabled={loading} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
              Coba lagi
            </button>
          </div>
        ) : depots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada wave minggu ini — Generate dulu di Batch Expired.</p>
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
                    <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">{d.validated}/{d.total} · {pct}%</span>
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
    </DashboardPanel>
  );
}
