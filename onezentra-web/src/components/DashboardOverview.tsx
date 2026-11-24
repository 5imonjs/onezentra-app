'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';

/** Baris KPI "At-a-Glance": angka nyata +(label singkat) + arah ke modul. */
export default function DashboardOverview() {
  const { hasPermission } = useAuthStore();
  const { summary, loading } = useDashboardSummary();
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setRefreshedAt(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <section aria-label="Ringkasan KPI" aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </section>
    );
  }

  const alerts = summary.alerts ?? { standarisasi_pending: 0, extra_item_pending: 0, expired_kritis: 0, expired_total: 0 };
  const incoming = summary.incoming ?? { today: 0, tomorrow: 0, overdue: 0 };
  const sla = summary.sla;
  const decisions = alerts.standarisasi_pending + alerts.extra_item_pending;
  const unload = sla?.avg_unload_hours ?? null;
  const trend = summary.activity_trend ?? { current_7d: 0, prev_7d: 0 };
  const trendMax = Math.max(trend.current_7d, trend.prev_7d, 1);

  const hoursLabel = (h: number | null) => {
    if (h === null) return '-';
    const minutes = Math.round(h * 60);
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return hh === 0 ? `${mm} mnt` : mm === 0 ? `${hh} jam` : `${hh}j ${mm}m`;
  };

  const cards = [
    {
      label: 'Menunggu keputusan', value: decisions.toLocaleString('id-ID'), sub: 'standarisasi + barang luar rencana',
      href: '/standarisasi', tone: 'text-amber-600', permission: 'standarisasi.view',
    },
    {
      label: 'Tiba hari ini', value: incoming.today.toLocaleString('id-ID'), sub: `besok ${incoming.tomorrow} PO`,
      href: '/rencana-kirim?eta=today', tone: 'text-info', permission: 'rencana_kirim.view',
    },
    {
      label: 'Lewat ETA', value: incoming.overdue.toLocaleString('id-ID'), sub: 'belum check-in',
      href: '/rencana-kirim?eta=overdue', tone: 'text-destructive', permission: 'rencana_kirim.view',
    },
    {
      label: 'Durasi bongkar', value: hoursLabel(unload), sub: 'rata-rata check-in → selesai',
      href: '/reports/rencana-kirim', tone: 'text-foreground', permission: 'receiving.view',
    },
    {
      label: 'Kritis + Expired', value: (alerts.expired_total ?? 0).toLocaleString('id-ID'), sub: `${alerts.expired_kritis ?? 0} kritis · ${summary.opname_at_risk?.expired_rows ?? 0} expired`,
      href: '/opname-expired', tone: 'text-red-600', permission: 'opname.view',
    },
    {
      label: 'SJ belum divalidasi', value: (sla?.sj_open_count ?? 0).toLocaleString('id-ID'), sub: 'dokumen terbuka',
      href: '/validasi-sj', tone: 'text-foreground', permission: 'sj_validation.view',
    },
  ].filter((card) => hasPermission(card.permission));

  return (
    <section aria-label="Ringkasan KPI" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Ringkasan Hari Ini</h2>
          <p className="text-[11px] text-muted-foreground">Angka langsung dari modul operasional</p>
        </div>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          Diperbarui {refreshedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
            <p className={`mt-1.5 text-2xl font-black tabular-nums leading-none ${card.tone}`}>{card.value}</p>
            <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{card.sub}</p>
          </Link>
        ))}
      </div>

      {hasPermission('users.view') && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground">Aktivitas 7 hari</p>
          <div className="flex h-8 flex-1 items-end gap-1" role="img" aria-label={`Aktivitas 7 hari ini ${trend.current_7d} dibanding ${trend.prev_7d} minggu lalu`}>
            <div className="w-6 rounded-t bg-slate-300" style={{ height: `${Math.max(8, (trend.prev_7d / trendMax) * 100)}%` }} title={`Minggu lalu: ${trend.prev_7d}`} />
            <div className="w-6 rounded-t bg-primary-600" style={{ height: `${Math.max(8, (trend.current_7d / trendMax) * 100)}%` }} title={`7 hari ini: ${trend.current_7d}`} />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">{trend.current_7d} vs {trend.prev_7d}</span>
        </div>
      )}
    </section>
  );
}
