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
 * Chart progres monitoring kedaluwarsa per depo di dashboard utama: batang
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
      setError(getErrorMessage(e, 'Gagal memuat progres monitoring.'));
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!hasPermission('opname.view')) return null;

  const done = depots.filter((d) => d.submitted).length;
  const totalRows = depots.reduce((sum, d) => sum + d.total, 0);
  const totalValidated = depots.reduce((sum, d) => sum + d.validated, 0);
  const overallPct = totalRows > 0 ? Math.round((totalValidated / totalRows) * 100) : 0;

  return (
    <DashboardPanel
      ariaLabel="Progres monitoring kedaluwarsa"
      title="Progres Monitoring Kedaluwarsa"
      icon={OPNAME_ICON}
      subtitle={<>{weekStart ? `Minggu ${weekStart} · ` : ''}{done}/{depots.length} depo sudah kirim</>}
      actions={
        <>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Muat ulang progres monitoring"
            aria-describedby={error ? 'opname-chart-error' : undefined}
            className="p-2 text-gray-400 hover:text-foreground hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 min-w-11 min-h-11 flex items-center justify-center"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          </button>
          <Link href="/opname-expired" className="whitespace-nowrap text-xs font-semibold text-accent-text hover:underline">Buka Monitoring Kedaluwarsa</Link>
        </>
      }
    >
      <div className="px-5 py-4">
        {loading && depots.length === 0 ? (
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 animate-pulse rounded-full bg-popover" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/5 animate-pulse rounded bg-popover" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-popover" />
            </div>
          </div>
        ) : error ? (
          <div id="opname-chart-error" role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <span className="flex-1 text-sm text-red-600">{error}</span>
            <button onClick={() => load()} disabled={loading} className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed">
              Coba lagi
            </button>
          </div>
        ) : depots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada baris monitoring minggu ini — buat baris monitoring dulu di Monitoring Kedaluwarsa.</p>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-4 rounded-2xl border border-border/70 bg-linear-to-br from-popover/80 to-card p-3.5">
              <div className="relative h-14 w-14 shrink-0">
                <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90" aria-hidden="true">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-gray-200)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={overallPct === 100 ? 'var(--color-emerald-500)' : 'var(--color-primary-500)'}
                    strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${overallPct} ${100 - overallPct}`}
                    className="transition-all duration-500"
                  />
                </svg>
                <span className="absolute inset-0 grid place-items-center text-sm font-black tabular-nums text-foreground">{overallPct}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan minggu ini</p>
                <p className="mt-0.5 text-base font-bold tracking-tight text-foreground">{done}/{depots.length} depo sudah kirim</p>
                <p className="text-xs tabular-nums text-muted-foreground">{totalValidated}/{totalRows} item tervalidasi</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${overallPct === 100 ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20' : 'bg-amber-500/10 text-amber-600 ring-amber-500/20'}`}>
                {overallPct === 100 ? 'Selesai' : 'Berjalan'}
              </span>
            </div>

            <ul className="space-y-3">
              {depots.map((d) => {
                const pct = d.total > 0 ? Math.round((d.validated / d.total) * 100) : 100;
                return (
                  <li key={d.kode_depo}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${d.submitted ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                        <span className="font-semibold text-foreground truncate">{d.nama_depo || d.kode_depo}</span>
                      </span>
                      <span className="rounded-full bg-popover px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground ring-1 ring-border/70 whitespace-nowrap">{d.validated}/{d.total} · {pct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-popover overflow-hidden ring-1 ring-inset ring-border/60" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${d.nama_depo || d.kode_depo}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${d.submitted ? 'bg-linear-to-r from-emerald-400 to-emerald-600' : 'bg-linear-to-r from-amber-400 to-primary-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </DashboardPanel>
  );
}
