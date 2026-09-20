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

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Approved', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
};

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
    document.addEventListener('mousedown', handleClickOutside);
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
        console.error(e);
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
        <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-sm font-medium text-gray-900 truncate">
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
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {results.map((product) => (
            <button
              key={product.id}
              onClick={() => { setSearch(''); setResults([]); setShowDropdown(false); onSelect(product); }}
              className="w-full px-3 py-2.5 text-left hover:bg-primary-50 transition-colors border-b border-gray-100 last:border-0"
            >
              <p className="text-sm text-gray-900 truncate">{product.szShortDescription || product.szNickName || product.szNickNameNew || '-'}</p>
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
   const { hasPermission, hasRole } = useAuthStore();

const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
   const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
   const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
   const [showSaveConfirm, setShowSaveConfirm] = useState(false);
   const [deleting, setDeleting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await standarisasiTumpukan.list({ search, status: statusFilter, page, per_page: 20 });
      setItems(res.data.data);
      setLastPage(res.data.last_page);
      setTotal(res.data.total ?? res.data.data.length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

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
          console.error(e);
        }
      };
      fetchProduct();
    }
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(i => i.id));
    }
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
      const results = await Promise.allSettled(selectedIds.map(id => standarisasiTumpukan.delete(id)));
      const failed = results.filter(r => r.status === 'rejected').length;
      const succeeded = selectedIds.filter((_, i) => results[i].status === 'fulfilled');
      setSelectedIds(selectedIds.filter((_, i) => results[i].status === 'rejected'));
      setShowBulkDeleteConfirm(false);
      await loadItems();
      if (failed > 0) {
        notifyGlobal(`${succeeded.length} data terhapus, ${failed} gagal. Silakan coba lagi untuk yang gagal.`);
      }
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
       notifyGlobal('Standarisasi tumpukan dikirim untuk approv BLC', 'info');
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
       await standarisasiTumpukan.update(editItem.id, editForm);
       setEditItem(null);
       setEditForm({});
       setEditProduct(null);
       setShowSaveConfirm(false);
       notifyGlobal('Data standarisasi berhasil diperbarui', 'success');
       loadItems();
     } catch (e) {
       notifyGlobal(getErrorMessage(e, 'Error'));
     } finally {
       setSaving(false);
     }
   };

  const [approveTarget, setApproveTarget] = useState<{ item: StandarisasiItem; status: 'approved' | 'rejected' } | null>(null);
  const [approving, setApproving] = useState(false);

