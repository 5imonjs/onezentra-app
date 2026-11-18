'use client';

import Link from 'next/link';
import { EXPIRED_REPORT_FLOW, EXPIRED_REPORT_INFO, type ExpiredReportKind } from '@/lib/expiredReportInfo';

export default function ExpiredReportNotice({ kind }: { kind: ExpiredReportKind }) {
  const info = EXPIRED_REPORT_INFO[kind];

  return (
    <section aria-label="Penjelasan sumber data laporan" className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center rounded-full border border-border bg-popover px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {info.stage}
          </div>
          <h2 className="text-sm font-bold text-foreground">Tentang data laporan ini</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Satu alur pengendalian stok kedaluwarsa. Yang beda hanya tahap dan cara hitungnya.</p>
        </div>
        <Link
          href={info.relatedHref}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-popover"
        >
          {info.relatedLabel}
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['Sumber data', info.source],
          ['Satu baris', info.grain],
          ['Qty', info.qty],
          ['Status', info.status],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-popover p-3">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-xs font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 rounded-xl bg-surface-hover px-3 py-2 text-xs font-semibold text-foreground">{EXPIRED_REPORT_FLOW}</p>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{info.note}</p>
    </section>
  );
}
