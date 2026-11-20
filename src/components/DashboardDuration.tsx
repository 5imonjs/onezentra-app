'use client';

import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';

/** Rata-rata durasi operasional dari check-in sampai selesai bongkar. */
export default function DashboardDuration() {
  const { hasPermission } = useAuthStore();
  const { summary, loading } = useDashboardSummary();

  if (!hasPermission('receiving.view') || loading) return null;

  const total = summary.sla?.avg_gate_to_receiving_hours ?? null;
  const unload = summary.sla?.avg_unload_hours ?? null;
  if (total === null && unload === null) return null;

  const label = (hours: number | null) => {
    if (hours === null) return '-';
    const minutes = Math.round(hours * 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h === 0 ? `${m} mnt` : m === 0 ? `${h} jam` : `${h} jam ${m} mnt`;
  };

  return (
    <section aria-label="Rata-rata durasi receiving" className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-info/10 text-info ring-1 ring-info/20">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground">Durasi Receiving</h2>
          <p className="text-[11px] text-muted-foreground">Rata-rata 30 hari terakhir</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-info/30 bg-info/5 px-4 py-3">
          <p className="text-[11px] font-semibold text-info">Check-in → Selesai</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-info">{label(total)}</p>
        </div>
        <div className="rounded-xl border border-border bg-popover/60 px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground">Durasi Bongkar</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{label(unload)}</p>
        </div>
      </div>
    </section>
  );
}