const confirmApprove = async () => {
     if (!approveTarget || approving) return;
     setApproving(true);
     try {
       if (approveTarget.status === 'approved') {
         await standarisasiTumpukan.approve(approveTarget.item.id);
         notifyGlobal('Standarisasi disetujui. Notifikasi email dikirim ke BLC & Admin Distribusi.', 'success');
       } else {
         await standarisasiTumpukan.reject(approveTarget.item.id);
         notifyGlobal('Standarisasi ditolak. Notifikasi email dikirim ke BLC & Admin Distribusi.', 'info');
       }
       setApproveTarget(null);
       await loadItems();
     } catch (e) {
       notifyGlobal(getErrorMessage(e, 'Error'));
     } finally {
       setApproving(false);
     }
   };

  const badge = (status: string) => {
    const meta = STATUS_META[status] || { label: status, badge: 'bg-gray-50 text-gray-600 ring-gray-200', dot: 'bg-gray-400' };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;

  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg aria-hidden="true" className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25" />
              </svg>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Master data</p>
              <h1 className="text-2xl font-bold leading-tight">Standarisasi Tumpukan</h1>
              <p className="text-gray-400 mt-0.5 text-sm">Kelola standarisasi tumpukan produk per depo</p>
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

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</p>
                <p className="text-xl font-bold text-slate-800 tabular-nums">{total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pending</p>
                <p className="text-xl font-bold text-amber-600 tabular-nums">{pendingCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Approved</p>
                <p className="text-xl font-bold text-emerald-600 tabular-nums">{items.filter(i => i.status === 'approved').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rejected</p>
                <p className="text-xl font-bold text-red-600 tabular-nums">{items.filter(i => i.status === 'rejected').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(v) => { setSearch(v); setPage(1); }}
                  placeholder="Cari produk..."
                  filters={[
                    { key: 'pending', label: 'Pending', value: 'pending' },
                    { key: 'approved', label: 'Approved', value: 'approved' },
                    { key: 'rejected', label: 'Rejected', value: 'rejected' },
                  ]}
                  activeFilter={statusFilter}
                  onFilterChange={(f) => { setStatusFilter(f); setPage(1); }}
                  resultCount={items.length}
                  resultLabel="item"
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

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Daftar standarisasi tumpukan</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th scope="col" className="table-header w-10">
                    {hasPermission('standarisasi.delete') && (
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
                  <th scope="col" className="table-header">Request By</th>
                  <th scope="col" className="table-header text-right">Aksi</th>
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
                  <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.includes(item.id) ? 'bg-primary-50/30' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="table-cell text-center">
                      {hasPermission('standarisasi.delete') && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      )}
                    </td>
                    <td className="table-cell text-sm text-slate-500 text-center">{(page - 1) * 20 + index + 1}</td>
                    <td className="table-cell">
                      <span className="font-mono text-sm font-medium text-slate-800">{item.npn?.BOSnetszProductId || '-'}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-slate-600">{item.npn?.szShortDescription || item.npn?.szNickName || item.npn?.szNickNameNew || '-'}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-slate-600 font-mono">{item.npn?.szBarcode || '-'}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-sm font-semibold text-primary-600">{item.tier ?? '-'}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-sm font-semibold text-amber-600">{item.tinggi_tumpukan ?? '-'}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-primary-50 text-primary-700 text-xs font-semibold">{item.total_tier_tinggi ?? '-'}</span>
                    </td>
                    <td className="table-cell">
                      {badge(item.status || 'pending')}
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-slate-600">{item.requested_by_email || '-'}</span>
                    </td>
<td className="table-cell text-right">
                       <div className="flex items-center justify-end gap-1">
                         {item.status === 'pending' && hasRole('blc') && (
                           <>
                             <button onClick={() => setApproveTarget({ item, status: 'approved' })} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all duration-200" title="Approve" aria-label="Approve">
                               <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                             </button>
                             <button onClick={() => setApproveTarget({ item, status: 'rejected' })} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200" title="Reject" aria-label="Reject">
                               <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                           </>
                         )}
                         {item.status === 'pending' && (
                           <button className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-all duration-200" title="Notifikasi Email akan dikirim ke BLC & Admin Distribusi berdasarkan role dan depo" aria-label="Email notification">
                             <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-3.622 2.707-5.225V6.741c0-1.602-1.336-2.994-2.907-3.227A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 3 5.14 3 6.741v6.018z" /></svg>
                           </button>
                         )}
                         <button onClick={() => setViewItem(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200" title="Lihat Detail" aria-label="Lihat Detail">
                           <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                         </button>
                         {hasPermission('standarisasi.edit') && (
                           <button onClick={() => handleEdit(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200" title="Edit" aria-label="Edit">
                             <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                           </button>
                         )}
                         {hasPermission('standarisasi.delete') && (
                           <button onClick={() => handleDelete(item.id)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200" title="Hapus" aria-label="Hapus">
                             <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                           </button>
                         )}
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
                        <p className="text-sm text-slate-500 font-medium" role="status">Tidak ada data standarisasi</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 tabular-nums">
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
        footer={<button onClick={() => setViewItem(null)} className="btn-secondary">Tutup</button>}
      >
        {viewItem && (
          <>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['BOS ID', viewItem.npn?.BOSnetszProductId],
                ['SAP ID', viewItem.npn?.SAPszProductId],
                ['Produk', viewItem.npn?.szShortDescription || viewItem.npn?.szNickName || viewItem.npn?.szNickNameNew],
                ['Barcode', viewItem.npn?.szBarcode],
                ['Kode Depo', viewItem.kode_depo],
                ['Nama Depo', viewItem.nama_depo],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-slate-50 rounded-xl p-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label as string}</span>
                  <p className="text-sm text-slate-800 mt-1 font-medium">{fmt(value)}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Perhitungan Tumpukan</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-primary-50 rounded-xl p-4 border border-primary-100 text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">Tier</span>
                  <p className="text-2xl font-bold text-primary-700 mt-1">{viewItem.tier ?? '-'}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">Tinggi</span>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{viewItem.tinggi_tumpukan ?? '-'}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">Total</span>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{viewItem.total_tier_tinggi ?? '-'}</p>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Status & Approval</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</span>
                  <p className="mt-1.5">{badge(viewItem.status || 'pending')}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Requested By</span>
                  <p className="text-sm text-slate-800 mt-1 font-medium">{viewItem.requested_by_email || '-'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Approved By</span>
                  <p className="text-sm text-slate-800 mt-1 font-medium">{viewItem.approved_by_email || '-'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tanggal</span>
                  <p className="text-sm text-slate-800 mt-1 font-medium">{viewItem.created_at ? new Date(viewItem.created_at).toLocaleDateString('id-ID') : '-'}</p>
                </div>
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
            <button onClick={handleSaveEdit} disabled={saving} className="btn-primary disabled:opacity-50">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Produk</label>
                <NpnProductPicker
                  selected={editProduct}
                  onSelect={(p) => { setEditProduct(p); setEditForm(prev => ({ ...prev, npn_id: p.id })); }}
                  onClear={() => { setEditProduct(null); setEditForm(prev => ({ ...prev, npn_id: undefined })); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Tier</label>
                <input type="number" min="1" value={editForm.tier || 1} onChange={(e) => setEditForm(prev => ({ ...prev, tier: parseInt(e.target.value) || 1 }))} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Tinggi Tumpukan</label>
                <input type="number" min="1" value={editForm.tinggi_tumpukan || 1} onChange={(e) => setEditForm(prev => ({ ...prev, tinggi_tumpukan: parseInt(e.target.value) || 1 }))} className="input-field text-sm" />
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 mt-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Preview Perhitungan</span>
              <p className="text-sm text-slate-800 mt-1">
                {editForm.tier || 1} tier x {editForm.tinggi_tumpukan || 1} tinggi = <span className="font-bold text-primary-600">{(editForm.tier || 1) * (editForm.tinggi_tumpukan || 1)}</span> total
              </p>
              <p className="text-xs text-slate-400 mt-2">Status hanya dapat diubah melalui tombol Approve/Reject oleh BLC.</p>
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
            <button onClick={handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">
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
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Produk</label>
            <NpnProductPicker
              selected={selectedProduct}
              onSelect={(p) => { setSelectedProduct(p); setCreateForm(prev => ({ ...prev, npn_id: p.id })); }}
              onClear={() => { setSelectedProduct(null); setCreateForm(prev => ({ ...prev, npn_id: undefined })); }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tier</label>
            <input type="number" min="1" value={createForm.tier || 1} onChange={(e) => setCreateForm(prev => ({ ...prev, tier: parseInt(e.target.value) || 1 }))} className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tinggi Tumpukan</label>
            <input type="number" min="1" value={createForm.tinggi_tumpukan || 1} onChange={(e) => setCreateForm(prev => ({ ...prev, tinggi_tumpukan: parseInt(e.target.value) || 1 }))} className="input-field text-sm" />
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 mt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Preview Perhitungan</span>
          <p className="text-sm text-slate-800 mt-1">
            {createForm.tier || 1} tier x {createForm.tinggi_tumpukan || 1} tinggi = <span className="font-bold text-primary-600">{(createForm.tier || 1) * (createForm.tinggi_tumpukan || 1)}</span> total
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
        message="Apakah Anda yakin ingin menyimpan perubahan pada data standarisasi ini?"
        confirmLabel="Simpan"
        variant="warning"
        loading={saving}
      />
      <ConfirmDialog
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={confirmApprove}
        title={approveTarget?.status === 'approved' ? 'Setujui Standarisasi' : 'Tolak Standarisasi'}
        message={approveTarget?.status === 'approved' ? 'Yakin ingin menyetujui standarisasi ini?' : 'Yakin ingin menolak standarisasi ini?'}
        confirmLabel={approveTarget?.status === 'approved' ? 'Setujui' : 'Tolak'}
        variant={approveTarget?.status === 'approved' ? 'info' : 'danger'}
        loading={approving}
      />
    </DashboardLayout>
  );
}
