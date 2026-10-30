'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { depo, retribusiRates } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';

type Mode = 'borongan' | 'koli';

type RateRow = {
  kode_depo: string;
  nama_depo: string | null;
  mode: Mode;
  rate_zak: string;
  rate_crt: string;
  is_active: boolean;
};

type Draft = {
  mode: Mode;
  rate_zak: string;
  rate_crt: string;
  is_active: boolean;
  /** true bila ada override tersimpan untuk depo ini (artinya tombol Reset aktif). */
  hasOverride: boolean;
};

const emptyDraft = (hasOverride: boolean): Draft => ({
  mode: 'borongan',
  rate_zak: '0',
  rate_crt: '0',
  is_active: true,
  hasOverride,
});

const toRateRow = (raw: Record<string, unknown>): RateRow => ({
  kode_depo: String(raw.kode_depo ?? ''),
  nama_depo: raw.nama_depo ? String(raw.nama_depo) : null,
  mode: raw.mode === 'koli' ? 'koli' : 'borongan',
  rate_zak: String(raw.rate_zak ?? '0'),
  rate_crt: String(raw.rate_crt ?? '0'),
  is_active: Boolean(raw.is_active),
});

export default function TarifRetribusiPage() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('retribusi_rates.manage');

  /** Depo master (semua depo dari data user) + override tarif existing. */
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string | null }[]>([]);
  const [overrides, setOverrides] = useState<Record<string, RateRow>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [depotResponse, rateResponse] = await Promise.all([depo.list(), retribusiRates.list()]);
      const depotList = (depotResponse.data?.data ?? []) as { kode_depo: string; nama_depo: string | null }[];
      const rateList = (rateResponse.data?.data ?? []) as Record<string, unknown>[];
      const rateMap: Record<string, RateRow> = {};
      for (const raw of rateList) {
        const row = toRateRow(raw);
        rateMap[row.kode_depo] = row;
      }
      setDepots(depotList);
      setOverrides(rateMap);
      setDrafts((current) => {
        const next: Record<string, Draft> = {};
        for (const d of depotList) next[d.kode_depo] = current[d.kode_depo] ?? (rateMap[d.kode_depo]
          ? { mode: rateMap[d.kode_depo].mode, rate_zak: rateMap[d.kode_depo].rate_zak, rate_crt: rateMap[d.kode_depo].rate_crt, is_active: rateMap[d.kode_depo].is_active, hasOverride: true }
          : emptyDraft(false));
        // Baris override yang deponya tak lagi ada di master tetap ditampilkan
        // agar bisa di-reset.
        for (const [kode, row] of Object.entries(rateMap)) {
          if (!next[kode]) next[kode] = { mode: row.mode, rate_zak: row.rate_zak, rate_crt: row.rate_crt, is_active: row.is_active, hasOverride: true };
        }
        return next;
      });
    } catch {
      notifyGlobal('Gagal memuat tarif retribusi', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

  const updateDraft = (kodeDepo: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [kodeDepo]: { ...current[kodeDepo], ...patch } }));
  };

  const rows = useMemo(() => {
    const byName = [...depots].sort((a, b) => (a.nama_depo || a.kode_depo).localeCompare(b.nama_depo || b.kode_depo));
    const extras = Object.keys(overrides)
      .filter((kode) => !byName.some((d) => d.kode_depo === kode))
      .map((kode) => ({ kode_depo: kode, nama_depo: overrides[kode].nama_depo }));
    return [...byName, ...extras];
  }, [depots, overrides]);

  const saveRow = async (kodeDepo: string) => {
    const draft = drafts[kodeDepo];
    if (!draft) return;
    const isKoli = draft.mode === 'koli';
    const rateZak = Number(draft.rate_zak) || 0;
    const rateCrt = Number(draft.rate_crt) || 0;
    if (isKoli && rateZak <= 0 && rateCrt <= 0) {
      notifyGlobal('Tentukan tarif zak dan/atau crt untuk mode koli', 'error');
      return;
    }
    setSaving(kodeDepo);
    try {
      await retribusiRates.save({
        kode_depo: kodeDepo,
        nama_depo: depots.find((d) => d.kode_depo === kodeDepo)?.nama_depo ?? kodeDepo,
        mode: draft.mode,
        rate_zak: rateZak,
        rate_crt: rateCrt,
        is_active: draft.is_active,
      });
      notifyGlobal(`Tarif ${kodeDepo} disimpan`, 'success');
      await load();
    } catch {
      notifyGlobal('Gagal menyimpan tarif', 'error');
    } finally {
      setSaving(null);
    }
  };

  const resetRow = async (kodeDepo: string) => {
    setSaving(kodeDepo);
    try {
      await retribusiRates.remove(kodeDepo);
      notifyGlobal(`Tarif ${kodeDepo} direset ke bawaan config`, 'success');
      await load();
    } catch {
      notifyGlobal('Gagal mereset tarif', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (!canManage) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-sm rounded-2xl border border-gray-100 bg-card p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
            </div>
            <h1 className="mt-4 text-lg font-bold text-slate-800">Akses terbatas</h1>
            <p className="mt-1 text-sm text-slate-500">Hanya Admin Master dan Admin Distribusi yang dapat mengelola tarif retribusi.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-primary-400">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375v9" /></svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">Tarif Retribusi</h1>
              <p className="mt-0.5 text-ink-fg-muted">Atur mode perhitungan &amp; tarif per depo — borongan (nominal manual) atau koli (zak × crt)</p>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-sm font-semibold text-slate-800">Tarif khusus per depo</p>
            <p className="mt-1 text-xs text-slate-500">
              Depo tanpa baris tersimpan memakai bawaan config. Simpan baris untuk meng-override, atau reset untuk kembali ke bawaan.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-600">Belum ada data depo</p>
              <p className="mt-1 text-xs text-slate-400">Data depo diturunkan dari akun user yang terdaftar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-overlay-60 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Depo</th>
                    <th className="px-3 py-3">Mode</th>
                    <th className="px-3 py-3 text-right">Tarif / zak (Rp)</th>
                    <th className="px-3 py-3 text-right">Tarif / crt (Rp)</th>
                    <th className="px-3 py-3 text-center">Aktif</th>
                    <th className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((depot) => {
                    const draft = drafts[depot.kode_depo] ?? emptyDraft(false);
                    const isSaving = saving === depot.kode_depo;
                    const isKoli = draft.mode === 'koli';
                    return (
                      <tr key={depot.kode_depo} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{depot.kode_depo}</span>
                            {depot.nama_depo && <span className="truncate text-xs text-slate-400">{depot.nama_depo}</span>}
                          </div>
                          {!draft.hasOverride && (
                            <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Bawaan config</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={draft.mode}
                            disabled={isSaving}
                            onChange={(e) => updateDraft(depot.kode_depo, { mode: e.target.value as Mode })}
                            className="select-field-sm w-32 text-xs"
                            aria-label={`Mode hitung ${depot.kode_depo}`}
                          >
                            <option value="borongan">Borongan</option>
                            <option value="koli">Koli</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={isSaving || !isKoli}
                            value={isKoli ? draft.rate_zak || '' : ''}
                            onChange={(e) => updateDraft(depot.kode_depo, { rate_zak: e.target.value })}
                            placeholder="0"
                            className="input-field w-28 py-1.5 text-right text-xs disabled:bg-slate-100 disabled:text-slate-300"
                            aria-label={`Tarif per zak ${depot.kode_depo}`}
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={isSaving || !isKoli}
                            value={isKoli ? draft.rate_crt || '' : ''}
                            onChange={(e) => updateDraft(depot.kode_depo, { rate_crt: e.target.value })}
                            placeholder="0"
                            className="input-field w-28 py-1.5 text-right text-xs disabled:bg-slate-100 disabled:text-slate-300"
                            aria-label={`Tarif per crt ${depot.kode_depo}`}
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            disabled={isSaving}
                            checked={draft.is_active}
                            onChange={(e) => updateDraft(depot.kode_depo, { is_active: e.target.checked })}
                            aria-label={`Aktif ${depot.kode_depo}`}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void saveRow(depot.kode_depo)}
                              disabled={isSaving}
                              className="rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSaving ? 'Menyimpan...' : 'Simpan'}
                            </button>
                            {draft.hasOverride && (
                              <button
                                type="button"
                                onClick={() => void resetRow(depot.kode_depo)}
                                disabled={isSaving}
                                title="Kembalikan ke nilai bawaan config"
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-gray-100 bg-overlay-60 px-5 py-3">
            <p className="text-xs text-slate-500">
              Rumus mode koli: <span className="font-semibold text-slate-700">nominal = qty zak × tarif zak + qty crt × tarif crt</span>. Mode borongan memakai nominal manual saat input biaya.
            </p>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}