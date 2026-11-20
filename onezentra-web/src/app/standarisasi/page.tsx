'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { standarisasiTumpukan, npn, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';

interface NpnProduct {
  id: number;
  BOSnetszProductId: string;
  SAPszProductId: string;
  szNickName: string;
  szNickNameNew: string;
  szShortDescription: string;
  szBarcode?: string;
}

interface StandarisasiItem {
  id: number;
  npn_id: number;
  npn?: NpnProduct | null;
  tier: number;
  tinggi_tumpukan: number;
  status: string;
  requested_by: number;
  requested_by_email: string;
  approved_by: number;
  approved_by_email: string;
  kode_depo: string;
  nama_depo: string;
  total_tier_tinggi: number;
  created_at: string;
  updated_at: string;
}

const emptyForm: Partial<StandarisasiItem> = {
  npn_id: undefined,
  tier: 1,
  tinggi_tumpukan: 1,
};

type DecisionStatus = 'approved' | 'rejected';

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  pending: { label: 'Menunggu', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Disetujui', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Ditolak', badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Item pending berikutnya dalam daftar termuat (wrap-around), untuk aksi "Lanjut". */
function nextPendingAfter(item: StandarisasiItem, source: StandarisasiItem[]): StandarisasiItem | null {
  const pending = source.filter((i) => i.status === 'pending');
  if (pending.length < 2) return null;
  const index = pending.findIndex((i) => i.id === item.id);
  return pending[(index + 1) % pending.length] ?? null;
}

function InfoItem({ label, children, bare = false }: { label: string; children: React.ReactNode; bare?: boolean }) {
  return (
    <div className="bg-popover rounded-xl p-3 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {bare ? (
        <div className="mt-1">{children}</div>
      ) : (
        <p className="text-sm text-foreground mt-1 font-medium wrap-break-word">{children}</p>
      )}
    </div>
  );
}

