'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { opnameExpired, npn, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { formatDateId } from '@/lib/dates';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import ReceivingItemEditModal from '@/components/ReceivingItemEditModal';
import { useAuthStore } from '@/store/auth';

interface ManualBatch {
  id: number;
  kode_barang: string;
  nama_barang: string | null;
  // Batch label fisik (dari validasi SJ) atau hasil verifikasi sesi lapangan.
  // Baris import yang belum terverifikasi = null → tampil '-'.
  batch?: { batch_number: string } | null;
  verifiedBatch?: { batch_number: string } | null;
  actual_qty: number;
  qty_pcs: number | null;
  satuan: string | null;
  expired_date: string | null;
  tanggal_penerimaan: string | null;
  sumber_material: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  condition?: string | null;
  notes?: string | null;
}

interface NpnProduct {
  id: number;
  BOSnetszProductId: string;
  SAPszProductId: string;
  SAPszUomId: string;
  szNickName: string;
  szNickNameNew: string;
  szShortDescription: string;
  satuan?: string;
}

const num = (v: unknown): number => Number(v ?? 0);

export default function ManualBatchManager({ onChanged, buttonClassName = 'btn-secondary text-sm px-4 py-2', buttonLabel = 'Batch Manual' }: { onChanged?: () => void; buttonClassName?: string; buttonLabel?: string }) {
  const { hasPermission, user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ManualBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  // Banner sukses (simpan manual / import) + aksi generate opname langsung.
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // Pratinjau gabungan: baris SJ + import yang siap masuk generate minggu ini.
  const [pendingPreview, setPendingPreview] = useState<{ total: number; sj: number; import: number; week_start: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Hapus massal: null = tidak ada dialog, selain itu mode konfirmasi.
  const [bulkMode, setBulkMode] = useState<null | 'selected' | 'all'>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<ManualBatch | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchKode, setSearchKode] = useState('');
  const [searchResults, setSearchResults] = useState<NpnProduct[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await opnameExpired.manualItems({ per_page: 100 });
      setItems(res.data.data);
      // Seleksi basi (id yang tak lagi tampil) dibuang tiap reload agar
      // hapus terpilih tidak membawa id hantu.
      setSelectedIds((prev) => {
        const visible = new Set(res.data.data.map((it: ManualBatch) => it.id));
        return new Set(Array.from(prev).filter((id) => visible.has(id)));
      });
    } catch (e) {
      // Jangan biarkan error menyamar sebagai "belum ada batch".
      setLoadError(getErrorMessage(e, 'Gagal memuat daftar batch manual.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { setSuccessMsg(null); load(); }
  }, [open, load]);

  const closeModal = () => {
    setOpen(false);
    // Banner sukses tidak boleh menghantui sesi berikutnya: generate dari
    // toolbar halaman maupun tutup modal selalu meresetnya. Daftar batch
    // (data ledger) memang tetap — yang hilang hanya banner konfirmasinya.
    setSuccessMsg(null);
  };

  const refreshPendingPreview = useCallback(async () => {
    try {
      const res = await opnameExpired.pending() as { data: { data: { pending: { total: number; sj: number; import: number }; week_start: string } } };
      setPendingPreview({ ...res.data.data.pending, week_start: res.data.data.week_start });
    } catch {
      setPendingPreview(null);
    }
  }, []);

  useEffect(() => {
    if (open) refreshPendingPreview();
  }, [open, refreshPendingPreview]);

  useEffect(() => {
    if (open && user) {
      setForm((p) => ({
        ...p,
        kode_depo: user.kode_depo || '',
        nama_depo: user.nama_depo || '',
      }));
    }
  }, [open, user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await npn.searchProduct(query);
        setSearchResults(res.data.data);
        setShowDropdown(res.data.data.length > 0);
        setActiveIndex(res.data.data.length > 0 ? 0 : -1);
      } catch (e) {
        // Error pencarian wajib bersuara: tanpa ini user mengira barang tidak ada.
        notifyGlobal(getErrorMessage(e, 'Gagal mencari produk'));
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchKode(value);
    doSearch(value);
  };

  const handleSelectProduct = (product: NpnProduct) => {
    setForm((p) => ({
      ...p,
      kode_barang: product.BOSnetszProductId || '',
      nama_barang: product.szShortDescription || product.szNickName || '',
      satuan: product.SAPszUomId || 'CRT',
    }));
    setSearchKode('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await opnameExpired.manualCreate({
        kode_barang: form.kode_barang,
        nama_barang: form.nama_barang || null,
        qty_crt: parseFloat(form.qty_crt || '0'),
        qty_pcs: form.qty_pcs ? parseFloat(form.qty_pcs) : null,
        satuan: form.satuan || 'CRT',
        expired_date: form.expired_date,
        tanggal_penerimaan: form.tanggal_penerimaan || undefined,
        sumber_material: form.sumber_material || null,
        kode_depo: form.kode_depo || null,
        nama_depo: form.nama_depo || null,
      });
      setForm({});
      setSearchKode('');
      setSearchResults([]);
      setShowDropdown(false);
      await load();
      await refreshPendingPreview();
      onChanged?.();
      setSuccessMsg('Batch manual ditambahkan.');
    } catch (err) {
      notifyGlobal(getErrorMessage(err, 'Gagal menyimpan batch manual'));
    } finally {
      setBusy(false);
    }
  };

  const handleImportError = (err: unknown) => {
    const response = (err as { response?: { data?: { message?: string; errors?: { row?: number; errors?: string[] }[] } } }).response?.data;
    if (response?.errors?.length) {
      const first = response.errors[0];
      notifyGlobal(`${response.message ?? 'Import gagal'}\nBaris ${first.row}: ${(first.errors ?? []).join(', ')}`);
    } else {
      notifyGlobal(getErrorMessage(err, 'Import gagal'));
    }
  };

  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

  const handleImport = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      notifyGlobal(`Ukuran file ${mb} MB melebihi batas 10 MB`);
      return;
    }
    setSelectedFile(file);
    setImporting(true);
    setSuccessMsg(null);
    try {
      const res = await opnameExpired.manualImport(file);
      const { imported, skipped } = res.data;
      const duplicates = Number(res.data.duplicates ?? 0);
      setSuccessMsg(
        `Import selesai: ${imported} baris masuk, ${skipped} dilewati${duplicates > 0 ? `, ${duplicates} duplikat (sudah pernah diimport) dilewati` : ''}.`
      );
      setSelectedFile(null);
      await load();
      await refreshPendingPreview();
      onChanged?.();
    } catch (err) {
      handleImportError(err);
    } finally {
      setImporting(false);
    }
  };

  /** Generate opname minggu berjalan langsung dari modal (tanpa arg = minggu sekarang). */
  const generateOpname = async () => {
    setGenerating(true);
    try {
      await opnameExpired.generate();
      notifyGlobal('Opname expired minggu ini berhasil di-generate.', 'success');
      await refreshPendingPreview();
      onChanged?.();
      setSuccessMsg(null);
    } catch (err) {
      notifyGlobal(getErrorMessage(err, 'Gagal generate opname'));
    } finally {
      setGenerating(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const downloadTemplate = async () => {
    try {
      const res = await opnameExpired.manualTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'template_batch_manual.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal unduh template'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await opnameExpired.manualDelete(deleteId);
      setDeleteId(null);
      await load();
      await refreshPendingPreview();
      onChanged?.();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal hapus batch manual'));
    } finally {
      setBusy(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (!bulkMode) return;
    setBusy(true);
    try {
      const res = await opnameExpired.manualBulkDelete(
        bulkMode === 'all' ? { all: true } : { ids: Array.from(selectedIds) }
      ) as { data: { message?: string; deleted?: number } };
      notifyGlobal(res.data.message ?? 'Hapus massal selesai.', 'success');
      setBulkMode(null);
      setSelectedIds(new Set());
      await load();
      await refreshPendingPreview();
      onChanged?.();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal hapus massal'));
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allLoadedSelected = items.length > 0 && items.every((it) => selectedIds.has(it.id));

  const fmtDate = formatDateId;

  return (
    <>
      {hasPermission('penerimaan.create') && (
        <button onClick={() => setOpen(true)} className={buttonClassName}>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            {buttonLabel}
          </span>
        </button>
      )}

      <Modal open={open} onClose={closeModal} title="Input Batch Manual" subtitle="Data batch tambahan untuk analisa opname expired (tidak terkait penerimaan SJ)" size="xl"
        footer={
          <button onClick={closeModal} className="btn-secondary">Tutup</button>
        }
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadTemplate} className="btn-secondary text-sm px-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Template
              </span>
            </button>
            <div
              className={`btn-secondary text-sm px-3 py-1.5 cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-slate-100'}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleImport(file); }}
              role="button"
              aria-label="Import Excel"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            >
              <span className="flex items-center gap-1.5">
                {importing ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                )}
                {selectedFile ? selectedFile.name : 'Import Excel'}
              </span>
              {selectedFile && !importing && (
                <span className="text-[11px] text-slate-400 ml-1">({formatFileSize(selectedFile.size)})</span>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={importing} onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleImport(f); } e.target.value = ''; }} />
            {selectedFile && (
              <button type="button" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-slate-400 hover:text-red-500 transition-colors p-1" aria-label="Hapus file terpilih">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Maks 10 MB • .xlsx, .xls, .csv • Taruh file di sini atau klik untuk browse</p>

          {successMsg && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <div className="min-w-0">
                <p className="font-semibold">{successMsg}</p>
                {pendingPreview && pendingPreview.total > 0 ? (
                  <p className="text-emerald-700 mt-0.5">
                    Siap generate minggu {pendingPreview.week_start}: {pendingPreview.sj} baris SJ + {pendingPreview.import} baris import ({pendingPreview.total} baru).
                  </p>
                ) : (
                  <p className="text-emerald-700 mt-0.5">Batch belum masuk analisa opname sampai di-generate.</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasPermission('opname.create') ? (
                  <button type="button" onClick={generateOpname} disabled={generating} className="btn-primary text-sm disabled:opacity-50">
                    <span className="flex items-center gap-1.5">
                      {generating ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M6.75 11.25a7.5 7.5 0 1010.5 0L12 7.5l-5.25 3.75z" /></svg>
                      )}
                      Generate sekarang
                    </span>
                  </button>
                ) : (
                  <span className="text-xs text-emerald-700">Jalankan Generate di menu Batch Expired</span>
                )}
                <button type="button" onClick={() => setSuccessMsg(null)} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors" aria-label="Tutup pesan">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gray-300 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Tambah Baris Manual</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="kode-barang" className="block text-sm font-medium text-gray-700 mb-1.5">Kode Barang *</label>
                  <input id="kode-barang" value={form.kode_barang || ''} readOnly className="input-field bg-surface-raised cursor-not-allowed" placeholder="Otomatis dari nama barang" required />
                </div>
                <div>
                  <label htmlFor="nama-barang" className="block text-sm font-medium text-gray-700 mb-1.5">Nama Barang *</label>
                  {form.nama_barang && form.kode_barang ? (
                    <div className="flex items-center gap-1">
                      <input value={form.nama_barang} id="nama-barang" readOnly className="input-field bg-surface-raised flex-1" />
                      <button type="button" onClick={() => setForm((p) => ({ ...p, kode_barang: '', nama_barang: '', satuan: 'CRT' }))} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" aria-label="Hapus produk terpilih">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="relative" ref={dropdownRef}>
                      <input
                        id="nama-barang"
                        type="text"
                        role="combobox"
                        value={searchKode}
                        onChange={handleSearchChange}
                        onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setShowDropdown(false); return; }
                          if (!showDropdown || searchResults.length === 0) return;
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActiveIndex((i) => (i + 1) % searchResults.length);
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveIndex((i) => (i - 1 + searchResults.length) % searchResults.length);
                          } else if (e.key === 'Enter' && activeIndex >= 0) {
                            e.preventDefault();
                            const product = searchResults[activeIndex];
                            if (product) handleSelectProduct(product);
                          }
                        }}
                        placeholder="Ketik nama barang..."
                        className="input-field"
                        required
                        aria-expanded={showDropdown}
                        aria-controls="nama-barang-options"
                        aria-autocomplete="list"
                        aria-activedescendant={activeIndex >= 0 && searchResults[activeIndex] ? `nama-barang-option-${searchResults[activeIndex].id}` : undefined}
                      />
                      {searching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <svg className="animate-spin w-4 h-4 text-primary-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      )}
                      {showDropdown && searchResults.length > 0 && (
                        <div id="nama-barang-options" role="listbox" aria-label="Hasil pencarian barang" className="absolute z-50 w-full mt-1 bg-surface-card border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-auto">
                          {searchResults.map((product) => (
                            <button
                              key={product.id}
                              id={`nama-barang-option-${product.id}`}
                              type="button"
                              role="option"
                              aria-selected={searchResults[activeIndex]?.id === product.id}
                              onClick={() => handleSelectProduct(product)}
                              onMouseEnter={() => setActiveIndex(searchResults.findIndex((p) => p.id === product.id))}
                              className={`w-full px-3 py-2.5 text-left transition-colors border-b border-gray-300 last:border-0 ${
                                searchResults[activeIndex]?.id === product.id
                                  ? 'bg-row-active text-row-active-text'
                                  : 'hover:bg-surface-hover text-gray-900'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-row-active-icon flex items-center justify-center shrink-0">
                                  <span className="text-xs font-bold text-row-active-text">{product.szNickName?.charAt(0) || '?'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{product.szShortDescription || '-'}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs font-mono opacity-70">{product.szNickName}</span>
                                    {product.SAPszUomId && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{product.SAPszUomId}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="qty-crt" className="block text-sm font-medium text-gray-700 mb-1.5">Qty CRT/ZAK *</label>
                  <input id="qty-crt" type="number" step="1" min="1" value={form.qty_crt || ''} onChange={(e) => setForm((p) => ({ ...p, qty_crt: e.target.value }))} className="input-field" required />
                </div>
                <div>
                  <label htmlFor="qty-pcs" className="block text-sm font-medium text-gray-700 mb-1.5">PCS</label>
                  <input id="qty-pcs" type="number" step="1" min="0" value={form.qty_pcs || ''} onChange={(e) => setForm((p) => ({ ...p, qty_pcs: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label htmlFor="satuan" className="block text-sm font-medium text-gray-700 mb-1.5">Satuan</label>
                  <input id="satuan" value={form.satuan || ''} readOnly placeholder="Otomatis dari nama barang" className="input-field bg-surface-raised cursor-not-allowed" />
                </div>
                <div>
                  <label htmlFor="expired-date" className="block text-sm font-medium text-gray-700 mb-1.5">Expired Date *</label>
                  <input id="expired-date" type="date" value={form.expired_date || ''} onChange={(e) => setForm((p) => ({ ...p, expired_date: e.target.value }))} className="input-field" required />
                </div>
                <div>
                  <label htmlFor="tanggal-penerimaan" className="block text-sm font-medium text-gray-700 mb-1.5">Tanggal Penerimaan</label>
                  <input id="tanggal-penerimaan" type="date" value={form.tanggal_penerimaan || ''} onChange={(e) => setForm((p) => ({ ...p, tanggal_penerimaan: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label htmlFor="sumber-material" className="block text-sm font-medium text-gray-700 mb-1.5">Sumber Material</label>
                  <input id="sumber-material" value={form.sumber_material || ''} onChange={(e) => setForm((p) => ({ ...p, sumber_material: e.target.value }))} className="input-field" />
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                <span className="flex items-center gap-2">
                  {busy ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      Simpan Batch
                    </>
                  )}
                </span>
              </button>
            </form>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Batch Manual Tersimpan {loading ? '(memuat...)' : `(${items.length})`}</p>
              <div className="flex items-center gap-2">
                {items.length > 0 && hasPermission('penerimaan.delete') && (
                  <>
                    <button
                      type="button"
                      onClick={() => setBulkMode('selected')}
                      disabled={selectedIds.size === 0 || busy}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-9"
                    >
                      Hapus terpilih ({selectedIds.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkMode('all')}
                      disabled={busy}
                      title="Hapus seluruh batch manual dalam jangkauan depo Anda (data SJ tidak ikut)"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-9"
                    >
                      Hapus semua
                    </button>
                  </>
                )}
              </div>
              {items.length >= 100 && (
                <p className="text-[11px] text-amber-600 w-full">Menampilkan maksimal 100 batch terbaru &mdash; &ldquo;Hapus semua&rdquo; mencakup seluruh data, bukan hanya yang tampil</p>
              )}
            </div>
            {loadError ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                <span>{loadError}</span>
                <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
              </div>
            ) : items.length > 0 ? (
              <div className="overflow-x-auto border border-gray-300 rounded-xl">
                <table className="w-full min-w-[820px]">
                  <caption className="sr-only">Daftar batch manual tersimpan</caption>
                  <thead>
                    <tr className="bg-surface-raised border-b border-gray-300">
                      {hasPermission('penerimaan.delete') && (
                        <th scope="col" className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={allLoadedSelected}
                            onChange={() => setSelectedIds(allLoadedSelected ? new Set() : new Set(items.map((it) => it.id)))}
                            aria-label="Pilih semua batch yang tampil"
                            className="w-4 h-4 accent-red-600 cursor-pointer"
                          />
                        </th>
                      )}
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Kode Barang</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Kode Batch</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Nama</th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Qty CRT</th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">PCS</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Expired</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Sumber</th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-overlay-50 transition-colors">
                        {hasPermission('penerimaan.delete') && (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(it.id)}
                              onChange={() => toggleSelect(it.id)}
                              aria-label={`Pilih batch ${it.kode_barang}`}
                              className="w-4 h-4 accent-red-600 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap"><span className="font-mono">{it.kode_barang}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap"><span className="font-mono">{it.batch?.batch_number ?? it.verifiedBatch?.batch_number ?? '-'}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{it.nama_barang || '-'}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-900 whitespace-nowrap">{num(it.actual_qty)}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-600 whitespace-nowrap">{it.qty_pcs != null ? num(it.qty_pcs) : '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(it.expired_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{it.sumber_material || '-'}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {hasPermission('penerimaan.edit') && (
                            <button onClick={() => setEditing(it)} className="p-1.5 text-gray-400 hover:text-accent-text hover:bg-chip-primary rounded-md transition-all" aria-label="Edit batch manual">
                              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </button>
                          )}
                          {hasPermission('penerimaan.delete') && (
                            <button onClick={() => setDeleteId(it.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all" aria-label="Hapus batch manual">
                              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-dashed border-gray-300 rounded-xl py-8 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">{loading ? 'Memuat...' : 'Belum ada batch manual tersimpan.'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Hapus Batch Manual"
        message="Apakah Anda yakin ingin menghapus batch manual ini?"
        confirmLabel="Hapus"
        variant="danger"
      />

      <ConfirmDialog
        open={bulkMode !== null}
        onClose={() => setBulkMode(null)}
        onConfirm={confirmBulkDelete}
        title={bulkMode === 'all' ? 'Hapus Semua Batch Manual' : `Hapus ${selectedIds.size} Batch Manual`}
        message={bulkMode === 'all'
          ? 'Seluruh batch manual dalam jangkauan depo Anda akan dihapus (bisa lebih dari 100 yang tampil). Data SJ tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.'
          : `${selectedIds.size} batch manual terpilih akan dihapus. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Ya, hapus"
        variant="danger"
      />

      <ReceivingItemEditModal
        open={editing !== null}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { load(); onChanged?.(); }}
      />
    </>
  );
}
