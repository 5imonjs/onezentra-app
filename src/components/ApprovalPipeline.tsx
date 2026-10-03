import { Fragment } from 'react';

export type ApprovalPipelineState = 'done' | 'current' | 'todo' | 'reject' | 'revisi';

export interface ApprovalPipelineStep {
  role: string;
  state: ApprovalPipelineState;
}

const STATE_STYLE: Record<ApprovalPipelineState, { dot: string; text: string; title: string }> = {
  done: { dot: 'bg-emerald-500', text: 'text-emerald-600', title: 'tahap selesai' },
  current: { dot: 'bg-primary-500', text: 'text-accent-text', title: 'menunggu pada tahap ini' },
  todo: { dot: 'bg-slate-300', text: 'text-slate-400', title: 'belum tercapai' },
  reject: { dot: 'bg-red-500', text: 'text-red-600', title: 'pengajuan ditolak pada tahap ini' },
  revisi: { dot: 'bg-orange-500', text: 'text-orange-600', title: 'diminta revisi pada tahap ini' },
};

/**
 * Ringkasan alur persetujuan yang ringkas (untuk baris daftar & kartu mobile).
 * Setiap tahap = titik + label peran; warna menandakan state tahap:
 * hijau selesai, indigo berdenyut = menunggu di tahap itu, abu = belum,
 * merah = ditolak, oranye = revisi. Data-role/data-state tersedia untuk tes.
 */
export default function ApprovalPipeline({ steps, className = '' }: { steps: ApprovalPipelineStep[]; className?: string }) {
  if (steps.length === 0) return null;

  return (
    <div aria-label="Alur tahapan persetujuan" role="img" className={`inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 ${className}`}>
      {steps.map((step, i) => {
        const style = STATE_STYLE[step.state] ?? STATE_STYLE.todo;
        const role = step.role.toUpperCase().replace(/\s+/g, '');
        return (
          <Fragment key={`${role}-${i}`}>
            {i > 0 && <span aria-hidden="true" className="h-px w-2 bg-slate-300" />}
            <div
              className="flex flex-col items-center gap-1"
              title={`${role} — ${style.title}`}
              data-role={role}
              data-state={step.state}
            >
              <span
                aria-hidden="true"
                className={`flex h-2 w-2 rounded-full ${step.state === 'current' ? `${style.dot} animate-pulse ring-2 ring-primary-500/20` : style.dot}`}
              />
              <span className={`text-[9px] font-black leading-none tracking-wide ${style.text}`}>{role}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}