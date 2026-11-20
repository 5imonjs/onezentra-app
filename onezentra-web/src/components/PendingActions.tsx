'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { biayaRetribusi, biayaThl, gateTransactions, rencanaKirim, sjValidations, standarisasiTumpukan, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import DashboardPanel from '@/components/DashboardPanel';

type Tone = 'amber' | 'blue' | 'sky' | 'violet';

type ToneStyle = { dot: string; chip: string; label: string; tile: string; ring: string };

type ActionItem = { id: string; primary: string; secondary: string; href: string; at?: string };

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

const TONE_STYLES: Record<Tone, ToneStyle> = {
  amber:  { dot: 'bg-amber-500',   chip: 'bg-amber-500/10 text-amber-600 ring-amber-500/20', label: 'text-amber-600', tile: 'bg-amber-500/10 text-amber-600', ring: 'hover:ring-amber-500/30' },
  blue:   { dot: 'bg-blue-500',    chip: 'bg-blue-500/10 text-blue-600 ring-blue-500/20',    label: 'text-blue-600',  tile: 'bg-blue-500/10 text-blue-600',  ring: 'hover:ring-blue-500/30' },
  sky:    { dot: 'bg-sky-500',     chip: 'bg-sky-500/10 text-sky-600 ring-sky-500/20',      label: 'text-sky-600',   tile: 'bg-sky-500/10 text-sky-600',   ring: 'hover:ring-sky-500/30' },
  violet: { dot: 'bg-primary-500', chip: 'bg-primary-500/10 text-accent-text ring-primary-500/20', label: 'text-accent-text', tile: 'bg-primary-500/10 text-accent-text', ring: 'hover:ring-primary-500/30' },
};

const MAX_PER_GROUP = 4;
/** Backend SJ/RK/gate memaksa created_at DESC; ambil jendela lebih besar lalu urutkan di client. */
const SORT_WINDOW = 20;

/** Batas usia dokumen sebelum ditandai "terlewat" (sama seperti reminder lama). */
const OVERDUE_MINUTES = 30;

function ageMinutes(item: ActionItem): number | null {
  if (!item.at) return null;
  const diff = Date.now() - new Date(item.at).getTime();
  return Number.isNaN(diff) ? null : Math.max(0, Math.floor(diff / 60000));
}

function isOverdue(item: ActionItem): boolean {
  const minutes = ageMinutes(item);
  return minutes !== null && minutes > OVERDUE_MINUTES;
}

