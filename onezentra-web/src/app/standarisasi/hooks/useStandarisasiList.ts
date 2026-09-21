'use client';

import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage, standarisasiTumpukan } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { PER_PAGE, StandarisasiItem } from '../types';

interface UseStandarisasiListParams {
  search: string;
  status: string;
  kodeDepo: string;
  page: number;
}

/**
 * Memuat satu halaman daftar standarisasi.
 *
 * Flag `cancelled` mencegah respons lama (mis. pencarian sebelumnya) menimpa
 * hasil yang lebih baru ketika user mengetik cepat atau berpindah halaman.
 */
export default function useStandarisasiList({ search, status, kodeDepo, page }: UseStandarisasiListParams) {
  const [items, setItems] = useState<StandarisasiItem[]>([]);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    standarisasiTumpukan
      .list({ search, status, kode_depo: kodeDepo, page, per_page: PER_PAGE })
      .then((res) => {
        if (cancelled) return;
        setItems((res.data.data ?? []) as StandarisasiItem[]);
        setLastPage(res.data.last_page ?? 1);
        setTotal(res.data.total ?? 0);
      })
      .catch((e) => {
        if (cancelled) return;
        setItems([]);
        setLastPage(1);
        setTotal(0);
        notifyGlobal(getErrorMessage(e, 'Gagal memuat data standarisasi'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, status, kodeDepo, page, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { items, lastPage, total, loading, reload };
}
