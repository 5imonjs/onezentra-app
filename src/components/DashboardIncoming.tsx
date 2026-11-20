'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';

/**
 * Kedatangan barang yang RENCANA-NYA ditentukan planner lewat ETA.
 * Sengaja dipisah dari gate check-in: BLC bisa melihat "PO ini tiba hari ini"
 * sebelum petugas lapangan melakukan check-in.
 */
export default function DashboardIncoming() {
  const { hasPermission } = useAuthStore();
  const { summary, loading } = useDashboardSummary();

  if (!hasPermission('rencana_kirim.view') || loading) return null;

  const today = summary.incoming?.today ?? 0;
  const tomorrow = summary.incoming?.tomorrow ?? 0;
  const overdue = summary.incoming?.overdue ?? 0;
  if (today === 0 && tomorrow === 0 && overdue === 0) return null;

  return (
    <section aria-label="Kedatangan terjadwal" className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-info/10 text-info ring-1 ring-info/20">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25M20.625 18.75a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.9 17.9 0 00-3.213-9.193 2.06 2.06 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.6 48.6 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">Kedatangan Terjadwal</h2>
          <p className="text-[11px] text-muted-foreground">Rencana tiba dari planner (ETA) — bukan gate check-in</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/rencana-kirim?eta=today"
          className="group flex items-center justify-between gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3 transition-colors hover:bg-info/10"
        >
          <div>
            <p className="text-xs font-semibold text-info">Tiba Hari Ini</p>
            <p className="text-[11px] text-muted-foreground">Klik untuk lihat detail PO</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tabular-nums text-info">{today}</span>
            <span className="text-[11px] text-info">PO</span>
            <svg className="h-4 w-4 text-info transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </div>
        </Link>
        <Link
          href="/rencana-kirim?eta=tomorrow"
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-popover/60 px-4 py-3 transition-colors hover:bg-card"
        >
          <div>
            <p className="text-xs font-semibold text-foreground">Tiba Besok</p>
            <p className="text-[11px] text-muted-foreground">Klik untuk lihat detail PO</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tabular-nums text-foreground">{tomorrow}</span>
            <span className="text-[11px] text-muted-foreground">PO</span>
            <svg className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </div>
        </Link>
        {overdue > 0 && (
          <Link
            href="/rencana-kirim?eta=overdue"
            className="group flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 transition-colors hover:bg-destructive/10"
          >
            <div>
              <p className="text-xs font-semibold text-destructive">Lewat ETA, belum check-in</p>
              <p className="text-[11px] text-muted-foreground">Perlu ditindaklanjuti</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tabular-nums text-destructive">{overdue}</span>
              <span className="text-[11px] text-destructive">PO</span>
              <svg className="h-4 w-4 text-destructive transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
