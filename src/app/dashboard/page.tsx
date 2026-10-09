'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import DashboardActivityChart from '@/components/DashboardActivityChart';
import DashboardAlerts from '@/components/DashboardAlerts';
import DashboardBiayaQueue from '@/components/DashboardBiayaQueue';
import DashboardOpnameChart from '@/components/DashboardOpnameChart';
import DashboardRecent from '@/components/DashboardRecent';
import DashboardStatCards from '@/components/DashboardStatCards';
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
  // Jam disimpan sekali saat mount agar greeting tidak "melompat" karena re-render.
  const [greeting] = useState(() => greetingFor(new Date().getHours()));
  const [depos, setDepos] = useState<DepoOption[]>([]);
  const [kodeDepo, setKodeDepo] = useState('');
  const [depotError, setDepotError] = useState('');

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
      case 'statCards':
        return <DashboardStatCards key={key} kodeDepo={kodeDepo || undefined} />;
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
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-surface-card text-slate-900 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">
                {greeting}, <span className="text-primary-300">{user?.full_name?.split(' ')[0]}</span>
              </h1>
              <p className="text-ink-fg-muted text-sm">{new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
          {canFilterDepot && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-fg-muted font-medium">Depo</span>
              <select
                value={kodeDepo}
                onChange={(e) => setKodeDepo(e.target.value)}
                aria-label="Filter depo dashboard"
                className="min-h-11 rounded-xl bg-white/10 border border-white/15 px-3 text-sm font-medium text-white backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 [&>option]:text-slate-900"
              >
                <option value="">Semua depo</option>
                {depos.map((d) => (
                  <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo || d.kode_depo}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {depotError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
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
