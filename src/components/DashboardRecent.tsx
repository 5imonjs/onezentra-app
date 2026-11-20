'use client';

import Link from 'next/link';
import { formatRelativeTime, useDashboardSummary } from '@/lib/dashboardSummary';
import DashboardPanel from '@/components/DashboardPanel';

const HISTORY_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />;

const TYPE_TONES: Record<string, string> = {
  'Rencana Kirim': 'bg-amber-500/10 text-amber-600 ring-amber-500/20',
  'Validasi SJ': 'bg-primary-500/10 text-accent-text ring-primary-500/20',
  'Standarisasi': 'bg-popover text-foreground ring-border/70',
  'Receiving': 'bg-teal-500/10 text-teal-600 ring-teal-500/20',
};

export default function DashboardRecent({ kodeDepo }: { kodeDepo?: string }) {
  const { summary, loading, failed, reload } = useDashboardSummary(kodeDepo);

  if (loading) {
    return (
      <DashboardPanel ariaLabel="Aktivitas terbaru" title="Aktivitas Terbaru" icon={HISTORY_ICON}>
        <div role="status" aria-busy="true" className="space-y-2 px-5 py-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 rounded-xl bg-popover animate-pulse" />
          ))}
        </div>
      </DashboardPanel>
    );
  }

  // Gagal memuat harus terlihat, bukan lenyap diam-diam (lihat DashboardAlerts).
  if (failed) {
    return (
      <section aria-label="Aktivitas terbaru" className="bg-card rounded-2xl shadow-sm border border-border p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          <span>Gagal memuat aktivitas terbaru.</span>
          <button type="button" onClick={reload} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      </section>
    );
  }

  if (summary.recent.length === 0) return null;

  return (
    <DashboardPanel
      ariaLabel="Aktivitas terbaru"
      title="Aktivitas Terbaru"
      subtitle="Perubahan terakhir lintas modul"
      icon={HISTORY_ICON}
    >
      <ul className="space-y-1 px-3 py-3">
        {summary.recent.map((item, i) => (
          <li key={`${item.type}-${item.title}-${i}`}>
            <Link
              href={item.href}
              className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-popover/70"
            >
              <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ${TYPE_TONES[item.type] ?? 'bg-popover text-foreground ring-border/70'}`}>
                {item.type}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground truncate">{item.title}</span>
                {item.subtitle && <span className="block text-[11px] text-muted-foreground truncate">{item.subtitle}</span>}
              </span>
              <span className="shrink-0 rounded-full bg-popover px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-border/60">
                {formatRelativeTime(item.at)}
              </span>
              <svg className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardPanel>
  );
}
