'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboard, getErrorMessage } from '@/lib/api';
import { formatRelativeTime } from '@/lib/dashboardSummary';
import { useAuthStore } from '@/store/auth';
import DashboardPanel from '@/components/DashboardPanel';

const LIVE_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />;

const POLL_INTERVAL_MS = 5_000;
const MAX_EVENTS = 50;

type ActivityEvent = {
  id: number;
  user_id: number;
  user_name: string;
  level: string;
  kode_depo: string | null;
  nama_depo: string | null;
  method: string;
  route: string;
  module: string;
  action: string;
  occurred_at: string;
};

type LivePayload = {
  events: ActivityEvent[];
  server_time: string;
};

type LiveResponse = { data?: { data?: LivePayload } };

const METHOD_TONES: Record<string, string> = {
  LOGIN: 'bg-emerald-500/10 text-emerald-600',
  LOGOUT: 'bg-popover text-muted-foreground',
  GET: 'bg-sky-500/10 text-sky-600',
  POST: 'bg-indigo-500/10 text-indigo-600',
  PUT: 'bg-amber-500/10 text-amber-600',
  PATCH: 'bg-amber-500/10 text-amber-600',
  DELETE: 'bg-red-500/10 text-red-600',
};

const METHOD_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  GET: 'Lihat',
  POST: 'Proses',
  PUT: 'Ubah',
  PATCH: 'Ubah',
  DELETE: 'Hapus',
};

function methodTone(method: string): string {
  return METHOD_TONES[method.toUpperCase()] ?? 'bg-popover text-foreground';
}

function methodLabel(method: string): string {
  return METHOD_LABELS[method.toUpperCase()] ?? method.toUpperCase();
}

export default function DashboardLiveActivity({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const lastIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const requestSeqRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (reset = false) => {
    // Polling tidak boleh menumpuk; refresh manual/ganti depo justru harus
    // membatalkan request lama agar respons usang tidak menimpa data baru.
    if (!reset && inFlightRef.current) {
      return;
    }

    const seq = ++requestSeqRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlightRef.current = true;

    if (reset) {
      setLoading(true);
      setError('');
    }

    try {
      const response = await dashboard.liveActivity(
        reset ? 0 : lastIdRef.current,
        kodeDepo,
        controller.signal,
      ) as LiveResponse;
      if (seq !== requestSeqRef.current) {
        return;
      }

      const payload = response.data?.data;

      if (!payload || !Array.isArray(payload.events)) {
        throw new Error('Format aktivitas real-time tidak valid.');
      }

      if (reset) {
        setEvents(payload.events);
      } else if (payload.events.length > 0) {
        setEvents((previous) => {
          const known = new Set(previous.map((event) => event.id));
          const additions = payload.events.filter((event) => !known.has(event.id));

          return [...additions, ...previous].slice(0, MAX_EVENTS);
        });
      }

      const newestId = payload.events.reduce((max, event) => Math.max(max, event.id), 0);
      // Saat ganti depo/reset, ID terakhir harus mengikuti snapshot baru —
      // bukan max lama — agar event baru di depo lain tidak terlewat.
      lastIdRef.current = reset ? newestId : Math.max(lastIdRef.current, newestId);
      setLastUpdated(new Date());
      setError('');
    } catch (exception) {
      // Abort saat unmount/ganti depo bukan kegagalan yang perlu ditampilkan.
      if (seq === requestSeqRef.current && !controller.signal.aborted) {
        setError(getErrorMessage(exception, 'Gagal memuat aktivitas real-time.'));
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        inFlightRef.current = false;
      }
    }
  }, [kodeDepo]);

  useEffect(() => {
    if (!hasPermission('users.view')) {
      return;
    }

    load(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        load();
      }
    }, POLL_INTERVAL_MS);

    const onFocus = () => load();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      requestSeqRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [hasPermission, load]);

  if (!hasPermission('users.view')) {
    return null;
  }

  const connectionLabel = error ? 'Terputus' : lastUpdated ? 'Live' : 'Menghubungkan';
  const connectionDot = error
    ? 'bg-red-500'
    : lastUpdated
      ? 'animate-pulse bg-emerald-500'
      : 'animate-pulse bg-amber-500';

  return (
    <DashboardPanel
      ariaLabel="Aktivitas real-time"
      title="Aktivitas Real-time"
      subtitle={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 ring-1 ring-emerald-500/20">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${connectionDot}`} />
            {connectionLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {lastUpdated
              ? `Diperbarui ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Memuat aktivitas...'}
          </span>
          <span aria-hidden="true">·</span>
          <span>otomatis tiap 5 detik</span>
        </>
      }
      icon={LIVE_ICON}
      actions={
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          aria-label="Muat ulang aktivitas real-time"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-foreground disabled:opacity-50"
        >
          <svg className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      }
    >
      {loading && events.length === 0 && (
        <div className="space-y-3 p-5" aria-label="Memuat aktivitas real-time">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-popover" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-popover" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-popover" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && events.length === 0 && (
        <div className="m-5 flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => load(true)} className="whitespace-nowrap font-semibold hover:underline">
            Coba lagi
          </button>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <p className="text-sm font-semibold text-foreground">Belum ada aktivitas terbaru</p>
          <p className="mt-1 max-w-xs text-xs text-gray-400">
            Aktivitas pengguna akan muncul di sini saat mereka membuka menu atau memproses data.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <>
          {error && (
            <div className="mx-5 mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
              {error} Menampilkan data terakhir yang berhasil dimuat.
            </div>
          )}

          <ul className="max-h-[30rem] space-y-1 overflow-y-auto px-3 py-3" aria-label="Daftar aktivitas real-time">
            {events.map((event, index) => (
              <li key={event.id} className="group relative flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-popover/70">
                {index < events.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[25px] top-11 h-[calc(100%-1.25rem)] w-px bg-linear-to-b from-border to-transparent"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-xs font-bold text-white shadow-md ring-2 ring-card"
                >
                  {event.user_name?.charAt(0)?.toUpperCase() || 'U'}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-5 text-foreground">
                    <span className="font-semibold">{event.user_name}</span>{' '}
                    <span className="text-foreground">{event.action}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-popover px-2 py-0.5 font-semibold text-foreground ring-1 ring-border/70">
                      {event.module}
                    </span>
                    <span>{event.level}</span>
                    {(event.nama_depo || event.kode_depo) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="max-w-40 truncate">{event.nama_depo || event.kode_depo}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span title={new Date(event.occurred_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}>
                      {formatRelativeTime(event.occurred_at)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="max-w-full truncate font-mono text-[10px]" title={event.route}>
                      {event.route}
                    </span>
                  </div>
                </div>

                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ring-black/5 ${methodTone(event.method)}`}>
                  {methodLabel(event.method)}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-border px-5 py-2.5 text-[11px] text-gray-400">
            Menampilkan maksimal {MAX_EVENTS} aktivitas terbaru dari pengguna operasional.
          </div>
        </>
      )}
    </DashboardPanel>
  );
}
