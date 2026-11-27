'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dashboard, opnameExpired, rencanaKirim } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';
import DashboardPanel from '@/components/DashboardPanel';

type Daily = { date: string; requests: number };
type StatusCount = { key: string; label: string; count: number; color: string };
type DepotProgress = {
  kode_depo: string;
  nama_depo: string | null;
  total: number;
  validated: number;
  submitted?: boolean;
  /** Progres hitungan lapangan dari item sesi (berubah saat mobile input). */
  item_total?: number;
  item_counted?: number;
  item_pct?: number;
  has_open_session?: boolean;
};

/**
 * Target progres hitung per depo: baris item sesi begitu sesi dibuat, atau
 * jumlah wave bila belum ada sesi (`item_total` 0). Tanpa fallback ini kartu
 * menampilkan 0/0 = 0% padahal wave sudah menunggu dihitung.
 */
function depotProgress(d: DepotProgress): { total: number; counted: number } {
  if ((d.item_total ?? 0) > 0) {
    return { total: d.item_total ?? 0, counted: d.item_counted ?? 0 };
  }
  return { total: d.total, counted: d.validated };
}

const ICON_ACTIVITY = <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />;
const ICON_TRUCK = <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25M20.625 18.75a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.9 17.9 0 00-3.213-9.193 2.06 2.06 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.6 48.6 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677" />;
const ICON_ALERT = <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />;
const ICON_OPNAME = <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.4 48.4 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.868.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />;

const STATUS_KEYS: { key: string; label: string; color: string }[] = [
  { key: 'DRAFT', label: 'Draft', color: 'text-slate-400' },
  { key: 'SCHEDULED', label: 'Dijadwalkan', color: 'text-blue-500' },
  { key: 'CHECKED_IN', label: 'Check-in', color: 'text-amber-500' },
  { key: 'VERIFIED', label: 'Terverifikasi', color: 'text-violet-500' },
  { key: 'IN_PROGRESS', label: 'Diproses', color: 'text-orange-500' },
  { key: 'COMPLETED', label: 'Selesai', color: 'text-emerald-500' },
  { key: 'CANCELLED', label: 'Dibatalkan', color: 'text-red-500' },
];

/** Tooltip kecil mengikuti tema (token), dipakai semua chart. */
function ChartTip({ x, text }: { x: number; text: string }) {
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-border bg-popover px-2 py-1 text-[10px] font-bold text-foreground shadow-lg"
      style={{ left: `${Math.min(90, Math.max(10, x))}%`, top: 0 }}
      role="tooltip"
    >
      {text}
    </div>
  );
}

