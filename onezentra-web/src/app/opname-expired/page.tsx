'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { opnameExpired, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { addDaysIso, formatDateId, formatDurationId, mondayOfWeek, todayLocal } from '@/lib/dates';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import ManualBatchManager from '@/components/ManualBatchManager';
import BaselineImportManager from '@/components/BaselineImportManager';
import { useAuthStore } from '@/store/auth';

interface Wave {
  id: number;
  week_start: string;
  week_end: string;
  kode_depo: string;
  nama_depo: string;
  kode_barang: string;
  nama_barang: string;
  // Principal 1 & 2 dari master cluster_principal (LEFT JOIN backend).
  // Null = master belum lengkap, tampil '-'.
  principal_1?: string | null;
  principal_2?: string | null;
  // Jejak batch penyusun baris agregat ini (diisi Generate).
  batch_numbers?: string[] | null;
  // Komposisi sumber: {sj, import, legacy} — penanda SJ murni / Import manual /
  // baseline legacy / Gabungan.
  source_mix?: { sj: number; import: number; legacy?: number } | null;
  sumber_material: string;
  tanggal_penerimaan: string | null;
  qty_ini_crt: number;
  qty_ini_pcs: number;
  qty_lalu_crt: number;
  qty_lalu_pcs: number;
  expired_date_ini: string;
  expired_date_lalu: string | null;
  sisa_hari: number;
  status_ini: string;
  status_lalu: string | null;
  perubahan: string;
  rekomendasi: string;
  selisih_expired_date: number | null;
  qty_koreksi_crt: number;
  qty_koreksi_pcs: number;
  validated_at: string | null;
  validator?: { full_name: string } | null;
}

interface StatusCount {
  count: number;
  qty_crt: number;
}

type StatusSummary = Partial<Record<string, StatusCount>>;

interface DepotSummaryEntry {
  kode_depo: string;
  nama_depo: string;
  status: string;
  count: number;
  qty_crt: number;
}

interface ListMeta {
  weeks: string[];
  thresholds: Record<string, number>;
  status_summary: StatusSummary;
  prev_week_start: string | null;
  prev_status_summary: StatusSummary;
  depot_summary: DepotSummaryEntry[];
}

