'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { opnameExpired, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import Modal from '@/components/Modal';
import ManualBatchManager from '@/components/ManualBatchManager';
import { useAuthStore } from '@/store/auth';

interface Wave {
  id: number;
  week_start: string;
  week_end: string;
  kode_depo: string;
  nama_depo: string;
  kode_barang: string;
  nama_barang: string;
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

interface ListMeta {
  weeks: string[];
  thresholds: Record<string, number>;
  status_summary: StatusSummary;
  prev_week_start: string | null;
  prev_status_summary: StatusSummary;
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

const ITEMS_PER_PAGE = 50;

const STATUS_ORDER = ['EXPIRED', 'KRITIS', 'PERHATIAN', 'AMAN'] as const;

type TabKey = 'ACTION' | 'EXPIRED' | 'KRITIS' | 'PERHATIAN' | 'AMAN' | 'ALL';

const STATUS_META: Record<string, { label: string; badge: string; dot: string; bar: string; text: string }> = {
  EXPIRED: { label: 'Expired', badge: 'bg-red-50 text-red-700', dot: 'bg-red-500', bar: 'bg-red-500', text: 'text-red-600' },
  KRITIS: { label: 'Kritis', badge: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500', bar: 'bg-orange-500', text: 'text-orange-700' },
  PERHATIAN: { label: 'Perhatian', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', bar: 'bg-amber-400', text: 'text-amber-700' },
  AMAN: { label: 'Aman', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-700' },
};

const num = (v: unknown): number => Number(v ?? 0);

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
  const { hasPermission } = useAuthStore();
  const [waves, setWaves] = useState<Wave[]>([]);
  const [pagination, setPagination] = useState<ListResponse['data'] | null>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [search, setSearch] = useState('');
  const [searchApply, setSearchApply] = useState('');
  const [page, setPage] = useState(1);
  const [tabKey, setTabKey] = useState<TabKey>('ACTION');
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [statusSummary, setStatusSummary] = useState<StatusSummary>({});
  const [prevWeekStart, setPrevWeekStart] = useState<string | null>(null);
  const [prevStatusSummary, setPrevStatusSummary] = useState<StatusSummary>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [thresholdForm, setThresholdForm] = useState<Record<string, number>>({
    threshold_aman: 90,
    threshold_perhatian: 30,
    threshold_kritis: 7,
  });
  const [thresholdErrors, setThresholdErrors] = useState<string[]>([]);
  const tablistRef = useRef<HTMLDivElement>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await opnameExpired.list({
        week_start: weekStart || undefined,
        search: searchApply || undefined,
        statuses: tabStatuses?.join(',') || undefined,
        per_page: ITEMS_PER_PAGE,
        page,
      }) as { data: ListResponse };
      setWaves(res.data.data.data);
      setPagination(res.data.data);
      setWeeks(res.data.meta.weeks ?? []);
      setThresholds(res.data.meta.thresholds ?? {});
      setStatusSummary(res.data.meta.status_summary ?? {});
      setPrevWeekStart(res.data.meta.prev_week_start ?? null);
      setPrevStatusSummary(res.data.meta.prev_status_summary ?? {});
    } catch (e) {
      setLoadError(getErrorMessage(e, 'Gagal memuat data'));
    } finally {
      setLoading(false);
    }
  }, [weekStart, searchApply, tabStatuses, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (weeks.length > 0 && !weekStart) setWeekStart(weeks[0]);
  }, [weeks, weekStart]);

  const totalActions = STATUS_ORDER.reduce((acc, s) => acc + (statusSummary[s]?.count ?? 0), 0);
  const totalBatch = totalActions;
  const berisikoCrt = (statusSummary.EXPIRED?.qty_crt ?? 0) + (statusSummary.KRITIS?.qty_crt ?? 0) + (statusSummary.PERHATIAN?.qty_crt ?? 0);

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

