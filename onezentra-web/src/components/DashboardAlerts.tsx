'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';
import DashboardCardGrid from '@/components/DashboardCardGrid';

type AlertIcon = 'warning' | 'clock' | 'document' | 'package' | 'chart' | 'scale' | 'truck';

const ALERT_ICONS: Record<AlertIcon, React.ReactNode> = {
  warning: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />,
  clock: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
  document: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />,
  package: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
  chart: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
  scale: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />,
  truck: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
};

function AlertCard({ href, label, value, hint, tone, icon }: {
  href: string;
  label: string;
  value: string;
  hint: string;
  tone: 'red' | 'amber' | 'blue';
  icon: AlertIcon;
}) {
  const tones = {
    red: { box: 'border-red-200 bg-red-50 hover:border-red-300', chip: 'bg-red-500 text-white', num: 'text-red-700', label: 'text-red-600' },
    amber: { box: 'border-amber-200 bg-amber-50 hover:border-amber-300', chip: 'bg-amber-500 text-white', num: 'text-amber-700', label: 'text-amber-600' },
    blue: { box: 'border-blue-200 bg-blue-50 hover:border-blue-300', chip: 'bg-blue-500 text-white', num: 'text-blue-700', label: 'text-blue-600' },
  } as const;
  const t = tones[tone];
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. ${hint}`}
      className={`group flex items-start gap-3 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${t.box}`}
    >
      <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-sm ${t.chip}`}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{ALERT_ICONS[icon]}</svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[11px] font-semibold uppercase tracking-wider ${t.label}`}>{label}</span>
        <span className={`mt-0.5 block text-2xl leading-none tabular-nums font-black ${t.num}`}>{value}</span>
        <span className="mt-1 block truncate text-[11px] text-gray-500">{hint}</span>
      </span>
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
    </Link>
  );
}

export default function DashboardAlerts({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const { summary, loading, failed, reload } = useDashboardSummary(kodeDepo);

  if (loading) return null;

  // Gagal memuat harus terlihat: mengembalikan null diam-diam membuat user
  // mengira "tidak ada peringatan" padahal datanya tidak terbaca.
  if (failed) {
    return (
      <section aria-label="Peringatan" className="rounded-2xl border border-gray-100 bg-surface-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>Gagal memuat peringatan — bisa jadi ada yang terlewat.</span>
          <button type="button" onClick={reload} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      </section>
    );
  }

  const cards: React.ReactNode[] = [];
  if (hasPermission('opname.view') && summary.alerts.expired_total > 0) {
    const atRiskPcs = summary.opname_at_risk ? Math.round(summary.opname_at_risk.pcs) : 0;
    cards.push(
      <AlertCard
        key="expired"
        href="/opname-expired"
        label="Kritis / Kedaluwarsa"
        value={summary.alerts.expired_total.toLocaleString('id-ID')}
        hint={`${summary.alerts.expired_kritis} kritis${atRiskPcs > 0 ? ` • ${atRiskPcs.toLocaleString('id-ID')} pcs` : ' perlu tindakan'}`}
        tone="red"
        icon="warning"
      />
    );
  }
  if (hasPermission('standarisasi.view') && summary.alerts.standarisasi_pending > 0) {
    cards.push(
      <AlertCard
        key="pending"
        href="/standarisasi"
        label="Menunggu Approval"
        value={summary.alerts.standarisasi_pending.toLocaleString('id-ID')}
        hint="Standarisasi tumpukan"
        tone="amber"
        icon="clock"
      />
    );
  }
  // Barang luar rencana menunggu keputusan planner (izin approve, bukan
  // sekadar melihat validasi) — keputusan terjadi di halaman validasi dokumen.
  if (hasPermission('sj_validation.approve') && summary.alerts.extra_item_pending > 0) {
    cards.push(
      <AlertCard
        key="extra-pending"
        href="/validasi-sj"
        label="Barang Luar Rencana"
        value={summary.alerts.extra_item_pending.toLocaleString('id-ID')}
        hint="menunggu keputusan planner"
        tone="amber"
        icon="package"
      />
    );
  }
  if (hasPermission('sj_validation.view') && summary.sla.sj_open_count > 0) {
    cards.push(
      <AlertCard
        key="sj"
        href="/validasi-sj"
        label="Validasi Terbuka"
        value={summary.sla.sj_open_count.toLocaleString('id-ID')}
        hint={summary.sla.sj_oldest_days != null ? `tertua ${summary.sla.sj_oldest_days} hari` : 'perlu validasi'}
        tone="amber"
        icon="document"
      />
    );
  }
  if (hasPermission('npn.view') && (summary.quality.npn_no_volume > 0 || summary.quality.npn_no_umur > 0)) {
    cards.push(
      <AlertCard
        key="quality"
        href="/npn"
        label="Data Produk Kurang"
        value={(summary.quality.npn_no_volume + summary.quality.npn_no_umur).toLocaleString('id-ID')}
        hint={`${summary.quality.npn_no_volume} tanpa volume • ${summary.quality.npn_no_umur} tanpa umur`}
        tone="blue"
        icon="package"
      />
    );
  }

  if (hasPermission('receiving.view') && summary.sla.avg_gate_to_receiving_hours != null) {
    cards.push(
      <AlertCard
        key="sla"
        href="/receiving"
        label="Gate → Receiving"
        value={`${summary.sla.avg_gate_to_receiving_hours} jam`}
        hint="rata-rata 30 hari terakhir"
        tone="blue"
        icon="chart"
      />
    );
  }

  if (hasPermission('receiving.view') && summary.inbound_selisih.items > 0) {
    cards.push(
      <AlertCard
        key="selisih"
        href="/receiving"
        label="Selisih Qty Inbound"
        value={summary.inbound_selisih.items.toLocaleString('id-ID')}
        hint={`${summary.inbound_selisih.kurang} kurang • ${summary.inbound_selisih.lebih} lebih`}
        tone="amber"
        icon="scale"
      />
    );
  }

  if (hasPermission('rencana_kirim.view') && summary.sla.rk_checked_in_count > 0) {
    cards.push(
      <AlertCard
        key="rk"
        href="/rencana-kirim"
        label="RK Tertahan di Gate"
        value={summary.sla.rk_checked_in_count.toLocaleString('id-ID')}
        hint={summary.sla.rk_checked_in_oldest_days != null ? `tertua ${summary.sla.rk_checked_in_oldest_days} hari` : 'belum diverifikasi'}
        tone="amber"
        icon="truck"
      />
    );
  }

  if (cards.length === 0) return null;

  return (
    <section aria-label="Peringatan">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span aria-hidden="true" className="h-4 w-1 rounded-full bg-red-500" />
        <h2 className="text-sm font-bold tracking-tight text-gray-900">Perlu Perhatian</h2>
        <span className="text-xs text-gray-400">· {cards.length} item</span>
      </div>
      <DashboardCardGrid>{cards}</DashboardCardGrid>
    </section>
  );
}
