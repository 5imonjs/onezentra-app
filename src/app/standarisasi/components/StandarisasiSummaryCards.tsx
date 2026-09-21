import { StandarisasiStats } from '../types';

interface SummaryCardConfig {
  key: keyof StandarisasiStats;
  label: string;
  iconWrapper: string;
  iconColor: string;
  valueColor: string;
  iconPath: string;
}

const STACK_ICON = 'M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25';

const CARDS: SummaryCardConfig[] = [
  {
    key: 'total',
    label: 'Total',
    iconWrapper: 'bg-slate-100',
    iconColor: 'text-slate-600',
    valueColor: 'text-slate-800',
    iconPath: STACK_ICON,
  },
  {
    key: 'pending',
    label: 'Pending',
    iconWrapper: 'bg-amber-50',
    iconColor: 'text-amber-600',
    valueColor: 'text-amber-600',
    iconPath: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'approved',
    label: 'Approved',
    iconWrapper: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    valueColor: 'text-emerald-600',
    iconPath: 'M4.5 12.75l6 6 9-13.5',
  },
  {
    key: 'rejected',
    label: 'Rejected',
    iconWrapper: 'bg-red-50',
    iconColor: 'text-red-600',
    valueColor: 'text-red-600',
    iconPath: 'M6 18L18 6M6 6l12 12',
  },
];

interface StandarisasiSummaryCardsProps {
  stats: StandarisasiStats;
  loading: boolean;
}

/**
 * Angka diambil dari /standarisasi-tumpukan/stats (seluruh depo user),
 * bukan dihitung dari baris halaman yang sedang dibuka.
 */
export default function StandarisasiSummaryCards({ stats, loading }: StandarisasiSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {CARDS.map((card) => (
        <div key={card.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.iconWrapper}`}>
              <svg className={`w-5 h-5 ${card.iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={card.iconPath} />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{card.label}</p>
              {loading ? (
                <div className="h-6 w-10 mt-0.5 bg-slate-100 rounded animate-pulse" />
              ) : (
                <p className={`text-xl font-bold tabular-nums ${card.valueColor}`}>{stats[card.key]}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
