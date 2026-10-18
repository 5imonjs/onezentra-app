'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { npn, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';

interface NpnItem {
  id: number;
  kode_depo: string;
  nama_depo: string;
  szNickName: string;
  szNickNameNew: string;
  BOSnetszProductId: string;
  SAPszProductId: string;
  szShortDescription: string;
  szLongDescription: string;
  szCategory_1: string;
  szCat1Description: string;
  szCategory_2: string;
  szCat2Description: string;
  szCategory_3: string;
  szCat3Description: string;
  szCategory_4: string;
  szCat4Description: string;
  szCategory_5: string;
  szCat5Description: string;
  szCategory_6: string;
  szCat6Description: string;
  szCategory_7: string;
  szCat7Description: string;
  szCategory_8: string;
  szCat8Description: string;
  szCategory_9: string;
  szCat9Description: string;
  szCategory_10: string;
  szCat10Description: string;
  szCompUomId: string;
  szCompUomDesc: string;
  BOSnetszUomId: string;
  BOSnetdecUom: string;
  SAPszUomId: string;
  SAPdecUom: string;
  decUomConversion1: number;
  decUomConversion2: number;
  decWeight: number;
  decLength: number;
  decWidth: number;
  decHeight: number;
  decVolume: number;
  decStoreTemp: string;
  szBarcode: string;
  szBarcodeSekunder: string;
  szBarcodeTersier: string;
  szStatus: string;
  dtmValidEnd: string;
  SAPszSalesOrgId: string;
  szTaxTypeId: string;
  decRate: number;
  created_at: string;
  updated_at: string;
}

