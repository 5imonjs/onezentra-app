'use client';

import { useCallback, useEffect, useState } from 'react';
import { dashboard, opnameExpired, rencanaKirim } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';

type Daily = { date: string; requests: number };
type StatusCount = { label: string; count: number; color: string };
type DepotProgress = { kode_depo: string; nama_depo: string | null; total: number; validated: number; submitted?: boolean };

const STATUS_KEYS: { key: string; label: string; color: string }[] = [
  { key: 'DRAFT', label: 'Draft', color: 'text-slate-400' },
  { key: 'SCHEDULED', label: 'Dijadwalkan', color: 'text-blue-500' },
  { key: 'CHECKED_IN', label: 'Check-in', color: 'text-amber-500' },
  { key: 'VERIFIED', label: 'Terverifikasi', color: 'text-violet-500' },
  { key: 'IN_PROGRESS', label: 'Diproses', color: 'text-orange-500' },
  { key: 'COMPLETED', label: 'Selesai', color: 'text-emerald-500' },
  { key: 'CANCELLED', label: 'Dibatalkan', color: 'text-red-500' },
];

function Card({ title, subtitle, children, action }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Grafik area 7 hari — data dari /dashboard/activity. */
function AreaChart({ daily }: { daily: Daily[] }) {
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

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" preserveAspectRatio="none" role="img"
        aria-label={`Tren aktivitas ${daily.length} hari, tertinggi ${max} aksi`}>
        <defs>
          <linearGradient id="oz-activity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="text-primary-500">
          <path d={area} fill="url(#oz-activity-fill)" />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p) => (
            <circle key={p.date} cx={p.x} cy={p.y} r="3" fill="currentColor">
              <title>{`${p.date}: ${p.requests} aksi`}</title>
            </circle>
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

/** Donut sebaran status Rencana Kirim. */
function StatusDonut({ statuses }: { statuses: StatusCount[] }) {
  const total = statuses.reduce((a, s) => a + s.count, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img"
          aria-label={`Sebaran ${total} rencana kirim per status`}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="16" className="text-muted/20" />
          {statuses.filter((s) => s.count > 0).map((s) => {
            const length = (s.count / Math.max(total, 1)) * circumference;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle key={s.label} cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="16"
                strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset}
                className={s.color}>
                <title>{`${s.label}: ${s.count}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums text-foreground">{total}</span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">PO</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {statuses.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${s.color}`} />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="font-bold tabular-nums text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bar horizontal untuk campuran exception. */
function ExceptionBars({ rows }: { rows: { label: string; count: number; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-bold tabular-nums text-foreground">{r.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/30">
            <div className={`h-full rounded-full bg-current transition-all duration-500 ${r.color}`}
              style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Progress ring progres opname. */
function ProgressRing({ depots }: { depots: DepotProgress[] }) {
  const total = depots.reduce((a, d) => a + d.total, 0);
  const validated = depots.reduce((a, d) => a + d.validated, 0);
  const pct = total > 0 ? Math.round((validated / total) * 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90" role="img" aria-label={`Progres opname ${pct}%`}>
          <circle cx="65" cy="65" r={radius} fill="none" stroke="currentColor" strokeWidth="12" className="text-muted/20" />
          <circle cx="65" cy="65" r={radius} fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circumference} ${circumference}`} className="text-emerald-500" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums text-foreground">{pct}%</span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">tervalidasi</span>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold tabular-nums text-foreground">{validated} / {total} item</p>
        <p className="text-[11px] text-muted-foreground">{depots.filter((d) => d.submitted).length || depots.filter((d) => d.validated >= d.total && d.total > 0).length} dari {depots.length} depo selesai</p>
        <ul className="mt-2 space-y-1">
          {depots.slice(0, 3).map((d) => (
            <li key={d.kode_depo} className="flex justify-between text-[11px]">
              <span className="truncate text-muted-foreground">{d.nama_depo || d.kode_depo}</span>
              <span className="font-bold tabular-nums text-foreground">{d.validated}/{d.total}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Dashboard chart-driven: semua panel memakai visualisasi dengan data nyata. */
export default function DashboardInsights({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const { summary } = useDashboardSummary(kodeDepo);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [statuses, setStatuses] = useState<StatusCount[]>([]);
  const [depots, setDepots] = useState<DepotProgress[]>([]);

  const canActivity = hasPermission('users.view');
  const canRencana = hasPermission('rencana_kirim.view');
  const canOpname = hasPermission('opname.view');

  const load = useCallback(async () => {
    const requests: Promise<void>[] = [];

    if (canActivity) {
      requests.push(
        dashboard.activity(7, kodeDepo).then((res) => {
          const rows = (res.data?.data?.daily ?? []) as Daily[];
          setDaily(rows);
        }).catch(() => setDaily([])),
      );
    }
    if (canRencana) {
      requests.push(
        rencanaKirim.stats(kodeDepo).then((res) => {
          const data = res.data?.data ?? {};
          setStatuses(STATUS_KEYS.map((s) => ({
            label: s.label, color: s.color,
            count: Number(data[s.key]?.count ?? 0),
          })));
        }).catch(() => setStatuses([])),
      );
    }
    if (canOpname) {
      requests.push(
        opnameExpired.progress().then((res) => {
          const rows = (res.data?.data?.depots ?? []) as DepotProgress[];
          setDepots(rows);
        }).catch(() => setDepots([])),
      );
    }

    await Promise.all(requests);
  }, [canActivity, canRencana, canOpname, kodeDepo]);

  useEffect(() => { void load(); }, [load]);

  const alerts = summary.alerts ?? { standarisasi_pending: 0, extra_item_pending: 0, expired_kritis: 0, expired_total: 0 };
  const incoming = summary.incoming ?? { today: 0, tomorrow: 0, overdue: 0 };
  const sjOpen = summary.sla?.sj_open_count ?? 0;
  const exceptionRows = [
    { label: 'Lewat ETA belum check-in', count: incoming.overdue, color: 'text-red-500' },
    { label: 'Standarisasi pending', count: alerts.standarisasi_pending, color: 'text-amber-500' },
    { label: 'Barang luar rencana', count: alerts.extra_item_pending, color: 'text-orange-500' },
    { label: 'SJ belum divalidasi', count: sjOpen, color: 'text-blue-500' },
    { label: 'Barang expired', count: alerts.expired_total, color: 'text-red-600' },
  ];

  if (!canActivity && !canRencana && !canOpname) return null;

  return (
    <section aria-label="Wawasan operasional" data-testid="dashboard-insights" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {canActivity && (
        <Card title="Aktivitas 7 Hari" subtitle="Aksi pengguna sistem per hari">
          <AreaChart daily={daily} />
        </Card>
      )}
      {canRencana && (
        <Card title="Sebaran Rencana Kirim" subtitle="Status pengiriman per PO">
          <StatusDonut statuses={statuses} />
        </Card>
      )}
      <Card title="Peta Exception" subtitle="Yang perlu ditindaklanjuti">
        <ExceptionBars rows={exceptionRows} />
      </Card>
      {canOpname && (
        <Card title="Progres Monitoring Expired" subtitle="Item tervalidasi minggu ini">
          <ProgressRing depots={depots} />
        </Card>
      )}
    </section>
  );
}
