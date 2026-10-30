'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { approvalAssignments } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';

const LEVELS = [
  { key: 'BLC', title: 'Mengajukan', description: 'Pengaju biaya' },
  { key: 'BAC', title: 'Mengetahui', description: 'Pemeriksa biaya' },
  { key: 'RLH', title: 'Menyetujui', description: 'Penyetuju biaya' },
  { key: 'RFAH', title: 'Menyetujui', description: 'Penyetuju biaya (RFAH)' },
] as const;

type Approver = { id: number; full_name: string; email: string; level: string; kode_depo: string };
type Assignment = { user: Approver };
type Depot = { kode_depo: string; nama_depo: string | null };

export default function ApprovalSettingsPage() {
  const { user, hasPermission } = useAuthStore();
  const [module, setModule] = useState<'biaya_thl' | 'biaya_retribusi'>('biaya_thl');
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [selectedDepot, setSelectedDepot] = useState('');

  const kodeDepo = user?.kode_depo;
  // SATU sumber kebenaran depo aktif: dropdown yang terlihat user HARUS sama
  // dengan yang di-load dan di-save. Sebelumnya value select bisa jatuh ke
  // option pertama sementara load/save memakai kode_depo user (yang bahkan
  // bisa tidak ada di daftar) — user mengira mengatur depo A padahal
  // tersimpan di depo B, dan yang tampil selalu kosong.
  const effectiveDepot =
    selectedDepot ||
    (kodeDepo && depots.some((d) => d.kode_depo === kodeDepo)
      ? kodeDepo
      : depots[0]?.kode_depo ?? '');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Saat daftar depo belum ada, panggil TANPA kode_depo: backend memakai
      // depo user sebagai default sekaligus mengirim daftar depo. Tanpa ini
      // halaman deadlock — `effectiveDepot` butuh `depots`, sementara `depots`
      // hanya diisi dari respons ini, sehingga fetch tak pernah berjalan dan
      // area data selamanya kosong.
      const response = await approvalAssignments.get(effectiveDepot || undefined, module) as { data: { data: Record<string, Assignment>; users: Approver[]; depots?: Depot[] } };
      setApprovers(response.data.users);
      if (response.data.depots) setDepots(response.data.depots);
      setAssignments(response.data.data || {});
      setSelected(Object.fromEntries(Object.entries(response.data.data).map(([level, assignment]) => [level, String(assignment.user.id)])));
    } catch {
      notifyGlobal('Gagal memuat pengaturan approval', 'error');
    } finally {
      setLoading(false);
    }
  }, [effectiveDepot, module]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!effectiveDepot) return;
    const localAssignments = LEVELS.filter(({ key }) => key === 'BLC' || key === 'BAC')
      .map(({ key }) => ({ approval_level: key, user_id: Number(selected[key]) }))
      .filter((assignment) => assignment.user_id > 0);
    const globalAssignments = LEVELS.filter(({ key }) => key === 'RLH' || key === 'RFAH')
      .map(({ key }) => ({ approval_level: key, user_id: Number(selected[key]) }))
      .filter((assignment) => assignment.user_id > 0);
    if (localAssignments.length !== 2 || globalAssignments.length !== 2) {
      notifyGlobal('Pilih approver untuk semua tahap', 'error');
      return;
    }
    setSaving(true);
    try {
      await approvalAssignments.save({ kode_depo: effectiveDepot, module, assignments: localAssignments });
      await approvalAssignments.save({ kode_depo: 'ADMIN', module, assignments: globalAssignments });
      notifyGlobal('Pengaturan approval berhasil disimpan', 'success');
      await load();
    } catch {
      notifyGlobal('Gagal menyimpan pengaturan approval', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-primary-400">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" /></svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">Pengaturan Approval</h1>
              <p className="mt-0.5 text-ink-fg-muted">Tentukan approver biaya untuk {depots.find((d) => d.kode_depo === effectiveDepot)?.nama_depo || effectiveDepot || 'depo aktif'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 p-1 backdrop-blur" role="tablist" aria-label="Modul biaya">
              {([
                { key: 'biaya_thl', label: 'Biaya THL' },
                { key: 'biaya_retribusi', label: 'Biaya Retribusi' },
              ] as const).map((tab) => (
                <button key={tab.key} role="tab" aria-selected={module === tab.key} onClick={() => { setModule(tab.key); setSelected({}); setAssignments({}); }} className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${module === tab.key ? 'bg-card text-slate-900 shadow' : 'text-ink-fg-muted hover:text-ink-fg'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-sm font-semibold text-slate-800">Approver {module === 'biaya_thl' ? 'Biaya THL' : 'Biaya Retribusi'} per depo</p>
            <p className="mt-1 text-xs text-slate-500">Berlaku khusus modul ini — tidak memengaruhi modul lainnya. Nama pada PDF diambil dari akun user aktif yang dipilih di sini.</p>
          </div>
          <div className="space-y-4 p-5">
            <label className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
              <span><span className="block text-sm font-semibold text-slate-800">Depo BLC/BAC</span><span className="text-xs text-slate-500">Pilih depo yang akan diatur</span></span>
              <select value={effectiveDepot} onChange={(event) => setSelectedDepot(event.target.value)} disabled={!hasPermission('approval.manage')} className="select-field-sm w-full">
                {depots.map((depot) => <option key={depot.kode_depo} value={depot.kode_depo}>{depot.nama_depo || depot.kode_depo} ({depot.kode_depo})</option>)}
              </select>
            </label>
            {(() => {
              // Setting tersimpan bisa menunjuk user yang levelnya berubah /
              // nonaktif / beda depo sehingga tak masuk daftar dropdown —
              // tampilkan peringatan, bukan kolom kosong yang terlihat seperti
              // "berubah".
              const stale = LEVELS.filter(({ key }) => {
                const id = selected[key];
                if (!id) return false;
                const depotScoped = key === 'BLC' || key === 'BAC';
                return !approvers.some((a) =>
                  String(a.id) === id
                  && a.level.toLowerCase() === key.toLowerCase()
                  && (!depotScoped || a.kode_depo === effectiveDepot)
                );
              });
              if (stale.length === 0) return null;
              return (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Penetapan tersimpan menunjuk user yang sudah tidak valid ({stale.map(({ key }) => key).join(', ')}: level berubah / nonaktif / beda depo). Pilih ulang lalu Simpan Pengaturan.
                </div>
              );
            })()}
            {loading ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" /> : LEVELS.map(({ key, title, description }) => {
              const matchingLevel = key.toLowerCase();
              // BLC/BAC hanya boleh dari depo terpilih; RLH/RFAH bersifat
              // global (lintas depo), jadi opsinya tidak dibatasi depo.
              const depotScoped = key === 'BLC' || key === 'BAC';
              const levelApprovers = approvers.filter((approver) =>
                approver.level.toLowerCase() === matchingLevel
                && (!depotScoped || approver.kode_depo === effectiveDepot)
              );
              // User tersimpan yang tak masuk filter tetap ditampilkan agar
              // tidak terlihat kosong.
              const savedId = selected[key] || '';
              const savedUser = assignments[key]?.user;
              const options = savedId && savedUser && !levelApprovers.some((a) => String(a.id) === savedId)
                ? [...levelApprovers, { ...savedUser, full_name: `${savedUser.full_name} (level/depo tidak sesuai)` }]
                : levelApprovers;

              return (
              <label key={key} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
                <span><span className="block text-sm font-semibold text-slate-800">{title}</span><span className="text-xs text-slate-500">{description} ({key})</span></span>
                <select value={selected[key] || ''} onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.value }))} disabled={!hasPermission('approval.manage')} className="select-field-sm w-full">
                  <option value="">Pilih user aktif</option>
                  {options.map((approver) => <option key={approver.id} value={approver.id}>{approver.full_name} - {approver.email}</option>)}
                </select>
              </label>
              );
            })}
          </div>
          <div className="flex justify-end border-t border-gray-100 px-5 py-4">
            <button type="button" onClick={() => void save()} disabled={loading || saving || !hasPermission('approval.manage')} className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