export default function NpnPage() {
  const [items, setItems] = useState<NpnItem[]>([]);
  const [_error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortKey, setSortKey] = useState<string>('szNickName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ message: string; ok?: boolean; imported?: number; updated?: number; errors?: { row: number; errors: string[] }[] } | null>(null);

  useEffect(() => {
    if (importResult?.ok === true) {
      const timer = setTimeout(() => {
        setShowImport(false);
        setImportResult(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [importResult]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const [viewItem, setViewItem] = useState<NpnItem | null>(null);
  const [editItem, setEditItem] = useState<NpnItem | null>(null);
  const [editForm, setEditForm] = useState<Partial<NpnItem>>({});
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Anti race: respons basi dibuang.
  const reqIdRef = useRef(0);
  const { hasPermission } = useAuthStore();

  const loadItems = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    try {
      const params: Record<string, string | number> = { search, page, per_page: 20, sort: sortKey, direction: sortDir };
      if (statusFilter) params.szStatus = statusFilter;
      const res = await npn.list(params);
      if (reqIdRef.current !== reqId) return;
      const data = res.data;
      setItems(data.data);
      setLastPage(data.last_page);
      if (page > data.last_page) setPage(data.last_page);
      setTotalCount(data.total);
    } catch (e: unknown) {
      if (reqIdRef.current !== reqId) return;
      setError(getErrorMessage(e, 'Gagal memuat data NPN.'));
    }
  }, [search, page, statusFilter, sortKey, sortDir]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

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

  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    try {
      await npn.bulkDelete(selectedIds);
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId || deleting) return;
    setDeleting(true);
    try {
      await npn.delete(deleteTargetId);
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (item: NpnItem) => {
    setEditItem(item);
    setEditForm({ ...item });
  };

  const handleSaveEdit = async () => {
    setShowSaveConfirm(true);
  };

  const confirmSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await npn.update(editItem.id, editForm);
      setEditItem(null);
      setEditForm({});
      setShowSaveConfirm(false);
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pickFile = (file: File | null) => {
    if (file && file.size > MAX_IMPORT_BYTES) {
      notifyGlobal(`Ukuran file ${formatFileSize(file.size)} melebihi batas 10 MB`);
      return;
    }
    setSelectedFile(file);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await npn.import(selectedFile);
      const data = res.data;
      setSelectedFile(null);
      loadItems();
      // Tampilkan rincian di modal (konsisten dengan jalur error), bukan toast.
      setImportResult({
        message: data.message || 'Import completed',
        ok: true,
        ...(typeof data.imported === 'number' ? { imported: data.imported, updated: data.updated } : {}),
      });
    } catch (e) {
      setImportResult({ message: getErrorMessage(e, 'Import failed'), ok: false });
    } finally {
      setImporting(false);
    }
  };

  const downloadBlob = (data: BlobPart, filename: string) => {
    const url = window.URL.createObjectURL(new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await npn.export({ search, szStatus: statusFilter || undefined, sort: sortKey, direction: sortDir });
      downloadBlob(res.data, `npn_products_${todayLocal()}.xlsx`);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Export gagal'));
    } finally {
      setExporting(false);
    }
  };

  const handleTemplate = async () => {
    if (templateLoading) return;
    setTemplateLoading(true);
    try {
      const res = await npn.template();
      downloadBlob(res.data, 'npn_template.xlsx');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengunduh template'));
    } finally {
      setTemplateLoading(false);
    }
  };

  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;

  const statusColor = (status: string): string => {
    switch (status) {
      case 'A': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'DEL': return 'bg-red-50 text-red-700 border-red-200';
      case 'EXISTING': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-surface-raised text-gray-700 border-gray-300';
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <span aria-hidden="true" className="sort-arrow text-gray-400">↕</span>;
    return <span aria-hidden="true" className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const sortHeaderProps = (column: string) => ({
    onClick: () => handleSort(column),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSort(column);
      }
    },
    tabIndex: 0,
    'aria-sort': (sortKey === column ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') as 'ascending' | 'descending' | 'none',
    title: `Urutkan berdasarkan ${column}`,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">NPN Products</h1>
                <p className="text-ink-fg-muted mt-0.5">Kelola data produk NPN</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(v) => { setSearch(v); setPage(1); }}
                  placeholder="Cari produk..."
                  filters={[
                    { key: 'A', label: 'Active', value: 'A' },
                    { key: 'DEL', label: 'Deleted', value: 'DEL' },
                    { key: 'EXISTING', label: 'Existing', value: 'EXISTING' },
                  ]}
                  activeFilter={statusFilter}
                  onFilterChange={(f) => { setStatusFilter(f); setPage(1); }}
                  resultCount={items.length}
                  resultLabel="produk"
                  totalCount={totalCount}
                  currentFrom={items.length > 0 ? (page - 1) * 20 + 1 : 0}
                  currentTo={(page - 1) * 20 + items.length}
                />
              </div>
              <div className="flex items-center gap-2">
                {hasPermission('npn.view') && (
                <button onClick={handleTemplate} disabled={templateLoading} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="flex items-center gap-2">
                    {templateLoading ? (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    )}
                    Template
                  </span>
                </button>
                )}
                {hasPermission('npn.view') && (
                <button onClick={handleExport} disabled={exporting} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="flex items-center gap-2">
                    {exporting ? (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    )}
                    Export
                  </span>
                </button>
                )}
                {hasPermission('npn.create') && (
                  <button onClick={() => setShowImport(true)} className="btn-primary">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                      Import
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <caption className="sr-only">Daftar produk NPN</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-raised">
                  {hasPermission('npn.delete') && (
                    <th scope="col" className="w-10 px-5 py-3 text-left align-middle">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && items.every((i) => selectedIds.includes(i.id))}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-accent-text focus:ring-primary-500"
                      />
                    </th>
                  )}
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">No</th>
                  <th scope="col" className={`whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer`} {...sortHeaderProps('szNickName')}>
                    Nickname <SortIcon column="szNickName" />
                  </th>
                  <th scope="col" className={`whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer`} {...sortHeaderProps('szNickNameNew')}>
                    Nickname New <SortIcon column="szNickNameNew" />
                  </th>
                  <th scope="col" className={`whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer`} {...sortHeaderProps('BOSnetszProductId')}>
                    BOS ID <SortIcon column="BOSnetszProductId" />
                  </th>
                  <th scope="col" className={`whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer`} {...sortHeaderProps('SAPszProductId')}>
                    SAP ID <SortIcon column="SAPszProductId" />
                  </th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Description</th>
                  <th scope="col" className={`whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer`} {...sortHeaderProps('szBarcode')}>
                    Barcode <SortIcon column="szBarcode" />
                  </th>
                  <th scope="col" className={`whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer`} {...sortHeaderProps('szStatus')}>
                    Status <SortIcon column="szStatus" />
                  </th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={`transition-colors even:bg-overlay-30 hover:bg-overlay-70 ${selectedIds.includes(item.id) ? 'bg-chip-primary/50' : ''}`}>
                    {hasPermission('npn.delete') && (
                      <td className="px-5 py-3 text-center text-sm align-middle">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-gray-300 text-accent-text focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="px-5 py-3 text-center text-sm text-gray-500">{(page - 1) * 20 + index + 1}</td>
                    <td className="px-5 py-3 text-sm"><div className="font-medium text-gray-900">{item.szNickName || '-'}</div></td>
                    <td className="px-5 py-3 text-sm text-gray-600">{item.szNickNameNew || '-'}</td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-600">{item.BOSnetszProductId || '-'}</td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-600">{item.SAPszProductId || '-'}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{item.szShortDescription || '-'}</td>
                    <td className="px-5 py-3 text-sm">{item.szBarcode ? <span className="font-mono text-gray-600">{item.szBarcode}</span> : <span className="text-gray-400 italic">Belum diisi</span>}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusColor(item.szStatus)}`}>{item.szStatus || '-'}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewItem(item)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all duration-200" title="Lihat Detail" aria-label="Lihat Detail">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                        {hasPermission('npn.edit') && (
                          <button onClick={() => handleEdit(item)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-all duration-200" title="Edit" aria-label="Edit">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </button>
                        )}
                        {hasPermission('npn.delete') && (
                          <button onClick={() => handleDelete(item.id)} disabled={deleting} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed" title="Hapus" aria-label="Hapus">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center">
                      <div className="flex flex-col items-center gap-3" role="status">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                          <svg className="h-8 w-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        </div>
                        <p className="text-sm font-medium text-slate-500">Tidak ada data produk</p>
                        <p className="text-xs text-slate-400">Cari atau import produk untuk memulai.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2 p-3">
            {items.map(item => (
              <div key={item.id} className="bg-surface-raised rounded-xl p-4 border border-slate-100">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{item.szNickName || '-'}</p>
                    <p className="text-xs text-gray-500">{item.szNickNameNew || '-'}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusColor(item.szStatus)}`}>{item.szStatus || '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <p className="text-slate-500">BOS: <span className="font-mono text-slate-700">{item.BOSnetszProductId || '-'}</span></p>
                  <p className="text-slate-500">SAP: <span className="font-mono text-slate-700">{item.SAPszProductId || '-'}</span></p>
                  <p className="text-slate-500 col-span-2">Barcode: <span className="font-mono text-slate-700">{item.szBarcode || 'Belum diisi'}</span></p>
                </div>
                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-100">
                  <button onClick={() => setViewItem(item)} className="min-h-9 px-2 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors" aria-label="Lihat Detail">Lihat</button>
                  {hasPermission('npn.edit') && <button onClick={() => handleEdit(item)} className="min-h-9 px-2 text-xs text-amber-600 hover:bg-amber-50 rounded transition-colors" aria-label="Edit">Edit</button>}
                  {hasPermission('npn.delete') && <button onClick={() => handleDelete(item.id)} disabled={deleting} className="min-h-9 px-2 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Hapus">Hapus</button>}
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                </div>
                <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 bg-overlay-50 px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium order-2 sm:order-1">
              Halaman {page} dari {lastPage}
            </span>
            <div className="flex items-center gap-2 order-1 sm:order-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="min-h-11 px-3 text-sm font-medium rounded-lg border border-slate-300 bg-surface-card text-slate-600 hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed transition-colors" aria-label="Halaman sebelumnya">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  Sebelumnya
                </span>
              </button>
              <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="min-h-11 px-3 text-sm font-medium rounded-lg border border-slate-300 bg-surface-card text-slate-600 hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed transition-colors" aria-label="Halaman berikutnya">
                <span className="flex items-center gap-1.5">
                  Selanjutnya
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating bulk-action bar */}
      {selectedIds.length > 0 && hasPermission('npn.delete') && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-ink-900 text-white pl-5 pr-3 py-2.5 rounded-2xl shadow-2xl border border-white/10 animate-fade-in">
          <span className="text-sm font-medium whitespace-nowrap">{selectedIds.length} produk terpilih</span>
          <span aria-hidden="true" className="w-px h-6 bg-white/20" />
          <button onClick={() => setSelectedIds([])} className="min-h-11 px-4 text-sm font-medium text-ink-fg hover:text-white hover:bg-white/10 rounded-xl transition-colors">
            Batal
          </button>
          <button onClick={handleBulkDelete} className="min-h-11 px-4 text-sm font-medium bg-red-600 hover:bg-red-500 rounded-xl transition-colors">
            Hapus
          </button>
        </div>
      )}

      {/* View Modal */}
      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail NPN" subtitle="Informasi lengkap produk NPN" size="xl"
        footer={<button onClick={() => setViewItem(null)} className="btn-secondary">Tutup</button>}
      >
        {viewItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['BOSnetszProductId', viewItem.BOSnetszProductId],
                ['SAPszProductId', viewItem.SAPszProductId],
                ['szNickName', viewItem.szNickName],
                ['szNickNameNew', viewItem.szNickNameNew],
                ['szShortDescription', viewItem.szShortDescription],
                ['szLongDescription', viewItem.szLongDescription],
                ['szBarcode', viewItem.szBarcode],
                ['szBarcodeSekunder', viewItem.szBarcodeSekunder],
                ['szBarcodeTersier', viewItem.szBarcodeTersier],
                ['szStatus', viewItem.szStatus],
                ['szCompUomId', viewItem.szCompUomId],
                ['szCompUomDesc', viewItem.szCompUomDesc],
                ['BOSnetszUomId', viewItem.BOSnetszUomId],
                ['BOSnetdecUom', viewItem.BOSnetdecUom],
                ['SAPszUomId', viewItem.SAPszUomId],
                ['SAPdecUom', viewItem.SAPdecUom],
                ['decWeight', viewItem.decWeight],
                ['decLength', viewItem.decLength],
                ['decWidth', viewItem.decWidth],
                ['decHeight', viewItem.decHeight],
                ['decVolume', viewItem.decVolume],
                ['decStoreTemp', viewItem.decStoreTemp],
                ['dtmValidEnd', viewItem.dtmValidEnd],
                ['SAPszSalesOrgId', viewItem.SAPszSalesOrgId],
                ['szTaxTypeId', viewItem.szTaxTypeId],
                ['decRate', viewItem.decRate],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-surface-raised rounded-xl p-3">
                  <span className="text-xs font-medium text-gray-400 uppercase">{label as string}</span>
                  <p className="text-sm text-gray-900 mt-1 font-medium">{fmt(value)}</p>
                </div>
              ))}
            </div>
            {(viewItem.szCategory_1 || viewItem.szCat1Description) && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Kategori</h3>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 10 }, (_, i) => {
                    const cat = viewItem[`szCategory_${i + 1}` as keyof NpnItem] as string;
                    const desc = viewItem[`szCat${i + 1}Description` as keyof NpnItem] as string;
                    if (!cat && !desc) return null;
                    return (
                      <div key={i} className="bg-chip-primary rounded-xl p-3 border border-chip-primary-border">
                        <span className="text-xs font-mono text-accent-text">{cat}</span>
                        <p className="text-xs text-gray-600 truncate mt-1">{desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => { setEditItem(null); setEditForm({}); }} title="Edit NPN" subtitle="Edit data produk NPN" size="xl"
        footer={
          <>
            <button onClick={() => { setEditItem(null); setEditForm({}); }} className="btn-secondary">Batal</button>
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['BOSnetszProductId', 'BOSnetszProductId'],
                ['SAPszProductId', 'SAPszProductId'],
                ['szNickName', 'szNickName'],
                ['szNickNameNew', 'szNickNameNew'],
                ['szShortDescription', 'szShortDescription', true],
                ['szLongDescription', 'szLongDescription', true],
                ['szBarcode', 'szBarcode'],
                ['szBarcodeSekunder', 'szBarcodeSekunder'],
                ['szBarcodeTersier', 'szBarcodeTersier'],
                ['szStatus', 'szStatus'],
                ['decWeight', 'decWeight', false, 'number'],
                ['decLength', 'decLength', false, 'number'],
                ['decWidth', 'decWidth', false, 'number'],
                ['decHeight', 'decHeight', false, 'number'],
                ['decVolume', 'decVolume', false, 'number'],
                ['decStoreTemp', 'decStoreTemp'],
                ['dtmValidEnd', 'dtmValidEnd', false, 'date'],
                ['SAPszSalesOrgId', 'SAPszSalesOrgId'],
                ['szTaxTypeId', 'szTaxTypeId'],
                ['decRate', 'decRate', false, 'number'],
              ].map(([label, key, full, type]) => (
                <div key={key as string} className={full ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor={`field-${key}`}>{label as string}</label>
                  <input id={`field-${key}`}
                    type={(type as string) || 'text'}
                    value={(editForm[key as keyof NpnItem] as string | number) ?? ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, [key as string]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                    className="input-field"
                  />
                </div>
              ))}
            </div>
            {(editForm.szCategory_1 || editForm.szCat1Description) && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Kategori</h3>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 10 }, (_, i) => {
                    const catKey = `szCategory_${i + 1}`;
                    const descKey = `szCat${i + 1}Description`;
                    return (
                      <div key={i} className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cat">Cat {i + 1}</label>
                          <input id="cat" value={(editForm[catKey as keyof NpnItem] as string) ?? ''} onChange={(e) => setEditForm(prev => ({ ...prev, [catKey]: e.target.value }))} className="input-field text-xs" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="desc">Desc {i + 1}</label>
                          <input id="desc" value={(editForm[descKey as keyof NpnItem] as string) ?? ''} onChange={(e) => setEditForm(prev => ({ ...prev, [descKey]: e.target.value }))} className="input-field text-xs" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportResult(null); setSelectedFile(null); }} title="Import NPN" subtitle="Upload file Excel untuk import data" size="md"
        footer={
          <>
            <button onClick={() => { setShowImport(false); setImportResult(null); setSelectedFile(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleImport} disabled={!selectedFile || importing} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="flex items-center gap-2">
                {importing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Importing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Import Sekarang
                  </>
                )}
              </span>
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">File Excel</label>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${isDragging ? 'border-primary-400 bg-chip-primary' : selectedFile ? 'border-primary-300 bg-chip-primary/30' : 'border-gray-300 hover:border-primary-300 hover:bg-surface-raised'}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files[0] || null); }}
              role="button"
              aria-label="Pilih file Excel untuk import"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { pickFile(e.target.files?.[0] || null); e.target.value = ''; }} className="hidden" />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-chip-primary flex items-center justify-center">
                    <svg className="w-7 h-7 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500 mt-1">({formatFileSize(selectedFile.size)}) • Klik atau taruh file untuk ganti</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors min-h-11 px-4"
                    aria-label="Hapus file terpilih"
                  >
                    Hapus file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <svg className="w-7 h-7 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Klik untuk pilih file atau taruh file di sini</p>
                    <p className="text-xs text-gray-400 mt-1">Mendukung .xlsx, .xls, .csv (maks 10 MB)</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {importResult && (
            <div className={`p-4 rounded-xl animate-fade-in ${importResult.ok !== false ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${importResult.ok !== false ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {importResult.ok !== false ? (
                    <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${importResult.ok !== false ? 'text-emerald-700' : 'text-red-700'}`}>{importResult.message}</p>
                  {importResult.imported !== undefined && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="badge badge-success">Imported: {importResult.imported}</span>
                      <span className="badge badge-info">Updated: {importResult.updated}</span>
                    </div>
                  )}
                  {importResult.errors && (
                    <div className="mt-2 text-sm text-red-600 space-y-1">
                      {importResult.errors.slice(0, 5).map((err, i) => <p key={i}>Row {err.row}: {err.errors?.join(', ')}</p>)}
                      {importResult.errors.length > 5 && <p className="text-red-500">...and {importResult.errors.length - 5} more errors</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => { if (deleting) return; setShowDeleteConfirm(false); setDeleteTargetId(null); }}
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
        confirmLabel="Hapus Semua"
        variant="danger"
      />
      <ConfirmDialog
        open={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={confirmSaveEdit}
        title="Simpan Perubahan"
        message="Apakah Anda yakin ingin menyimpan perubahan pada data NPN?"
        confirmLabel="Simpan"
        variant="warning"
        loading={saving}
      />
    </DashboardLayout>
  );
}
