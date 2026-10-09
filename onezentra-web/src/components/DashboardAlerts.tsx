'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useDashboardSummary } from '@/lib/dashboardSummary';
import DashboardCardGrid from '@/components/DashboardCardGrid';

function AlertCard({ href, label, value, hint, tone }: {
  href: string;
  label: string;
  value: string;
  hint: string;
  tone: 'red' | 'amber' | 'blue';
}) {
  const tones = {
    red: { box: 'border-red-200 bg-red-50', num: 'text-red-700', label: 'text-red-600' },
    amber: { box: 'border-amber-200 bg-amber-50', num: 'text-amber-700', label: 'text-amber-600' },
    blue: { box: 'border-blue-200 bg-blue-50', num: 'text-blue-700', label: 'text-blue-600' },
  } as const;
  const t = tones[tone];
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. ${hint}`}
      className={`group bg-surface-card rounded-2xl border p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${t.box}`}
    >
      <p className={`text-xl leading-none tabular-nums font-black ${t.num}`}>{value}</p>
      <p className={`text-xs font-semibold tracking-wider uppercase truncate mt-1 ${t.label}`}>{label}</p>
      <p className="text-[11px] text-slate-500 mt-1 truncate">{hint}</p>
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
      <section aria-label="Peringatan" className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
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
      />
    );
  }

  if (cards.length === 0) return null;

  return (
    <section aria-label="Peringatan">
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Perlu Perhatian</p>
      <DashboardCardGrid>{cards}</DashboardCardGrid>
    </section>
  );
}
