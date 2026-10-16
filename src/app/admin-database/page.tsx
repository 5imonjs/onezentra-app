'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { adminDatabase } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';

// Modul yang boleh dikosongkan master. Urutan hapus di backend anak-dulu agar
// FK tidak meledak; baris biaya retribusi yang mengklaim receiving TIDAK ikut
// dihapus (referensinya di-set null) dan jumlahnya dilaporkan.
const MODULES = [
  { key: 'rencana_kirim', label: 'Replenishment', note: 'Rencana + item, gate, receiving, dan validasi ikut terhapus via relasi' },
  { key: 'gate', label: 'Check In Point', note: 'Transaksi gate (receiving yang menunjuk ikut longgar, tidak hilang)' },
  { key: 'validasi-sj', label: 'Validasi Dokumen', note: 'Sesi validasi + item + label batch validasi' },
  { key: 'receiving', label: 'Check Out Point', note: 'Receiving + item (+batch receiving via cascade)' },
  { key: 'penerimaan', label: 'Inbound (SJ)', note: 'Tabel penerimaan (mandiri)' },
  { key: 'opname-session', label: 'Sesi Opname', note: 'Sesi opname + item (waves dibiarkan sebagai referensi)' },
] as const;

export default function AdminDatabasePage() {
  const { hasPermission } = useAuthStore();
  const allowed = hasPermission('database.purge');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState('');
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await adminDatabase.summary() as { data: { data: Record<string, number> } };
      setCounts(response.data.data || {});
    } catch {
      notifyGlobal('Gagal memuat ringkasan data', 'error');
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (key: string) => {
    setChecked((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
    setPreview(null);
  };

  const runPurge = async (dryRun: boolean) => {
    if (checked.length === 0) {
      notifyGlobal('Pilih minimal satu modul', 'error');
      return;
    }
    if (!dryRun && confirm.trim() !== 'HAPUS') {
      notifyGlobal('Ketik HAPUS untuk konfirmasi', 'error');
      return;
    }
    setWorking(true);
    try {
      const response = await adminDatabase.purge({ modules: checked, confirm: 'HAPUS', dry_run: dryRun }) as { data: { message: string; data: { counts?: Record<string, number> } } };
      if (dryRun) {
        setPreview(response.data.data.counts || {});
      } else {
        notifyGlobal(response.data.message || 'Data modul terpilih berhasil dikosongkan', 'success');
        setChecked([]);
        setConfirm('');
        setPreview(null);
        await load();
      }
    } catch {
      notifyGlobal(dryRun ? 'Gagal mempratinjau' : 'Gagal mengosongkan data', 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-primary-400">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">Reset Data Operasional</h1>
              <p className="mt-0.5 text-ink-fg-muted">Khusus level master — kosongkan isi database per modul. Tidak bisa dibatalkan.</p>
            </div>
          </div>
        </header>

        {!allowed ? (
          <section className="rounded-2xl border border-gray-100 bg-surface-card p-6 text-sm text-slate-600 shadow-sm">
            Hanya akun level admin master yang boleh membuka halaman ini.
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-800">Pilih modul yang akan dikosongkan</p>
              <p className="mt-1 text-xs text-slate-500">Angka = jumlah baris saat ini. Pratinjau dulu (dry-run), lalu ketik HAPUS untuk eksekusi.</p>
            </div>
            <div className="space-y-3 p-5">
              {loading ? (
                <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
              ) : (
                MODULES.map((module) => (
                  <label key={module.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200">
                    <input
                      type="checkbox"
                      checked={checked.includes(module.key)}
                      onChange={() => toggle(module.key)}
                      className="mt-1 h-4 w-4 accent-red-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">
                        {module.label}
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{counts[module.key] ?? 0} baris</span>
                      </span>
                      <span className="text-xs text-slate-500">{module.note}</span>
                    </span>
                  </label>
                ))
              )}
              {preview && (
                <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Pratinjau (tidak ada yang dihapus): {Object.entries(preview).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  {preview.klaim_biaya_terdampak ? ` — ${preview.klaim_biaya_terdampak} baris biaya ikut longgar (referensi di-set null, tidak dihapus).` : ''}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button type="button" onClick={() => void runPurge(true)} disabled={working || checked.length === 0} className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                  Pratinjau
                </button>
                <input
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Ketik HAPUS"
                  aria-label="Konfirmasi ketik HAPUS"
                  className="select-field-sm w-40"
                />
                <button type="button" onClick={() => void runPurge(false)} disabled={working || checked.length === 0 || confirm.trim() !== 'HAPUS'} className="btn-danger inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                  {working ? 'Memproses…' : 'Kosongkan Sekarang'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
