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
 * Kerangka panel dashboard yang seragam: header ramping (chip ikon + judul +
 * subjudul, badge/aksi di kanan) di atas konten.
 *
 * Dipakai seluruh blok dashboard supaya header tidak lagi punya dua dialek
 * berbeda (dulu sebagian `px-6 py-4 text-lg`, sebagian `text-sm` ber-ikon).
 * Header memakai gradien `gray-50 → surface-card` yang mengikuti tema.
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
    <section aria-label={ariaLabel} className={`overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 bg-linear-to-r from-gray-50 to-surface-card px-5 py-3.5">
        {icon && (
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              {icon}
            </svg>
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle != null && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">{subtitle}</div>
          )}
        </div>
        {(badge || actions) && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {badge}
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
