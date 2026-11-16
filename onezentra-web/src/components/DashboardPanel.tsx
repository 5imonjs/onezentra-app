import type { ReactNode } from 'react';

type DashboardPanelProps = {
  /** Judul panel — satu-satunya `<h2>` di dalam kartu. */
  title: string;
  /** Baris kecil di bawah judul (teks atau chip). */
  subtitle?: ReactNode;
  /** Ikon di dalam chip brand di kiri judul. */
  icon?: ReactNode;
  /** Elemen ringkas di sisi kanan (mis. badge jumlah). */
  badge?: ReactNode;
  /** Kontrol di sisi kanan (mis. tombol muat ulang, pemilih periode). */
  actions?: ReactNode;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Kerangka panel dashboard yang seragam.
 *
 * Versi modern memakai kartu dengan elevasi lembut, garis aksen tipis di
 * bagian atas yang muncul saat hover, dan chip ikon berbasis `primary` agar
 * konsisten di terang/gelap. Header tetap ramping supaya konten operasional
 * tidak terdorong ke bawah.
 */
export default function DashboardPanel({
  title,
  subtitle,
  icon,
  badge,
  actions,
  ariaLabel,
  className = '',
  children,
}: DashboardPanelProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={`group relative overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_-28px_rgba(15,23,42,0.4)] ring-1 ring-black/[0.02] backdrop-blur-sm transition-shadow duration-300 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_20px_44px_-28px_rgba(15,23,42,0.45)] ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary-500/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-linear-to-r from-surface-card/80 to-card px-5 py-4">
        {icon && (
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-500/10 text-primary-600 ring-1 ring-primary-500/20">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              {icon}
            </svg>
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle != null && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {(badge || actions) && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {badge}
            {actions}
          </div>
        )}
      </div>

      <div className="relative">{children}</div>
    </section>
  );
}