function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} jam` : `${hours}j ${rest}m`;
}

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

  // Urutkan tertua lebih dulu. Endpoint THL/retribusi/standarisasi sudah
  // menerima sort=created_at&dir=asc, tetapi SJ/RK/gate mengabaikannya dan
  // memaksa DESC — jadi penyortiran final tetap dilakukan di sini.
  const mapped = items.map(options.map).sort((a, b) => {
    const timeA = a.at ? new Date(a.at).getTime() : Number.POSITIVE_INFINITY;
    const timeB = b.at ? new Date(b.at).getTime() : Number.POSITIVE_INFINITY;
    return timeA - timeB;
  });

  return {
    key: options.key,
    label: options.label,
    href: options.href,
    tone: options.tone,
    total,
    moreCount: Math.max(0, total - MAX_PER_GROUP),
    items: mapped.slice(0, MAX_PER_GROUP),
  };
}

/** Sisipkan filter depo hanya bila dipilih (user global dengan depot.view_all). */
function depotFilter(kodeDepo?: string): Record<string, string> {
  return kodeDepo ? { kode_depo: kodeDepo } : {};
}

/** Bentuk baris yang relevan dari tiap endpoint list (untuk pemetaan grup). */
type ThlItem = { id: number; no_kendaraan?: string; nama_depo?: string; kode_depo?: string; created_at?: string };
type RetribusiItem = { id: number; nama_depo?: string; kode_depo?: string; created_at?: string };
type SjValidationItem = {
  id: number;
  scan_code?: string | null;
  rencana_kirim?: { po_transporter?: string; nama_depo?: string; kode_depo?: string } | null;
  created_at?: string;
};
type RkItem = { id: number; nopol?: string; nama_depo?: string; kode_depo?: string; created_at?: string };
type GateItem = { id: number; po_transporter?: string; nopol?: string; created_at?: string };
type SjExtraSession = {
  id: number;
  scan_code?: string | null;
  rencana_kirim?: { po_transporter?: string; nama_depo?: string; kode_depo?: string } | null;
  pending_extra_items_count?: number;
  created_at?: string;
};
type StandarisasiRow = {
  id: number;
  npn?: { szShortDescription?: string; szNickName?: string; szNickNameNew?: string } | null;
  created_at?: string;
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
  const [onlyOverdue, setOnlyOverdue] = useState(false);
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
          at: item.created_at,
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
          at: item.created_at,
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
          status: 'IN_PROGRESS', per_page: SORT_WINDOW, ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `sj-${item.id}`,
          primary: item.rencana_kirim?.po_transporter || item.scan_code || `Validasi #${item.id}`,
          secondary: item.rencana_kirim?.nama_depo || item.rencana_kirim?.kode_depo || '-',
          href: '/validasi-sj',
          at: item.created_at,
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
          status: 'CHECKED_IN', per_page: SORT_WINDOW, ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `rk-${item.id}`,
          primary: item.nopol || `Rencana kirim #${item.id}`,
          secondary: item.nama_depo || item.kode_depo || '-',
          href: '/rencana-kirim',
          at: item.created_at,
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
          status: 'CHECKED_IN', per_page: SORT_WINDOW, ...depotFilter(kodeDepo),
        }),
        map: (item) => ({
          id: `gate-${item.id}`,
          primary: item.po_transporter || item.nopol || `Transaksi #${item.id}`,
          secondary: item.nopol || '-',
          href: '/gate',
          at: item.created_at,
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
          at: item.created_at,
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
          at: item.created_at,
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
      <section className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-sm" aria-busy="true">
        <div className="mb-3 h-4 w-36 rounded-full bg-popover animate-pulse" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="h-14 rounded-xl bg-popover animate-pulse" />
          <div className="h-14 rounded-xl bg-popover animate-pulse" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-card rounded-2xl shadow-sm border border-border p-5">
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
      <section className="bg-card rounded-2xl shadow-sm border border-border p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700" role="alert">
          <span>Data tugas gagal dimuat.</span>
          <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      </section>
    );
  }

  const totalItems = groups.reduce((sum, g) => sum + g.total, 0);

  const displayedGroups = groups
    .map((group) => {
      const items = onlyOverdue ? group.items.filter(isOverdue) : group.items;
      return {
        ...group,
        items,
        total: onlyOverdue ? items.length : group.total,
        moreCount: onlyOverdue ? 0 : group.moreCount,
      };
    })
    .filter((group) => group.items.length > 0);

  const overdueCount = groups.reduce(
    (sum, group) => sum + group.items.filter(isOverdue).length,
    0,
  );

  return (
    <DashboardPanel
      ariaLabel="Item yang memerlukan tindakan Anda"
      title="Perlu Tindakan"
      subtitle="Semua antrean kerja · penanda terlewat > 30 menit"
      icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
      badge={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-red-600 ring-1 ring-red-500/20" title="Sudah melewati 30 menit">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
              {overdueCount} terlewat
            </span>
          )}
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold tabular-nums text-amber-600 ring-1 ring-amber-500/20">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            {totalItems} item
          </span>
          <div role="group" aria-label="Filter usia tugas" className="flex rounded-lg border border-border bg-card p-0.5">
            <button type="button" onClick={() => setOnlyOverdue(false)} aria-pressed={!onlyOverdue} className="rounded-md px-2 py-1 text-[11px] font-bold transition-colors min-h-8">
              Semua
            </button>
            <button type="button" onClick={() => setOnlyOverdue(true)} aria-pressed={onlyOverdue} className="rounded-md px-2 py-1 text-[11px] font-bold transition-colors min-h-8">
              Terlewat
            </button>
          </div>
        </div>
      }
    >
      {failedCount > 0 && (
        <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700" role="alert">
          <span>Sebagian data gagal dimuat — daftar mungkin belum lengkap.</span>
          <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
        </div>
      )}

      <div className="divide-y divide-border/60">
        {displayedGroups.map((group) => {
          const tone = TONE_STYLES[group.tone];
          return (
            <div key={group.key} className="px-5 py-4">
              <div className="mb-2.5 flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                <h3 className="truncate text-[13px] font-semibold text-foreground">{group.label}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${tone.chip}`}>{group.total}</span>
                <Link
                  href={group.href}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-popover hover:text-foreground"
                >
                  Lihat semua →
                </Link>
              </div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-xl border border-border/70 bg-popover/60 px-3 py-2.5 ring-1 ring-transparent transition-all duration-200 hover:-translate-y-0.5 hover:bg-card hover:shadow-sm ${tone.ring}`}
                    >
                      <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone.tile}`}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{item.primary}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{item.secondary}</span>
                      </span>
                      {(() => {
                        const minutes = ageMinutes(item);
                        if (minutes === null) return null;
                        const overdue = isOverdue(item);
                        return (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1 ${overdue ? 'bg-red-500/10 text-red-600 ring-red-500/20' : 'bg-popover text-muted-foreground ring-border/70'}`} title={overdue ? 'Sudah melewati batas 30 menit' : 'Usia dokumen'}>
                            {ageLabel(minutes)}
                          </span>
                        );
                      })()}
                      <svg className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </Link>
                  </li>
                ))}
              </ul>
              {group.moreCount > 0 && (
                <p className="mt-2 px-1 text-[11px] text-muted-foreground">+{group.moreCount} lainnya — lihat semua di halaman modul</p>
              )}
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