function NpnProductPicker({
  selected,
  onSelect,
  onClear,
}: {
  selected: NpnProduct | null;
  onSelect: (product: NpnProduct) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<NpnProduct[]>([]);
  const [_error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await npn.searchProduct(query);
        setResults(res.data.data);
        setShowDropdown(res.data.data.length > 0);
      } catch (e) {
        setError(getErrorMessage(e, 'Gagal memuat produk NPN.'));
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleClear = () => {
    setSearch('');
    setResults([]);
    setShowDropdown(false);
    onClear();
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-xl border border-border bg-popover px-3 py-2.5">
          <p className="text-sm font-medium text-foreground truncate">
            {selected.szShortDescription || selected.szNickName || selected.szNickNameNew || '-'}
          </p>
          <p className="text-xs font-mono text-gray-400">{selected.BOSnetszProductId || '-'}</p>
        </div>
        <button
          onClick={handleClear}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
          aria-label="Ganti produk"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); doSearch(e.target.value); }}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder="Ketik nama produk / BOS ID..."
        className="input-field text-sm"
        aria-label="Cari produk"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <svg className="animate-spin w-4 h-4 text-primary-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-auto">
          {results.map((product) => (
            <button
              key={product.id}
              onClick={() => { setSearch(''); setResults([]); setShowDropdown(false); onSelect(product); }}
              className="w-full px-3 py-2.5 text-left hover:bg-chip-primary transition-colors border-b border-border last:border-0"
            >
              <p className="text-sm text-foreground truncate">{product.szShortDescription || product.szNickName || product.szNickNameNew || '-'}</p>
              <span className="text-xs font-mono text-gray-400">{product.BOSnetszProductId} · {product.SAPszProductId || '-'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StandarisasiPage() {
  const [items, setItems] = useState<StandarisasiItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [viewItem, setViewItem] = useState<StandarisasiItem | null>(null);
  const [editItem, setEditItem] = useState<StandarisasiItem | null>(null);
  const [editForm, setEditForm] = useState<Partial<StandarisasiItem>>({});
  const [createForm, setCreateForm] = useState<Partial<StandarisasiItem>>({ ...emptyForm });
  const [selectedProduct, setSelectedProduct] = useState<NpnProduct | null>(null);
  const [editProduct, setEditProduct] = useState<NpnProduct | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
   const { hasPermission } = useAuthStore();

const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
   const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
   const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
   const [showSaveConfirm, setShowSaveConfirm] = useState(false);
   const [deleting, setDeleting] = useState(false);

  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });

  // Cermin lastPage agar clamp bisa baca nilai terbaru tanpa jadi dep fetch.
  const lastPageRef = useRef(1);

  const loadItems = useCallback(async (overrides?: { status?: string; page?: number }): Promise<StandarisasiItem[]> => {
    // Clamp sebelum request — jangan setPage di dalam fetch (picu double fetch).
    const requestStatus = overrides?.status ?? statusFilter;
    const requestPageRaw = overrides?.page ?? page;
    const requestPage = Math.min(Math.max(1, requestPageRaw), Math.max(1, lastPageRef.current));
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        standarisasiTumpukan.list({ search, status: requestStatus, page: requestPage, per_page: 20 }),
        standarisasiTumpukan.stats({ search }),
      ]);
      const rows = listRes.data.data as StandarisasiItem[];
      setItems(rows);
      const nextLast = listRes.data.last_page ?? 1;
      setLastPage(nextLast);
      lastPageRef.current = nextLast;
      setTotal(listRes.data.total ?? rows.length);
      if (statsRes.data?.data) setStats(statsRes.data.data);
      return rows;
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat data standarisasi'), 'error');
      return [];
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Koreksi halaman keluar-jarak setelah lastPage diketahui (di luar fetch
  // agar tak memicu double fetch dari dalam callback fetch itu sendiri).
  useEffect(() => {
    if (page > lastPage) setPage(Math.max(1, lastPage));
  }, [page, lastPage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('productId');
    if (pid) {
      const fetchProduct = async () => {
        try {
          const res = await npn.searchProduct(pid);
          const data = res.data.data as NpnProduct[];
          if (data && data.length > 0) {
            const product = data.find((p) => p.BOSnetszProductId === pid) || data[0];
            setSelectedProduct(product);
            setCreateForm(prev => ({ ...prev, npn_id: product.id }));
            setShowCreate(true);
          }
        } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat produk'), 'error');
    }
      };
      fetchProduct();
    }
  }, []);

  const toggleSelectAll = () => {
    const pageIds = items.map((i) => i.id);
    setSelectedIds((prev) => {
      const allOnPage = pageIds.length > 0 && pageIds.every((id) => prev.includes(id));
      return allOnPage ? prev.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...prev, ...pageIds]));
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleDelete = async (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

const confirmDelete = async () => {
     if (deleteTargetId === null) return;
     setDeleting(true);
     try {
       await standarisasiTumpukan.delete(deleteTargetId);
       setShowDeleteConfirm(false);
       setDeleteTargetId(null);
       notifyGlobal('Data standarisasi berhasil dihapus', 'success');
       loadItems();
     } catch (e) {
       notifyGlobal(getErrorMessage(e, 'Error'));
     } finally {
       setDeleting(false);
     }
   };

  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    setDeleting(true);
    try {
      const res = await standarisasiTumpukan.bulkDelete(selectedIds);
      const deleted = res.data?.deleted ?? selectedIds.length;
      const skipped = res.data?.skipped ?? 0;
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      await loadItems();
      notifyGlobal(
        skipped > 0
          ? `${deleted} data terhapus, ${skipped} dilewati (di luar depo Anda).`
          : `${deleted} data terhapus.`,
        'success'
      );
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setDeleting(false);
    }
  };

const handleCreate = async () => {
     if (!createForm.npn_id) {
       notifyGlobal('Pilih produk terlebih dahulu', 'info');
       return;
     }
     setSaving(true);
     try {
       await standarisasiTumpukan.create(createForm);
       setShowCreate(false);
       setCreateForm({ ...emptyForm });
       setSelectedProduct(null);
       notifyGlobal('Standarisasi tumpukan dikirim untuk approve BLC', 'info');
       loadItems();
     } catch (e) {
       notifyGlobal(getErrorMessage(e, 'Error'));
     } finally {
       setSaving(false);
     }
   };

  const handleEdit = (item: StandarisasiItem) => {
    setEditItem(item);
    setEditForm({ ...item });
    setEditProduct(item.npn ?? null);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setShowSaveConfirm(true);
  };

const confirmSaveEdit = async () => {
     if (!editItem) return;
     setSaving(true);
     try {
       const res = await standarisasiTumpukan.update(editItem.id, editForm);
       const requiresReapproval = res.data?.requires_reapproval === true;
       setEditItem(null);
       setEditForm({});
       setEditProduct(null);
       setShowSaveConfirm(false);
       notifyGlobal(
         requiresReapproval
           ? 'Data diperbarui. Approval sebelumnya dibatalkan — item kembali Menunggu dan notifikasi dikirim ulang.'
           : (res.data?.message || 'Data standarisasi berhasil diperbarui'),
         requiresReapproval ? 'info' : 'success'
       );
       loadItems();
     } catch (e) {
       notifyGlobal(getErrorMessage(e, 'Error'));
     } finally {
       setSaving(false);
     }
   };

  const [approveTarget, setApproveTarget] = useState<{ item: StandarisasiItem; status: DecisionStatus } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [notifyingId, setNotifyingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-row-actions]')) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const openDecision = (item: StandarisasiItem, status: DecisionStatus) => {
    setDecisionReason('');
    setApproveTarget({ item, status });
  };

  const closeDecision = () => {
    setApproveTarget(null);
    setDecisionReason('');
  };

  const confirmApprove = async (continueToNext = false) => {
    if (!approveTarget || approving) return;
    // Alasan penolakan wajib diisi di UI (belum dikirim ke backend).
    if (approveTarget.status === 'rejected' && !decisionReason.trim()) return;
    const next = continueToNext ? nextPendingAfter(approveTarget.item, items) : null;
    setApproving(true);
    try {
      if (approveTarget.status === 'approved') {
        await standarisasiTumpukan.approve(approveTarget.item.id);
        notifyGlobal('Standarisasi disetujui. Notifikasi email dikirim ke BLC & Admin Distribusi.', 'success');
      } else {
        await standarisasiTumpukan.reject(approveTarget.item.id);
        notifyGlobal('Standarisasi ditolak. Notifikasi email dikirim ke BLC & Admin Distribusi.', 'info');
      }
      closeDecision();
      // Tutup detail agar tidak menyimpan status lokal yang sudah usang.
      setViewItem(null);
      await loadItems();
      if (next) {
        setApproveTarget({ item: next, status: approveTarget.status });
        setDecisionReason('');
      }
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'), 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleNotify = async (id: number) => {
    if (notifyingId !== null) return;
    setNotifyingId(id);
    try {
      await standarisasiTumpukan.notify(id);
      notifyGlobal('Notifikasi email berhasil dikirim ulang ke BLC & Admin Distribusi.', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengirim notifikasi email'), 'error');
    } finally {
      setNotifyingId(null);
    }
  };

  const handleReviewPending = async () => {
    const rows = await loadItems({ status: 'pending', page: 1 });
    setStatusFilter('pending');
    setPage(1);
    if (rows.length > 0) setViewItem(rows[0]);
    else notifyGlobal('Tidak ada pengajuan yang menunggu keputusan.', 'info');
  };

  const handleImport = async () => {
    if (!importFile) {
      notifyGlobal('Pilih file terlebih dahulu', 'info');
      return;
    }
    setImporting(true);
    try {
      await standarisasiTumpukan.import(importFile);
      setShowImportModal(false);
      setImportFile(null);
      notifyGlobal('Import berhasil', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Import gagal'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await standarisasiTumpukan.export();
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `standarisasi-tumpukan-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Export dimulai', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Export gagal'), 'error');
    }
  };

  const handleTemplate = async () => {
    try {
      const res = await standarisasiTumpukan.template();
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'standarisasi-tumpukan_template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Template diunduh', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Template gagal'), 'error');
    }
  };


  const badge = (status: string) => {
    const meta = STATUS_META[status] || { label: status, badge: 'bg-slate-100 text-foreground border-border', dot: 'bg-slate-400' };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;

  const nextPendingItem = approveTarget ? nextPendingAfter(approveTarget.item, items) : null;



  // Duplikat: produk yang dipilih di form edit sudah punya standarisasi lain (selain item ini)
  const editDuplicate = editItem && editForm.npn_id != null
    ? items.find((i) => i.id !== editItem.id && i.npn_id === editForm.npn_id) ?? null
    : null;

  // Dirty check: Simpan hanya aktif bila ada perubahan (hindari no-op save)
  const isEditDirty = !!editItem && (
    editForm.npn_id !== editItem.npn_id ||
    (editForm.tier ?? 1) !== (editItem.tier ?? 1) ||
    (editForm.tinggi_tumpukan ?? 1) !== (editItem.tinggi_tumpukan ?? 1)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg aria-hidden="true" className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25" />
              </svg>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-fg-muted">Master data</p>
              <h1 className="text-2xl font-bold leading-tight">Standarisasi Tumpukan</h1>
              <p className="text-ink-fg-muted mt-0.5 text-sm">Kelola standarisasi tumpukan produk per depo</p>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        {selectedIds.length > 0 && hasPermission('standarisasi.delete') && (
          <div className="flex items-center justify-between">
            <button onClick={handleBulkDelete} className="btn-danger">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                Hapus ({selectedIds.length})
              </span>
            </button>
          </div>
        )}
        {hasPermission('standarisasi.import') && (
          <button onClick={() => setShowImportModal(true)} className="btn-secondary shrink-0">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Import
            </span>
          </button>
        )}
        {hasPermission('standarisasi.export') && (
          <button onClick={handleExport} className="btn-secondary shrink-0">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 18v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>
              Export
            </span>
          </button>
        )}
        {hasPermission('standarisasi.template') && (
          <button onClick={handleTemplate} className="btn-secondary shrink-0">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Template
            </span>
          </button>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</p>
                <p className="text-xl font-bold text-foreground tabular-nums">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pending</p>
                <p className="text-xl font-bold text-amber-600 tabular-nums">{stats.pending}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Approved</p>
                <p className="text-xl font-bold text-emerald-600 tabular-nums">{stats.approved}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rejected</p>
                <p className="text-xl font-bold text-red-600 tabular-nums">{stats.rejected}</p>
              </div>
            </div>
          </div>
        </div>

        {stats.pending > 0 && hasPermission('standarisasi.approve') && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900">Antrean Approval BLC</p>
                <p className="text-xs text-amber-700">
                  <span className="font-bold tabular-nums">{stats.pending}</span> pengajuan tier tumpukan menunggu keputusan Anda.
                </p>
              </div>
            </div>
            <button onClick={() => void handleReviewPending()} className="btn-primary inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500">
              Tinjau Sekarang
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
        )}


        {/* Table Card */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(v) => { setSearch(v); setPage(1); }}
                  placeholder="Cari produk..."
                  filters={[
                    { key: 'pending', label: 'Menunggu', value: 'pending' },
                    { key: 'approved', label: 'Disetujui', value: 'approved' },
                    { key: 'rejected', label: 'Ditolak', value: 'rejected' },
                  ]}
                  activeFilter={statusFilter}
                  onFilterChange={(f) => { setStatusFilter(f); setPage(1); }}
                  resultCount={items.length}
                  resultLabel="item"
                  totalCount={total}
                  currentFrom={items.length > 0 ? (page - 1) * 20 + 1 : 0}
                  currentTo={(page - 1) * 20 + items.length}
                />
              </div>
              {hasPermission('standarisasi.create') && (
                <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Daftar standarisasi tumpukan</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-popover border-b border-border">
                  <th scope="col" className="table-header w-10">
                    {hasPermission('standarisasi.delete') && (
                      <input
                        type="checkbox"
                        checked={items.length > 0 && items.every((i) => selectedIds.includes(i.id))}
                        onChange={toggleSelectAll}
                        className="rounded border-border text-accent-text focus:ring-primary-500"
                      />
                    )}
                  </th>
                  <th scope="col" className="table-header w-12">No</th>
                  <th scope="col" className="table-header">BOS ID</th>
                  <th scope="col" className="table-header">Produk</th>
                  <th scope="col" className="table-header">Barcode</th>
                  <th scope="col" className="table-header text-center">Tier</th>
                  <th scope="col" className="table-header text-center">Tinggi</th>
                  <th scope="col" className="table-header text-center">Total</th>
                  <th scope="col" className="table-header">Status</th>
                  <th scope="col" className="table-header">Pengaju / Depo</th>
                  <th scope="col" className="table-header sticky right-0 z-20 border-l border-border text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="table-cell"><div className="h-4 w-4 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-8 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                      <td className="table-cell"><div className="h-4 w-28 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-8 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                      <td className="table-cell"><div className="h-4 w-8 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                      <td className="table-cell"><div className="h-5 w-10 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                      <td className="table-cell"><div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                    </tr>
                  ))
                ) : items.map((item, index) => (
                  <tr key={item.id} className={`hover:bg-overlay-50 transition-colors ${selectedIds.includes(item.id) ? 'bg-chip-primary/30' : index % 2 === 0 ? 'bg-card' : 'bg-overlay-30'}`}>
                    <td className="table-cell text-center">
                      {hasPermission('standarisasi.delete') && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-border text-accent-text focus:ring-primary-500"
                        />
                      )}
                    </td>
                    <td className="table-cell text-sm text-muted-foreground text-center">{(page - 1) * 20 + index + 1}</td>
                    <td className="table-cell">
                      <button onClick={() => setViewItem(item)} className="font-mono text-sm font-medium text-foreground hover:text-accent-text hover:underline" title="Lihat detail standarisasi">
                        {item.npn?.BOSnetszProductId || '-'}
                      </button>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-foreground">{item.npn?.szShortDescription || item.npn?.szNickName || item.npn?.szNickNameNew || '-'}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-foreground font-mono">{item.npn?.szBarcode || '-'}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-sm font-semibold text-accent-text">{item.tier ?? '-'}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-sm font-semibold text-amber-600">{item.tinggi_tumpukan ?? '-'}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-chip-primary text-accent-text text-xs font-semibold">{item.total_tier_tinggi ?? '-'}</span>
                    </td>
                    <td className="table-cell">
                      {badge(item.status || 'pending')}
                    </td>
                    <td className="table-cell">
                      <span className="block max-w-[180px] truncate text-sm text-foreground" title={item.requested_by_email || ''}>{item.requested_by_email || '-'}</span>
                      <span className="block text-[11px] font-mono text-slate-400">{item.kode_depo || '-'}</span>
                    </td>
<td className="table-cell sticky right-0 z-10 border-l border-border bg-inherit text-right">
                        <div className="flex items-center justify-end gap-1">
                          {item.status === 'pending' && hasPermission('standarisasi.approve') && (
                            <>
                              <button onClick={() => openDecision(item, 'approved')} className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100" title="Setujui pengajuan standarisasi ini">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                Setujui
                              </button>
                              <button onClick={() => openDecision(item, 'rejected')} className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-100" title="Tolak pengajuan standarisasi ini">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                Tolak
                              </button>
                            </>
                          )}
                          <div className="relative" data-row-actions>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                              className="min-h-11 min-w-11 rounded-lg p-1.5 text-gray-400 transition-all duration-200 hover:bg-popover hover:text-foreground"
                              title="Aksi lainnya"
                              aria-label="Aksi lainnya"
                              aria-expanded={openMenuId === item.id}
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm7.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm7.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
                            </button>
                            {openMenuId === item.id && (
                              <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                                <button onClick={() => { setViewItem(item); setOpenMenuId(null); }} className="flex w-full items-center px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-popover">Lihat Detail</button>
                                {item.status === 'pending' && (
                                  <button onClick={() => { void handleNotify(item.id); setOpenMenuId(null); }} className="flex w-full items-center px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-popover">Kirim ulang notifikasi</button>
                                )}
                                {hasPermission('standarisasi.edit') && (
                                  <button onClick={() => { handleEdit(item); setOpenMenuId(null); }} className="flex w-full items-center px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-popover">Edit</button>
                                )}
                                {hasPermission('standarisasi.delete') && (
                                  <button onClick={() => { handleDelete(item.id); setOpenMenuId(null); }} className="flex w-full items-center px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50">Hapus</button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                     </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={11} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25" />
                          </svg>
                        </div>
                        <p className="text-sm text-muted-foreground font-medium" role="status">Tidak ada data standarisasi</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              Halaman {page} dari {lastPage}
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Halaman sebelumnya">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  Sebelumnya
                </span>
              </button>
              <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Halaman berikutnya">
                <span className="flex items-center gap-2">
                  Selanjutnya
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* View Modal */}
      <Modal
        open={!!viewItem}
        onClose={() => setViewItem(null)}
        title="Detail Standarisasi"
        subtitle="Informasi lengkap standarisasi tumpukan"
        size="lg"
        footer={
          <>
            <button onClick={() => setViewItem(null)} className="btn-secondary">Tutup</button>
            {viewItem?.status === 'pending' && hasPermission('standarisasi.approve') && (
              <>
                <button
                  onClick={() => { if (viewItem) openDecision(viewItem, 'rejected'); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-100"
                >
                  Tolak
                </button>
                <button
                  onClick={() => { if (viewItem) openDecision(viewItem, 'approved'); }}
                  className="btn-primary inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  Setujui
                </button>
              </>
            )}
          </>
        }
      >
        {viewItem && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem label="BOS ID">{fmt(viewItem.npn?.BOSnetszProductId)}</InfoItem>
              <InfoItem label="SAP ID">{fmt(viewItem.npn?.SAPszProductId)}</InfoItem>
              <InfoItem label="Produk">{fmt(viewItem.npn?.szShortDescription || viewItem.npn?.szNickName || viewItem.npn?.szNickNameNew)}</InfoItem>
              <InfoItem label="Barcode">{fmt(viewItem.npn?.szBarcode)}</InfoItem>
              <InfoItem label="Kode Depo">{fmt(viewItem.kode_depo)}</InfoItem>
              <InfoItem label="Nama Depo">{fmt(viewItem.nama_depo)}</InfoItem>
            </div>
            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Perhitungan Tumpukan</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-popover rounded-xl p-4 border border-border text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tier</span>
                  <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{viewItem.tier ?? '-'}</p>
                </div>
                <div className="bg-popover rounded-xl p-4 border border-border text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tinggi</span>
                  <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{viewItem.tinggi_tumpukan ?? '-'}</p>
                </div>
                <div className="bg-chip-primary rounded-xl p-4 border border-chip-primary-border text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">Total</span>
                  <p className="text-2xl font-bold text-accent-text mt-1 tabular-nums">{viewItem.total_tier_tinggi ?? '-'}</p>
                </div>
              </div>
              {viewItem.tier != null && viewItem.tinggi_tumpukan != null && (
                <p className="text-xs text-slate-400 mt-2 text-center">
                  {viewItem.tier} tier × {viewItem.tinggi_tumpukan} tinggi = {viewItem.total_tier_tinggi ?? viewItem.tier * viewItem.tinggi_tumpukan} total tumpukan
                </p>
              )}
            </div>
            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Status & Approval</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem label="Status" bare>{badge(viewItem.status || 'pending')}</InfoItem>
                <InfoItem label="Diajukan Oleh">{fmt(viewItem.requested_by_email)}</InfoItem>
                <InfoItem label="Disetujui Oleh">
                  {viewItem.approved_by_email || (viewItem.status === 'pending' ? <span className="text-slate-400 font-normal">Menunggu approval</span> : '-')}
                </InfoItem>
                <InfoItem label="Tanggal Dibuat">{fmtDate(viewItem.created_at)}</InfoItem>
                <InfoItem label="Tanggal Approval">
                  {viewItem.status === 'pending'
                    ? <span className="text-slate-400 font-normal">Menunggu approval</span>
                    : fmtDate(viewItem.updated_at)}
                </InfoItem>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editItem}
        onClose={() => { setEditItem(null); setEditForm({}); setEditProduct(null); }}
        title="Edit Standarisasi"
        subtitle="Edit data standarisasi tumpukan"
        size="md"
        footer={
          <>
            <button onClick={() => { setEditItem(null); setEditForm({}); setEditProduct(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleSaveEdit} disabled={saving || !editForm.npn_id || !isEditDirty} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed" title={!isEditDirty ? 'Tidak ada perubahan untuk disimpan' : undefined}>
              <span className="flex items-center gap-2">
                {saving ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    Simpan
                  </>
                )}
              </span>
            </button>
          </>
        }
      >
        {editItem && (
          <>
            {editItem.status === 'approved' && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 mb-4" role="alert">
                <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <p className="text-xs text-amber-800">
                  Item ini sudah <span className="font-semibold">Disetujui</span>. Perubahan apa pun akan membatalkan approval dan mengembalikan status ke <span className="font-semibold">Menunggu</span>.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4" onKeyDown={(e) => { if (e.key === 'Enter' && editForm.npn_id && isEditDirty && !saving) { e.preventDefault(); handleSaveEdit(); } }}>
              <div className="col-span-2 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Produk <span className="text-slate-400">(ketik nama atau BOS ID)</span></label>
                {badge(editItem.status || 'pending')}
              </div>
              <div className="col-span-2 -mt-2">
                <NpnProductPicker
                  selected={editProduct}
                  onSelect={(p) => { setEditProduct(p); setEditForm(prev => ({ ...prev, npn_id: p.id })); }}
                  onClear={() => { setEditProduct(null); setEditForm(prev => ({ ...prev, npn_id: undefined })); }}
                />
                {editDuplicate && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 mt-2" role="alert">
                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                    <p className="text-xs text-amber-800">
                      Produk ini sudah memiliki standarisasi ({editDuplicate.tier} tier × {editDuplicate.tinggi_tumpukan} tinggi). Menyimpan akan membuat data kedua untuk produk yang sama.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="edit-tier" className="block text-xs font-medium text-muted-foreground mb-1.5">Tier <span className="text-primary-500">*</span></label>
                <input id="edit-tier" type="number" min="1" max="100" value={editForm.tier || 1} onChange={(e) => setEditForm(prev => ({ ...prev, tier: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))} className="input-field text-sm" />
              </div>
              <div>
                <label htmlFor="edit-tinggi" className="block text-xs font-medium text-muted-foreground mb-1.5">Tinggi Tumpukan <span className="text-primary-500">*</span></label>
                <input id="edit-tinggi" type="number" min="1" max="100" value={editForm.tinggi_tumpukan || 1} onChange={(e) => setEditForm(prev => ({ ...prev, tinggi_tumpukan: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))} className="input-field text-sm" />
              </div>
            </div>
            <div className="bg-popover rounded-xl p-4 mt-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Preview Perhitungan</span>
              <p className="text-sm text-foreground mt-1">
                {editForm.tier || 1} tier x {editForm.tinggi_tumpukan || 1} tinggi = <span className="font-bold text-accent-text">{(editForm.tier || 1) * (editForm.tinggi_tumpukan || 1)}</span> total
              </p>
            </div>
          </>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateForm({ ...emptyForm }); setSelectedProduct(null); }}
        title="Tambah Standarisasi"
        subtitle="Buat standarisasi tumpukan baru"
        size="md"
        footer={
          <>
            <button onClick={() => { setShowCreate(false); setCreateForm({ ...emptyForm }); setSelectedProduct(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleCreate} disabled={saving || !createForm.npn_id} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="flex items-center gap-2">
                {saving ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    Simpan
                  </>
                )}
              </span>
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4" onKeyDown={(e) => { if (e.key === 'Enter' && createForm.npn_id && !saving) { e.preventDefault(); handleCreate(); } }}>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Produk <span className="text-slate-400">(ketik nama atau BOS ID)</span></label>
            <NpnProductPicker
              selected={selectedProduct}
              onSelect={(p) => { setSelectedProduct(p); setCreateForm(prev => ({ ...prev, npn_id: p.id })); }}
              onClear={() => { setSelectedProduct(null); setCreateForm(prev => ({ ...prev, npn_id: undefined })); }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="tier">Tier <span className="text-primary-500">*</span></label>
            <input id="tier" type="number" min="1" max="100" value={createForm.tier || 1} onChange={(e) => setCreateForm(prev => ({ ...prev, tier: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))} className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="tinggi-tumpukan">Tinggi Tumpukan <span className="text-primary-500">*</span></label>
            <input id="tinggi-tumpukan" type="number" min="1" max="100" value={createForm.tinggi_tumpukan || 1} onChange={(e) => setCreateForm(prev => ({ ...prev, tinggi_tumpukan: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))} className="input-field text-sm" />
          </div>
        </div>
        <div className="bg-popover rounded-xl p-4 mt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Preview Perhitungan</span>
          <p className="text-sm text-foreground mt-1">
            {createForm.tier || 1} tier x {createForm.tinggi_tumpukan || 1} tinggi = <span className="font-bold text-accent-text">{(createForm.tier || 1) * (createForm.tinggi_tumpukan || 1)}</span> total
          </p>
        </div>
      </Modal>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
        onConfirm={confirmDelete}
        title="Hapus Item"
        message="Apakah Anda yakin ingin menghapus item ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="danger"
        loading={deleting}
      />
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
        title="Hapus Item Terpilih"
        message={`Apakah Anda yakin ingin menghapus ${selectedIds.length} item yang dipilih? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel={`Hapus ${selectedIds.length} Item`}
        variant="danger"
        loading={deleting}
      />
      <ConfirmDialog
        open={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={confirmSaveEdit}
        title="Simpan Perubahan"
        message={editItem?.status === 'approved'
          ? 'Item ini sudah Disetujui. Menyimpan akan membatalkan approval dan mengembalikan status ke Menunggu. Lanjut?'
          : 'Apakah Anda yakin ingin menyimpan perubahan pada data standarisasi ini?'}
        confirmLabel="Simpan"
        variant="warning"
        loading={saving}
      />
      {/* Modal Keputusan Approval BLC */}
      <Modal
        open={!!approveTarget}
        onClose={() => { if (!approving) closeDecision(); }}
        title={approveTarget?.status === 'approved' ? 'Setujui Standarisasi' : 'Tolak Standarisasi'}
        subtitle="Konfirmasi keputusan BLC atas pengajuan tier tumpukan dari lapangan"
        size="md"
        footer={
          <>
            <button onClick={closeDecision} disabled={approving} className="btn-secondary">Batal</button>
            {approveTarget?.status === 'approved' ? (
              <>
                <button onClick={() => void confirmApprove()} disabled={approving} className="btn-primary min-h-11 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  {approving ? 'Memproses...' : 'Setujui'}
                </button>
                {nextPendingItem && (
                  <button onClick={() => void confirmApprove(true)} disabled={approving} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
                    Setujui & Lanjut
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => void confirmApprove()} disabled={approving || !decisionReason.trim()} className="btn-primary min-h-11 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" title={!decisionReason.trim() ? 'Alasan penolakan wajib diisi' : undefined}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  {approving ? 'Memproses...' : 'Tolak'}
                </button>
                {nextPendingItem && (
                  <button onClick={() => void confirmApprove(true)} disabled={approving || !decisionReason.trim()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                    Tolak & Lanjut
                  </button>
                )}
              </>
            )}
          </>
        }
      >
        {approveTarget && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-2.5 bg-ink-900 px-4 py-3 text-white">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-primary-300">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-300/80">Standarisasi Tumpukan</p>
                  <p className="truncate text-sm font-bold">{fmt(approveTarget.item.npn?.szShortDescription || approveTarget.item.npn?.szNickName || approveTarget.item.npn?.szNickNameNew)}</p>
                </div>
                <span className="ml-auto shrink-0">{badge(approveTarget.item.status)}</span>
              </div>
              <div className="divide-y divide-slate-100 bg-card text-sm">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">BOS ID</span>
                  <span className="font-mono font-semibold text-foreground">{fmt(approveTarget.item.npn?.BOSnetszProductId)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Depo</span>
                  <span className="text-right font-semibold text-foreground">{fmt(approveTarget.item.nama_depo)} <span className="font-mono text-xs text-slate-400">({fmt(approveTarget.item.kode_depo)})</span></span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Diajukan Oleh</span>
                  <span className="text-right font-semibold text-foreground">{fmt(approveTarget.item.requested_by_email)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Perhitungan Tier</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {approveTarget.item.tier} × {approveTarget.item.tinggi_tumpukan} = <span className="text-accent-text">{approveTarget.item.total_tier_tinggi ?? (approveTarget.item.tier ?? 0) * (approveTarget.item.tinggi_tumpukan ?? 0)}</span>
                  </span>
                </div>
              </div>
            </div>

            {nextPendingItem && (
              <p className="text-xs text-slate-400">Masih ada pengajuan lain yang menunggu. Gunakan tombol Lanjut untuk memproses berurutan.</p>
            )}

            {approveTarget.status === 'rejected' ? (
              <div>
                <label htmlFor="standarisasi-reject-reason" className="mb-1.5 block text-xs font-semibold text-foreground">
                  Alasan penolakan <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="standarisasi-reject-reason"
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  rows={4}
                  disabled={approving}
                  placeholder="Jelaskan mengapa pengajuan ditolak agar pengaju lapangan dapat memperbaikinya"
                  className="w-full resize-none rounded-xl border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/60"
                />
                <p className="mt-1.5 text-xs text-slate-400">Wajib diisi untuk melengkapi keputusan penolakan.</p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3" role="status">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                <p className="text-xs text-emerald-800">
                  Setelah disetujui, standarisasi ini langsung dapat dipakai pada <strong>Validasi SJ</strong>. Notifikasi email akan dikirim ke BLC & Admin Distribusi.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={() => { setShowImportModal(false); setImportFile(null); }}
        title="Import Standarisasi"
        subtitle="Upload file Excel/CSV untuk mengimpor data standarisasi"
        size="md"
        footer={
          <>
            <button onClick={() => { setShowImportModal(false); setImportFile(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleImport} disabled={importing || !importFile} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {importing ? 'Mengimpor...' : 'Import'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1" htmlFor="pilih-file">Pilih File</label>
            <input id="pilih-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-chip-primary file:text-accent-text hover:file:bg-chip-primary"
            />
            <p className="text-xs text-slate-400 mt-1">Format: xlsx, xls, csv. Kolom wajib: npn_id, tier, tinggi_tumpukan</p>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
