'use client';

import { useCallback, useEffect, useState } from 'react';
import { dashboard } from '@/lib/api';

export interface SummaryRecentItem {
  type: string;
  title: string;
  subtitle: string;
  href: string;
  at: string | null;
}

export interface SummaryOpnameAtRisk {
  week_start: string;
  kritis_rows: number;
  expired_rows: number;
  pcs: number;
  crt: number;
}

export interface SummaryData {
  depot: string | null;
  totals: Record<string, number>;
  new_7d: Record<string, number>;
  alerts: { expired_kritis: number; expired_total: number; standarisasi_pending: number };
  opname_at_risk: SummaryOpnameAtRisk | null;
  quality: { npn_no_volume: number; npn_no_umur: number };
  sla: {
    avg_gate_to_receiving_hours: number | null;
    sj_open_count: number;
    sj_oldest_days: number | null;
    rk_checked_in_count: number;
    rk_checked_in_oldest_days: number | null;
  };
  inbound_selisih: { items: number; kurang: number; lebih: number };
  recent: SummaryRecentItem[];
  activity_trend: { current_7d: number; prev_7d: number };
}

type SummaryResponse = { data?: { data?: SummaryData } };

const EMPTY: SummaryData = {
  depot: null,
  totals: {},
  new_7d: {},
  alerts: { expired_kritis: 0, expired_total: 0, standarisasi_pending: 0 },
  opname_at_risk: null,
  quality: { npn_no_volume: 0, npn_no_umur: 0 },
  sla: {
    avg_gate_to_receiving_hours: null,
    sj_open_count: 0,
    sj_oldest_days: null,
    rk_checked_in_count: 0,
    rk_checked_in_oldest_days: null,
  },
  inbound_selisih: { items: 0, kurang: 0, lebih: 0 },
  recent: [],
  activity_trend: { current_7d: 0, prev_7d: 0 },
};

const cache = new Map<string, { at: number; data: SummaryData }>();
const CACHE_TTL_MS = 60_000;

export function useDashboardSummary(kodeDepo?: string): { summary: SummaryData; loading: boolean; failed: boolean; reload: () => void } {
  const [summary, setSummary] = useState<SummaryData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    const key = kodeDepo || '';
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS && nonce === 0) {
      setSummary(hit.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const res = (await dashboard.summary(kodeDepo)) as SummaryResponse;
      const data = res.data?.data;
      if (!data || typeof data !== 'object') throw new Error('invalid');
      cache.set(key, { at: Date.now(), data });
      setSummary(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [kodeDepo, nonce]);

  useEffect(() => { load(); }, [load]);

  return { summary, loading, failed, reload: () => { cache.delete(kodeDepo || ''); setNonce((n) => n + 1); } };
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
