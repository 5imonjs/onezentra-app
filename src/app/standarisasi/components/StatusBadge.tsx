import { STATUS_META } from '../types';

const FALLBACK = {
  badge: 'bg-gray-50 text-gray-600 ring-gray-200',
  dot: 'bg-gray-400',
};

export default function StatusBadge({ status }: { status: string }) {
  const key = status || 'pending';
  const meta = STATUS_META[key];
  const label = meta?.label ?? key;
  const badge = meta?.badge ?? FALLBACK.badge;
  const dot = meta?.dot ?? FALLBACK.dot;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
