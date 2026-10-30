'use client';

export function ReportSelectCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 rounded border-border text-red-600 focus:ring-red-500"
    />
  );
}

export function ReportDeleteBar({
  count,
  deleting,
  onDelete,
  onClear,
}: {
  count: number;
  deleting: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-ink-900 py-2.5 pl-5 pr-3 text-white shadow-2xl"
    >
      <span className="whitespace-nowrap text-sm font-medium">{count} baris terpilih</span>
      <span aria-hidden="true" className="h-6 w-px bg-white/20" />
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 rounded-xl px-4 text-sm font-medium text-ink-fg transition-colors hover:bg-white/10 hover:text-white"
      >
        Batal
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {deleting ? 'Menghapus...' : 'Hapus permanen'}
      </button>
    </div>
  );
}
