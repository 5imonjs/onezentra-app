'use client';

import Link from 'next/link';
import { formatRelativeTime, useDashboardSummary } from '@/lib/dashboardSummary';
import DashboardPanel from '@/components/DashboardPanel';

const HISTORY_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />;

const TYPE_TONES: Record<string, string> = {
  'Rencana Kirim': 'bg-amber-100 text-amber-700',
  'Validasi SJ': 'bg-chip-primary text-accent-text',
  'Standarisasi': 'bg-slate-200 text-slate-700',
  'Receiving': 'bg-teal-100 text-teal-700',
};

export default function DashboardRecent({ kodeDepo }: { kodeDepo?: string }) {
  const { summary, loading, failed, reload } = useDashboardSummary(kodeDepo);

  if (loading) return null;

  // Gagal memuat harus terlihat, bukan lenyap diam-diam (lihat DashboardAlerts).
  if (failed) {
    return (
      <section aria-label="Aktivitas terbaru" className="bg-card rounded-2xl shadow-sm border border-gray-100 p-5">
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
      <ul className="divide-y divide-gray-100">
        {summary.recent.map((item, i) => (
          <li key={`${item.type}-${item.title}-${i}`}>
            <Link href={item.href} className="flex items-center gap-3 px-5 py-3 hover:bg-popover transition-colors">
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${TYPE_TONES[item.type] ?? 'bg-slate-100 text-slate-600'}`}>
                {item.type}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800 truncate">{item.title}</span>
                {item.subtitle && <span className="block text-xs text-slate-400 truncate">{item.subtitle}</span>}
              </span>
              <span className="shrink-0 text-xs text-slate-400 tabular-nums">{formatRelativeTime(item.at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardPanel>
  );
}
