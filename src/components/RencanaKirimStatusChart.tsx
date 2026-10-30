'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardCardGrid from '@/components/DashboardCardGrid';
import DashboardPanel from '@/components/DashboardPanel';
import { rencanaKirim } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const TRUCK_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />;

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
  dot: string;
  box: string;
  num: string;
  name: string;
}

/**
 * Palet ramah buta warna: alur progres memakai skala intensitas satu hue (biru
 * muda -> gelap) sehingga urutan tahap tetap terbaca tanpa mengandalkan
 * perbedaan warna; abu untuk draf, merah hanya untuk status pengecualian
 * (dibatalkan). Kartu memakai kombinasi border+bg yang sama dengan kartu
 * "Antrean Persetujuan Biaya" supaya dua blok di dashboard terlihat satu gaya.
 */
const STATUSES: StatusDef[] = [
  { key: 'DRAFT',       label: 'Rencana Kirim',     dot: 'bg-slate-400', box: 'border-border bg-popover', num: 'text-foreground', name: 'text-muted-foreground' },
  { key: 'SCHEDULED',   label: 'Dijadwalkan',       dot: 'bg-blue-300',  box: 'border-blue-200 bg-blue-50',         num: 'text-blue-700',  name: 'text-blue-600' },
  { key: 'CHECKED_IN',  label: 'Gate Check-in',     dot: 'bg-blue-400',  box: 'border-blue-200 bg-blue-50',         num: 'text-blue-700',  name: 'text-blue-600' },
  { key: 'VERIFIED',    label: 'Verifikasi',        dot: 'bg-blue-500',  box: 'border-blue-200 bg-blue-50',         num: 'text-blue-700',  name: 'text-blue-600' },
  { key: 'IN_PROGRESS', label: 'Receiving',         dot: 'bg-blue-600',  box: 'border-blue-200 bg-blue-50',         num: 'text-blue-700',  name: 'text-blue-600' },
  { key: 'COMPLETED',   label: 'Selesai Receiving', dot: 'bg-blue-700',  box: 'border-blue-200 bg-blue-50',         num: 'text-blue-800',  name: 'text-blue-700' },
  { key: 'CANCELLED',   label: 'Dibatalkan',        dot: 'bg-red-500',   box: 'border-red-200 bg-red-50',           num: 'text-red-700',   name: 'text-red-600' },
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

  const total = PIPELINE_STATUSES.reduce((a, s) => a + (counts[s.key] ?? 0), 0);
  const totalQty = Object.values(qtyMap).reduce((a, b) => a + b, 0);
  const totalKubikasi = Object.values(kubikasiMap).reduce((a, b) => a + b, 0);

  return (
    <DashboardPanel
      title="Progress Rencana Kirim"
      subtitle="Sebaran status • qty &amp; kubikasi"
      icon={TRUCK_ICON}
      className="transition-shadow hover:shadow-md"
      badge={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-chip-primary-border bg-chip-primary px-2.5 py-1 text-[11px] font-bold text-accent-text">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
          {total} pengiriman
        </span>
      }
      actions={
        <button
          onClick={load}
          disabled={loading}
          aria-label="Muat ulang data"
          className="p-2 text-slate-400 hover:text-foreground hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 min-w-11 min-h-11 flex items-center justify-center border border-transparent hover:border-border"
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
      }
    >
      <div className="p-4 sm:p-5">
        {failed && !loading && (<p className="mb-3 text-xs text-amber-600">Sebagian gagal dimuat</p>)}

        {loading ? (
          <DashboardCardGrid>
            {PIPELINE_STATUSES.map((s) => (
              <div key={s.key} className="rounded-2xl border border-border bg-card p-3">
                <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
                <div className="mt-2 h-5 w-8 rounded bg-slate-200 animate-pulse" />
                <div className="mt-2 h-3 w-20 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </DashboardCardGrid>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-popover flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
            </div>
            <p className="text-sm font-semibold text-foreground">Belum ada rencana kirim</p>
            <p className="mt-1 text-xs text-slate-400 max-w-xs">Buat rencana kirim pertama untuk melihat progresnya di sini.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              role="group"
              aria-label={`Progres rencana kirim sampai receiving: ${PIPELINE_STATUSES.map((s) => `${s.label} ${counts[s.key]}`).join(', ')}`}
            >
              <DashboardCardGrid>
                {PIPELINE_STATUSES.map((s) => {
                  const count = counts[s.key];
                  const active = count > 0;
                  return (
                    <div
                      key={s.key}
                      data-role={s.key}
                      data-count={count}
                      title={`${s.label}: ${count} pengiriman • ${qtyMap[s.key].toLocaleString('id-ID')} qty • ${kubikasiMap[s.key].toFixed(2)} m³`}
                      className={`rounded-2xl border p-3 transition-colors ${active ? s.box : 'border-border bg-card'}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="relative flex h-5 w-5 shrink-0 items-center justify-center">
  {active && <span className={`absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-60 animate-ping`} />}
  <span className={`relative flex h-5 w-5 items-center justify-center rounded-full ${active ? s.dot : 'bg-slate-200'} text-white shadow-sm`}>
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3h13v13H1z" />
      <path d="M14 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  </span>
</span>
                        <p className={`truncate text-[11px] font-semibold uppercase tracking-wider ${active ? s.name : 'text-slate-400'}`}>{s.label}</p>
                      </div>
                      <p className={`mt-1.5 text-xl leading-none font-black tabular-nums ${active ? s.num : 'text-slate-400'}`}>{count}</p>
                      {active && (
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {qtyMap[s.key].toLocaleString('id-ID')} qty • {kubikasiMap[s.key].toFixed(2)} m³
                        </p>
                      )}
                    </div>
                  );
                })}
              </DashboardCardGrid>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0">
                <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--oz-gray-200)" strokeWidth="3" />
                  {PIPELINE_STATUSES.map((s, i) => {
                    const pct = total > 0 ? (counts[s.key] / total) * 100 : 0;
                    if (pct <= 0) return null;
                    const offset = PIPELINE_STATUSES.slice(0, i).reduce((a, st) => a + (total > 0 ? (counts[st.key] / total) * 100 : 0), 0);
                    // Warna segmen donat diambil dari token tema (bukan hex)
                    // supaya ikut berubah saat tema gelap/terang, sama seperti
                    // titik status pada kartu di atasnya.
                    const colorMap: Record<string, string> = {
                      DRAFT: 'var(--oz-gray-400)',
                      SCHEDULED: 'var(--oz-blue-300)',
                      CHECKED_IN: 'var(--oz-blue-400)',
                      VERIFIED: 'var(--oz-blue-500)',
                      IN_PROGRESS: 'var(--oz-blue-600)',
                      COMPLETED: 'var(--oz-blue-700)',
                    };
                    return (
                      <circle
                        key={s.key}
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke={colorMap[s.key]}
                        strokeWidth="3"
                        strokeDasharray={`${pct} ${100 - pct}`}
                        strokeDashoffset={-offset}
                        strokeLinecap="butt"
                        className="transition-all duration-500"
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black text-foreground">
                    {total > 0 ? Math.round((counts.COMPLETED / total) * 100) : 0}%
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total {total} pengiriman • {totalQty.toLocaleString('id-ID')} qty • {totalKubikasi.toFixed(2)} m³
                <br />
                Selesai receiving: {counts.COMPLETED} dari {total}
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardPanel>
  );
}