/** Grafik area interaktif: hover shows nilai, klik titik → drill-down. */
function AreaChart({ daily, onOpen }: { daily: Daily[]; onOpen: () => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (daily.length === 0) return <p className="text-xs text-muted-foreground">Belum ada aktivitas.</p>;

  const width = 600;
  const height = 150;
  const pad = 8;
  const max = Math.max(...daily.map((d) => d.requests), 1);
  const step = daily.length > 1 ? (width - pad * 2) / (daily.length - 1) : 0;
  const points = daily.map((d, i) => ({
    x: pad + i * step,
    y: height - pad - (d.requests / max) * (height - pad * 2),
    ...d,
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;
  const active = hovered !== null ? points[hovered] : null;

  return (
    <div className="relative pt-6">
      {active && <ChartTip x={(active.x / width) * 100} text={`${active.date.slice(5)} · ${active.requests} aksi`} />}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" preserveAspectRatio="none" role="img"
        aria-label={`Tren aktivitas ${daily.length} hari, tertinggi ${max} aksi`}>
        <defs>
          <linearGradient id="oz-activity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="text-primary-500">
          <path d={area} fill="url(#oz-activity-fill)" className="transition-all duration-500" />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500" />
          {active && (
            <line x1={active.x} y1={pad} x2={active.x} y2={height - pad} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 3" />
          )}
          {points.map((p, i) => (
            <g key={p.date} className="cursor-pointer" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} onClick={onOpen}>
              <rect x={p.x - 12} y={0} width={24} height={height} fill="transparent" />
              <circle cx={p.x} cy={p.y} r={hovered === i ? 5 : 3} fill="currentColor" className="transition-all duration-200">
                <title>{`${p.date}: ${p.requests} aksi`}</title>
              </circle>
            </g>
          ))}
        </g>
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{daily[0].date.slice(5)}</span>
        <span>puncak {max}</span>
        <span>{daily[daily.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

/** Donut interaktif: segmen bisa di-hover & diklik untuk filter status. */
function StatusDonut({ statuses, onSelect }: { statuses: StatusCount[]; onSelect: (key: string) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = statuses.reduce((a, s) => a + s.count, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const active = statuses.find((s) => s.key === hovered);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-36 w-36 shrink-0">
        {active && <ChartTip x={50} text={`${active.label}: ${active.count}`} />}
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img"
          aria-label={`Sebaran ${total} rencana kirim per status`}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="16" className="text-muted/25" />
          {statuses.filter((s) => s.count > 0).map((s) => {
            const length = (s.count / Math.max(total, 1)) * circumference;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle key={s.key} cx="70" cy="70" r={radius} fill="none" stroke="currentColor"
                strokeWidth={hovered === s.key ? 20 : 16}
                strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset}
                className={`${s.color} cursor-pointer transition-all duration-200`}
                onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(s.key)}>
                <title>{`${s.label}: ${s.count}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums text-foreground">{active ? active.count : total}</span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{active ? active.label : 'PO'}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {statuses.map((s) => (
          <li key={s.key}>
            <button
              onClick={() => onSelect(s.key)}
              onMouseEnter={() => setHovered(s.key)}
              onMouseLeave={() => setHovered(null)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-popover"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${s.color}`} />
              <span className="flex-1 text-muted-foreground">{s.label}</span>
              <span className="font-bold tabular-nums text-foreground">{s.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bar exception — tiap bar adalah tautan ke modul terkait. */
function ExceptionBars({ rows, onOpen }: {
  rows: { label: string; count: number; color: string; href: string }[];
  onOpen: (href: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <button key={r.label} onClick={() => onOpen(r.href)} className="block w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-popover">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-bold tabular-nums text-foreground">{r.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/30">
            <div className={`h-full rounded-full bg-current transition-all duration-500 ${r.color}`}
              style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

/** Progress ring — klik membuka modul monitoring. */
function ProgressRing({ depots, onOpen }: { depots: DepotProgress[]; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  // Pakai hitungan item sesi (berubah saat petugas input), bukan wave
  // tervalidasi yang hanya berubah setelah approval web.
  const progress = depots.map(depotProgress);
  const total = progress.reduce((a, p) => a + p.total, 0);
  const counted = progress.reduce((a, p) => a + p.counted, 0);
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
  const sisa = Math.max(total - counted, 0);
  const hasRunningSession = depots.some((d) => d.has_open_session);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <button onClick={onOpen} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className="flex w-full items-center gap-5 rounded-xl p-1 text-left transition-colors hover:bg-popover">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90" role="img" aria-label={`Progres opname ${pct}%`}>
          <circle cx="65" cy="65" r={radius} fill="none" stroke="currentColor" strokeWidth="12" className="text-muted/25" />
          <circle cx="65" cy="65" r={radius} fill="none" stroke="currentColor" strokeWidth={hovered ? 14 : 12} strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circumference} ${circumference}`} className="text-emerald-500 transition-all duration-500" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums text-foreground">{pct}%</span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">terhitung</span>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-base font-black tabular-nums text-foreground">{counted}/{total} terhitung{sisa > 0 ? ` · ${sisa} sisa` : ''}</p>
        <p className="text-sm font-bold tabular-nums text-foreground">{counted} / {total} batch dihitung</p>
        <p className="text-[11px] text-muted-foreground">{progress.filter((p) => p.total > 0 && p.counted >= p.total).length} dari {depots.length} depo tuntas hitung</p>
        <ul className="mt-2 space-y-1">
          {depots.slice(0, 3).map((d) => {
            const p = depotProgress(d);
            return (
              <li key={d.kode_depo} className="flex justify-between text-[11px]">
                <span className="truncate text-muted-foreground">{d.nama_depo || d.kode_depo}</span>
                <span className="font-bold tabular-nums text-foreground">{p.counted}/{p.total}</span>
              </li>
            );
          })}
        </ul>
        {hasRunningSession && (
          <p className="mt-2 text-[11px] font-semibold text-emerald-600">
            Sesi berjalan sedang dicatat — lihat per baris imputasi.
          </p>
        )}
      </div>
    </button>
  );
}

/** Dashboard chart-driven, interaktif, dan theme-aware. */
export default function DashboardInsights({ kodeDepo }: { kodeDepo?: string }) {
  const router = useRouter();
  const { hasPermission } = useAuthStore();
  const { summary } = useDashboardSummary(kodeDepo);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [statuses, setStatuses] = useState<StatusCount[]>([]);
  const [depots, setDepots] = useState<DepotProgress[]>([]);
  const [lastProgressUpdate, setLastProgressUpdate] = useState<Date | null>(null);

  const canActivity = hasPermission('activity.view');
  const canRencana = hasPermission('rencana_kirim.view');
  const canOpname = hasPermission('opname.view');

  const loadProgress = useCallback(async () => {
    if (!canOpname) return;
    try {
      const res = await opnameExpired.progress();
      setDepots((res.data?.data?.depots ?? []) as DepotProgress[]);
      setLastProgressUpdate(new Date());
    } catch {
      setDepots([]);
    }
  }, [canOpname]);

  const load = useCallback(async () => {
    const requests: Promise<void>[] = [];
    if (canActivity) {
      requests.push(dashboard.activity(7, kodeDepo)
        .then((res) => setDaily((res.data?.data?.daily ?? []) as Daily[]))
        .catch(() => setDaily([])));
    }
    if (canRencana) {
      requests.push(rencanaKirim.stats(kodeDepo)
        .then((res) => {
          const data = res.data?.data ?? {};
          setStatuses(STATUS_KEYS.map((s) => ({
            ...s, count: Number(data[s.key]?.count ?? 0),
          })));
        })
        .catch(() => setStatuses([])));
    }
    requests.push(loadProgress());
    await Promise.all(requests);
  }, [canActivity, canRencana, kodeDepo, loadProgress]);

  useEffect(() => { void load(); }, [load]);

  // "Real-time" yang dapat diandalkan tanpa WebSocket: tarik ulang progres
  // secara berkala HANYA saat tab terlihat, plus langsung saat tab difokuskan.
  // Permintaan lain di dashboard tidak ikut di-poll supaya ringan.
  useEffect(() => {
    if (!canOpname) return;
    const refresh = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void loadProgress();
      }
    };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [canOpname, loadProgress]);

  const alerts = summary.alerts ?? { standarisasi_pending: 0, extra_item_pending: 0, expired_kritis: 0, expired_total: 0 };
  const incoming = summary.incoming ?? { today: 0, tomorrow: 0, overdue: 0 };
  const exceptionRows = [
    { label: 'Lewat ETA belum check-in', count: incoming.overdue, color: 'text-red-500', href: '/rencana-kirim?eta=overdue' },
    { label: 'Standarisasi pending', count: alerts.standarisasi_pending, color: 'text-amber-500', href: '/standarisasi' },
    { label: 'Barang luar rencana', count: alerts.extra_item_pending, color: 'text-orange-500', href: '/validasi-sj' },
    { label: 'SJ belum divalidasi', count: summary.sla?.sj_open_count ?? 0, color: 'text-blue-500', href: '/validasi-sj' },
    { label: 'Kritis + Expired', count: alerts.expired_total, color: 'text-red-600', href: '/opname-expired' },
  ];

  if (!canActivity && !canRencana && !canOpname) return null;

  return (
    <section aria-label="Wawasan operasional" data-testid="dashboard-insights" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {canActivity && (
        <DashboardPanel ariaLabel="Aktivitas 7 Hari" title="Aktivitas 7 Hari" subtitle="Hover untuk nilai · klik untuk detail" icon={ICON_ACTIVITY}
          badge={<span className="rounded-full bg-popover px-2 py-0.5 text-[11px] font-bold text-foreground ring-1 ring-border/70">{daily.length} hari</span>}>
          <div className="p-4 sm:p-5"><AreaChart daily={daily} onOpen={() => router.push('/users')} /></div>
        </DashboardPanel>
      )}
      {canRencana && (
        <DashboardPanel ariaLabel="Sebaran Rencana Kirim" title="Sebaran Rencana Kirim" subtitle="Klik status untuk memfilter daftar" icon={ICON_TRUCK}
          badge={<span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent-text ring-1 ring-primary-500/20">{statuses.reduce((a, s) => a + s.count, 0)} PO</span>}>
          <div className="p-4 sm:p-5"><StatusDonut statuses={statuses} onSelect={(key) => router.push(`/rencana-kirim?status=${key}`)} /></div>
        </DashboardPanel>
      )}
      <DashboardPanel ariaLabel="Peta Exception" title="Peta Exception" subtitle="Klik bar untuk membuka modul" icon={ICON_ALERT}
        badge={<span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-red-600 ring-1 ring-red-500/20">{exceptionRows.reduce((a, r) => a + r.count, 0)}</span>}>
        <div className="p-4 sm:p-5"><ExceptionBars rows={exceptionRows} onOpen={(href) => router.push(href)} /></div>
      </DashboardPanel>
      {canOpname && (
        <DashboardPanel
          ariaLabel="Progres Monitoring Expired"
          title="Progres Monitoring Expired"
          subtitle={lastProgressUpdate
            ? `Diperbarui ${lastProgressUpdate.toLocaleTimeString('id-ID')} · klik untuk monitoring`
            : 'Klik untuk membuka monitoring'}
          icon={ICON_OPNAME}
          badge={
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-600 ring-1 ring-emerald-500/20">{depots.length} depo</span>
              <button
                type="button"
                onClick={() => void loadProgress()}
                title="Segarkan progres sekarang"
                aria-label="Segarkan progres"
                className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-bold text-foreground transition-colors hover:bg-popover"
              >
                ↻
              </button>
            </span>
          }>
          <div className="p-4 sm:p-5"><ProgressRing depots={depots} onOpen={() => router.push('/opname-expired')} /></div>
        </DashboardPanel>
      )}
    </section>
  );
}
