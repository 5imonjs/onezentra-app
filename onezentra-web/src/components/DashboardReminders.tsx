'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { dashboard, getErrorMessage } from '@/lib/api';
import DashboardPanel from '@/components/DashboardPanel';

type ReminderItem = {
  id: number;
  title: string;
  subtitle: string;
  elapsed_minutes: number;
  at: string | null;
};

type ReminderGroup = {
  key: string;
  label: string;
  href: string;
  count: number;
  items: ReminderItem[];
};

type ReminderData = {
  threshold_minutes: number;
  generated_at: string;
  total: number;
  groups: ReminderGroup[];
};

const REMINDER_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0zM12 3V1.5m0 19.5V19m9-7h1.5M3.5 12H2m16.364-6.364 1.061-1.061M4.575 17.425l-1.061 1.061" />;

const TONES: Record<string, { dot: string; chip: string; tile: string }> = {
  sj_validation: { dot: 'bg-amber-500', chip: 'bg-amber-500/10 text-amber-600 ring-amber-500/20', tile: 'bg-amber-500/10 text-amber-600' },
  gate: { dot: 'bg-blue-500', chip: 'bg-blue-500/10 text-blue-600 ring-blue-500/20', tile: 'bg-blue-500/10 text-blue-600' },
  rencana_kirim: { dot: 'bg-sky-500', chip: 'bg-sky-500/10 text-sky-600 ring-sky-500/20', tile: 'bg-sky-500/10 text-sky-600' },
};

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} jam ${rest} mnt` : `${hours} jam`;
}

/**
 * Panel reminder keterlambatan proses (validasi SJ, gate, rencana kirim).
 * Satu endpoint dengan mobile — angka keterlambatan dihitung server.
 */
export default function DashboardReminders({ kodeDepo }: { kodeDepo?: string }) {
  const [data, setData] = useState<ReminderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = (await dashboard.reminders(kodeDepo)) as { data?: { data?: ReminderData } };
      const payload = res.data?.data;
      if (!payload) throw new Error('invalid');
      setData(payload);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat reminder.'));
    } finally {
      setLoading(false);
    }
  }, [kodeDepo]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    if (error) {
      return (
        <section aria-label="Reminder proses tertunda" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
          </div>
        </section>
      );
    }
    return (
      <section aria-label="Reminder proses tertunda" aria-busy="true" role="status" className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
        <div className="mb-3 h-4 w-52 animate-pulse rounded-full bg-popover" />
        <div className="h-16 animate-pulse rounded-xl bg-popover" />
      </section>
    );
  }

  if (data.total === 0 || data.groups.length === 0) return null;

  return (
    <DashboardPanel
      ariaLabel="Reminder proses tertunda"
      title="Proses Tertunda"
      subtitle={`Belum selesai lebih dari ${data.threshold_minutes} menit`}
      icon={REMINDER_ICON}
      badge={
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold tabular-nums text-amber-600 ring-1 ring-amber-500/20">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
          {data.total} perlu tindakan
        </span>
      }
    >
      <div className="divide-y divide-border/60">
        {data.groups.map((group) => {
          const tone = TONES[group.key] ?? TONES.sj_validation;
          return (
            <div key={group.key} className="px-5 py-3.5">
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                <h3 className="truncate text-[13px] font-semibold text-foreground">{group.label}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${tone.chip}`}>{group.count}</span>
                <Link href={group.href} className="ml-auto shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-popover hover:text-foreground">
                  Lihat semua →
                </Link>
              </div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link href={group.href} className="flex items-center gap-3 rounded-xl border border-border/70 bg-popover/60 px-3 py-2.5 transition-colors hover:bg-card">
                      <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone.tile}`}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{item.subtitle}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${tone.chip}`} title={item.at ?? undefined}>
                        {formatElapsed(item.elapsed_minutes)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
