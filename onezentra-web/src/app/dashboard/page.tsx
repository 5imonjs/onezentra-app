'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import DashboardActivityChart from '@/components/DashboardActivityChart';
import DashboardAlerts from '@/components/DashboardAlerts';
import DashboardRecent from '@/components/DashboardRecent';
import DashboardStatCards from '@/components/DashboardStatCards';
import PendingActions from '@/components/PendingActions';
import RencanaKirimStatusChart from '@/components/RencanaKirimStatusChart';
import { depo } from '@/lib/api';

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

  const canFilterDepot = hasPermission('depot.view_all');

  useEffect(() => {
    if (!canFilterDepot) return;
    depo.list()
      .then((res) => {
        const rows = res.data?.data;
        if (Array.isArray(rows)) setDepos(rows);
      })
      .catch(() => {});
  }, [canFilterDepot]);

  if (!hasPermission('dashboard.view')) {
    return null;
  }

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
                className="min-h-[44px] rounded-xl bg-white/10 border border-white/15 px-3 text-sm font-medium text-white backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 [&>option]:text-slate-900"
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

      <PendingActions />

      <DashboardAlerts kodeDepo={kodeDepo || undefined} />

      <DashboardStatCards kodeDepo={kodeDepo || undefined} />

      {/* Charts — bento */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <DashboardActivityChart kodeDepo={kodeDepo || undefined} />
        {hasPermission('rencana_kirim.view') && <RencanaKirimStatusChart kodeDepo={kodeDepo || undefined} />}
      </div>

      <DashboardRecent kodeDepo={kodeDepo || undefined} />
    </div>
  );
}
