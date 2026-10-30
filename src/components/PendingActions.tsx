'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { biayaRetribusi, biayaThl, gateTransactions, rencanaKirim, sjValidations, standarisasiTumpukan, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import DashboardPanel from '@/components/DashboardPanel';

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

const TONE_STYLES: Record<Tone, { dot: string; chip: string; label: string }> = {
  amber:  { dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700',      label: 'text-amber-700' },
  blue:   { dot: 'bg-blue-600',    chip: 'bg-blue-50 text-blue-700',        label: 'text-blue-700' },
  sky:    { dot: 'bg-sky-600',     chip: 'bg-sky-50 text-sky-700',          label: 'text-sky-700' },
  violet: { dot: 'bg-primary-600', chip: 'bg-chip-primary text-accent-text', label: 'text-accent-text' },
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
type SjExtraSession = {
  id: number;
  scan_code?: string | null;
  rencana_kirim?: { po_transporter?: string; nama_depo?: string; kode_depo?: string } | null;
  pending_extra_items_count?: number;
};
type StandarisasiRow = {
  id: number;
  npn?: { szShortDescription?: string; szNickName?: string; szNickNameNew?: string } | null;
};

/**
 * Section "Perlu Tindakan": item kerja yang menunggu aksi user, dikelompokkan
 * per modul dan mengikuti filter depo dashboard. Hanya memuat modul yang
 * izinnya dimiliki user; jika semua kosong, section tidak dirender sama sekali
 * (bukan menampilkan kartu kosong).
 *
 * Tata letak dibuat ringkas: header ramping + baris item satu-lapis yang
 * tersusun dua kolom di layar lebar, supaya section tidak memakan tinggi
 * dashboard.
 */
export default function PendingActions({ kodeDepo }: { kodeDepo?: string }) {
  const { hasPermission } = useAuthStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** Jumlah modul yang gagal dimuat — tampilkan indikator parsial, bukan hilang diam-diam. */
  const [failedCount, setFailedCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setFailedCount(0);

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

    // Barang luar rencana menunggu keputusan planner: sesi berjalan yang
    // punya catatan PENDING (filter backend has_pending_extra_items) —
    // keputusan setujui/tolak terjadi di halaman validasi dokumen.
    if (hasPermission('sj_validation.approve')) {
      jobs.push(async () => buildGroup<SjExtraSession>({
        key: 'sj_extra_pending',
        label: 'Barang luar rencana menunggu keputusan',
        href: '/validasi-sj',
        tone: 'amber',
        response: await sjValidations.list({
          status: 'IN_PROGRESS', has_pending_extra_items: 1,
          per_page: MAX_PER_GROUP, sort: 'created_at', dir: 'asc',
          ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `sj-extra-${item.id}`,
          primary: item.rencana_kirim?.po_transporter || item.scan_code || `Validasi #${item.id}`,
          secondary: `${item.pending_extra_items_count ?? 0} barang menunggu`,
          href: '/validasi-sj',
        }),
      }));
    }

    // Pengajuan standarisasi tumpukan menunggu keputusan BLC; persetujuan
    // terjadi di halaman modul standarisasi.
    if (hasPermission('standarisasi.approve')) {
      jobs.push(async () => buildGroup<StandarisasiRow>({
        key: 'standarisasi_pending',
        label: 'Standarisasi menunggu approval BLC',
        href: '/standarisasi',
        tone: 'violet',
        response: await standarisasiTumpukan.list({
          status: 'pending', per_page: MAX_PER_GROUP,
          sort: 'created_at', dir: 'asc', ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `standarisasi-${item.id}`,
          primary: item.npn?.szShortDescription || item.npn?.szNickName || item.npn?.szNickNameNew || `Standarisasi #${item.id}`,
          secondary: 'Menunggu keputusan BLC',
          href: '/standarisasi',
        }),
      }));
    }

    try {
      const results = await Promise.all(jobs.map((job) => job().then(
        (group) => ({ group, failed: false }),
        () => ({ group: null as Group | null, failed: true }),
      )));
      setFailedCount(results.filter((r) => r.failed).length);
      setGroups(results.map((r) => r.group).filter((group): group is Group => group !== null));
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
      <section className="bg-card rounded-2xl shadow-sm border border-gray-100 p-5" aria-busy="true">
        <div className="mb-3 h-4 w-36 rounded bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="h-9 rounded-lg bg-popover animate-pulse" />
          <div className="h-9 rounded-lg bg-popover animate-pulse" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-card rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      </section>
    );
  }

  // Semua tugas beres dan tak ada modul yang gagal: section tidak perlu tampil.
  if (groups.length === 0 && failedCount === 0) {
    return null;
  }

  // Seluruh modul gagal: tampilkan banner + retry, bukan section kosong yang hilang diam-diam.
  if (groups.length === 0) {
    return (
      <section className="bg-card rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700" role="alert">
          <span>Data tugas gagal dimuat.</span>
          <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      </section>
    );
  }

  const totalItems = groups.reduce((sum, g) => sum + g.total, 0);

  return (
    <DashboardPanel
      ariaLabel="Item yang memerlukan tindakan Anda"
      title="Perlu Tindakan"
      subtitle="Item yang menunggu aksi Anda hari ini"
      icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
      badge={
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold tabular-nums text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
          {totalItems} item
        </span>
      }
    >
      {failedCount > 0 && (
        <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700" role="alert">
          <span>Sebagian data gagal dimuat — daftar mungkin belum lengkap.</span>
          <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {groups.map((group) => {
          const tone = TONE_STYLES[group.tone];
          return (
            <div key={group.key} className="px-5 py-3">
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className={`truncate text-xs font-semibold ${tone.label}`}>{group.label}</h3>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tone.chip}`}>{group.total}</span>
                <Link href={group.href} className="ml-auto shrink-0 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700">
                  Lihat semua →
                </Link>
              </div>
              <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-popover"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{item.primary}</span>
                        <span className="min-w-0 truncate text-xs text-gray-400">{item.secondary}</span>
                      </span>
                      <svg className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </Link>
                  </li>
                ))}
              </ul>
              {group.moreCount > 0 && (
                <p className="mt-1 px-1 text-xs text-gray-400">+{group.moreCount} lainnya — lihat semua di halaman modul</p>
              )}
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
