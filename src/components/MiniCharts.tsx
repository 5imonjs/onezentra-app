'use client';

/** Mini bar chart dekoratif-informatif untuk header panel daftar. */
export function MiniBars({ rows, className = '' }: {
  rows: { label: string; value: number; color?: string }[];
  className?: string;
}) {
  const visible = rows.filter((r) => r.value > 0);
  if (visible.length === 0) return null;
  const max = Math.max(...visible.map((r) => r.value), 1);

  return (
    <div className={`flex h-8 items-end gap-1 ${className}`} aria-hidden="true">
      {visible.map((row) => (
        <div
          key={row.label}
          className={`w-2 rounded-t bg-current transition-all duration-500 ${row.color ?? 'text-primary-500'}`}
          style={{ height: `${Math.max(18, (row.value / max) * 100)}%` }}
          title={`${row.label}: ${row.value}`}
        />
      ))}
    </div>
  );
}
