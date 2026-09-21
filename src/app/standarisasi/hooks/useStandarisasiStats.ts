'use client';

import { useCallback, useEffect, useState } from 'react';
import { standarisasiTumpukan } from '@/lib/api';
import { EMPTY_STATS, StandarisasiStats } from '../types';

interface UseStandarisasiStatsParams {
  kodeDepo: string;
}

/**
 * Jumlah per status untuk seluruh depo user.
 *
 * Sengaja tidak dihitung dari `items` halaman aktif: kartu ringkasan harus
 * tetap benar walau data lebih dari satu halaman atau sedang difilter.
 * Pencarian teks juga tidak ikut diterapkan agar kartu tidak berkedip saat
 * user mengetik — yang difilter hanya depo.
 */
export default function useStandarisasiStats({ kodeDepo }: UseStandarisasiStatsParams) {
  const [stats, setStats] = useState<StandarisasiStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    standarisasiTumpukan
      .stats({ kode_depo: kodeDepo })
      .then((res) => {
        if (cancelled) return;
        setStats({ ...EMPTY_STATS, ...(res.data.data ?? {}) });
      })
      .catch(() => {
        if (cancelled) return;
        setStats(EMPTY_STATS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kodeDepo, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { stats, loading, reload };
}
