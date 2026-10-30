'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { adminDatabase } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';

// Modul yang boleh dikosongkan master. SEMUA modul operasional harus ada di
// sini — reset yang hanya mencakup sebagian modul meninggalkan data yatim
// (mis. wave Batch Expired yang masih membawa qty lama setelah receiving
// direset). Urutan hapus di backend anak-dulu agar FK tidak meledak.
const MODULES = [
  { key: 'rencana_kirim', label: 'Replenishment', note: 'Rencana + item, gate, receiving, dan validasi ikut terhapus via relasi' },
  { key: 'gate', label: 'Check In Point', note: 'Transaksi gate (receiving yang menunjuk ikut longgar, tidak hilang)' },
  { key: 'validasi-sj', label: 'Validasi Dokumen', note: 'Sesi validasi + item + label batch validasi' },
  { key: 'receiving', label: 'Check Out Point', note: 'Receiving + item (+batch receiving via cascade)' },
  { key: 'penerimaan', label: 'Inbound (SJ)', note: 'Tabel penerimaan legacy (tidak dibaca UI, tetap dibersihkan)' },
  { key: 'opname-session', label: 'Sesi Opname', note: 'Sesi opname + item (wave dibiarkan sebagai referensi)' },
  { key: 'opname-wave', label: 'Batch Expired', note: 'Wave monitoring + item sesi yang menunjuk wave tersebut (sesi induk tetap ada)' },
  { key: 'standarisasi', label: 'Standarisasi', note: 'Pengajuan standarisasi tumpukan depo terpilih' },
  { key: 'biaya-thl', label: 'Biaya THL', note: 'Pengajuan THL + detail, kendaraan, foto, dan riwayat approval' },
  { key: 'biaya-retribusi', label: 'Biaya Retribusi', note: 'Pengajuan retribusi + detail, dokumen, riwayat approval (THL turunan ikut terhapus)' },
] as const;

type Depot = { kode_depo: string; nama_depo: string | null };

type AdminDocument = {
  id: number;
  label: string;
  subtitle: string | null;
  date: string | null;
  status: string | null;
};

type ModuleKey = (typeof MODULES)[number]['key'];

type BackfillSample = {
  id: number;
  nama_depo: string | null;
  kode_depo: string;
  sumber: string;
};

type BackfillUnresolvedSample = {
  id: number;
  nama_depo: string | null;
  alasan: string;
};

type BackfillTable = {
  total: number;
  resolved: number;
  unresolved: number;
  samples: BackfillSample[];
  unresolved_samples: BackfillUnresolvedSample[];
};

type BackfillData = {
  dry_run: boolean;
  candidates: Record<string, BackfillTable>;
  applied: Record<string, number>;
};

const LEGACY_TABLE_LABELS: Record<string, string> = {
  rencana_kirim: 'Replenishment',
  receiving_items: 'Item Check Out',
  penerimaan: 'Inbound (SJ)',
  opname_expired_sessions: 'Sesi Opname',
  opname_expired_waves: 'Batch Expired',
  standarisasi_tumpukan: 'Standarisasi',
  biaya_thls: 'Biaya THL',
  biaya_retribusis: 'Biaya Retribusi',
};

