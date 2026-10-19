'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { biayaRetribusi, biayaThl } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import DashboardCardGrid from '@/components/DashboardCardGrid';

type ApprovalLevel = 'check' | 'approve' | 'rfah';

interface QueueRow {
  count: number;
  nominal: number;
  oldest_days: number | null;
}

interface QueueCard {
  key: string;
  href: string;
  level: ApprovalLevel;
  label: string;
  hint: string;
  count: number;
}

const LEVELS: ApprovalLevel[] = ['check', 'approve', 'rfah'];

const LEVEL_META: Record<ApprovalLevel, { label: string; permission: string }> = {
  check: { label: 'Perlu Diperiksa (BAC)', permission: 'approval.check' },
  approve: { label: 'Perlu Disetujui (RLH)', permission: 'approval.approve' },
  rfah: { label: 'Perlu Persetujuan RFAH', permission: 'approval.rfah' },
};

const LEVEL_ICONS: Record<ApprovalLevel, React.ReactNode> = {
  check: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  approve: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />,
  rfah: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
};

const TONES: Record<ApprovalLevel, { box: string; chip: string; num: string; label: string }> = {
  check: { box: 'border-amber-200 bg-amber-50 hover:border-amber-300', chip: 'bg-amber-500 text-white', num: 'text-amber-700', label: 'text-amber-600' },
  approve: { box: 'border-blue-200 bg-blue-50 hover:border-blue-300', chip: 'bg-blue-500 text-white', num: 'text-blue-700', label: 'text-blue-600' },
  rfah: { box: 'border-rose-200 bg-rose-50 hover:border-rose-300', chip: 'bg-rose-500 text-white', num: 'text-rose-700', label: 'text-rose-600' },
};

function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
}

function extractQueue(response: unknown): Partial<Record<ApprovalLevel, QueueRow>> | null {
  const res = response as { data?: { summary?: { queue?: Partial<Record<ApprovalLevel, QueueRow>> } } };

  return res?.data?.summary?.queue ?? null;
}

/**
 * Blok "Antrean Persetujuan Biaya" yang role-aware.
 *
 * Hanya level yang izinnya dimiliki user yang ditampilkan (BAC=check,
 * RLH=approve, RFAH=rfah), dan hanya modul yang bisa dibaca user. Angka
 * berasal dari `summary.queue` endpoint list modul, yang sudah ter-scope
 * ApprovalAssignment — jadi yang tampil adalah antrean yang benar-benar
 * bisa user tindak, bukan semua pengajuan.
 */
export default function DashboardBiayaQueue({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const [cards, setCards] = useState<QueueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);

    const depotFilter = kodeDepo ? { kode_depo: kodeDepo } : {};
    const sources: { module: string; label: string; href: string; fetcher: () => Promise<unknown> }[] = [];

    if (hasPermission('biaya_thl.view')) {
      sources.push({ module: 'thl', label: 'THL', href: '/biaya-thl', fetcher: () => biayaThl.list({ per_page: 1, ...depotFilter }) });
    }
    if (hasPermission('biaya_retribusi.view')) {
      sources.push({ module: 'retribusi', label: 'Retribusi', href: '/biaya-retribusi', fetcher: () => biayaRetribusi.list({ per_page: 1, ...depotFilter }) });
    }

    const next: QueueCard[] = [];
    let anyFailed = false;

    await Promise.all(sources.map(async (source) => {
      try {
        const queue = extractQueue(await source.fetcher());
        if (!queue) {
          return;
        }
        for (const level of LEVELS) {
          if (!hasPermission(LEVEL_META[level].permission)) {
            continue;
          }
          const row = queue[level];
          if (!row || row.count <= 0) {
            continue;
          }
          next.push({
            key: `${source.module}-${level}`,
            href: source.href,
            level,
            label: `${source.label} — ${LEVEL_META[level].label}`,
            hint: row.oldest_days != null
              ? `${formatRupiah(row.nominal)} • tertua ${row.oldest_days} hari`
              : formatRupiah(row.nominal),
            count: row.count,
          });
        }
      } catch {
        anyFailed = true;
      }
    }));

    setCards(next);
    setFailed(anyFailed);
    setLoading(false);
  }, [hasPermission, kodeDepo]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (cards.length === 0 && !failed) return null;

  return (
    <section aria-label="Antrean persetujuan biaya">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span aria-hidden="true" className="h-4 w-1 rounded-full bg-blue-500" />
        <h2 className="text-sm font-bold tracking-tight text-gray-900">Antrean Persetujuan Biaya</h2>
        {failed && (
          <button type="button" onClick={load} className="ml-auto text-[11px] font-semibold text-amber-700 hover:underline">
            Sebagian gagal dimuat — coba lagi
          </button>
        )}
      </div>
      {cards.length > 0 && (
        <DashboardCardGrid>
          {cards.map((card) => {
            const tone = TONES[card.level];
            return (
              <Link
                key={card.key}
                href={card.href}
                aria-label={`${card.label}: ${card.count} pengajuan. ${card.hint}`}
                className={`group flex items-start gap-3 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${tone.box}`}
              >
                <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-sm ${tone.chip}`}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{LEVEL_ICONS[card.level]}</svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[11px] font-semibold uppercase tracking-wider ${tone.label}`}>{card.label}</span>
                  <span className={`mt-0.5 block text-2xl leading-none tabular-nums font-black ${tone.num}`}>{card.count.toLocaleString('id-ID')}</span>
                  <span className="mt-1 block truncate text-[11px] text-gray-500">{card.hint}</span>
                </span>
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </Link>
            );
          })}
        </DashboardCardGrid>
      )}
    </section>
  );
}