interface ListResponse {
  data: {
    data: Wave[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
  meta: ListMeta;
}

interface PendingSummary {
  week_start: string;
  week_end: string;
  wave_exists: boolean;
  eligible: { total: number; sj: number; import: number; legacy: number };
  pending: { total: number; sj: number; import: number; legacy: number };
}

const ITEMS_PER_PAGE = 50;

const STATUS_ORDER = ['EXPIRED', 'KRITIS', 'PERHATIAN', 'AMAN'] as const;

type TabKey = 'ACTION' | 'EXPIRED' | 'KRITIS' | 'PERHATIAN' | 'AMAN' | 'ALL';

const STATUS_META: Record<string, { label: string; badge: string; dot: string; bar: string; text: string; panel: string }> = {
  EXPIRED: { label: 'Expired', badge: 'bg-red-50 text-red-700', dot: 'bg-red-500', bar: 'bg-red-500', text: 'text-red-600', panel: 'bg-red-500/10 border-red-500/20' },
  KRITIS: { label: 'Kritis', badge: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500', bar: 'bg-orange-500', text: 'text-orange-700', panel: 'bg-orange-500/10 border-orange-500/20' },
  PERHATIAN: { label: 'Perhatian', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', bar: 'bg-amber-400', text: 'text-amber-700', panel: 'bg-amber-500/10 border-amber-500/20' },
  AMAN: { label: 'Aman', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-700', panel: 'bg-emerald-500/10 border-emerald-500/20' },
};

const num = (v: unknown): number => Number(v ?? 0);

// Kotak cari dengan state lokal: ketikan TIDAK me-render ulang tabel.
// Filter terkirim ke halaman hanya saat Enter (pola halaman ini).
function SearchBox({ initial, onSearch }: { initial: string; onSearch: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="relative flex-1 min-w-[240px]">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch(value.trim()); }}
        placeholder="Cari kode / nama barang..."
        className="input-field pl-9 py-2 text-sm"
        aria-label="Cari kode atau nama barang"
      />
    </div>
  );
}

// Helper murni di modul agar WaveRow memo bisa pakai.
const fmtDate = formatDateId;

const fnum = (v: number) => v.toLocaleString('id-ID');

function badge(status?: string | null) {
  const s = status || '-';
  const meta = STATUS_META[s] || { label: s, badge: 'bg-popover text-foreground', dot: 'bg-gray-400', bar: 'bg-gray-300', text: 'text-foreground', panel: 'bg-popover border-border' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// Baris tabel di-memo: parent me-render ulang tiap ketikan/filter harus
// TIDAK me-render ulang 50 baris yang datanya tidak berubah.
const WaveRow = memo(function WaveRow({ w, selected, canDelete, deleting, maxHari, onOpen, onDelete, onToggle }: {
  w: Wave;
  selected: boolean;
  canDelete: boolean;
  deleting: boolean;
  maxHari: number;
  onOpen: (w: Wave) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const meta = STATUS_META[w.status_ini] || STATUS_META.AMAN;
  return (
    <tr className="hover:bg-overlay-70 transition-colors">
      {canDelete && (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(w.id)}
            aria-label={`Pilih baris ${w.kode_barang}`}
            className="w-4 h-4 accent-red-600 cursor-pointer"
          />
        </td>
      )}
      <td className="px-5 py-3 whitespace-nowrap">
        {badge(w.status_ini)}
      </td>
      <td className="px-5 py-3 min-w-50 max-w-80">
        <span className="block font-mono text-sm font-medium text-foreground">{w.kode_barang}</span>
        <span className="block text-xs text-muted-foreground line-clamp-1 wrap-break-word" title={w.nama_barang || undefined}>{w.nama_barang || '-'}</span>
      </td>
      <td className="px-5 py-3 whitespace-nowrap text-sm text-foreground">{w.nama_depo || w.kode_depo || '-'}</td>
      <td className="px-5 py-3 whitespace-nowrap">{sourceBadge(w.source_mix)}</td>
      <td className="px-5 py-3 whitespace-nowrap text-sm text-foreground">{w.principal_1 || '-'}</td>
      <td className="px-5 py-3 whitespace-nowrap text-sm text-foreground">{w.principal_2 || '-'}</td>
      <td className="px-5 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-semibold tabular-nums text-foreground">{fnum(num(w.qty_ini_crt))}</span>
        {num(w.qty_koreksi_crt) !== 0 && (
          <span className="block text-[11px] text-blue-600 tabular-nums">koreksi {num(w.qty_koreksi_crt)}</span>
        )}
      </td>
      <td className="px-5 py-3 text-right whitespace-nowrap">
        <span className="text-sm tabular-nums text-foreground">{fnum(num(w.qty_ini_pcs))}</span>
        {num(w.qty_koreksi_pcs) !== 0 && (
          <span className="block text-[11px] text-blue-600 tabular-nums">koreksi {num(w.qty_koreksi_pcs)}</span>
        )}
      </td>
      <td className="px-5 py-3 whitespace-nowrap text-sm text-foreground">{w.tanggal_penerimaan ? fmtDate(w.tanggal_penerimaan) : '-'}</td>
      <td className="px-5 py-3 whitespace-nowrap text-sm text-foreground">{fmtDate(w.expired_date_ini)}</td>
      <td className="px-5 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <DaysBar sisaHari={w.sisa_hari} maxHari={maxHari} status={w.status_ini} />
          <span title={`${w.sisa_hari} hari`} className={`text-sm font-bold tabular-nums whitespace-nowrap ${meta.text}`}>
            {formatDurationId(w.sisa_hari)}
          </span>
        </div>
      </td>
      <td className="px-5 py-3 text-right whitespace-nowrap">
        <button
          onClick={() => onOpen(w)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-foreground hover:bg-slate-200 hover:text-foreground transition-colors"
        >
          Detail
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
        {canDelete && (
          <button
            onClick={() => onDelete(w.id)}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            Hapus
          </button>
        )}
      </td>
    </tr>
  );
});
function sourceBadge(mix?: { sj: number; import: number; legacy?: number } | null) {
  const sj = num(mix?.sj);
  const imp = num(mix?.import);
  const legacy = num(mix?.legacy);
  const kinds = [sj > 0, imp > 0, legacy > 0].filter(Boolean).length;

  if (kinds > 1) {
    const parts = [
      sj > 0 ? `${sj} SJ` : null,
      imp > 0 ? `${imp} stok manual` : null,
      legacy > 0 ? `${legacy} Saldo Awal` : null,
    ].filter(Boolean).join(' + ');
    return (
      <span title={parts} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 whitespace-nowrap">Gabungan</span>
    );
  }
  if (legacy > 0) {
    return (
      <span title={`${legacy} baris saldo awal`} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-violet-50 text-violet-700 whitespace-nowrap">Saldo Awal</span>
    );
  }
  if (imp > 0) {
    return (
      <span title={`${imp} baris stok manual`} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-foreground whitespace-nowrap">Stok Manual</span>
    );
  }
  if (sj > 0) {
    return (
      <span title={`${sj} baris SJ`} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 whitespace-nowrap">SJ</span>
    );
  }
  return <span className="text-slate-300 text-xs">-</span>;
}

// Sortir klik-header ala Excel: klik = A-Z, klik lagi = Z-A.
type SortKey = 'status' | 'produk' | 'depo' | 'principal_1' | 'principal_2' | 'crt' | 'pcs' | 'penerimaan' | 'expired' | 'sisa';

function SortHeader({ label, sortKey, sort, onSort, align = 'left' }: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey | null; dir: 'asc' | 'desc' } | null;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Urutkan ${label} ${active && sort.dir === 'asc' ? 'menurun' : 'menaik'}`}
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[11px] transition-colors hover:text-foreground ${active ? 'text-foreground' : 'text-muted-foreground'} ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className={`text-[10px] leading-none ${active ? 'text-primary-500' : 'text-slate-300'}`}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '△'}
      </span>
    </button>
  );
}

function DaysBar({ sisaHari, maxHari, status }: { sisaHari: number; maxHari: number; status: string }) {
  const meta = STATUS_META[status] || STATUS_META.AMAN;
  const pct = Math.max(0, Math.min(100, (sisaHari / Math.max(maxHari, 1)) * 100));
  return (
    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-10 max-w-[80px]">
      <div className={`h-full rounded-full transition-all duration-300 ${meta.bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}



export default function OpnameExpiredPage() {
  const { hasPermission, user } = useAuthStore();
  const kodeDepo = user?.kode_depo;
  const canViewReceiving = hasPermission('penerimaan.view');
  const [waves, setWaves] = useState<Wave[]>([]);
  const [pagination, setPagination] = useState<ListResponse['data'] | null>(null);
  // Halaman ini bekerja per minggu opname. Semua aksi (daftar, pending,
  // progres, generate, export) memakai week_start yang sama agar tidak ada
  // dua konsep tanggal yang saling bertentangan.
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(todayLocal()));
  const [searchApply, setSearchApply] = useState('');
  // Filter sumber data: '' semua, 'sj' murni sistem, 'import' manual, 'mixed' gabungan.
  const [sourceFilter, setSourceFilter] = useState('');
  // Filter depo: '' semua; opsi dari meta.depot_summary (semua depo minggu ini).
  const [depoFilter, setDepoFilter] = useState('');
  const [depotSummary, setDepotSummary] = useState<DepotSummaryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [tabKey, setTabKey] = useState<TabKey>('ACTION');
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [statusSummary, setStatusSummary] = useState<StatusSummary>({});
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [prevWeekStart, setPrevWeekStart] = useState<string | null>(null);
  const [prevStatusSummary, setPrevStatusSummary] = useState<StatusSummary>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, setPending] = useState<PendingSummary | null>(null);
  const [pendingError, setPendingError] = useState(false);
  const [depoProgress, setDepoProgress] = useState<{
    kode_depo: string;
    nama_depo: string | null;
    total: number;
    validated: number;
    has_session: boolean;
    has_open_session?: boolean;
    open_session_id?: number | null;
    has_finalized_session?: boolean;
    finalized_session_id?: number | null;
    submitted: boolean;
  }[] | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [thresholdForm, setThresholdForm] = useState<Record<string, number>>({
    threshold_aman: 90,
    threshold_perhatian: 30,
    threshold_kritis: 7,
  });
  const [thresholdErrors, setThresholdErrors] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [baselineStatus, setBaselineStatus] = useState<'loading' | 'missing' | 'installed' | 'unknown'>('loading');
  const tablistRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => waves.find((w) => w.id === selectedId) ?? null, [waves, selectedId]);
  const currentIndex = useMemo(() => waves.findIndex((w) => w.id === selectedId), [waves, selectedId]);

  const tabStatuses = useMemo((): string[] | null => {
    switch (tabKey) {
      case 'ACTION':
        return ['EXPIRED', 'KRITIS', 'PERHATIAN'];
      case 'ALL':
        return null;
      default:
        return [tabKey];
    }
  }, [tabKey]);

  // Opsi dropdown filter depo: de-dupe meta.depot_summary per kode_depo.
  const depoOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of depotSummary) {
      if (!seen.has(d.kode_depo)) seen.set(d.kode_depo, d.nama_depo || d.kode_depo);
    }
    return Array.from(seen, ([kode_depo, nama_depo]) => ({ kode_depo, nama_depo }));
  }, [depotSummary]);

  /**
   * Minggu aktif adalah satu-satunya sumber tanggal untuk halaman ini.
   * Input tanggal dinormalisasi ke Senin agar daftar, pending, progres,
   * generate, dan export selalu membaca minggu yang sama.
   */
  const weekEnd = useMemo(() => addDaysIso(weekStart, 6), [weekStart]);
  const weekRangeLabel = `${formatDateId(weekStart)} – ${formatDateId(weekEnd)}`;
  const currentWeekStart = mondayOfWeek(todayLocal());
  const isCurrentWeek = weekStart === currentWeekStart;