export default function AdminDatabasePage() {
  const { user, hasPermission } = useAuthStore();
  const allowed = hasPermission('database.purge');
  const kodeDepo = user?.kode_depo;
  const [depots, setDepots] = useState<Depot[]>([]);
  const [selectedDepot, setSelectedDepot] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState('');
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<'depot' | 'documents'>('depot');
  const [docModule, setDocModule] = useState<ModuleKey>('rencana_kirim');
  const [docSearchInput, setDocSearchInput] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [docChecked, setDocChecked] = useState<number[]>([]);
  const [docPreview, setDocPreview] = useState<Record<string, number> | null>(null);
  const [legacy, setLegacy] = useState<BackfillData | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [legacyWorking, setLegacyWorking] = useState(false);
  const [legacyConfirm, setLegacyConfirm] = useState('');
  const [legacyError, setLegacyError] = useState(false);
  const [masterCounts, setMasterCounts] = useState<Record<string, number>>({});
  const [masterConfirm, setMasterConfirm] = useState('');
  const [masterPreview, setMasterPreview] = useState<Record<string, number> | null>(null);
  const [masterWorking, setMasterWorking] = useState(false);

  // Satu sumber kebenaran depo aktif: dropdown yang terlihat HARUS sama dengan
  // depo yang dihitung dan direset.
  const effectiveDepot =
    selectedDepot ||
    (kodeDepo && depots.some((d) => d.kode_depo === kodeDepo)
      ? kodeDepo
      : depots[0]?.kode_depo ?? '');

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Panggilan pertama tanpa kode_depo: backend mengembalikan daftar depo
      // sekaligus depo default. Tanpa ini halaman deadlock karena dropdown
      // butuh depo yang hanya datang dari respons ini.
      const response = await adminDatabase.summary(effectiveDepot || undefined) as {
        data: {
          data: Record<string, number>;
          master?: Record<string, number>;
          depots?: Depot[];
          kode_depo?: string | null;
        };
      };
      if (response.data.depots) setDepots(response.data.depots);
      if (!selectedDepot && response.data.kode_depo) setSelectedDepot(response.data.kode_depo);
      setCounts(response.data.data || {});
      setMasterCounts(response.data.master || {});
    } catch {
      notifyGlobal('Gagal memuat ringkasan data', 'error');
    } finally {
      setLoading(false);
    }
  }, [allowed, effectiveDepot, selectedDepot]);

  const loadLegacy = useCallback(async () => {
    if (!allowed) {
      setLegacyLoading(false);
      return;
    }
    setLegacyLoading(true);
    setLegacyError(false);
    try {
      // Default backend adalah dry-run: aman dipanggil saat halaman dibuka.
      const response = await adminDatabase.backfillDepot({ dry_run: true }) as {
        data: { data: BackfillData };
      };
      setLegacy(response.data.data);
    } catch {
      setLegacyError(true);
    } finally {
      setLegacyLoading(false);
    }
  }, [allowed]);

  const loadDocuments = useCallback(async () => {
    if (!allowed || mode !== 'documents' || !effectiveDepot) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    try {
      const response = await adminDatabase.documents({
        kode_depo: effectiveDepot,
        module: docModule,
        search: docSearch || undefined,
      }) as { data: { data?: AdminDocument[] } };
      setDocuments(response.data.data || []);
    } catch {
      notifyGlobal('Gagal memuat daftar dokumen', 'error');
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, [allowed, mode, effectiveDepot, docModule, docSearch]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadLegacy(); }, [loadLegacy]);
  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const changeDepot = (value: string) => {
    setSelectedDepot(value);
    setChecked([]);
    setConfirm('');
    setPreview(null);
    setDocChecked([]);
    setDocPreview(null);
    setDocSearch('');
    setDocSearchInput('');
  };

  const changeMode = (next: 'depot' | 'documents') => {
    setMode(next);
    setConfirm('');
    setPreview(null);
    setDocPreview(null);
    setDocChecked([]);
    setDocSearch('');
    setDocSearchInput('');
  };

  const changeDocModule = (value: ModuleKey) => {
    setDocModule(value);
    setDocChecked([]);
    setDocPreview(null);
    setDocSearch('');
    setDocSearchInput('');
  };

  const submitDocSearch = () => {
    setDocSearch(docSearchInput.trim());
    setDocChecked([]);
    setDocPreview(null);
  };

  const toggleDoc = (id: number) => {
    setDocChecked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    setDocPreview(null);
  };

  const toggle = (key: string) => {
    setChecked((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
    setPreview(null);
  };

  const runPurge = async (dryRun: boolean) => {
    if (!effectiveDepot) {
      notifyGlobal('Pilih depo terlebih dahulu', 'error');
      return;
    }
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
      const response = await adminDatabase.purge({
        modules: checked,
        kode_depo: effectiveDepot,
        confirm: 'HAPUS',
        dry_run: dryRun,
      }) as { data: { message: string; data: { counts?: Record<string, number> } } };
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

  const runMasterNpnPurge = async (dryRun: boolean) => {
    const total = masterCounts.npn ?? 0;
    if (total === 0) {
      notifyGlobal('Master NPN sudah kosong', 'error');
      return;
    }
    if (!dryRun && masterConfirm.trim() !== 'HAPUS NPN') {
      notifyGlobal('Ketik HAPUS NPN untuk konfirmasi', 'error');
      return;
    }
    setMasterWorking(true);
    try {
      const response = await adminDatabase.purgeMaster({
        modules: ['npn'],
        confirm: 'HAPUS NPN',
        dry_run: dryRun,
      }) as { data: { message: string; data: { counts?: Record<string, number> } } };
      if (dryRun) {
        setMasterPreview(response.data.data.counts || {});
      } else {
        notifyGlobal(response.data.message || 'Master NPN berhasil dikosongkan', 'success');
        setMasterConfirm('');
        setMasterPreview(null);
        await load();
      }
    } catch {
      notifyGlobal(dryRun ? 'Gagal mempratinjau master NPN' : 'Gagal mengosongkan master NPN', 'error');
    } finally {
      setMasterWorking(false);
    }
  };

  const runItemPurge = async (dryRun: boolean) => {
    if (!effectiveDepot) {
      notifyGlobal('Pilih depo terlebih dahulu', 'error');
      return;
    }
    if (docChecked.length === 0) {
      notifyGlobal('Pilih minimal satu dokumen', 'error');
      return;
    }
    if (!dryRun && confirm.trim() !== 'HAPUS') {
      notifyGlobal('Ketik HAPUS untuk konfirmasi', 'error');
      return;
    }
    setWorking(true);
    try {
      const response = await adminDatabase.purgeItems({
        module: docModule,
        ids: docChecked,
        kode_depo: effectiveDepot,
        confirm: 'HAPUS',
        dry_run: dryRun,
      }) as { data: { message: string; data: { counts?: Record<string, number> } } };
      if (dryRun) {
        setDocPreview(response.data.data.counts || {});
      } else {
        notifyGlobal(response.data.message || 'Dokumen terpilih berhasil dihapus', 'success');
        setDocChecked([]);
        setConfirm('');
        setDocPreview(null);
        await Promise.all([load(), loadDocuments()]);
      }
    } catch {
      notifyGlobal(dryRun ? 'Gagal mempratinjau dokumen' : 'Gagal menghapus dokumen', 'error');
    } finally {
      setWorking(false);
    }
  };

  const runBackfill = async () => {
    if (legacyConfirm.trim() !== 'BACKFILL') {
      notifyGlobal('Ketik BACKFILL untuk konfirmasi backfill', 'error');
      return;
    }
    setLegacyWorking(true);
    try {
      const response = await adminDatabase.backfillDepot({
        dry_run: false,
        confirm: 'BACKFILL',
      }) as { data: { message: string; data: BackfillData } };
      notifyGlobal(response.data.message || 'Backfill kode depo selesai', 'success');
      setLegacyConfirm('');
      await Promise.all([load(), loadLegacy()]);
    } catch {
      notifyGlobal('Gagal menjalankan backfill', 'error');
    } finally {
      setLegacyWorking(false);
    }
  };

  const legacyTotals = Object.values(legacy?.candidates ?? {}).reduce(
    (total, table) => ({
      total: total.total + table.total,
      resolved: total.resolved + table.resolved,
      unresolved: total.unresolved + table.unresolved,
    }),
    { total: 0, resolved: 0, unresolved: 0 },
  );

  const legacyTables = Object.entries(legacy?.candidates ?? {});
  const legacyResolvedSamples = legacyTables.flatMap(([table, stat]) =>
    stat.samples.slice(0, 3).map((sample) => ({ table, ...sample })),
  );
  const legacyUnresolvedSamples = legacyTables.flatMap(([table, stat]) =>
    stat.unresolved_samples.slice(0, 3).map((sample) => ({ table, ...sample })),
  );

  const selectedName = depots.find((d) => d.kode_depo === effectiveDepot)?.nama_depo || effectiveDepot;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-primary-400">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">Reset Data</h1>
              <p className="mt-0.5 text-ink-fg-muted">Khusus level master — kosongkan data operasional satu depo atau master NPN global. Tidak bisa dibatalkan.</p>
            </div>
          </div>
        </header>

        {!allowed ? (
          <section className="rounded-2xl border border-gray-100 bg-card p-6 text-sm text-slate-600 shadow-sm">
            Hanya akun level admin master yang boleh membuka halaman ini.
          </section>
        ) : (
          <>
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <label htmlFor="reset-depot" className="text-sm font-semibold text-slate-800">Depo yang direset</label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <select
                  id="reset-depot"
                  value={effectiveDepot}
                  onChange={(event) => changeDepot(event.target.value)}
                  disabled={working || depots.length === 0}
                  className="select-field-sm w-full max-w-xs"
                >
                  {depots.length === 0 ? <option value="">Belum ada depo aktif</option> : null}
                  {depots.map((depot) => (
                    <option key={depot.kode_depo} value={depot.kode_depo}>
                      {depot.nama_depo || depot.kode_depo} ({depot.kode_depo})
                    </option>
                  ))}
                </select>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {effectiveDepot ? `Hanya data ${selectedName}` : 'Pilih depo'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Reset bersifat per depo: baris depo lain tidak tersentuh. Baris lama tanpa kode depo tidak ikut terhapus.
              </p>
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-slate-800">Mode reset</p>
                <div className="mt-2 inline-flex rounded-lg border border-border bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => changeMode('depot')}
                    aria-pressed={mode === 'depot'}
                    disabled={working}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mode === 'depot' ? 'bg-card text-slate-900 shadow-sm' : 'text-muted-foreground hover:text-slate-800'}`}
                  >
                    Per Depo
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMode('documents')}
                    aria-pressed={mode === 'documents'}
                    disabled={working}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mode === 'documents' ? 'bg-card text-slate-900 shadow-sm' : 'text-muted-foreground hover:text-slate-800'}`}
                  >
                    Pilih Dokumen
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {mode === 'depot'
                    ? 'Kosongkan seluruh modul terpilih untuk depo ini.'
                    : 'Cari dan centang dokumen tertentu saja. Turunan dokumen yang dipilih ikut terhapus; dokumen lain tidak tersentuh.'}
                </p>
              </div>
            </div>
            {mode === 'depot' ? (
              <>
                <div className="border-b border-gray-100 px-5 py-4">
                  <p className="text-sm font-semibold text-slate-800">Pilih modul yang akan dikosongkan</p>
                  <p className="mt-1 text-xs text-muted-foreground">Angka = jumlah baris depo ini saat ini. Pratinjau dulu (dry-run), lalu ketik HAPUS untuk eksekusi.</p>
                </div>
                <div className="space-y-3 p-5">
                  {loading ? (
                    <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
                  ) : (
                    MODULES.map((module) => (
                      <label key={module.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 px-4 py-3 hover:border-border">
                        <input
                          type="checkbox"
                          checked={checked.includes(module.key)}
                          onChange={() => toggle(module.key)}
                          disabled={working}
                          className="mt-1 h-4 w-4 accent-red-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800">
                            {module.label}
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{counts[module.key] ?? 0} baris</span>
                          </span>
                          <span className="text-xs text-muted-foreground">{module.note}</span>
                        </span>
                      </label>
                    ))
                  )}
                  {preview && (
                    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      Pratinjau {selectedName} (tidak ada yang dihapus): {Object.entries(preview).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      {preview.klaim_biaya_terdampak ? ` — ${preview.klaim_biaya_terdampak} baris biaya ikut longgar (referensi di-set null, tidak dihapus).` : ''}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button type="button" onClick={() => void runPurge(true)} disabled={working || checked.length === 0 || !effectiveDepot} className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                      Pratinjau
                    </button>
                    <input
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      placeholder="Ketik HAPUS"
                      aria-label="Konfirmasi ketik HAPUS"
                      disabled={working || !effectiveDepot}
                      className="select-field-sm w-40"
                    />
                    <button type="button" onClick={() => void runPurge(false)} disabled={working || checked.length === 0 || confirm.trim() !== 'HAPUS' || !effectiveDepot} className="btn-danger inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? 'Memproses…' : `Kosongkan ${selectedName || 'Depo'}`}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
                    <div>
                      <label htmlFor="document-module" className="text-sm font-semibold text-slate-800">Jenis dokumen</label>
                      <select
                        id="document-module"
                        value={docModule}
                        onChange={(event) => changeDocModule(event.target.value as ModuleKey)}
                        disabled={working}
                        className="select-field-sm mt-2 w-full"
                      >
                        {MODULES.map((module) => (
                          <option key={module.key} value={module.key}>{module.label}</option>
                        ))}
                      </select>
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); submitDocSearch(); }} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <label htmlFor="document-search" className="text-sm font-semibold text-slate-800">Cari nomor PO / SJ / dokumen</label>
                        <input
                          id="document-search"
                          value={docSearchInput}
                          onChange={(event) => setDocSearchInput(event.target.value)}
                          placeholder="Contoh: 0127-26-00001"
                          disabled={working}
                          className="select-field-sm mt-2 w-full"
                        />
                      </div>
                      <button type="submit" disabled={working} className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                        Cari
                      </button>
                    </form>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Pilih satu atau beberapa dokumen. Reset hanya menghapus dokumen yang dicentang beserta turunannya.</p>
                </div>
                <div className="space-y-3 p-5">
                  {documentsLoading ? (
                    <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
                  ) : documents.length === 0 ? (
                    <p className="text-sm text-slate-600">Tidak ada dokumen yang cocok untuk depo dan modul ini.</p>
                  ) : (
                    <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
                      {documents.map((document) => (
                        <label key={document.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={docChecked.includes(document.id)}
                            onChange={() => toggleDoc(document.id)}
                            disabled={working}
                            className="mt-1 h-4 w-4 accent-red-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-sm font-semibold text-slate-800">{document.label}</span>
                            {document.subtitle && <span className="block text-xs text-muted-foreground">{document.subtitle}</span>}
                            <span className="block text-xs text-slate-400">{[document.date, document.status].filter(Boolean).join(' · ') || '—'}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{docChecked.length} dokumen dipilih.</p>
                  {docPreview && (
                    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      Pratinjau dokumen terpilih (tidak ada yang dihapus): {Object.entries(docPreview).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      {docPreview.klaim_biaya_terdampak ? ` — ${docPreview.klaim_biaya_terdampak} baris biaya ikut longgar (referensi di-set null, tidak dihapus).` : ''}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button type="button" onClick={() => void runItemPurge(true)} disabled={working || docChecked.length === 0 || !effectiveDepot} className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                      Pratinjau
                    </button>
                    <input
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      placeholder="Ketik HAPUS"
                      aria-label="Konfirmasi ketik HAPUS"
                      disabled={working || !effectiveDepot}
                      className="select-field-sm w-40"
                    />
                    <button type="button" onClick={() => void runItemPurge(false)} disabled={working || docChecked.length === 0 || confirm.trim() !== 'HAPUS' || !effectiveDepot} className="btn-danger inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                      {working ? 'Memproses…' : 'Hapus Dokumen Terpilih'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <section aria-label="Reset master data" className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Reset Master Data (Global)</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Khusus admin master — menghapus master NPN untuk SEMUA depo. Data operasional tidak ikut terhapus.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Global</span>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Master NPN</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Seluruh produk NPN lintas depo. Gunakan ini untuk reset total sebelum import ulang.
                    </p>
                  </div>
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                    {masterCounts.npn ?? 0} baris
                  </span>
                </div>
              </div>
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Referensi NPN pada item Rencana Kirim, Validasi SJ, dan Standarisasi di-set null. Item Rencana/Validasi
                masih menyimpan kode &amp; nama barang; baris Standarisasi akan kehilangan tautan produk. Setelah reset,
                import ulang file master NPN.
              </p>
              {masterPreview && (
                <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Pratinjau master NPN (tidak ada yang dihapus): {masterPreview.npn ?? 0} baris NPN.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void runMasterNpnPurge(true)}
                  disabled={masterWorking || (masterCounts.npn ?? 0) === 0}
                  className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Pratinjau NPN
                </button>
                <input
                  value={masterConfirm}
                  onChange={(event) => setMasterConfirm(event.target.value)}
                  placeholder="Ketik HAPUS NPN"
                  aria-label="Konfirmasi ketik HAPUS NPN"
                  disabled={masterWorking || (masterCounts.npn ?? 0) === 0}
                  className="select-field-sm w-44"
                />
                <button
                  type="button"
                  onClick={() => void runMasterNpnPurge(false)}
                  disabled={masterWorking || (masterCounts.npn ?? 0) === 0 || masterConfirm.trim() !== 'HAPUS NPN'}
                  className="btn-danger inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {masterWorking ? 'Memproses…' : 'Kosongkan Master NPN'}
                </button>
              </div>
            </div>
          </section>

          <section aria-label="Data legacy tanpa depo" className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-800">Data Legacy Tanpa Depo</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Baris lama dengan kode depo kosong tidak ikut reset per depo. Backfill hanya mengisi baris kosong dari relasi dokumen atau nama depo yang cocok unik; kode yang sudah terisi tidak pernah ditimpa.
              </p>
            </div>
            <div className="space-y-4 p-5">
              {legacyLoading ? (
                <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
              ) : legacyError ? (
                <p className="text-sm text-red-600">Gagal memuat pratinjau data legacy.</p>
              ) : legacy === null || legacyTotals.total === 0 ? (
                <p className="text-sm text-slate-600">Tidak ada data legacy tanpa kode depo.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-gray-100 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Baris tanpa depo</p>
                      <p className="text-xl font-bold text-slate-800">{legacyTotals.total}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Bisa diisi otomatis</p>
                      <p className="text-xl font-bold text-emerald-700">{legacyTotals.resolved}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Perlu dicek manual</p>
                      <p className="text-xl font-bold text-amber-700">{legacyTotals.unresolved}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="py-2 pr-4">Modul</th>
                          <th className="py-2 pr-4">Total</th>
                          <th className="py-2 pr-4">Bisa diisi</th>
                          <th className="py-2">Perlu manual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {legacyTables.map(([table, stat]) => (
                          <tr key={table} className="border-b border-gray-50">
                            <td className="py-2 pr-4 font-medium text-slate-700">{LEGACY_TABLE_LABELS[table] ?? table}</td>
                            <td className="py-2 pr-4">{stat.total}</td>
                            <td className="py-2 pr-4 text-emerald-700">{stat.resolved}</td>
                            <td className="py-2 text-amber-700">{stat.unresolved}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {legacyResolvedSamples.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Contoh yang akan diisi</p>
                      <ul className="mt-1 space-y-1 text-xs text-slate-600">
                        {legacyResolvedSamples.map((sample) => (
                          <li key={`${sample.table}-${sample.id}`}>
                            {LEGACY_TABLE_LABELS[sample.table] ?? sample.table} #{sample.id}
                            {sample.nama_depo ? ` (${sample.nama_depo})` : ''} → <strong>{sample.kode_depo}</strong> dari {sample.sumber}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {legacyUnresolvedSamples.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Tidak diisi — perlu dicek manual</p>
                      <ul className="mt-1 space-y-1 text-xs text-amber-700">
                        {legacyUnresolvedSamples.map((sample) => (
                          <li key={`${sample.table}-${sample.id}`}>
                            {LEGACY_TABLE_LABELS[sample.table] ?? sample.table} #{sample.id}
                            {sample.nama_depo ? ` (${sample.nama_depo})` : ''}: {sample.alasan}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {legacyTotals.resolved > 0 && (
                    <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                      <input
                        value={legacyConfirm}
                        onChange={(event) => setLegacyConfirm(event.target.value)}
                        placeholder="Ketik BACKFILL"
                        aria-label="Konfirmasi ketik BACKFILL"
                        disabled={legacyWorking}
                        className="select-field-sm w-44"
                      />
                      <button
                        type="button"
                        onClick={() => void runBackfill()}
                        disabled={legacyWorking || legacyConfirm.trim() !== 'BACKFILL'}
                        className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {legacyWorking ? 'Memproses…' : 'Backfill Kode Depo'}
                      </button>
                      <span className="text-xs text-muted-foreground">Hanya mengisi baris kosong; kode yang sudah ada tidak berubah.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
