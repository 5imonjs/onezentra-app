'use client';

import { useCallback, useEffect, useState } from 'react';
import { rencanaKirim } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type StatusKey =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'CHECKED_IN'
  | 'VERIFIED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

interface StatusDef {
  key: StatusKey;
  label: string;
  hex: string;
  color: string;
  dot: string;
  bg: string;
}

/**
 * Palet ramah buta warna: alur progres memakai skala intensitas satu hue (biru
 * muda -> gelap) sehingga urutan tahap tetap terbaca tanpa mengandalkan perbedaan
 * warna; abu untuk draf, merah hanya untuk status pengecualian (dibatalkan).
 *
 * `hex` points at a CSS variable rather than a literal. A raw hex in the
 * conic-gradient bypasses the theme entirely, so the ring would keep its
 * light-mode tints on the dark canvas. `var()` resolves per theme instead.
 */
const STATUSES: StatusDef[] = [
  { key: 'DRAFT',        label: 'Draf',            hex: 'var(--oz-gray-400)',  color: 'bg-slate-400',   dot: 'bg-slate-400',   bg: 'bg-surface-raised' },
  { key: 'SCHEDULED',    label: 'Dijadwalkan',     hex: 'var(--oz-blue-300)',  color: 'bg-blue-300',    dot: 'bg-blue-400',    bg: 'bg-blue-50' },
  { key: 'CHECKED_IN',   label: 'Check In',        hex: 'var(--oz-blue-400)',  color: 'bg-blue-400',    dot: 'bg-blue-500',    bg: 'bg-blue-50' },
  { key: 'VERIFIED',     label: 'Terverifikasi',   hex: 'var(--oz-blue-500)',  color: 'bg-blue-500',    dot: 'bg-blue-600',    bg: 'bg-blue-50' },
  { key: 'IN_PROGRESS',  label: 'Diterima',        hex: 'var(--oz-blue-600)',  color: 'bg-blue-600',    dot: 'bg-blue-700',    bg: 'bg-blue-50' },
  { key: 'COMPLETED',    label: 'Selesai',         hex: 'var(--oz-blue-700)',  color: 'bg-blue-700',    dot: 'bg-blue-700',    bg: 'bg-blue-50' },
  { key: 'CANCELLED',    label: 'Dibatalkan',      hex: 'var(--oz-red-500)',   color: 'bg-red-500',     dot: 'bg-red-500',     bg: 'bg-red-50' },
];

const EMPTY_COUNTS: Record<StatusKey, number> = {
  DRAFT: 0, SCHEDULED: 0, CHECKED_IN: 0, VERIFIED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0,
};