  const weekOptions = useMemo(() => {
    const weeks = new Set(availableWeeks.map(mondayOfWeek));
    weeks.add(currentWeekStart);
    weeks.add(weekStart);
    return Array.from(weeks).sort((a, b) => b.localeCompare(a));
  }, [availableWeeks, currentWeekStart, weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await opnameExpired.list({
        week_start: weekStart,
        search: searchApply || undefined,
        statuses: tabStatuses?.join(',') || undefined,
        source: sourceFilter || undefined,
        kode_depo: depoFilter || undefined,
        sort_by: sort.key || undefined,
        sort_dir: sort.key ? sort.dir : undefined,
        per_page: ITEMS_PER_PAGE,
        page,
      }) as { data: ListResponse };
      setWaves(res.data.data.data);
      // Buang seleksi basi (id yang tak lagi tampil), termasuk drawer yang
      // sedang terbuka — kalau tidak, panel kanan bisa kosong setelah refresh.
      setSelectedWaveIds((prev) => {
        const visible = new Set(res.data.data.data.map((w: Wave) => w.id));
        return new Set(Array.from(prev).filter((id) => visible.has(id)));
      });
      setSelectedId((prev) => (prev !== null && !res.data.data.data.some((w: Wave) => w.id === prev) ? null : prev));
      setPagination(res.data.data);
      setThresholds(res.data.meta.thresholds ?? {});
      setStatusSummary(res.data.meta.status_summary ?? {});
      setAvailableWeeks(res.data.meta.weeks ?? []);
      setPrevWeekStart(res.data.meta.prev_week_start ?? null);
      setPrevStatusSummary(res.data.meta.prev_status_summary ?? {});
      // Dropdown depo mengikuti minggu terpilih; reset filter bila depo yang
      // dipilih tak lagi punya wave di minggu ini.
      const summary = res.data.meta.depot_summary ?? [];
      setDepotSummary(summary);
      if (depoFilter && !summary.some((d: DepotSummaryEntry) => d.kode_depo === depoFilter)) {
        setDepoFilter('');
      }
    } catch (e) {
      setLoadError(getErrorMessage(e, 'Gagal memuat data'));
    } finally {
      setLoading(false);
    }
  }, [weekStart, searchApply, tabStatuses, page, sort, sourceFilter, depoFilter]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
    setPage(1);
  };

  useEffect(() => { load(); }, [load]);

  // Indikator "belum di-generate": baris ledger (SJ + import) yang lolos syarat
  // generate minggu berjalan tapi kuncinya belum ada di wave. Basisnya sama
  // dengan backend generate() — lihat GET /opname-expired/pending.
  const loadPending = useCallback(async (week?: string) => {
    try {
      const res = await opnameExpired.pending({ week_start: week || undefined }) as { data: { data: PendingSummary } };
      setPending(res.data.data);
      setPendingError(false);
    } catch {
      setPending(null);
      setPendingError(true);
    }
  }, []);

  useEffect(() => { loadPending(weekStart); }, [loadPending, weekStart]);

  // Progres kirim per depo: sudah vs belum kirim hasil opname minggu ini.
  const loadProgress = useCallback(async (week?: string) => {
    try {
      const res = await opnameExpired.progress({ week_start: week || undefined }) as {
        data: { data: { depots: { kode_depo: string; nama_depo: string | null; total: number; validated: number; has_session: boolean; has_open_session?: boolean; open_session_id?: number | null; has_finalized_session?: boolean; finalized_session_id?: number | null; submitted: boolean }[] } };
      };
      setDepoProgress(res.data.data.depots);
      setProgressError(false);
    } catch {
      setDepoProgress(null);
      setProgressError(true);
    }
  }, []);

  useEffect(() => { loadProgress(weekStart); }, [loadProgress, weekStart]);

  // Status data awal hanya relevan untuk akun depo. Akun pusat/global tidak
  // dipaksa memilih satu depo di sini.
  const loadBaselineStatus = useCallback(async () => {
    if (!kodeDepo || !canViewReceiving) {
      setBaselineStatus('unknown');
      return;
    }
    try {
      const res = await opnameExpired.baselineManifests({ kode_depo: kodeDepo }) as {
        data: { data: { kode_depo: string | null }[] };
      };
      const list = res.data?.data ?? [];
      setBaselineStatus(list.some((b) => b.kode_depo === kodeDepo) ? 'installed' : 'missing');
    } catch {
      setBaselineStatus('unknown');
    }
  }, [canViewReceiving, kodeDepo]);

  useEffect(() => { loadBaselineStatus(); }, [loadBaselineStatus]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Drawer detail berperilaku sebagai dialog: Escape menutup dan halaman di
  // belakang tidak ikut ter-scroll saat panel terbuka.
  useEffect(() => {
    if (selectedId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedId]);

  const reloadAll = useCallback((resetPage = false) => {
    if (resetPage) setPage(1);
    void load();
    void loadPending(weekStart);
    void loadProgress(weekStart);
    void loadBaselineStatus();
  }, [load, loadBaselineStatus, loadPending, loadProgress, weekStart]);

  const refreshAfterDataChange = useCallback(() => reloadAll(true), [reloadAll]);

  /**
   * Semua tombol ke modul Stock Opname membawa konteks minggu + depo agar
   * user tidak mendarat di daftar sesi mentah lalu memfilter ulang.
   */
  const sessionHref = (options: { depo?: string; create?: boolean; sessionId?: number | null } = {}): string => {
    const params = new URLSearchParams();
    params.set('week_start', weekStart);
    const depo = options.depo || depoFilter || kodeDepo || '';
    if (depo) params.set('kode_depo', depo);
    if (options.create) params.set('create', '1');
    if (options.sessionId) params.set('session_id', String(options.sessionId));
    return `/opname-sessions?${params.toString()}`;
  };

  const handleRemind = async () => {
    setReminding(true);
    try {
      const res = await opnameExpired.remind({ week_start: weekStart }) as { data: { message?: string } };
      notifyGlobal(res.data.message ?? 'Pengingat dikirim.', 'success');
      await loadProgress(weekStart);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengirim pengingat'));
    } finally {
      setReminding(false);
    }
  };

  const totalActions = STATUS_ORDER.reduce((acc, s) => acc + (statusSummary[s]?.count ?? 0), 0);
  const totalRows = totalActions;
  const berisikoCrt = (statusSummary.EXPIRED?.qty_crt ?? 0) + (statusSummary.KRITIS?.qty_crt ?? 0) + (statusSummary.PERHATIAN?.qty_crt ?? 0);

  // Progres sesi minggu aktif. depoProgress adalah sumber yang tidak ikut
  // filter tab/search, sehingga cocok untuk menentukan langkah alur.
  const progressTotal = depoProgress?.reduce((sum, d) => sum + d.total, 0) ?? 0;
  const progressValidated = depoProgress?.reduce((sum, d) => sum + d.validated, 0) ?? 0;
  const weekRows = depoProgress && depoProgress.length > 0
    ? progressTotal
    : Object.values(statusSummary).reduce((sum, s) => sum + (s?.count ?? 0), 0);
  const allRowsValidated = Boolean(depoProgress && depoProgress.length > 0 && depoProgress.every((d) => d.submitted));
  const openSessionRows = depoProgress?.filter((d) => d.has_open_session ?? d.has_session) ?? [];
  const hasOpenSession = openSessionRows.length > 0;
  const onlyOpenSessionId = openSessionRows.length === 1 ? (openSessionRows[0].open_session_id ?? null) : null;
  const finalizedSessionRows = depoProgress?.filter((d) => d.has_finalized_session && d.finalized_session_id) ?? [];
  const onlyFinalizedSessionId = finalizedSessionRows.length === 1 ? (finalizedSessionRows[0].finalized_session_id ?? null) : null;
  const progressPct = progressTotal > 0 ? Math.round((progressValidated / progressTotal) * 100) : 0;
  const hasWeekRows = weekRows > 0 || waves.length > 0;

  // Dipakai empty-state: apakah pencarian aktif (UI saja).
  const hasSearch = searchApply.trim().length > 0;

  const tabCount = (key: TabKey): number => {
    if (key === 'ACTION') return (statusSummary.EXPIRED?.count ?? 0) + (statusSummary.KRITIS?.count ?? 0) + (statusSummary.PERHATIAN?.count ?? 0);
    if (key === 'ALL') return totalActions;
    return statusSummary[key]?.count ?? 0;
  };

  const diff = (status: string): string => {
    const cur = statusSummary[status]?.count ?? 0;
    const prev = prevStatusSummary[status]?.count ?? 0;
    const d = cur - prev;
    if (!prevWeekStart) return '—';
    if (d > 0) return `▲ ${d}`;
    if (d < 0) return `▼ ${Math.abs(d)}`;
    return '•';
  };

  const openItem = useCallback((w: Wave) => setSelectedId(w.id), []);
  const navNext = (delta: 1 | -1) => {
    if (waves.length === 0 || currentIndex < 0) return;
    const next = waves[(currentIndex + delta + waves.length) % waves.length];
    if (next) setSelectedId(next.id);
  };

  const tabList = useMemo((): { key: TabKey; label: string }[] => [
    { key: 'ACTION', label: 'Perlu Ditindak' },
    ...STATUS_ORDER.map((s) => ({ key: s as TabKey, label: STATUS_META[s].label })),
    { key: 'ALL', label: 'Semua' },
  ], []);

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const tabs = tabList;
    const currentIdx = tabs.findIndex((t) => t.key === tabKey);
    let nextIdx = currentIdx;
    if (e.key === 'ArrowRight') { nextIdx = (currentIdx + 1) % tabs.length; e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { nextIdx = (currentIdx - 1 + tabs.length) % tabs.length; e.preventDefault(); }
    else return;
    setTabKey(tabs[nextIdx].key);
    setPage(1);
    (document.querySelector(`[data-tab="${tabs[nextIdx].key}"]`) as HTMLElement)?.focus();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await opnameExpired.generate(weekStart) as { data: { data: { week_start: string } } };
      setPage(1);
      await load();
      await loadPending(res.data.data.week_start);
      await loadProgress(res.data.data.week_start);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal membentuk baris opname'));
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await opnameExpired.export({ week_start: weekStart, statuses: tabStatuses?.join(',') || undefined, source: sourceFilter || undefined, kode_depo: depoFilter || undefined });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `opname_expired_${weekStart}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal export'));
    }
  };

  const handleDelete = useCallback((id: number) => {
    setDeleteTargetId(id);
    setShowSingleDelete(true);
  }, []);

  const confirmSingleDelete = async () => {
    if (deleteTargetId === null || singleDeleting) return;
    setSingleDeleting(true);
    try {
      await opnameExpired.delete(deleteTargetId);
      notifyGlobal('Baris monitoring berhasil dihapus', 'success');
      reloadAll(false);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Hapus gagal'), 'error');
    } finally {
      setSingleDeleting(false);
      setShowSingleDelete(false);
      setDeleteTargetId(null);
    }
  };

  // Hapus massal wave terpilih (berurutan agar pesan gagal jelas per baris).
  const [selectedWaveIds, setSelectedWaveIds] = useState<Set<number>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Hapus satu wave lewat ConfirmDialog (pengganti native confirm) + guard dobel-klik.
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showSingleDelete, setShowSingleDelete] = useState(false);
  const [singleDeleting, setSingleDeleting] = useState(false);

  const toggleWaveSelect = useCallback((id: number) => {
    setSelectedWaveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelectedWaveIds]);

  const confirmBulkDeleteWaves = async () => {
    const ids = waves.filter((w) => selectedWaveIds.has(w.id)).map((w) => w.id);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await opnameExpired.delete(id);
        ok++;
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        // 404 = wave sudah tidak ada (mis. terhapus sebelumnya) → anggap berhasil
        if (status === 404) {
          ok++;
        } else {
          fail++;
        }
      }
    }
    setBulkDeleting(false);
    setShowBulkDelete(false);
    setSelectedWaveIds(new Set());
    notifyGlobal(
      fail === 0 ? `${ok} baris opname dihapus.` : `${ok} baris opname dihapus, ${fail} gagal (kemungkinan depo lain).`,
      fail === 0 ? 'success' : 'error'
    );
    reloadAll(false);
  };

  const openSettings = async () => {
    setShowSettings(true);
    try {
      const res = await opnameExpired.settings() as { data: { data: Record<string, number> } };
      setThresholdForm(Object.fromEntries(Object.entries(res.data.data).map(([k, v]) => [k, Number(v)])));
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat pengaturan'));
    }
  };

  const validateThresholds = (): boolean => {
    const { threshold_aman, threshold_perhatian, threshold_kritis } = thresholdForm;
    const errors: string[] = [];
    if (threshold_aman < 1 || threshold_perhatian < 1 || threshold_kritis < 1) {
      errors.push('Semua threshold minimal 1 hari.');
    }
    if (threshold_aman <= threshold_perhatian) {
      errors.push('Ambang Aman harus lebih besar dari Ambang Perhatian.');
    }
    if (threshold_perhatian <= threshold_kritis) {
      errors.push('Ambang Perhatian harus lebih besar dari Batas Rekomendasi SEGERA.');
    }
    setThresholdErrors(errors);
    return errors.length === 0;
  };

  const saveSettings = async () => {
    if (!validateThresholds()) return;
    try {
      await opnameExpired.updateSettings(thresholdForm);
      setShowSettings(false);
      setThresholdErrors([]);
      await load();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal simpan pengaturan'));
    }
  };

  // Dipakai baris memo: boolean stabil per render (bukan hasil panggil di JSX).
  const canDeleteWaves = hasPermission('opname.delete');

  // Satu langkah berikutnya yang paling relevan. CTA-nya ditampilkan di
  // bagian atas menu "Aksi" (grup "Langkah berikutnya") agar semua tombol di
  // header berada dalam satu menu; tidak ada lagi kartu banner terpisah.
  // Menu "Aksi" dikelompokkan (Langkah berikutnya / Input data / Proses
  // monitoring / Laporan / Pengaturan) supaya beda fungsi tidak tercampur.
  const nextStep = (() => {
    if (baselineStatus === 'missing') {
      return {
        title: 'Saldo Awal belum dipasang',
        description: 'Pasang saldo pembuka sebelum sistem sekali per depo agar stok lama tidak dihitung dua kali.',
        action: hasPermission('penerimaan.create') ? (
          <button type="button" onClick={() => setBaselineOpen(true)} className="btn-primary text-sm">
            Pasang Saldo Awal
          </button>
        ) : (
          <span className="text-xs font-semibold text-violet-800">Minta admin depo memasang Saldo Awal.</span>
        ),
      };
    }
    if (pendingError) {
      return {
        title: 'Gagal memeriksa data baru',
        description: 'Data baru belum bisa dipastikan masuk analisa. Coba periksa lagi.',
        action: (
          <button type="button" onClick={() => loadPending(weekStart)} className="btn-secondary text-sm">
            Periksa lagi
          </button>
        ),
      };
    }
    if ((pending?.pending.total ?? 0) > 0) {
      return {
        title: `${fnum(pending?.pending.total ?? 0)} baris baru belum masuk analisa`,
        description: `Minggu ${formatDateId(pending?.week_start)}: ${pending?.pending.sj ?? 0} baris SJ + ${pending?.pending.import ?? 0} baris stok manual${(pending?.pending.legacy ?? 0) > 0 ? ` + ${pending?.pending.legacy} baris Saldo Awal` : ''}.`,
        action: hasPermission('opname.create') ? (
          <button type="button" onClick={handleGenerate} disabled={generating} className="btn-primary text-sm disabled:opacity-50">
            {generating ? 'Membentuk...' : 'Buat Baris Monitoring'}
          </button>
        ) : (
          <span className="text-xs font-semibold text-amber-800">Minta admin membuat baris monitoring.</span>
        ),
      };
    }
    if (baselineStatus === 'loading' && !hasWeekRows) return null;
    if (!hasWeekRows) {
      return {
        title: 'Belum ada baris monitoring minggu ini',
        description: 'Tambahkan stok manual atau pastikan penerimaan SJ sudah masuk, lalu buat baris monitoring.',
        action: hasPermission('opname.create') ? (
          <button type="button" onClick={handleGenerate} disabled={generating} className="btn-primary text-sm disabled:opacity-50">
            {generating ? 'Membentuk...' : 'Buat Baris Monitoring'}
          </button>
        ) : null,
      };
    }
    if (allRowsValidated) {
      return {
        title: 'Hitung fisik minggu ini selesai',
        description: 'Semua baris sudah tervalidasi. Hasil hitung fisik bisa dilihat di Stock Opname.',
        action: hasPermission('opname.session.view') ? (
          <Link href={sessionHref({ sessionId: onlyFinalizedSessionId })} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-600">
            Lihat Hasil Stock Opname
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </Link>
        ) : null,
      };
    }
    if (hasOpenSession) {
      return {
        title: 'Stock Opname sedang berjalan',
        description: `${fnum(progressValidated)} dari ${fnum(progressTotal)} baris sudah tervalidasi. Lanjutkan sesi yang sudah dibuka.`,
        action: hasPermission('opname.session.view') ? (
          <Link href={sessionHref({ sessionId: onlyOpenSessionId })} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-600">
            Lanjutkan Stock Opname
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </Link>
        ) : null,
      };
    }
    return {
      title: 'Baris monitoring siap dihitung fisik',
      description: 'Baris monitoring minggu ini sudah terbentuk. Buat sesi Stock Opname agar petugas bisa input hasil hitung lapangan.',
      action: hasPermission('opname.session.create') ? (
        <Link href={sessionHref({ create: true })} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-600">
          Buat Sesi Stock Opname
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </Link>
      ) : hasPermission('opname.session.view') ? (
        <Link href={sessionHref()} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-600">
          Lihat Stock Opname
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </Link>
      ) : null,
    };
  })();

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header — satu baris ringkas agar tidak terlihat seperti beberapa
            header bertumpuk (judul + konteks minggu/depo + aksi). */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight text-foreground">Monitoring Kedaluwarsa</h1>
              <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                {weekRangeLabel} · {user?.nama_depo || kodeDepo || 'Semua depo'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => reloadAll(false)}
                disabled={loading}
                title="Muat ulang semua data halaman"
                aria-label="Muat ulang data"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-popover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
              <div className="relative" ref={moreMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  aria-expanded={showMore}
                  aria-haspopup="menu"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-popover"
                >
                  Aksi
                  <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {showMore && (
                  <div role="menu" aria-label="Menu aksi" className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-border bg-card p-1.5 text-foreground shadow-xl">
                    {nextStep && (
                      <>
                        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Langkah berikutnya</p>
                        <div className="rounded-xl bg-primary-500/10 px-3 py-2.5">
                          <p className="text-sm font-bold text-foreground">{nextStep.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{nextStep.description}</p>
                          <div className="mt-2 [&_a]:flex [&_a]:w-full [&_a]:justify-center [&>button]:w-full">{nextStep.action}</div>
                        </div>
                        <div aria-hidden="true" className="my-1 border-t border-border" />
                      </>
                    )}
                    {hasPermission('penerimaan.create') && (
                      <>
                        <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Input data</p>
                        {baselineStatus !== 'missing' && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setBaselineOpen(true); setShowMore(false); }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-100"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />
                            Kelola Saldo Awal
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setManualOpen(true); setShowMore(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-100"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                          Tambah Stok Manual
                        </button>
                      </>
                    )}
                    {hasPermission('opname.create') && (
                      <>
                        <div aria-hidden="true" className="my-1 border-t border-border" />
                        <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proses monitoring</p>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { handleGenerate(); setShowMore(false); }}
                          disabled={generating}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-100 disabled:opacity-50"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />
                          {(pending?.pending.total ?? 0) > 0 ? 'Buat Baris Monitoring Baru' : 'Perbarui Baris Monitoring'}
                        </button>
                      </>
                    )}
                    {(hasPermission('opname.view') || hasPermission('reports.view')) && (
                      <>
                        <div aria-hidden="true" className="my-1 border-t border-border" />
                        <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Laporan</p>
                        {hasPermission('opname.view') && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { handleExport(); setShowMore(false); }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-100"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                            Export Excel
                          </button>
                        )}
                        {hasPermission('reports.view') && (
                          <Link
                            href="/reports/opname-expired"
                            role="menuitem"
                            onClick={() => setShowMore(false)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-100"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                            Lihat Rekap Laporan
                          </Link>
                        )}
                      </>
                    )}
                    {hasPermission('opname.edit') && (
                      <>
                        <div aria-hidden="true" className="my-1 border-t border-border" />
                        <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pengaturan</p>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { openSettings(); setShowMore(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-100"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                          Pengaturan Status Kedaluwarsa
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* KPI strip */}
        <div className="bg-card rounded-2xl shadow-sm border border-border px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-4">
            <div className="px-2 py-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" /></svg>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Baris</p>
                  <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{fnum(totalRows)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 tabular-nums mt-0.5 truncate">{weekRangeLabel}</p>
            </div>

            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const c = statusSummary[s];
              const iconTone = s === 'EXPIRED'
                ? 'bg-red-500/10 text-red-500'
                : s === 'KRITIS'
                  ? 'bg-orange-500/10 text-orange-500'
                  : s === 'PERHATIAN'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-emerald-500/10 text-emerald-500';
              return (
                <div
                  key={s}
                  className="px-2 py-1"
                  title={`${meta.label}: ${fnum(c?.count ?? 0)} baris · ${fnum(c?.qty_crt ?? 0)} CRT`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconTone}`}>
                      {s === 'EXPIRED' && <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>}
                      {s === 'KRITIS' && <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>}
                      {s === 'PERHATIAN' && <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      {s === 'AMAN' && <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground truncate">{meta.label}</p>
                      <p className={`text-2xl font-bold tabular-nums mt-1 ${meta.text}`}>{fnum(c?.count ?? 0)}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 tabular-nums mt-0.5 truncate">
                    {c ? `${fnum(c.qty_crt)} CRT` : '0 CRT'}
                    {prevWeekStart && <span title="Dibanding minggu lalu"> · {diff(s)}</span>}
                  </p>
                </div>
              );
            })}

            <div className="px-2 py-1" title={`${fnum(berisikoCrt)} CRT berisiko (Expired + Kritis + Perhatian)`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <svg aria-hidden="true" className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CRT Berisiko</p>
                  <p className="text-2xl font-bold tabular-nums mt-1 text-foreground">{fnum(berisikoCrt)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">Expired + Kritis + Perhatian</p>
            </div>
          </div>
        </div>

        {/* Progres sesi per depo: pantau siapa sudah / belum submit */}
        {progressError && (depoProgress === null || depoProgress.length === 0) && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-700" role="alert">
            <span>Progres sesi gagal dimuat.</span>
            <button type="button" onClick={() => loadProgress(weekStart)} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
          </div>
        )}
        {depoProgress !== null && depoProgress.length > 1 && (
          <div className="bg-card rounded-2xl shadow-sm border border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-foreground">
                Progres Stock Opname per Depo
                <span className="ml-2 font-medium text-slate-400">
                  {depoProgress.filter((d) => d.submitted).length}/{depoProgress.length} depo sudah submit · {progressPct}% baris tervalidasi
                </span>
              </h2>
              {hasPermission('opname.create') && depoProgress.some((d) => !d.submitted) && (
                <button
                  type="button"
                  onClick={handleRemind}
                  disabled={reminding}
                  title="Kirim email pengingat ke depo yang belum submit (penerima diatur di Penerima Email)"
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  {reminding ? 'Mengirim...' : 'Ingatkan depo yang belum submit'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {depoProgress.map((d) => {
                const pct = d.total > 0 ? Math.round((d.validated / d.total) * 100) : 100;
                return (
                  <div key={d.kode_depo} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${d.submitted ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{d.nama_depo || d.kode_depo}</p>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1">
                        <div className={`h-full rounded-full ${d.submitted ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap" title={`${d.validated} dari ${d.total} baris tervalidasi`}>{d.validated}/{d.total}</span>
                    {hasPermission('opname.session.view') && (
                      <Link
                        href={sessionHref({ depo: d.kode_depo })}
                        className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-slate-100"
                        aria-label={`Buka Stock Opname ${d.nama_depo || d.kode_depo}`}
                      >
                        Buka
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter + Tabs + Table */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          {/* Toolbar: minggu opname + search */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-border">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="oe-week" className="flex items-center gap-2">
                <span className="hidden sm:block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Minggu</span>
                <select
                  id="oe-week"
                  value={weekStart}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    setWeekStart(mondayOfWeek(value));
                    setPage(1);
                  }}
                  title="Daftar minggu yang memiliki data + minggu berjalan. Gunakan tombol ‹ › untuk minggu lain."
                  className="select-field-sm min-w-[210px]"
                >
                  {weekOptions.map((week) => (
                    <option key={week} value={week}>
                      {week === currentWeekStart ? 'Minggu ini · ' : 'Minggu '}
                      {formatDateId(week)} – {formatDateId(addDaysIso(week, 6))}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{weekRangeLabel}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setWeekStart(addDaysIso(weekStart, -7)); setPage(1); }}
                  aria-label="Minggu sebelumnya"
                  className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-slate-100"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => { setWeekStart(currentWeekStart); setPage(1); }}
                  disabled={isCurrentWeek}
                  className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Minggu ini
                </button>
                <button
                  type="button"
                  onClick={() => { setWeekStart(addDaysIso(weekStart, 7)); setPage(1); }}
                  disabled={weekStart >= currentWeekStart}
                  aria-label="Minggu berikutnya"
                  className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
            <SearchBox
              key={searchApply}
              initial={searchApply}
              onSearch={(v) => { setPage(1); setSearchApply(v); }}
            />
            {depoOptions.length > 1 && (
              <label className="flex items-center gap-2">
                <span className="hidden sm:block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Depo</span>
                <select
                  value={depoFilter}
                  onChange={(e) => { setDepoFilter(e.target.value); setPage(1); }}
                  aria-label="Filter depo"
                  title="Saring baris opname berdasarkan depo"
                  className="select-field-sm min-w-[160px]"
                >
                  <option value="">Semua Depo</option>
                  {depoOptions.map((d) => (
                    <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2">
              <span className="hidden sm:block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asal Data</span>
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
                aria-label="Filter asal data"
                title="Penerimaan SJ = penerimaan sistem, Stok Manual = input tambahan, Saldo Awal = saldo pembuka sebelum sistem, Gabungan = lebih dari satu sumber"
                className="select-field-sm min-w-[150px]"
              >
                <option value="">Semua asal</option>
                <option value="sj">Penerimaan SJ</option>
                <option value="import">Stok Manual</option>
                <option value="legacy">Saldo Awal</option>
                <option value="mixed">Gabungan</option>
              </select>
            </label>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-2">
            <div className="flex flex-wrap items-center gap-1" role="tablist" ref={tablistRef} onKeyDown={handleTabKeyDown}>
              {tabList.map((tab) => {
                const active = tabKey === tab.key;
                const count = tabCount(tab.key);
                return (
                  <button
                    key={tab.key}
                    data-tab={tab.key}
                    onClick={() => { setTabKey(tab.key); setPage(1); }}
                    onKeyDown={handleTabKeyDown}
                    tabIndex={active ? 0 : -1}
                    role="tab"
                    aria-selected={active}
                    aria-controls="opname-table-panel"
                    id={`tab-${tab.key}`}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-ink-900 text-white shadow' : 'text-foreground hover:bg-slate-100'}`}
                  >
                    {tab.label}
                    <span className={`px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-muted-foreground'}`}>
                      {fnum(count)}
                    </span>
                  </button>
                );
              })}
            </div>

          </div>

          {selectedWaveIds.size > 0 && canDeleteWaves && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-5 py-2.5">
              <span className="text-sm font-semibold text-red-700">{selectedWaveIds.size} baris dipilih</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWaveIds(new Set())}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  Batal pilih
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDelete(true)}
                  disabled={bulkDeleting}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  Hapus baris terpilih
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading && waves.length === 0 ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: ITEMS_PER_PAGE > 8 ? 8 : ITEMS_PER_PAGE }).map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : loadError ? (
            <div className="py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                  <svg className="w-7 h-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                </div>
                <p className="text-sm text-red-500 font-medium">{loadError}</p>
                <button onClick={load} className="btn-secondary text-xs">Coba Lagi</button>
              </div>
            </div>
          ) : waves.length === 0 ? (
            <div className="px-4 py-16" role="status">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  {hasSearch ? (
                    <svg className="h-7 w-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  ) : (
                    <svg className="h-7 w-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                </div>
                {hasSearch ? (
                  <>
                    <p className="text-sm font-medium text-foreground">Tidak ada hasil untuk &quot;{searchApply}&quot;</p>
                    <p className="text-xs text-slate-400">Coba kata kunci lain atau hapus pencarian.</p>
                    <button type="button" onClick={() => { setSearchApply(''); setPage(1); }} className="btn-secondary text-xs">Hapus pencarian</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">
                      {tabKey === 'AMAN' ? 'Tidak ada baris berstatus Aman minggu ini.' : 'Tidak ada baris dengan kriteria ini.'}
                    </p>
                    <p className="text-xs text-slate-400">Ganti minggu/tab, atau bentuk baris opname untuk minggu tersebut.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="hidden md:block max-h-[560px] overflow-x-auto overflow-y-auto" id="opname-table-panel" role="tabpanel" aria-labelledby={`tab-${tabKey}`}>
                <table className="w-full min-w-[1040px] border-collapse">
                  <caption className="sr-only">Daftar baris monitoring kedaluwarsa</caption>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-popover">
                      {hasPermission('opname.delete') && (
                        <th scope="col" className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={waves.length > 0 && waves.every((w) => selectedWaveIds.has(w.id))}
                            onChange={() => setSelectedWaveIds((prev) => {
                              const all = waves.every((w) => prev.has(w.id));
                              return all ? new Set() : new Set(waves.map((w) => w.id));
                            })}
                            aria-label="Pilih semua baris yang tampil"
                            className="w-4 h-4 accent-red-600 cursor-pointer"
                          />
                        </th>
                      )}
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Produk" sortKey="produk" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Depo" sortKey="depo" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Asal Data</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Principal 1" sortKey="principal_1" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Principal 2" sortKey="principal_2" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right"><SortHeader label="Qty CRT" sortKey="crt" sort={sort} onSort={handleSort} align="right" /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right"><SortHeader label="Qty PCS" sortKey="pcs" sort={sort} onSort={handleSort} align="right" /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Tanggal Masuk" sortKey="penerimaan" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Tanggal Kedaluwarsa" sortKey="expired" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left"><SortHeader label="Sisa Hari" sortKey="sisa" sort={sort} onSort={handleSort} /></th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {waves.map((w) => (
                      <WaveRow
                        key={w.id}
                        w={w}
                        selected={selectedWaveIds.has(w.id)}
                        canDelete={canDeleteWaves}
                        deleting={singleDeleting}
                        maxHari={num(thresholds.threshold_aman) || 90}
                        onOpen={openItem}
                        onDelete={handleDelete}
                        onToggle={toggleWaveSelect}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto md:hidden">
                {waves.map((w) => {
                  const meta = STATUS_META[w.status_ini] || STATUS_META.AMAN;
                  return (
                    <div key={w.id} className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-bold text-foreground">{w.kode_barang}</p>
                          <p className="mt-0.5 line-clamp-1 wrap-break-word text-xs text-muted-foreground" title={w.nama_barang || undefined}>{w.nama_barang || '-'}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {badge(w.status_ini)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                          {w.nama_depo || w.kode_depo || '-'}
                        </span>
                        <span className="tabular-nums text-foreground"><span className="text-slate-400">Qty CRT:</span> <span className="font-semibold">{fnum(num(w.qty_ini_crt))}</span></span>
                        <span className="tabular-nums text-foreground"><span className="text-slate-400">Qty PCS:</span> <span className="font-semibold">{fnum(num(w.qty_ini_pcs))}</span></span>
                        {sourceBadge(w.source_mix)}
                        <span className="tabular-nums text-foreground"><span className="text-slate-400">Principal 1:</span> <span className="font-semibold">{w.principal_1 || '-'}</span></span>
                        <span className="tabular-nums text-foreground"><span className="text-slate-400">Principal 2:</span> <span className="font-semibold">{w.principal_2 || '-'}</span></span>
                        {num(w.qty_koreksi_crt) !== 0 && <span className="tabular-nums text-[11px] text-blue-600">koreksi CRT {num(w.qty_koreksi_crt)}</span>}
                        {num(w.qty_koreksi_pcs) !== 0 && <span className="tabular-nums text-[11px] text-blue-600">koreksi PCS {num(w.qty_koreksi_pcs)}</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-popover px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tanggal Masuk</p>
                          <p className="mt-0.5 font-medium text-foreground">{w.tanggal_penerimaan ? fmtDate(w.tanggal_penerimaan) : '-'}</p>
                        </div>
                        <div className="rounded-lg bg-popover px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tanggal Kedaluwarsa</p>
                          <p className="mt-0.5 font-medium text-foreground">{fmtDate(w.expired_date_ini)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DaysBar sisaHari={w.sisa_hari} maxHari={num(thresholds.threshold_aman) || 90} status={w.status_ini} />
                        <span title={`${w.sisa_hari} hari`} className={`whitespace-nowrap text-sm font-bold tabular-nums ${meta.text}`}>{formatDurationId(w.sisa_hari)}</span>
                      </div>
                      <div className="flex items-center gap-2 border-t border-border pt-3">
                        <button
                          onClick={() => openItem(w)}
                          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-slate-200 hover:text-foreground"
                        >
                          Detail
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        </button>
                        {hasPermission('opname.delete') && (
                          <button
                            onClick={() => handleDelete(w.id)}
                            disabled={singleDeleting}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {pagination && pagination.total > ITEMS_PER_PAGE && (
                <div className="border-t border-border bg-overlay-50 px-5 py-4">
                  <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Menampilkan {pagination.from ?? 0}–{pagination.to ?? 0} dari {pagination.total} baris
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.current_page <= 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-foreground hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Halaman sebelumnya"
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs text-foreground tabular-nums">Hal {pagination.current_page} / {pagination.last_page}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                      disabled={pagination.current_page >= pagination.last_page}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-foreground hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Halaman berikutnya"
                    >
                      Berikutnya
                    </button>
                  </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      {/* Detail drawer */}
      <div className={`fixed inset-0 z-40 ${selectedId !== null ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-ink-900/50 backdrop-blur-[2px] transition-opacity duration-300 ${selectedId !== null ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSelectedId(null)}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Detail baris monitoring"
          aria-hidden={selectedId === null}
          inert={selectedId === null ? true : undefined}
          className={`absolute right-0 top-0 h-full w-full max-w-[480px] bg-card shadow-2xl flex flex-col transition-transform duration-300 ${selectedId !== null ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {current && (
            <>
              {/* Drawer header */}
              <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-foreground truncate">{current.nama_barang || current.kode_barang}</h2>
                    {badge(current.status_ini)}
                  </div>
                  <p className="font-mono text-xs text-slate-400 mt-0.5">{current.kode_barang}</p>
                </div>
                <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-slate-100 transition-colors" aria-label="Tutup detail">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Ringkasan */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-popover rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qty Minggu Ini</p>
                    <p className="text-lg font-bold text-foreground tabular-nums mt-1">{fnum(num(current.qty_ini_crt))} CRT</p>
                    {num(current.qty_ini_pcs) > 0 && <p className="text-xs text-muted-foreground tabular-nums">{fnum(num(current.qty_ini_pcs))} PCS</p>}
                    {num(current.qty_koreksi_crt) !== 0 && (
                      <p className="text-[11px] text-blue-600 tabular-nums mt-0.5">koreksi {num(current.qty_koreksi_crt)} CRT / {num(current.qty_koreksi_pcs)} PCS</p>
                    )}
                  </div>
                  <div className="bg-popover rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tanggal Kedaluwarsa</p>
                    <p className="text-lg font-bold text-foreground mt-1">{fmtDate(current.expired_date_ini)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <DaysBar sisaHari={current.sisa_hari} maxHari={num(thresholds.threshold_aman) || 90} status={current.status_ini} />
                      <span title={`${current.sisa_hari} hari`} className={`text-xs font-bold tabular-nums ${(STATUS_META[current.status_ini] || STATUS_META.AMAN).text}`}>{formatDurationId(current.sisa_hari)}</span>
                    </div>
                  </div>
                  <div className="bg-popover rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Depo</p>
                    <p className="text-sm font-semibold text-foreground mt-1">{current.nama_depo || current.kode_depo || '-'}</p>
                  </div>
                  <div className="bg-popover rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sumber Material</p>
                    <p className="text-sm font-semibold text-foreground mt-1 wrap-break-word">{current.sumber_material || '-'}</p>
                  </div>
                </div>

                {/* Rekomendasi */}
                <div className={`rounded-xl border px-4 py-3 ${(STATUS_META[current.status_ini] || STATUS_META.AMAN).panel}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rekomendasi</p>
                  <p className="text-sm text-foreground mt-0.5 leading-snug">{current.rekomendasi || '-'}</p>
                </div>

                {/* Lot Penyusun: jejak lot yang membentuk baris monitoring ini */}
                <div className="rounded-xl border border-border px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Lot Penyusun ({(current.batch_numbers || []).length}) · Asal: {(() => {
                      const sj = num(current.source_mix?.sj);
                      const imp = num(current.source_mix?.import);
                      const legacy = num(current.source_mix?.legacy);
                      const parts = [
                        sj > 0 ? `${sj} SJ` : null,
                        imp > 0 ? `${imp} stok manual` : null,
                        legacy > 0 ? `${legacy} Saldo Awal` : null,
                      ].filter(Boolean);
                      if (parts.length === 0) return '-';
                      return parts.length > 1 ? `Gabungan (${parts.join(' + ')})` : parts[0];
                    })()}
                  </p>
                  {(current.batch_numbers || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(current.batch_numbers || []).map((b) => (
                        <span key={b} className="font-mono text-xs px-2 py-0.5 rounded-md bg-popover text-foreground">{b}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">Belum ada — perbarui baris monitoring untuk mengisi jejak lot.</p>
                  )}
                </div>

                {/* Perbandingan mingguan */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Perbandingan Minggu</h3>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-popover text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <th scope="col" className="px-3 py-2 text-left">Aspek</th>
                          <th scope="col" className="px-3 py-2 text-right">Minggu Ini</th>
                          <th scope="col" className="px-3 py-2 text-right">Minggu Lalu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr>
                          <td className="px-3 py-2 text-muted-foreground text-xs">Qty (CRT / PCS)</td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">{fnum(num(current.qty_ini_crt))} / {fnum(num(current.qty_ini_pcs))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{num(current.qty_lalu_crt) > 0 || num(current.qty_lalu_pcs) > 0 ? `${fnum(num(current.qty_lalu_crt))} / ${fnum(num(current.qty_lalu_pcs))}` : '—'}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-muted-foreground text-xs">Tanggal Kedaluwarsa</td>
                          <td className="px-3 py-2 text-right text-foreground">{fmtDate(current.expired_date_ini)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(current.expired_date_lalu)}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-muted-foreground text-xs">Status</td>
                          <td className="px-3 py-2 text-right">{badge(current.status_ini)}</td>
                          <td className="px-3 py-2 text-right">{current.status_lalu ? badge(current.status_lalu) : <span className="text-xs text-slate-400">—</span>}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-muted-foreground text-xs">Selisih Expired</td>
                          <td colSpan={2} className="px-3 py-2 text-right tabular-nums text-foreground">
                            {current.selisih_expired_date === null ? '—' : `${current.selisih_expired_date > 0 ? '+' : ''}${current.selisih_expired_date} hari`}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-muted-foreground text-xs font-semibold">Perubahan</td>
                          <td colSpan={2} className="px-3 py-2 text-right text-foreground font-medium">{current.perubahan || '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Validasi info */}
                {current.validated_at && (
                  <div className="text-xs text-muted-foreground bg-popover rounded-xl px-3 py-2.5">
                    <span className="font-semibold text-foreground">Divalidasi:</span> oleh {current.validator?.full_name || '-'} · {fmtDate(current.validated_at)}
                  </div>
                )}
              </div>

              {/* Drawer footer */}
              <div className="px-5 py-3 border-t border-border space-y-2">
                {hasPermission('opname.session.view') && (
                  <Link
                    href={sessionHref({ depo: current.kode_depo })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-primary-600"
                  >
                    Buka Stock Opname Depo Ini
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </Link>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navNext(-1)}
                    disabled={currentIndex <= 0}
                    className="p-2.5 rounded-xl border border-border text-muted-foreground hover:bg-popover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Baris sebelumnya"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-semibold text-foreground hover:bg-slate-200 transition-colors"
                  >
                    Tutup
                  </button>
                  <button
                    onClick={() => navNext(1)}
                    disabled={currentIndex >= waves.length - 1}
                    className="p-2.5 rounded-xl border border-border text-muted-foreground hover:bg-popover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Baris berikutnya"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      <BaselineImportManager
        open={baselineOpen}
        onClose={() => setBaselineOpen(false)}
        onChanged={refreshAfterDataChange}
      />

      <ManualBatchManager
        open={manualOpen}
        onOpenChange={setManualOpen}
        hideTrigger
        onChanged={refreshAfterDataChange}
      />

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Pengaturan Status Kedaluwarsa" subtitle="Ambang batas status kedaluwarsa" size="md"
        footer={
          <>
            <button onClick={() => { setThresholdForm({ threshold_aman: 90, threshold_perhatian: 30, threshold_kritis: 7 }); setThresholdErrors([]); }} className="btn-secondary">Reset</button>
            <button onClick={() => setShowSettings(false)} className="btn-secondary">Batal</button>
            <button onClick={saveSettings} className="btn-primary">Simpan</button>
          </>
        }
      >
      <div className="space-y-6">
        {thresholdErrors.length > 0 && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            {thresholdErrors.map((err, i) => (
              <p key={i} className="text-sm text-red-700">{err}</p>
            ))}
          </div>
        )}
          <div className="rounded-xl border border-border bg-popover px-4 py-3">
            <p className="text-xs font-semibold text-foreground">Skala status saat ini</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold">
              <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">Expired &lt; 0 hari</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="rounded-md bg-orange-50 px-2 py-1 text-orange-700">Kritis 0–{Math.max(0, thresholdForm.threshold_perhatian - 1)} hari</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">Perhatian {thresholdForm.threshold_perhatian}–{Math.max(thresholdForm.threshold_perhatian, thresholdForm.threshold_aman - 1)} hari</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Aman ≥ {thresholdForm.threshold_aman} hari</span>
            </div>
          </div>
          <div>
            <label htmlFor="threshold-aman" className="block text-xs font-medium text-muted-foreground mb-1">Ambang Aman (hari, ≥ ini = Aman)</label>
            <input id="threshold-aman" type="number" min={1} step={1} value={thresholdForm.threshold_aman} onChange={(e) => setThresholdForm((p) => ({ ...p, threshold_aman: parseInt(e.target.value) || 0 }))} className="input-field" />
            <p className="text-[11px] text-slate-400 mt-1">Lot dengan sisa ≥ hari ini → status <span className="text-emerald-600 font-medium">Aman</span></p>
          </div>
          <div>
            <label htmlFor="threshold-perhatian" className="block text-xs font-medium text-muted-foreground mb-1">Ambang Perhatian (hari, ≥ ini = Perhatian)</label>
            <input id="threshold-perhatian" type="number" min={1} step={1} value={thresholdForm.threshold_perhatian} onChange={(e) => setThresholdForm((p) => ({ ...p, threshold_perhatian: parseInt(e.target.value) || 0 }))} className="input-field" />
            <p className="text-[11px] text-slate-400 mt-1">Lot dengan sisa ≥ ambang ini tetapi &lt; Ambang Aman → status <span className="text-amber-600 font-medium">Perhatian</span></p>
          </div>
          <div>
            <label htmlFor="threshold-kritis" className="block text-xs font-medium text-muted-foreground mb-1">Batas Rekomendasi SEGERA (hari)</label>
            <input id="threshold-kritis" type="number" min={1} step={1} value={thresholdForm.threshold_kritis} onChange={(e) => setThresholdForm((p) => ({ ...p, threshold_kritis: parseInt(e.target.value) || 0 }))} className="input-field" />
            <p className="text-[11px] text-slate-400 mt-1">Lot berstatus Kritis dengan sisa ≤ hari ini → rekomendasi <span className="text-red-600 font-medium">&ldquo;SEGERA kirim/retur&rdquo;</span>. Nilai ini tidak menggeser batas status; status Kritis ditentukan oleh Ambang Perhatian.</p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={confirmBulkDeleteWaves}
        title={`Hapus ${selectedWaveIds.size} Baris Monitoring`}
        message="Baris monitoring terpilih akan dihapus dari minggu ini. Data catatan stok tidak ikut terhapus — Buat Baris Monitoring akan membuatnya kembali. Lanjutkan?"
        confirmLabel="Ya, hapus"
        variant="danger"
      />

      <ConfirmDialog
        open={showSingleDelete}
        onClose={() => { if (singleDeleting) return; setShowSingleDelete(false); setDeleteTargetId(null); }}
        onConfirm={confirmSingleDelete}
        title="Hapus Baris Monitoring"
        message="Baris monitoring ini akan dihapus dari minggu ini. Data catatan stok tidak ikut terhapus — Buat Baris Monitoring akan membuatnya kembali. Lanjutkan?"
        confirmLabel="Ya, hapus"
        variant="danger"
        loading={singleDeleting}
      />
    </div>
  </DashboardLayout>
  );
}
