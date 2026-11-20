'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dashboard, opnameExpired, rencanaKirim } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';

type Daily = { date: string; requests: number };
type StatusCount = { key: string; label: string; count: number; color: string };
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
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
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
  const total = depots.reduce((a, d) => a + d.total, 0);
  const validated = depots.reduce((a, d) => a + d.validated, 0);
  const pct = total > 0 ? Math.round((validated / total) * 100) : 0;
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
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">tervalidasi</span>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold tabular-nums text-foreground">{validated} / {total} item</p>
        <p className="text-[11px] text-muted-foreground">{depots.filter((d) => d.validated >= d.total && d.total > 0).length} dari {depots.length} depo selesai</p>
        <ul className="mt-2 space-y-1">
          {depots.slice(0, 3).map((d) => (
            <li key={d.kode_depo} className="flex justify-between text-[11px]">
              <span className="truncate text-muted-foreground">{d.nama_depo || d.kode_depo}</span>
              <span className="font-bold tabular-nums text-foreground">{d.validated}/{d.total}</span>
            </li>
          ))}
        </ul>
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

  const canActivity = hasPermission('users.view');
  const canRencana = hasPermission('rencana_kirim.view');
  const canOpname = hasPermission('opname.view');

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
    if (canOpname) {
      requests.push(opnameExpired.progress()
        .then((res) => setDepots((res.data?.data?.depots ?? []) as DepotProgress[]))
        .catch(() => setDepots([])));
    }
    await Promise.all(requests);
  }, [canActivity, canRencana, canOpname, kodeDepo]);

  useEffect(() => { void load(); }, [load]);

  const alerts = summary.alerts ?? { standarisasi_pending: 0, extra_item_pending: 0, expired_kritis: 0, expired_total: 0 };
  const incoming = summary.incoming ?? { today: 0, tomorrow: 0, overdue: 0 };
  const exceptionRows = [
    { label: 'Lewat ETA belum check-in', count: incoming.overdue, color: 'text-red-500', href: '/rencana-kirim?eta=overdue' },
    { label: 'Standarisasi pending', count: alerts.standarisasi_pending, color: 'text-amber-500', href: '/standarisasi' },
    { label: 'Barang luar rencana', count: alerts.extra_item_pending, color: 'text-orange-500', href: '/validasi-sj' },
    { label: 'SJ belum divalidasi', count: summary.sla?.sj_open_count ?? 0, color: 'text-blue-500', href: '/validasi-sj' },
    { label: 'Barang expired', count: alerts.expired_total, color: 'text-red-600', href: '/opname-expired' },
  ];

  if (!canActivity && !canRencana && !canOpname) return null;

  return (
    <section aria-label="Wawasan operasional" data-testid="dashboard-insights" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {canActivity && (
        <Card title="Aktivitas 7 Hari" subtitle="Hover untuk nilai · klik untuk detail">
          <AreaChart daily={daily} onOpen={() => router.push('/users')} />
        </Card>
      )}
      {canRencana && (
        <Card title="Sebaran Rencana Kirim" subtitle="Klik status untuk memfilter daftar">
          <StatusDonut statuses={statuses} onSelect={(key) => router.push(`/rencana-kirim?status=${key}`)} />
        </Card>
      )}
      <Card title="Peta Exception" subtitle="Klik bar untuk membuka modul">
        <ExceptionBars rows={exceptionRows} onOpen={(href) => router.push(href)} />
      </Card>
      {canOpname && (
        <Card title="Progres Monitoring Expired" subtitle="Klik untuk membuka monitoring">
          <ProgressRing depots={depots} onOpen={() => router.push('/opname-expired')} />
        </Card>
      )}
    </section>
  );
}
