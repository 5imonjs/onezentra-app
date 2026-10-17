'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
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
  { key: 'DRAFT',        label: 'Rencana Kirim',   hex: 'var(--oz-gray-400)',  color: 'bg-slate-400',   dot: 'bg-slate-400',   bg: 'bg-surface-raised' },
  { key: 'SCHEDULED',    label: 'Dijadwalkan',     hex: 'var(--oz-blue-300)',  color: 'bg-blue-300',    dot: 'bg-blue-400',    bg: 'bg-blue-50' },
  { key: 'CHECKED_IN',   label: 'Gate Check-in',   hex: 'var(--oz-blue-400)',  color: 'bg-blue-400',    dot: 'bg-blue-500',    bg: 'bg-blue-50' },
  { key: 'VERIFIED',     label: 'Verifikasi',      hex: 'var(--oz-blue-500)',  color: 'bg-blue-500',    dot: 'bg-blue-600',    bg: 'bg-blue-50' },
  { key: 'IN_PROGRESS',  label: 'Receiving',       hex: 'var(--oz-blue-600)',  color: 'bg-blue-600',    dot: 'bg-blue-700',    bg: 'bg-blue-50' },
  { key: 'COMPLETED',    label: 'Selesai Receiving', hex: 'var(--oz-blue-700)', color: 'bg-blue-700',    dot: 'bg-blue-700',    bg: 'bg-blue-50' },
  { key: 'CANCELLED',    label: 'Dibatalkan',      hex: 'var(--oz-red-500)',   color: 'bg-red-500',     dot: 'bg-red-500',     bg: 'bg-red-50' },
];

// Tahap yang membentuk alur normal rencana kirim -> receiving. CANCELLED
// sengaja tidak ditampilkan di pipeline (pengecualian).
const PIPELINE_STATUSES = STATUSES.filter((s) => s.key !== 'CANCELLED');

const EMPTY_COUNTS: Record<StatusKey, number> = {
  DRAFT: 0, SCHEDULED: 0, CHECKED_IN: 0, VERIFIED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0,
};

export default function RencanaKirimStatusChart({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const [counts, setCounts] = useState<Record<StatusKey, number>>({ ...EMPTY_COUNTS });
  const [loading, setLoading] = useState(true);
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

  const pipelineTotal = PIPELINE_STATUSES.reduce((a, s) => a + (counts[s.key] ?? 0), 0);
  const total = pipelineTotal;



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
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 min-w-11 min-h-11 flex items-center justify-center border border-transparent hover:border-slate-300"
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
          <div className="flex items-center gap-3">
            {PIPELINE_STATUSES.map((s) => (
              <div key={s.key} className="flex flex-col items-center gap-2 flex-1">
                <div className="h-3 w-3 rounded-full bg-slate-200 animate-pulse" />
                <div className="h-3 w-12 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
            </div>
            <p className="text-sm font-semibold text-slate-700">Belum ada rencana kirim</p>
            <p className="mt-1 text-xs text-slate-400 max-w-xs">Buat rencana kirim pertama untuk melihat progresnya di sini.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Progres Rencana Kirim → Receiving</p>
              <span className="text-xs text-gray-500">{total} pengiriman</span>
            </div>
            <div
              aria-label={`Progres rencana kirim sampai receiving: ${PIPELINE_STATUSES.map((s) => `${s.label} ${counts[s.key]}`).join(', ')}`}
              className="flex flex-wrap items-center gap-x-1 gap-y-3"
            >
              {PIPELINE_STATUSES.map((s, i) => (
                <Fragment key={s.key}>
                  {i > 0 && <span aria-hidden="true" className="h-px w-4 sm:w-8 bg-slate-300" />}
                  <div
                    className="flex flex-col items-center gap-1 min-w-[60px] flex-1 sm:flex-none"
                    title={`${s.label}: ${counts[s.key]} pengiriman • ${qtyMap[s.key].toLocaleString('id-ID')} qty • ${kubikasiMap[s.key].toFixed(2)} m³`}
                    data-role={s.key}
                    data-count={counts[s.key]}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-3 w-3 rounded-full ${counts[s.key] > 0 ? s.dot : 'bg-slate-300'}`}
                    />
                    <span className="text-[10px] font-black leading-none tracking-wide text-center text-gray-600">
                      {s.label.toUpperCase().replace(/\s+/g, '')}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-gray-900">{counts[s.key]}</span>
                  </div>
                </Fragment>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Total {total} pengiriman • {Object.values(qtyMap).reduce((a, b) => a + b, 0).toLocaleString('id-ID')} qty • {Object.values(kubikasiMap).reduce((a, b) => a + b, 0).toFixed(2)} m³
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
