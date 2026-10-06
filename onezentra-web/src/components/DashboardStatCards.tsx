'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { rencanaKirim, gateTransactions, receivingItems, receivings, sjValidations, npn, standarUmurProduk, standarisasiTumpukan } from '@/lib/api';
import { useDashboardSummary } from '@/lib/dashboardSummary';

interface StatSource {
  key: string;
  label: string;
  href: string;
  permission: string;
  icon: 'truck' | 'gate' | 'clipboard' | 'receive' | 'check' | 'package' | 'clock' | 'grid';
  /** Warna ikon: aksen solid untuk modul operasional, netral untuk master data. */
  iconBg: string;
  group: 'operasional' | 'master';
  /**
   * `kodeDepo` diteruskan hanya untuk modul yang juga difilter per depo di
   * `dashboard/summary` — npn & standar umur sengaja global agar angka
   * fallback identik dengan angka summary.
   */
  load: (kodeDepo?: string) => Promise<number>;
}

/** Sisipkan filter depo hanya bila dipilih (user global dengan depot.view_all). */
function depotParam(kodeDepo?: string): Record<string, string> {
  return kodeDepo ? { kode_depo: kodeDepo } : {};
}

const STAT_SOURCES: StatSource[] = [
  {
    key: 'rencana_kirim',
    label: 'Replenishment',
    href: '/rencana-kirim',
    permission: 'rencana_kirim.view',
    icon: 'truck',
    iconBg: 'bg-amber-500',
    group: 'operasional',
    load: async (kodeDepo?: string) => (await rencanaKirim.list({ per_page: 1, ...depotParam(kodeDepo) })).data.total ?? 0,
  },
  {
    key: 'gate',
    label: 'Check In Point',
    href: '/gate',
    permission: 'gate.view',
    icon: 'gate',
    iconBg: 'bg-sky-600',
    group: 'operasional',
    load: async (kodeDepo?: string) => (await gateTransactions.list({ per_page: 1, ...depotParam(kodeDepo) })).data.total ?? 0,
  },
  {
    key: 'penerimaan',
    label: 'Inbound',
    href: '/penerimaan',
    permission: 'penerimaan.view',
    icon: 'clipboard',
    iconBg: 'bg-emerald-600',
    group: 'operasional',
    load: async (kodeDepo?: string) => (await receivingItems.list({ source: 'VALIDASI_SJ', per_page: 1, ...depotParam(kodeDepo) })).data.total ?? 0,
  },
  {
    key: 'receiving',
    label: 'Check Out Point',
    href: '/receiving',
    permission: 'receiving.view',
    icon: 'receive',
    iconBg: 'bg-teal-600',
    group: 'operasional',
    load: async (kodeDepo?: string) => (await receivings.list({ per_page: 1, ...depotParam(kodeDepo) })).data.total ?? 0,
  },
  {
    key: 'sj_validation',
    label: 'Validasi Dokumen',
    href: '/validasi-sj',
    permission: 'sj_validation.view',
    icon: 'check',
    iconBg: 'bg-primary-600',
    group: 'operasional',
    load: async (kodeDepo?: string) => (await sjValidations.list({ per_page: 1, ...depotParam(kodeDepo) })).data.total ?? 0,
  },
  {
    key: 'npn',
    label: 'NPN',
    href: '/npn',
    permission: 'npn.view',
    icon: 'package',
    iconBg: 'bg-slate-400',
    group: 'master',
    // Tanpa kodeDepo: summary memuat npn global, fallback harus identik.
    load: async () => (await npn.list({ per_page: 1 })).data.total ?? 0,
  },
  {
    key: 'standar_umur',
    label: 'Standar Umur',
    href: '/standar-umur',
    permission: 'standar_umur.view',
    icon: 'clock',
    iconBg: 'bg-slate-400',
    group: 'master',
    // Tanpa kodeDepo: summary memuat standar umur global, fallback harus identik.
    load: async () => (await standarUmurProduk.list({ per_page: 1 })).data.total ?? 0,
  },
  {
    key: 'standarisasi',
    label: 'Standarisasi',
    href: '/standarisasi',
    permission: 'standarisasi.view',
    icon: 'grid',
    iconBg: 'bg-slate-400',
    group: 'master',
    load: async (kodeDepo?: string) => (await standarisasiTumpukan.list({ per_page: 1, ...depotParam(kodeDepo) })).data.total ?? 0,
  },
];