  const openItem = (w: Wave) => setSelectedId(w.id);
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
      const res = await opnameExpired.generate(weekStart || undefined) as { data: { data: { week_start: string } } };
      setWeekStart(res.data.data.week_start);
      setPage(1);
      await load();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal generate opname'));
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await opnameExpired.export({ week_start: weekStart || undefined, statuses: tabStatuses?.join(',') || undefined });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `opname_expired_${weekStart || 'now'}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal export'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus wave ini?')) return;
    try {
      await opnameExpired.delete(id);
      notifyGlobal('Wave berhasil dihapus', 'success');
      load();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Hapus gagal'), 'error');
    }
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
    if (threshold_aman < 0 || threshold_perhatian < 0 || threshold_kritis < 0) {
      errors.push('Semua threshold harus ≥ 0.');
    }
    if (threshold_aman <= threshold_perhatian) {
      errors.push('AMAN harus > PERHATIAN.');
    }
    if (threshold_perhatian <= threshold_kritis) {
      errors.push('PERHATIAN harus > KRITIS.');
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

  const fmtDate = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const fnum = (v: number) => v.toLocaleString('id-ID');

  const badge = (status?: string | null) => {
    const s = status || '-';
    const meta = STATUS_META[s] || { label: s, badge: 'bg-surface-raised text-gray-600', dot: 'bg-gray-400', bar: 'bg-gray-300', text: 'text-gray-600' };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <svg aria-hidden="true" className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Batch Expired</h1>
                <p className="text-ink-fg-muted mt-0.5">Queue kerja mingguan: batch mendekati kedaluwarsa & yang perlu ditindak</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-4">
            <div className="px-2 py-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" /></svg>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Batch</p>
                  <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{fnum(totalBatch)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 tabular-nums mt-0.5 truncate">{weekStart ? `${new Date(weekStart).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - ${weekEndLabel(weekStart)} ${new Date(weekStart).getFullYear()}` : '—'}</p>
            </div>

            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const c = statusSummary[s];
              return (
                <div key={s} className="px-2 py-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      {s === 'EXPIRED' && <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>}
                      {s === 'KRITIS' && <svg className="w-5 h-5 text-orange-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>}
                      {s === 'PERHATIAN' && <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      {s === 'AMAN' && <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 truncate">{meta.label}</p>
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

            <div className="px-2 py-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                </div>
                <div>
                  <p className="text-xs text-slate-500">CRT Berisiko</p>
                  <p className="text-2xl font-bold tabular-nums mt-1 text-slate-800">{fnum(berisikoCrt)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">Expired + Kritis + Perhatian</p>
            </div>
          </div>
        </div>

        {/* Filter + Tabs + Table */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Toolbar: week + search */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100">
            <label htmlFor="week-start" className="flex items-center gap-2">
              <span className="hidden sm:block text-xs font-semibold uppercase tracking-wider text-slate-500">Minggu</span>
              <select id="week-start" value={weekStart} onChange={(e) => { setWeekStart(e.target.value); setPage(1); }} className="select-field-sm min-w-[210px]">
                <option value="">— Pilih Minggu —</option>
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    {new Date(w).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - {weekEndLabel(w)} {new Date(w).getFullYear()}
                  </option>
                ))}
              </select>
            </label>
            <div className="relative flex-1 min-w-[240px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setSearchApply(search.trim()); } }}
                placeholder="Cari kode / nama barang..."
                className="input-field pl-9 py-2 text-sm"
                aria-label="Cari kode atau nama barang"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 px-2 py-2">
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
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-ink-900 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {tab.label}
                    <span className={`px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {fnum(count)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="ml-auto flex flex-wrap items-center gap-2 px-2">
            <ManualBatchManager
              buttonClassName="btn-primary"
              onChanged={() => { setPage(1); load(); }}
            />
            {hasPermission('opname.create') && (
              <button onClick={handleGenerate} disabled={generating} className="btn-primary disabled:opacity-50">
                <span className="flex items-center gap-2">
                  {generating ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M6.75 11.25a7.5 7.5 0 1010.5 0L12 7.5l-5.25 3.75z" /></svg>
                  )}
                  Generate
                </span>
              </button>
            )}
            {hasPermission('opname.view') && <button onClick={handleExport} className="btn-primary">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Export
              </span>
            </button>}
            <button onClick={openSettings} className="btn-secondary">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Threshold
              </span>
            </button>
            </div>
          </div>

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
                    <p className="text-sm font-medium text-slate-600">Tidak ada hasil untuk &quot;{searchApply}&quot;</p>
                    <p className="text-xs text-slate-400">Coba kata kunci lain atau hapus pencarian.</p>
                    <button type="button" onClick={() => { setSearch(''); setSearchApply(''); setPage(1); }} className="btn-secondary text-xs">Hapus pencarian</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-500">
                      {tabKey === 'AMAN' ? 'Tidak ada batch berstatus Aman minggu ini.' : 'Tidak ada batch dengan kriteria ini.'}
                    </p>
                    <p className="text-xs text-slate-400">Ganti filter minggu/tab, atau Generate opname untuk minggu tersebut.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block" id="opname-table-panel" role="tabpanel" aria-labelledby="tab-ACTION">
                <table className="w-full min-w-[980px] border-collapse">
                  <caption className="sr-only">Daftar opname expired</caption>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-300 bg-surface-raised">
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Produk</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Depo</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Qty</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Tgl Penerimaan</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Expired</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Sisa</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {waves.map((w) => {
                      const meta = STATUS_META[w.status_ini] || STATUS_META.AMAN;
                      return (
                        <tr key={w.id} className="hover:bg-overlay-70 transition-colors">
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {badge(w.status_ini)}
                              {w.sisa_hari < 0 && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">EXPIRED</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 min-w-[200px] max-w-[320px]">
                            <span className="block font-mono text-sm font-medium text-slate-800">{w.kode_barang}</span>
                            <span className="block text-xs text-slate-500 line-clamp-1 break-words" title={w.nama_barang || undefined}>{w.nama_barang || '-'}</span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-sm text-slate-600">{w.nama_depo || w.kode_depo || '-'}</td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <span className="text-sm font-semibold tabular-nums text-slate-800">{fnum(num(w.qty_ini_crt))} CRT</span>
                            {num(w.qty_ini_pcs) > 0 && <span className="ml-1 text-xs tabular-nums text-slate-400">/ {fnum(num(w.qty_ini_pcs))} PCS</span>}
                            {num(w.qty_koreksi_crt) !== 0 && (
                              <span className="block text-[11px] text-blue-600 tabular-nums">koreksi {num(w.qty_koreksi_crt)} CRT / {num(w.qty_koreksi_pcs)} PCS</span>
                            )}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-sm text-slate-700">{w.tanggal_penerimaan ? fmtDate(w.tanggal_penerimaan) : '-'}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-sm text-slate-700">{fmtDate(w.expired_date_ini)}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <DaysBar sisaHari={w.sisa_hari} maxHari={num(thresholds.threshold_aman) || 90} status={w.status_ini} />
                              <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${meta.text}`}>
                                {w.sisa_hari} hr
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openItem(w)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                            >
                              Detail
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                            </button>
                            {hasPermission('opname.delete') && (
                              <button
                                onClick={() => handleDelete(w.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                Hapus
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-gray-100 md:hidden">
                {waves.map((w) => {
                  const meta = STATUS_META[w.status_ini] || STATUS_META.AMAN;
                  return (
                    <div key={w.id} className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-bold text-slate-800">{w.kode_barang}</p>
                          <p className="mt-0.5 line-clamp-1 break-words text-xs text-slate-500" title={w.nama_barang || undefined}>{w.nama_barang || '-'}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {badge(w.status_ini)}
                          {w.sisa_hari < 0 && <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">EXPIRED</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                          {w.nama_depo || w.kode_depo || '-'}
                        </span>
                        <span className="tabular-nums font-semibold text-slate-700">{fnum(num(w.qty_ini_crt))} CRT</span>
                        {num(w.qty_ini_pcs) > 0 && <span className="tabular-nums text-slate-400">/ {fnum(num(w.qty_ini_pcs))} PCS</span>}
                        {num(w.qty_koreksi_crt) !== 0 && <span className="tabular-nums text-[11px] text-blue-600">koreksi {num(w.qty_koreksi_crt)} CRT</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-surface-raised px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Penerimaan</p>
                          <p className="mt-0.5 font-medium text-slate-700">{w.tanggal_penerimaan ? fmtDate(w.tanggal_penerimaan) : '-'}</p>
                        </div>
                        <div className="rounded-lg bg-surface-raised px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Expired</p>
                          <p className="mt-0.5 font-medium text-slate-700">{fmtDate(w.expired_date_ini)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DaysBar sisaHari={w.sisa_hari} maxHari={num(thresholds.threshold_aman) || 90} status={w.status_ini} />
                        <span className={`whitespace-nowrap text-sm font-bold tabular-nums ${meta.text}`}>{w.sisa_hari} hr</span>
                      </div>
                      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                        <button
                          onClick={() => openItem(w)}
                          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
                        >
                          Detail
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        </button>
                        {hasPermission('opname.delete') && (
                          <button
                            onClick={() => handleDelete(w.id)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
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
                <div className="border-t border-gray-100 bg-overlay-50 px-5 py-4">
                  <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                  <p className="text-xs text-slate-500 tabular-nums">
                    Menampilkan {pagination.from ?? 0}–{pagination.to ?? 0} dari {pagination.total} baris
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.current_page <= 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Halaman sebelumnya"
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs text-slate-600 tabular-nums">Hal {pagination.current_page} / {pagination.last_page}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                      disabled={pagination.current_page >= pagination.last_page}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          className={`absolute right-0 top-0 h-full w-full max-w-[480px] bg-surface-card shadow-2xl flex flex-col transition-transform duration-300 ${selectedId !== null ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {current && (
            <>
              {/* Drawer header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-800 truncate">{current.nama_barang || current.kode_barang}</h2>
                    {badge(current.status_ini)}
                  </div>
                  <p className="font-mono text-xs text-slate-400 mt-0.5">{current.kode_barang}</p>
                </div>
                <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Tutup detail">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Ringkasan */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-raised rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Qty Minggu Ini</p>
                    <p className="text-lg font-bold text-slate-800 tabular-nums mt-1">{fnum(num(current.qty_ini_crt))} CRT</p>
                    {num(current.qty_ini_pcs) > 0 && <p className="text-xs text-slate-500 tabular-nums">{fnum(num(current.qty_ini_pcs))} PCS</p>}
                    {num(current.qty_koreksi_crt) !== 0 && (
                      <p className="text-[11px] text-blue-600 tabular-nums mt-0.5">koreksi {num(current.qty_koreksi_crt)} CRT / {num(current.qty_koreksi_pcs)} PCS</p>
                    )}
                  </div>
                  <div className="bg-surface-raised rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expired Date</p>
                    <p className="text-lg font-bold text-slate-800 mt-1">{fmtDate(current.expired_date_ini)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <DaysBar sisaHari={current.sisa_hari} maxHari={num(thresholds.threshold_aman) || 90} status={current.status_ini} />
                      <span className={`text-xs font-bold tabular-nums ${(STATUS_META[current.status_ini] || STATUS_META.AMAN).text}`}>{current.sisa_hari} hr</span>
                    </div>
                  </div>
                  <div className="bg-surface-raised rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Depo</p>
                    <p className="text-sm font-semibold text-slate-800 mt-1">{current.nama_depo || current.kode_depo || '-'}</p>
                  </div>
                  <div className="bg-surface-raised rounded-xl p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sumber Material</p>
                    <p className="text-sm font-semibold text-slate-800 mt-1 break-words">{current.sumber_material || '-'}</p>
                  </div>
                </div>

                {/* Rekomendasi */}
                <div className={`rounded-xl border px-4 py-3 ${(STATUS_META[current.status_ini] || STATUS_META.AMAN).badge}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rekomendasi</p>
                  <p className="text-sm text-slate-800 mt-0.5 leading-snug">{current.rekomendasi || '-'}</p>
                </div>

                {/* Perbandingan mingguan */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Perbandingan Minggu</h3>
                  <div className="rounded-xl border border-gray-300 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-raised text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th scope="col" className="px-3 py-2 text-left">Aspek</th>
                          <th scope="col" className="px-3 py-2 text-right">Minggu Ini</th>
                          <th scope="col" className="px-3 py-2 text-right">Minggu Lalu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr>
                          <td className="px-3 py-2 text-slate-500 text-xs">Qty (CRT / PCS)</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fnum(num(current.qty_ini_crt))} / {fnum(num(current.qty_ini_pcs))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{num(current.qty_lalu_crt) > 0 || num(current.qty_lalu_pcs) > 0 ? `${fnum(num(current.qty_lalu_crt))} / ${fnum(num(current.qty_lalu_pcs))}` : '—'}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-500 text-xs">Expired Date</td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtDate(current.expired_date_ini)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{fmtDate(current.expired_date_lalu)}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-500 text-xs">Status</td>
                          <td className="px-3 py-2 text-right">{badge(current.status_ini)}</td>
                          <td className="px-3 py-2 text-right">{current.status_lalu ? badge(current.status_lalu) : <span className="text-xs text-slate-400">—</span>}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-500 text-xs">Selisih Expired</td>
                          <td colSpan={2} className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {current.selisih_expired_date === null ? '—' : `${current.selisih_expired_date > 0 ? '+' : ''}${current.selisih_expired_date} hari`}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-slate-500 text-xs font-semibold">Perubahan</td>
                          <td colSpan={2} className="px-3 py-2 text-right text-slate-700 font-medium">{current.perubahan || '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Validasi info */}
                {current.validated_at && (
                  <div className="text-xs text-slate-500 bg-surface-raised rounded-xl px-3 py-2.5">
                    <span className="font-semibold text-slate-700">Divalidasi:</span> oleh {current.validator?.full_name || '-'} · {fmtDate(current.validated_at)}
                  </div>
                )}
              </div>

              {/* Drawer footer */}
              <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => navNext(-1)}
                  disabled={currentIndex <= 0}
                  className="p-2.5 rounded-xl border border-gray-300 text-slate-500 hover:bg-surface-raised transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Batch sebelumnya"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Tutup
                </button>
                <button
                  onClick={() => navNext(1)}
                  disabled={currentIndex >= waves.length - 1}
                  className="p-2.5 rounded-xl border border-gray-300 text-slate-500 hover:bg-surface-raised transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Batch berikutnya"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Threshold Opname" subtitle="Ambang batas status expired" size="md"
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
          <div>
            <label htmlFor="threshold-aman" className="block text-xs font-medium text-gray-500 mb-1">Threshold AMAN (hari, ≥ ini = Aman)</label>
            <input id="threshold-aman" type="number" min={0} step={1} value={thresholdForm.threshold_aman} onChange={(e) => setThresholdForm((p) => ({ ...p, threshold_aman: parseInt(e.target.value) || 0 }))} className="input-field" />
            <p className="text-[11px] text-slate-400 mt-1">Batch dengan sisa ≥ hari ini → status <span className="text-emerald-600 font-medium">Aman</span></p>
          </div>
          <div>
            <label htmlFor="threshold-perhatian" className="block text-xs font-medium text-gray-500 mb-1">Threshold PERHATIAN (hari)</label>
            <input id="threshold-perhatian" type="number" min={0} step={1} value={thresholdForm.threshold_perhatian} onChange={(e) => setThresholdForm((p) => ({ ...p, threshold_perhatian: parseInt(e.target.value) || 0 }))} className="input-field" />
            <p className="text-[11px] text-slate-400 mt-1">Batch dengan sisa &lt; threshold AMAN → status <span className="text-amber-600 font-medium">Perhatian</span></p>
          </div>
          <div>
            <label htmlFor="threshold-kritis" className="block text-xs font-medium text-gray-500 mb-1">Threshold KRITIS (hari)</label>
            <input id="threshold-kritis" type="number" min={0} step={1} value={thresholdForm.threshold_kritis} onChange={(e) => setThresholdForm((p) => ({ ...p, threshold_kritis: parseInt(e.target.value) || 0 }))} className="input-field" />
            <p className="text-[11px] text-slate-400 mt-1">Batch dengan sisa &lt; threshold PERHATIAN → status <span className="text-red-600 font-medium">Kritis/Expired</span></p>
          </div>
        </div>
      </Modal>
    </div>
  </DashboardLayout>
  );
}

function weekEndLabel(weekStart: string): string {
  return new Date(new Date(weekStart).getTime() + 6 * 86400000).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}