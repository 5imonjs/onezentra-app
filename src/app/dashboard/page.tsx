'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import DashboardActivityChart from '@/components/DashboardActivityChart';
import DashboardAlerts from '@/components/DashboardAlerts';
import DashboardBiayaQueue from '@/components/DashboardBiayaQueue';
import DashboardOpnameChart from '@/components/DashboardOpnameChart';
import DashboardRecent from '@/components/DashboardRecent';
import PendingActions from '@/components/PendingActions';
import RencanaKirimStatusChart from '@/components/RencanaKirimStatusChart';
import { visibleDashboardBlocks, type DashboardBlockKey } from './dashboardBlocks';
import { depo, getErrorMessage } from '@/lib/api';

function greetingFor(hour: number): string {
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

interface DepoOption {
  kode_depo: string;
  nama_depo: string;
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore();
  // Jam diperbarui berkala: sapaan dan penunjuk waktu tetap relevan selama
  // tab dibiarkan terbuka, tanpa memicu re-render tiap detik.
  const [now, setNow] = useState(() => new Date());
  const [depos, setDepos] = useState<DepoOption[]>([]);
  const [kodeDepo, setKodeDepo] = useState('');
  const [depotError, setDepotError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const canFilterDepot = hasPermission('depot.view_all');
  const canSeeRencanaKirimChart = hasPermission('rencana_kirim.view');

  const loadDepos = useCallback(async () => {
    if (!canFilterDepot) return;
    try {
      const res = await depo.list();
      const rows = res.data?.data;
      if (Array.isArray(rows)) setDepos(rows);
      setDepotError('');
    } catch (e) {
      console.error('[Dashboard depo]', e);
      setDepotError(getErrorMessage(e, 'Gagal memuat daftar depo.'));
    }
  }, [canFilterDepot]);

  useEffect(() => { loadDepos(); }, [loadDepos]);

  const blocks = useMemo(
    () => visibleDashboardBlocks(user?.level, hasPermission),
    [user?.level, hasPermission],
  );

  const canSeeActivityChart = hasPermission('users.view');
  const bothCharts = canSeeActivityChart && canSeeRencanaKirimChart;

  if (!hasPermission('dashboard.view')) {
    return null;
  }

  const renderBlock = (key: DashboardBlockKey) => {
    switch (key) {
      case 'biayaQueue':
        return <DashboardBiayaQueue key={key} kodeDepo={kodeDepo || undefined} />;
      case 'pending':
        return <PendingActions key={key} kodeDepo={kodeDepo || undefined} />;
      case 'alerts':
        return <DashboardAlerts key={key} kodeDepo={kodeDepo || undefined} />;
      case 'charts':
        return (
          <div key={key} className={`grid grid-cols-1 gap-5 ${bothCharts ? 'xl:grid-cols-2' : ''}`}>
            {canSeeActivityChart && <DashboardActivityChart kodeDepo={kodeDepo || undefined} />}
            {canSeeRencanaKirimChart && <RencanaKirimStatusChart kodeDepo={kodeDepo || undefined} />}
          </div>
        );
      case 'opname':
        return <DashboardOpnameChart key={key} />;
      case 'recent':
        return <DashboardRecent key={key} kodeDepo={kodeDepo || undefined} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero: satu panel gelap dengan aksen brand, memuat sapaan, tanggal/jam,
          dan filter depo. Panjang gelap tetap (ink) agar logo & teks putih
          terbaca di kedua tema. */}
      <section
        aria-label="Ringkasan dashboard"
        className="relative overflow-hidden rounded-3xl bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 p-5 text-white shadow-xl sm:p-7"
      >
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary-500/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-fg-muted">Dashboard Operasional</p>
              <h1 className="mt-1 truncate text-2xl font-black tracking-tight sm:text-3xl">
                {greetingFor(now.getHours())}, <span className="text-primary-300">{user?.full_name?.split(' ')[0]}</span>
              </h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-fg-muted">
                <span>{now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/30" />
                <span className="tabular-nums">{now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
              </p>
            </div>
          </div>

          {canFilterDepot && (
            <label className="flex items-center gap-2 self-start rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/15 lg:self-auto">
              <svg className="h-4 w-4 shrink-0 text-ink-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-fg-muted">Depo</span>
              <select
                value={kodeDepo}
                onChange={(e) => setKodeDepo(e.target.value)}
                aria-label="Filter depo dashboard"
                className="min-h-8 cursor-pointer bg-transparent pr-1 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 [&>option]:text-slate-900"
              >
                <option value="">Semua depo</option>
                {depos.map((d) => (
                  <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo || d.kode_depo}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {depotError && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <span className="flex-1">{depotError}</span>
          <button onClick={loadDepos} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold hover:bg-red-100">
            Coba lagi
          </button>
        </div>
      )}

      {blocks.map(renderBlock)}
    </div>
  );
}