const ICONS: Record<StatSource['icon'], React.ReactNode> = {
  truck: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
  gate: <><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></>,
  clipboard: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />,
  receive: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
  check: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  package: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
  clock: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
  grid: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />,
};

function SkeletonCard() {
  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-100 rounded-2xl" />
        <div className="flex-1">
          <div className="h-7 w-12 bg-gray-100 rounded-lg" />
          <div className="h-4 w-20 bg-surface-raised rounded mt-2" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ source, count, failed, delta, kodeDepo }: { source: StatSource; count?: number; failed?: boolean; delta?: number; kodeDepo?: string }) {
  const isEmpty = !failed && count === 0;
  return (
    <Link
      href={source.href}
      aria-label={`${source.label}: ${failed ? 'data tidak tersedia' : (count ?? 0)}`}
      className={`group relative bg-surface-card rounded-2xl border p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden ${
        failed ? 'border-amber-200' : isEmpty ? 'border-slate-100 opacity-75' : 'border-slate-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${source.iconBg} ${isEmpty ? 'opacity-40 saturate-50' : ''}`}>
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            {ICONS[source.icon]}
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xl leading-none tabular-nums ${failed ? 'text-amber-600 font-bold' : isEmpty ? 'text-slate-300 font-bold' : 'font-black text-slate-900'}`}>
            {failed ? '–' : (count ?? 0).toLocaleString('id-ID')}
          </p>
          <p className={`text-xs font-semibold tracking-wider uppercase truncate mt-1 ${isEmpty ? 'text-slate-300' : 'text-slate-500'}`}>{source.label}</p>
          {source.group === 'master' && kodeDepo && (
            <p className="text-[10px] text-slate-400 truncate">Global — semua depo</p>
          )}
          {!failed && (delta ?? 0) > 0 && (
            <p className="text-[11px] font-semibold text-emerald-600 tabular-nums mt-0.5">+{delta} minggu ini</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function DashboardStatCards({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const { summary, loading: summaryLoading, failed: summaryFailed } = useDashboardSummary(kodeDepo);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const memoizedVisibleSources = useMemo(
    () => STAT_SOURCES.filter((s) => hasPermission(s.permission)),
    [hasPermission],
  );

  const loadFallback = useCallback(async (kodeDepo?: string) => {
    const visible = memoizedVisibleSources;
    setLoading(true);
    const results = await Promise.all(
      visible.map(async (s) => {
        try {
          return [s.key, await s.load(kodeDepo), false] as const;
        } catch {
          return [s.key, 0, true] as const;
        }
      }),
    );
    const next: Record<string, number> = {};
    const nextFailed: Record<string, boolean> = {};
    for (const [key, total, err] of results) {
      next[key] = total;
      nextFailed[key] = err;
    }
    setCounts(next);
    setFailed(nextFailed);
    setLoading(false);
  }, [memoizedVisibleSources]);

  useEffect(() => {
    if (!summaryLoading && !summaryFailed) {
      setCounts(summary.totals);
      setDeltas(summary.new_7d);
      const noneFailed: Record<string, boolean> = {};
      for (const s of STAT_SOURCES) noneFailed[s.key] = false;
      setFailed(noneFailed);
      setLoading(false);
      return;
    }
    if (!summaryLoading && summaryFailed) {
      loadFallback(kodeDepo);
    }
  }, [summaryLoading, summaryFailed, summary, loadFallback, kodeDepo]);

  const visible = useMemo(() => STAT_SOURCES.filter((s) => hasPermission(s.permission)), [hasPermission]);
  const operasional = useMemo(() => visible.filter((s) => s.group === 'operasional'), [visible]);
  const master = useMemo(() => visible.filter((s) => s.group === 'master'), [visible]);

  if (visible.length === 0) {
    return null;
  }

  const renderCard = (s: StatSource) => (
    <StatCard key={s.key} source={s} count={counts[s.key]} failed={failed[s.key]} delta={deltas[s.key]} kodeDepo={kodeDepo} />
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {loading ? operasional.map((s) => <SkeletonCard key={s.key} />) : operasional.map(renderCard)}
      </div>
      {master.length > 0 && (
        <div>
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Data Master</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {loading ? master.map((s) => <SkeletonCard key={s.key} />) : master.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
}