export default function RencanaKirimStatusChart({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const [counts, setCounts] = useState<Record<StatusKey, number>>({ ...EMPTY_COUNTS });
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<StatusKey | null>(null);
  const [failed, setFailed] = useState(false);

  const canView = hasPermission('rencana_kirim.view');

  const [qtyMap, setQtyMap] = useState<Record<StatusKey, number>>({ ...EMPTY_COUNTS });
  const [kubikasiMap, setKubikasiMap] = useState<Record<StatusKey, number>>({ ...EMPTY_COUNTS });

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const res = await rencanaKirim.stats(kodeDepo);
      const data = res.data.data as Record<StatusKey, { count: number; sum_qty: number; sum_kubikasi: number }>;
      const next: Record<StatusKey, number> = { ...EMPTY_COUNTS };
      const nextQty: Record<StatusKey, number> = { ...EMPTY_COUNTS };
      const nextKub: Record<StatusKey, number> = { ...EMPTY_COUNTS };
      let anyFailed = false;
      for (const s of STATUSES) {
        const row = data[s.key];
        if (row) {
          next[s.key] = row.count ?? 0;
          nextQty[s.key] = row.sum_qty ?? 0;
          nextKub[s.key] = row.sum_kubikasi ?? 0;
        } else {
          anyFailed = true;
        }
      }
      setCounts(next);
      setQtyMap(nextQty);
      setKubikasiMap(nextKub);
      setFailed(anyFailed);
    } catch {
      setCounts({ ...EMPTY_COUNTS });
      setQtyMap({ ...EMPTY_COUNTS });
      setKubikasiMap({ ...EMPTY_COUNTS });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [canView, kodeDepo]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView) {
    return null;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const pct = (key: StatusKey) => (total > 0 ? Math.round((counts[key] / total) * 100) : 0);

  const donutSegments = STATUSES
    .map((s) => ({ ...s, p: pct(s.key) }))
    .filter((s) => s.p > 0)
    .reduce<{ css: string; deg: number }[]>((acc, s) => {
      const from = acc.length > 0 ? acc[acc.length - 1].deg : 0;
      const to = from + (s.p / 100) * 360;
      acc.push({ css: `${s.hex} ${from}deg ${to.toFixed(2)}deg`, deg: to });
      return acc;
    }, []);

  return (
    <section className="bg-surface-card rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-6 py-4 border-b border-slate-100 bg-linear-to-r from-slate-50 to-surface-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center shadow">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Progress Rencana Kirim</h2>
            <p className="text-xs text-slate-500">Sebaran status • qty & kubikasi</p>
            {failed && !loading && (<p className="text-xs text-amber-600 mt-0.5">Sebagian gagal dimuat</p>)}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Muat ulang data"
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center border border-transparent hover:border-slate-300"
        >
          <svg
            className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-36 h-36 bg-slate-100 rounded-full animate-pulse" />
            <div className="flex-1 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-11 bg-surface-raised rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
            </div>
            <p className="text-sm font-semibold text-slate-700">Belum ada rencana kirim</p>
            <p className="mt-1 text-xs text-slate-400 max-w-xs">Buat rencana kirim pertama untuk melihat sebaran statusnya di sini.</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="relative w-40 h-40 shrink-0">
              <div
                className={`absolute inset-0 rounded-full transition-all duration-300 ${active ? 'scale-[1.03]' : ''}`}
                style={{
                  background: `conic-gradient(${donutSegments.map((s) => s.css).join(',')})`,
                }}
                role="img"
                aria-label={`Distribusi status ${total} rencana kirim: ${STATUSES.filter((s) => counts[s.key] > 0).map((s) => `${s.label} ${counts[s.key]}`).join(', ')}`}
              />
              {/* The hole is a surface, not a fixed white. A literal
                  `bg-white` here punches a white disc through the middle of
                  the donut on the dark theme, and the dark `text-gray-900`
                  number lands on it with no contrast left. */}
              <div className="absolute inset-4 rounded-full bg-surface-card flex flex-col items-center justify-center shadow-inner">
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>

            <div className="flex-1 w-full min-w-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">Distribusi Status</h3>
                <span className="text-xs text-gray-500">{total} pengiriman</span>
              </div>

              <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-5">
                {STATUSES.map((s) => {
                  const p = pct(s.key);
                  if (p === 0) return null;
                  return (
                    <div
                      key={s.key}
                      className={`${s.color} transition-all duration-200 ${active === s.key ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                      style={{ width: `${p}%` }}
                      onMouseEnter={() => setActive(s.key)}
                      onMouseLeave={() => setActive(null)}
                      title={`${s.label}: ${counts[s.key]}`}
                    />
                  );
                })}
              </div>

              <ul className="space-y-2">
                {STATUSES.map((s) => {
                  const p = pct(s.key);
                  const isActive = active === s.key;
                  return (
                    <li
                      key={s.key}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-all ${
                        isActive
                          ? `${s.bg} ring-1 ring-gray-200 shadow-sm`
                          : ''
                      }`}
                      onMouseEnter={() => setActive(s.key)}
                      onMouseLeave={() => setActive(null)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full ${s.dot} shrink-0`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.label}</p>
                          <p className="text-xs text-gray-500">
                            {counts[s.key]} pengiriman • {qtyMap[s.key].toLocaleString('id-ID')} qty • {kubikasiMap[s.key].toFixed(2)} m³
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-base font-bold tabular-nums ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                          {p}%
                        </p>
                        <p className="text-[11px] text-gray-400 tabular-nums">{qtyMap[s.key] > 0 ? `${((qtyMap[s.key] / (Object.values(qtyMap).reduce((a,b)=>a+b,0) || 1))*100).toFixed(0)}% qty` : ''}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
