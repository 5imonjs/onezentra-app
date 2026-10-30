'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { clusterPrincipal, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';

interface ClusterPrincipalRow {
  id: number;
  lob: string | null;
  product_category: string | null;
  sub_product_category: string | null;
  product_group: string | null;
  product_class: string | null;
  product_sku: string;
  principal_1: string | null;
  principal_2: string | null;
  created_at: string;
  updated_at: string;
}

type FormState = Record<string, string>;

const EMPTY_FORM: FormState = {
  lob: '',
  product_category: '',
  sub_product_category: '',
  product_group: '',
  product_class: '',
  product_sku: '',
  principal_1: '',
  principal_2: '',
};

/**
 * Kolom tabel, urut dariumbrelda yang dipakai. `sort` adalah nama kolom DB.
 */
const COLUMNS: { key: keyof ClusterPrincipalRow; label: string; sort: string }[] = [
  { key: 'lob', label: 'LOB', sort: 'lob' },
  { key: 'product_category', label: 'Product Category', sort: 'product_category' },
  { key: 'sub_product_category', label: 'Sub Product Category', sort: 'sub_product_category' },
  { key: 'product_group', label: 'Product Group', sort: 'product_group' },
  { key: 'product_class', label: 'Product Class', sort: 'product_class' },
  { key: 'product_sku', label: 'Product SKU', sort: 'product_sku' },
  { key: 'principal_1', label: 'Principal 1', sort: 'principal_1' },
  { key: 'principal_2', label: 'Principal 2', sort: 'principal_2' },
];

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export default function ClusterPrincipalPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<ClusterPrincipalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lobFilter, setLobFilter] = useState('');
  const [principalFilter, setPrincipalFilter] = useState('');
  const [options, setOptions] = useState<{ lob: string[]; principal: string[] }>({ lob: [], principal: [] });
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortKey, setSortKey] = useState('product_sku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<{ message: string; ok: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editItem, setEditItem] = useState<ClusterPrincipalRow | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        search: debouncedSearch,
        page,
        per_page: 20,
        sort: sortKey,
        direction: sortDir,
      };
      if (lobFilter) params.lob = lobFilter;
      if (principalFilter) params.principal = principalFilter;

      const res = await clusterPrincipal.list(params);
      const data = res.data;
      setItems(data.data);
      setLastPage(data.last_page);
      if (page > data.last_page) setPage(data.last_page);
      setTotalCount(data.total);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat data cluster/principal.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, lobFilter, principalFilter, sortKey, sortDir]);

  // Opsi dropdown diambil sekali: daftar filter tidak boleh ikut berubah
  // mengikuti pencarian yang sedang diketik, kalau tidak pilihan yang tersedia
  // ikut menyusut setiap kali pengguna mengetik.
  useEffect(() => {
    clusterPrincipal
      .filters()
      .then((res) => setOptions({ lob: res.data.data.lob, principal: res.data.data.principal }))
      .catch((e: unknown) => {
        setOptions({ lob: [], principal: [] });
        notifyGlobal(getErrorMessage(e, 'Gagal memuat opsi filter.'), 'error');
      });
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSort = (sort: string) => {
    if (sortKey === sort) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(sort);
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
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleEdit = (row: ClusterPrincipalRow) => {
    setEditItem(row);
    setEditForm(
      Object.fromEntries(
        Object.entries(EMPTY_FORM).map(([key, empty]) => [key, (row as unknown as FormState)[key] ?? empty]),
      ),
    );
  };

  const confirmSave = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await clusterPrincipal.update(editItem.id, editForm);
      setEditItem(null);
      setShowSaveConfirm(false);
      notifyGlobal('Data cluster/principal diperbarui.', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menyimpan perubahan'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!editItem) return;
    try {
      await clusterPrincipal.delete(editItem.id);
      setEditItem(null);
      setShowDeleteConfirm(false);
      notifyGlobal('Data cluster/principal dihapus.', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menghapus data'), 'error');
    }
  };

  const confirmBulkDelete = async () => {
    try {
      await clusterPrincipal.bulkDelete(selectedIds);
      notifyGlobal(`${selectedIds.length} data dihapus.`, 'success');
      setSelectedIds([]);
      setShowBulkConfirm(false);
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menghapus data'), 'error');
    }
  };

  const pickFile = (file: File | null) => {
    if (file && file.size > MAX_IMPORT_BYTES) {
      notifyGlobal(`Ukuran file melebihi batas 10 MB`, 'error');
      return;
    }
    setSelectedFile(file);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await clusterPrincipal.import(selectedFile);
      setSelectedFile(null);
      setShowImport(false);
      setImportResult({ message: res.data.message, ok: true });
      loadItems();
    } catch (e) {
      setImportResult({ message: getErrorMessage(e, 'Import gagal'), ok: false });
    } finally {
      setImporting(false);
    }
  };

  const downloadBlob = (data: BlobPart, filename: string) => {
    const url = window.URL.createObjectURL(
      new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
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
      const res = await clusterPrincipal.export({
        search: debouncedSearch,
        lob: lobFilter || undefined,
        principal: principalFilter || undefined,
        sort: sortKey,
        direction: sortDir,
      });
      downloadBlob(res.data, `cluster_principal_${todayLocal()}.xlsx`);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Export gagal'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleTemplate = async () => {
    if (templateLoading) return;
    setTemplateLoading(true);
    try {
      const res = await clusterPrincipal.template();
      downloadBlob(res.data, 'cluster_principal_template.xlsx');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengunduh template'), 'error');
    } finally {
      setTemplateLoading(false);
    }
  };

  const SortIcon = ({ column }: { column: string }) => (
    <span aria-hidden="true" className="sort-arrow">
      {sortKey === column ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const sortProps = (column: string) => ({
    onClick: () => handleSort(column),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSort(column);
      }
    },
    tabIndex: 0,
    'aria-sort': (sortKey === column ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') as
      | 'ascending'
      | 'descending'
      | 'none',
  });
return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Cluster Principal</h1>
                <p className="text-ink-fg-muted mt-0.5">Kelola pemetaan produk ke principal (pabrikan)</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(v) => { setSearch(v); setPage(1); }}
                  placeholder="Cari SKU, principal, atau kategori..."
                  resultCount={items.length}
                  resultLabel="baris"
                  totalCount={totalCount}
                  currentFrom={items.length > 0 ? (page - 1) * 20 + 1 : 0}
                  currentTo={(page - 1) * 20 + items.length}
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={lobFilter}
                  onChange={(e) => { setLobFilter(e.target.value); setPage(1); }}
                  aria-label="Filter LOB"
                  className="select-field-sm"
                >
                  <option value="">Semua LOB</option>
                  {options.lob.map((lob) => <option key={lob} value={lob}>{lob}</option>)}
                </select>
                <select
                  value={principalFilter}
                  onChange={(e) => { setPrincipalFilter(e.target.value); setPage(1); }}
                  aria-label="Filter Principal"
                  className="select-field-sm"
                >
                  <option value="">Semua Principal</option>
                  {options.principal.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {hasPermission('cluster_principal.view') && (
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
                {hasPermission('cluster_principal.view') && (
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
                {hasPermission('cluster_principal.create') && (
                  <button onClick={() => setShowImport(true)} className="btn-primary">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                      Import
                    </span>
                  </button>
                )}
              </div>
            </div>
            {selectedIds.length > 0 && hasPermission('cluster_principal.delete') && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">{selectedIds.length} dipilih</span>
                <button onClick={() => setShowBulkConfirm(true)} className="btn-danger px-3 py-1.5 text-xs">
                  Hapus Terpilih
                </button>
                <button onClick={() => setSelectedIds([])} className="btn-secondary px-3 py-1.5 text-xs">Batal</button>
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <caption className="sr-only">Daftar cluster dan principal produk</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-popover">
                  {hasPermission('cluster_principal.delete') && (
                    <th scope="col" className="w-10 px-5 py-3 text-left align-middle">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua"
                        checked={items.length > 0 && items.every((i) => selectedIds.includes(i.id))}
                        onChange={toggleSelectAll}
                        className="rounded border-border text-accent-text focus:ring-primary-500"
                      />
                    </th>
                  )}
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">No</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} scope="col" {...sortProps(col.sort)} className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer">
                      <span className="inline-flex items-center gap-1">{col.label}<SortIcon column={col.sort} /></span>
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="animate-pulse">
                      {hasPermission('cluster_principal.delete') && <td className="px-5 py-3"><div className="h-4 w-4 rounded bg-slate-100" /></td>}
                      <td className="px-5 py-3"><div className="h-4 w-6 rounded bg-slate-100" /></td>
                      {COLUMNS.map((col) => (
                        <td key={col.key} className="px-5 py-3"><div className="h-4 w-28 rounded bg-slate-100" /></td>
                      ))}
                      <td className="px-5 py-3"><div className="ml-auto h-8 w-8 rounded bg-slate-100" /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + (hasPermission('cluster_principal.delete') ? 3 : 2)} className="px-5 py-12 text-center">
                      <div className="flex flex-col items-center gap-3" role="status">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                          <svg className="h-8 w-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">Tidak ada data cluster/principal</p>
                        <p className="text-xs text-slate-400">Cari atau import produk untuk memulai.</p>
                      </div>
                    </td>
                  </tr>
                ) : items.map((row, index) => (
                  <tr key={row.id} className={`transition-colors even:bg-overlay-30 hover:bg-overlay-70 ${selectedIds.includes(row.id) ? 'bg-chip-primary/50' : ''}`}>
                    {hasPermission('cluster_principal.delete') && (
                      <td className="px-5 py-3 text-center text-sm align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${row.product_sku}`}
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="rounded border-border text-accent-text focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="px-5 py-3 text-center text-sm text-muted-foreground">{(page - 1) * 20 + index + 1}</td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-5 py-3 text-sm ${
                          col.key === 'product_sku'
                            ? 'font-mono font-medium text-foreground'
                            : 'text-foreground'
                        }`}
                      >
                        {row[col.key] || <span className="text-gray-400">-</span>}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission('cluster_principal.edit') && (
                          <button onClick={() => handleEdit(row)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-all duration-200" title="Edit" aria-label={`Edit ${row.product_sku}`}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                        )}
                        {hasPermission('cluster_principal.delete') && (
                          <button onClick={() => { setEditItem(row); setShowDeleteConfirm(true); }} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all duration-200" title="Hapus" aria-label={`Hapus ${row.product_sku}`}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0v-.916c0-1.18.91-2.164 2.09-2.201a51.964 51.964 0 003.32 0c1.18-.037 2.09-1.022 2.09-2.201v-.916m-16.538 0H4.772M16.5 4.5h-3a1.125 1.125 0 01-1.125-1.125V3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-3m1.5-1.5h-3.75m2.25 5.25v5.25" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2 p-3">
            {items.map((row) => (
              <div key={row.id} className="bg-popover rounded-xl p-4 border border-border">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono font-medium text-foreground text-sm">{row.product_sku}</p>
                    <p className="text-xs text-muted-foreground">{row.principal_1 || row.principal_2 || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <p className="text-muted-foreground">LOB: <span className="text-foreground">{row.lob || '-'}</span></p>
                  <p className="text-muted-foreground">Category: <span className="text-foreground">{row.product_category || '-'}</span></p>
                  <p className="text-muted-foreground">Group: <span className="text-foreground">{row.product_group || '-'}</span></p>
                  <p className="text-muted-foreground">Class: <span className="text-foreground">{row.product_class || '-'}</span></p>
                  <p className="text-muted-foreground col-span-2">Principal 2: <span className="text-foreground">{row.principal_2 || '-'}</span></p>
                </div>
                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border">
                  {hasPermission('cluster_principal.edit') && <button onClick={() => handleEdit(row)} className="min-h-9 px-2 text-xs text-amber-600 hover:bg-amber-50 rounded transition-colors" aria-label={`Edit ${row.product_sku}`}>Edit</button>}
                  {hasPermission('cluster_principal.delete') && <button onClick={() => { setEditItem(row); setShowDeleteConfirm(true); }} className="min-h-9 px-2 text-xs text-red-600 hover:bg-red-50 rounded transition-colors" aria-label={`Hapus ${row.product_sku}`}>Hapus</button>}
                </div>
              </div>
            ))}
            {items.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                </div>
                <p className="text-sm font-medium text-muted-foreground">Tidak ada data</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-sm text-muted-foreground">
              Menampilkan <span className="font-medium text-foreground">{items.length > 0 ? (page - 1) * 20 + 1 : 0}-{Math.min(page * 20, totalCount)}</span> dari <span className="font-medium text-foreground">{totalCount}</span>
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="min-h-11 px-3 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-popover disabled:opacity-40 disabled:cursor-not-allowed transition-colors" aria-label="Halaman sebelumnya">
                Sebelumnya
              </button>
              <span className="text-sm text-muted-foreground">
                Halaman <span className="font-medium text-foreground">{page}</span> dari <span className="font-medium text-foreground">{lastPage}</span>
              </span>
              <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="min-h-11 px-3 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-popover disabled:opacity-40 disabled:cursor-not-allowed transition-colors" aria-label="Halaman berikutnya">
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import */}
      <Modal open={showImport || importResult !== null} onClose={() => { setShowImport(false); setImportResult(null); }} title="Import Cluster Principal">
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files[0]); }}
            className={`rounded-xl border-2 border-dashed p-6 text-center ${isDragging ? 'border-primary-500 bg-chip-primary' : 'border-border'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-sm text-foreground">Tarik file Excel ke sini, atau</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary mt-2 rounded-lg px-3 py-1.5 text-xs font-bold">Pilih File</button>
            {selectedFile && <p className="mt-2 text-xs font-bold text-foreground">{selectedFile.name}</p>}
          </div>

          {importResult && (
            <div role="alert" className={`rounded-xl border p-3 text-sm ${importResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {importResult.message}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowImport(false); setImportResult(null); }} className="btn-secondary rounded-lg px-4 py-2 text-sm">Tutup</button>
            <button type="button" onClick={handleImport} disabled={!selectedFile || importing} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              {importing ? 'Mengimport...' : 'Import'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit */}
      <Modal open={editItem !== null} onClose={() => setEditItem(null)} title="Ubah Cluster Principal">
        <div className="space-y-3">
          {COLUMNS.map((col) => (
            <label key={col.key} className="block">
              <span className="mb-1 block text-xs font-bold text-foreground">{col.label}</span>
              <input
                value={editForm[col.key] ?? ''}
                onChange={(e) => setEditForm((prev) => ({ ...prev, [col.key]: e.target.value }))}
                className="input-field text-sm"
              />
            </label>
          ))}
          {editItem && editForm.product_sku !== editItem.product_sku && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Mengubah Product SKU akan mengubah kunci baris ini.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {editItem && hasPermission('cluster_principal.delete') && (
              <button type="button" onClick={() => setShowDeleteConfirm(true)} className="btn-danger mr-auto rounded-lg px-3 py-2 text-sm">Hapus</button>
            )}
            <button type="button" onClick={() => setEditItem(null)} className="btn-secondary rounded-lg px-4 py-2 text-sm">Batal</button>
            <button type="button" onClick={() => setShowSaveConfirm(true)} disabled={saving || !editForm.product_sku.trim()} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">Simpan</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showSaveConfirm}
        title="Simpan perubahan?"
        message="Perubahan pada data cluster/principal akan langsung tersimpan."
        onConfirm={confirmSave}
        onClose={() => setShowSaveConfirm(false)}
        loading={saving}
      />
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Hapus data ini?"
        message="Data cluster/principal akan dihapus permanen."
        onConfirm={confirmDelete}
        onClose={() => setShowDeleteConfirm(false)}
        variant="danger"
      />
      <ConfirmDialog
        open={showBulkConfirm}
        title={`Hapus ${selectedIds.length} data?`}
        message="Semua data yang dipilih akan dihapus permanen."
        onConfirm={confirmBulkDelete}
        onClose={() => setShowBulkConfirm(false)}
        variant="danger"
      />
    </DashboardLayout>
  );
}
