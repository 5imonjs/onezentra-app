'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { biayaRetribusi, biayaThl, gateTransactions, rencanaKirim, sjValidations, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type Tone = 'amber' | 'blue' | 'sky' | 'violet';

type ActionItem = { id: string; primary: string; secondary: string; href: string };

type Group = {
  key: string;
  label: string;
  items: ActionItem[];
  /** Total baris di server (bukan hanya yang muat di halaman ini). */
  total: number;
  moreCount: number;
  href: string;
  tone: Tone;
};

const TONE_STYLES: Record<Tone, { iconBg: string; chip: string }> = {
  amber:  { iconBg: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-700' },
  blue:   { iconBg: 'bg-blue-600',   chip: 'bg-blue-50 text-blue-700' },
  sky:    { iconBg: 'bg-sky-600',    chip: 'bg-sky-50 text-sky-700' },
  violet: { iconBg: 'bg-primary-600', chip: 'bg-chip-primary text-accent-text' },
};

const MAX_PER_GROUP = 4;

type ListResponse<T> = { data?: { data?: T[]; total?: number } };

type GroupJob = () => Promise<Group | null>;

/**
 * Respons paginate Laravel: `data` = baris halaman ini, `total` = seluruh
 * baris terfilter. `total` dipakai untuk badge & "+N lainnya" agar angka yang
 * dibaca user adalah jumlah sebenarnya, bukan isi halaman (maks. 4).
 */
function pickPage<T>(response: unknown): { items: T[]; total: number } {
  const res = response as ListResponse<T>;
  const items = Array.isArray(res?.data?.data) ? res.data.data : [];
  const total = typeof res?.data?.total === 'number' ? res.data.total : items.length;

  return { items, total };
}

function buildGroup<T>(options: {
  key: string;
  label: string;
  href: string;
  tone: Tone;
  response: unknown;
  map: (item: T) => ActionItem;
}): Group | null {
  const { items, total } = pickPage<T>(options.response);
  if (total === 0) return null;

  return {
    key: options.key,
    label: options.label,
    href: options.href,
    tone: options.tone,
    total,
    moreCount: Math.max(0, total - items.length),
    items: items.slice(0, MAX_PER_GROUP).map(options.map),
  };
}

/** Sisipkan filter depo hanya bila dipilih (user global dengan depot.view_all). */
function depotFilter(kodeDepo?: string): Record<string, string> {
  return kodeDepo ? { kode_depo: kodeDepo } : {};
}

/** Bentuk baris yang relevan dari tiap endpoint list (untuk pemetaan grup). */
type ThlItem = { id: number; no_kendaraan?: string; nama_depo?: string; kode_depo?: string };
type RetribusiItem = { id: number; nama_depo?: string; kode_depo?: string };
type SjValidationItem = {
  id: number;
  scan_code?: string | null;
  rencana_kirim?: { po_transporter?: string; nama_depo?: string; kode_depo?: string } | null;
};
type RkItem = { id: number; nopol?: string; nama_depo?: string; kode_depo?: string };
type GateItem = { id: number; po_transporter?: string; nopol?: string };

/**
 * Section "Perlu Tindakan": item kerja yang menunggu aksi user, dikelompokkan
 * per modul dan mengikuti filter depo dashboard. Hanya memuat modul yang
 * izinnya dimiliki user; jika semua kosong, section tidak dirender sama sekali
 * (bukan menampilkan kartu kosong).
 */
export default function PendingActions({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const jobs: GroupJob[] = [];

    // Pengajuan biaya menunggu pemeriksaan: hasil submit berstatus 'pending'
    // (tak ada status 'submitted'); gate aksi pemeriksaan = approval.check.
    if (hasPermission('biaya_thl.view') && hasPermission('approval.check')) {
      jobs.push(async () => buildGroup<ThlItem>({
        key: 'thl_check',
        label: 'Pengajuan THL menunggu pemeriksaan',
        href: '/biaya-thl',
        tone: 'amber',
        response: await biayaThl.list({
          status: 'pending', per_page: MAX_PER_GROUP,
          sort: 'created_at', dir: 'asc', ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `thl-${item.id}`,
          primary: item.no_kendaraan || 'Pengajuan THL',
          secondary: item.nama_depo || item.kode_depo || '-',
          href: '/biaya-thl',
        }),
      }));
    }

    if (hasPermission('biaya_retribusi.view') && hasPermission('approval.check')) {
      jobs.push(async () => buildGroup<RetribusiItem>({
        key: 'retribusi_check',
        label: 'Retribusi menunggu pemeriksaan',
        href: '/biaya-retribusi',
        tone: 'violet',
        response: await biayaRetribusi.list({
          status: 'pending', per_page: MAX_PER_GROUP,
          sort: 'created_at', dir: 'asc', ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `retribusi-${item.id}`,
          primary: item.nama_depo || item.kode_depo || 'Pengajuan retribusi',
          secondary: 'Menunggu verifikasi BAC',
          href: '/biaya-retribusi',
        }),
      }));
    }

    // sj_validations.status hanya IN_PROGRESS/COMPLETED/CANCELLED — 'PENDING'
    // tidak pernah ada di tabel ini (PENDING hanya milik item validasinya).
    if (hasPermission('sj_validation.view')) {
      jobs.push(async () => buildGroup<SjValidationItem>({
        key: 'sj_pending',
        label: 'Surat jalan belum divalidasi',
        href: '/validasi-sj',
        tone: 'sky',
        response: await sjValidations.list({
          status: 'IN_PROGRESS', per_page: MAX_PER_GROUP, ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `sj-${item.id}`,
          primary: item.rencana_kirim?.po_transporter || item.scan_code || `Validasi #${item.id}`,
          secondary: item.rencana_kirim?.nama_depo || item.rencana_kirim?.kode_depo || '-',
          href: '/validasi-sj',
        }),
      }));
    }

    // Aksi verify memakai permission rencana_kirim.edit (lihat route /verify).
    if (hasPermission('rencana_kirim.view') && hasPermission('rencana_kirim.edit')) {
      jobs.push(async () => buildGroup<RkItem>({
        key: 'rk_verify',
        label: 'Rencana kirim menunggu verifikasi',
        href: '/rencana-kirim',
        tone: 'blue',
        response: await rencanaKirim.list({
          status: 'CHECKED_IN', per_page: MAX_PER_GROUP, ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `rk-${item.id}`,
          primary: item.nopol || `Rencana kirim #${item.id}`,
          secondary: item.nama_depo || item.kode_depo || '-',
          href: '/rencana-kirim',
        }),
      }));
    }

    if (hasPermission('gate.view')) {
      jobs.push(async () => buildGroup<GateItem>({
        key: 'gate_checkin',
        label: 'Kendaraan sedang di gate',
        href: '/gate',
        tone: 'blue',
        response: await gateTransactions.list({
          status: 'CHECKED_IN', per_page: MAX_PER_GROUP, ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `gate-${item.id}`,
          primary: item.po_transporter || item.nopol || `Transaksi #${item.id}`,
          secondary: item.nopol || '-',
          href: '/gate',
        }),
      }));
    }

    try {
      const results = await Promise.all(jobs.map((job) => job().catch(() => null)));
      setGroups(results.filter((group): group is Group => group !== null));
    } catch (exception) {
      setError(getErrorMessage(exception, 'Gagal memuat daftar tugas.'));
    } finally {
      setLoading(false);
    }
  }, [hasPermission, kodeDepo]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5" aria-busy="true">
        <div className="h-5 w-40 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="space-y-2">
          <div className="h-14 bg-surface-raised rounded-xl animate-pulse" />
          <div className="h-14 bg-surface-raised rounded-xl animate-pulse" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      </section>
    );
  }

  // Semua tugas beres: section tidak perlu tampil — dashboard tetap bersih.
  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden" aria-label="Item yang memerlukan tindakan Anda">
      <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-surface-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Perlu Tindakan</h2>
          <p className="text-sm text-gray-500">Item yang menunggu aksi Anda hari ini</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 px-3 py-1 text-xs font-bold tabular-nums">
          {groups.reduce((sum, g) => sum + g.total, 0)} item
        </span>
      </div>
      <div className="p-5 space-y-5">
        {groups.map((group) => {
          const tone = TONE_STYLES[group.tone];
          return (
            <div key={group.key}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className={`text-sm font-semibold ${tone.chip.split(' ')[1]}`}>{group.label}</h3>
                <Link href={group.href} className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors">
                  Lihat semua →
                </Link>
              </div>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:border-gray-300 hover:bg-surface-raised transition-colors group"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tone.iconBg}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900 truncate">{item.primary}</span>
                        <span className="block text-xs text-gray-400 truncate">{item.secondary}</span>
                      </span>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </Link>
                  </li>
                ))}
              </ul>
              {group.moreCount > 0 && (
                <p className="mt-1.5 px-1 text-xs text-gray-400">+{group.moreCount} lainnya — lihat semua di halaman modul</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
