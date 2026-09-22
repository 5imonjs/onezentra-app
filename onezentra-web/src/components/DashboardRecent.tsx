'use client';

import Link from 'next/link';
import { formatRelativeTime, useDashboardSummary } from '@/lib/dashboardSummary';

const TYPE_TONES: Record<string, string> = {
  'Rencana Kirim': 'bg-amber-100 text-amber-700',
  'Validasi SJ': 'bg-indigo-100 text-indigo-700',
  'Standarisasi': 'bg-slate-200 text-slate-700',
  'Receiving': 'bg-teal-100 text-teal-700',
};

export default function DashboardRecent({ kodeDepo }: { kodeDepo?: string }) {
  const { summary, loading, failed } = useDashboardSummary(kodeDepo);

  if (loading || failed || summary.recent.length === 0) return null;

  return (
    <section aria-label="Aktivitas terbaru" className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
        <h2 className="text-lg font-semibold text-gray-900">Aktivitas Terbaru</h2>
        <p className="text-sm text-gray-500">Perubahan terakhir lintas modul</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {summary.recent.map((item, i) => (
          <li key={`${item.type}-${item.title}-${i}`}>
            <Link href={item.href} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors">
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
    </section>
  );
}
