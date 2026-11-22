'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatRelativeTime } from '@/lib/dashboardSummary';
import { dashboard, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import DashboardPanel from '@/components/DashboardPanel';

const HISTORY_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0z" />;

type ActivityEvent = {
  id: number;
  user_id: number | null;
  user_name: string;
  level: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  method: string;
  route: string;
  module: string;
  action: string;
  occurred_at: string;
};

const MODULE_TONES = [
  'bg-primary-500/10 text-accent-text ring-primary-500/20',
  'bg-teal-500/10 text-teal-600 ring-teal-500/20',
  'bg-amber-500/10 text-amber-600 ring-amber-500/20',
  'bg-popover text-foreground ring-border/70',
];

function moduleTone(module: string): string {
  let hash = 0;
  for (let i = 0; i < module.length; i++) {
    hash = (hash * 31 + module.charCodeAt(i)) >>> 0;
  }
  return MODULE_TONES[hash % MODULE_TONES.length];
}

/**
 * Feed "Aktivitas Terbaru" dari LOG AKTIVITAS (audit trail).
 *
 * Sumbernya `GET /dashboard/activity/live` yang mencatat semua request API —
 * termasuk aksi dari mobile dan LOGIN/LOGOUT. Panel ini hanya tampil untuk
 * pemegang izin `activity.view` yang diatur per role di Role & Permission.
 */
export default function DashboardRecent({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const canView = hasPermission('activity.view');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef(0);

  const load = useCallback(async (reset = false) => {
    if (reset) {
      lastId.current = 0;
    }
    try {
      const res = await dashboard.liveActivity(lastId.current, kodeDepo);
      const incoming = (res.data?.data?.events ?? []) as ActivityEvent[];
      if (incoming.length > 0) {
        lastId.current = Math.max(lastId.current, ...incoming.map((e) => e.id));
      }
      setEvents((prev) => {
        if (reset) {
          return incoming.slice(0, 30);
        }
        const seen = new Set(prev.map((e) => e.id));
        return [...incoming.filter((e) => !seen.has(e.id)), ...prev].slice(0, 30);
      });
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat aktivitas terbaru.'));
    } finally {
      setLoading(false);
    }
  }, [kodeDepo]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void load(true);
  }, [canView, load]);

  // Polling ringan: endpoint ini sengaja tidak ikut dicatat agar tidak
  // membanjiri log dengan permintaannya sendiri.
  useEffect(() => {
    if (!canView) {
      return;
    }
    const refresh = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void load();
      }
    };
    const timer = window.setInterval(refresh, 5_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [canView, load]);

  if (!canView) {
    return null;
  }

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

  if (error && events.length === 0) {
    return (
      <section aria-label="Aktivitas terbaru" className="bg-card rounded-2xl shadow-sm border border-border p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void load(true)} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <DashboardPanel
      ariaLabel="Aktivitas terbaru"
      title="Aktivitas Terbaru"
      subtitle="Log aktivitas lintas modul · termasuk mobile & login"
      badge={<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-500/20 ring-offset-1">LIVE</span>}
      icon={HISTORY_ICON}
    >
      <ul className="space-y-1 px-3 py-3">
        {events.map((event) => (
          <li key={event.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-popover/70">
            <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ${moduleTone(event.module)}`}>
              {event.module}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground truncate">{event.action}</span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {event.user_name || 'Sistem'}
                {event.nama_depo || event.kode_depo ? ` · ${event.nama_depo || event.kode_depo}` : ''}
                {event.level ? ` · ${event.level}` : ''}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-popover px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-border/60">
              {formatRelativeTime(event.occurred_at)}
            </span>
          </li>
        ))}
      </ul>
    </DashboardPanel>
  );
}
