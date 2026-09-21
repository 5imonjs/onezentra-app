'use client';

import { useEffect, useState } from 'react';
import { depo } from '@/lib/api';
import { DepoOption } from '../types';

/**
 * Opsi filter depo. Hanya diambil bila `enabled` true (user boleh melihat
 * seluruh depo); user yang di-scope ke satu depo tidak perlu dropdown ini.
 */
export default function useDepoOptions(enabled: boolean) {
  const [options, setOptions] = useState<DepoOption[]>([]);

  useEffect(() => {
    if (!enabled) {
      setOptions([]);
      return;
    }

    let cancelled = false;

    depo
      .list()
      .then((res) => {
        if (!cancelled) setOptions((res.data.data ?? []) as DepoOption[]);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return options;
}
