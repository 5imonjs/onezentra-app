'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { standarUmurProduk, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuthStore } from '@/store/auth';

interface StandarUmurItem {
  id: number;
  material: string;
  material_description: string;
  old_material_number: string;
  ext_material_group: string;
  country: string;
  principal: string;
  cluster: string;
  cluster2: string;
  lob: string;
  category: string;
  sub_category: string;
  brand: string;
  incubation: string;
  isi_sap: string;
  isi_bosnet: string;
  conversion1: string;
  conversion2: string;
  min_doi: number;
  target_doi: number;
  max_doi: number;
  trigger_point: number;
  max_point: number;
  supply_pattern: string;
  demand_pattern: string;
  skugrp: string;
  skuconv: string;
  umur: number;
  vol_m3: number;
  weight_kg: number;
  metric_ton: number;
  type_sku: string;
  uom: string;
  allocation_start: string;
  allocation_end: string;
  uom2: string;
  sku_status: string;
  made_in: string;
  product_id: string;
  nickname: string;
  sku_fokus_nka: string;
  sku_fokus_mti: string;
  created_at: string;
  updated_at: string;
}

const emptyForm: Partial<StandarUmurItem> = {
  material: '', material_description: '', old_material_number: '',
  ext_material_group: '', country: '', principal: '', cluster: '', cluster2: '',
  lob: '', category: '', sub_category: '', brand: '', incubation: '',
  isi_sap: '', isi_bosnet: '', conversion1: '', conversion2: '',
  min_doi: 0, target_doi: 0, max_doi: 0, trigger_point: 0, max_point: 0,
  supply_pattern: '', demand_pattern: '', skugrp: '', skuconv: '',
  umur: 0, vol_m3: 0, weight_kg: 0, metric_ton: 0,
  type_sku: '', uom: '', allocation_start: '', allocation_end: '',
  uom2: '', sku_status: '', made_in: '', product_id: '',
  nickname: '', sku_fokus_nka: '', sku_fokus_mti: '',
};

const allFields: [keyof StandarUmurItem, string, boolean?, string?][] = [
  ['material', 'Material'],
  ['material_description', 'Material Description', true],
  ['old_material_number', 'Old material number'],
  ['ext_material_group', 'Ext Material Group'],
  ['country', 'Country'],
  ['principal', 'Principal'],
  ['cluster', 'Cluster'],
  ['cluster2', 'Cluster2'],
  ['lob', 'LOB'],
  ['category', 'Category'],
  ['sub_category', 'Sub Category'],
  ['brand', 'Brand'],
  ['incubation', 'Incubation'],
  ['isi_sap', 'Isi -SAP'],
  ['isi_bosnet', 'Isi -BOSnet'],
  ['conversion1', 'Conversion1'],
  ['conversion2', 'Conversion2'],
  ['min_doi', 'MinDOI', false, 'number'],
  ['target_doi', 'TargetDOI', false, 'number'],
  ['max_doi', 'MaxDOI', false, 'number'],
  ['trigger_point', 'Trigger Point', false, 'number'],
  ['max_point', 'Max Point', false, 'number'],
  ['supply_pattern', 'Supply Pattern'],
  ['demand_pattern', 'Demand Pattern'],
  ['skugrp', 'SKUGrp'],
  ['skuconv', 'SKUConv.'],
  ['umur', 'Umur (bulan)', false, 'number'],
  ['vol_m3', 'Vol (m3)', false, 'number'],
  ['weight_kg', 'Weight (kg)', false, 'number'],
  ['metric_ton', 'MetricTon', false, 'number'],
  ['type_sku', 'TypeSKU'],
  ['uom', 'Uom'],
  ['allocation_start', 'Allocation Start'],
  ['allocation_end', 'Allocation End'],
  ['uom2', 'Uom2'],
  ['sku_status', 'SKUStatus'],
  ['made_in', 'MadeIn'],
  ['product_id', 'Supplier ProductId'],
  ['nickname', 'NickName'],
  ['sku_fokus_nka', 'SKU Fokus NKA'],
  ['sku_fokus_mti', 'SKU Fokus MTI'],
];

const viewFields: [keyof StandarUmurItem, string, boolean?][] = [
  ['material', 'Material'],
  ['material_description', 'Material Description', true],
  ['old_material_number', 'Old material number'],
  ['ext_material_group', 'Ext Material Group'],
  ['country', 'Country'],
  ['principal', 'Principal'],
  ['cluster', 'Cluster'],
  ['cluster2', 'Cluster2'],
  ['lob', 'LOB'],
  ['category', 'Category'],
  ['sub_category', 'Sub Category'],
  ['brand', 'Brand'],
  ['incubation', 'Incubation'],
  ['isi_sap', 'Isi -SAP'],
  ['isi_bosnet', 'Isi -BOSnet'],
  ['conversion1', 'Conversion1'],
  ['conversion2', 'Conversion2'],
  ['min_doi', 'MinDOI'],
  ['target_doi', 'TargetDOI'],
  ['max_doi', 'MaxDOI'],
  ['trigger_point', 'Trigger Point'],
  ['max_point', 'Max Point'],
  ['supply_pattern', 'Supply Pattern'],
  ['demand_pattern', 'Demand Pattern'],
  ['skugrp', 'SKUGrp'],
  ['skuconv', 'SKUConv.'],
  ['umur', 'Umur (bulan)'],
  ['vol_m3', 'Vol (m3)'],
  ['weight_kg', 'Weight (kg)'],
  ['metric_ton', 'MetricTon'],
  ['type_sku', 'TypeSKU'],
  ['uom', 'Uom'],
  ['allocation_start', 'Allocation Start'],
  ['allocation_end', 'Allocation End'],
  ['uom2', 'Uom2'],
  ['sku_status', 'SKUStatus'],
  ['made_in', 'MadeIn'],
  ['product_id', 'Supplier ProductId'],
  ['nickname', 'NickName'],
  ['sku_fokus_nka', 'SKU Fokus NKA'],
  ['sku_fokus_mti', 'SKU Fokus MTI'],
];

export default function StandarUmurPage() {
  const [items, setItems] = useState<StandarUmurItem[]>([]);
  const [_error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortKey, setSortKey] = useState<string>('material_description');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewItem, setViewItem] = useState<StandarUmurItem | null>(null);
  const [editItem, setEditItem] = useState<StandarUmurItem | null>(null);
  const [editForm, setEditForm] = useState<Partial<StandarUmurItem>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<StandarUmurItem>>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const [importResult, setImportResult] = useState<{ message?: string; ok?: boolean; total_rows?: number; imported?: number; skipped?: number } | null>(null);

  useEffect(() => {
    if (importResult?.ok === true) {
      const timer = setTimeout(() => {
        setShowImport(false);
        setImportResult(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [importResult]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { hasPermission } = useAuthStore();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const res = await standarUmurProduk.list({ search, page, per_page: 20, sort: sortKey, direction: sortDir });
      const data = res.data;
      setItems(data.data);
      setLastPage(data.last_page);
      setTotalCount(data.total);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Gagal memuat data standar umur.'));
    }
  }, [search, page, sortKey, sortDir]);

  useEffect(() => { loadItems(); }, [loadItems]);

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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleDelete = async (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try { await standarUmurProduk.delete(deleteTargetId); loadItems(); } catch (e) { notifyGlobal(getErrorMessage(e, 'Error')); }
    setShowDeleteConfirm(false);
    setDeleteTargetId(null);
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    try {
      await standarUmurProduk.bulkDelete(selectedIds);
      setSelectedIds([]);
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    }
    setShowBulkDeleteConfirm(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await standarUmurProduk.create(createForm);
      setShowCreate(false);
      setCreateForm({ ...emptyForm });
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: StandarUmurItem) => {
    setEditItem(item);
    setEditForm({ ...item });
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setShowSaveConfirm(true);
  };

  const confirmSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await standarUmurProduk.update(editItem.id, editForm);
      setEditItem(null);
      setEditForm({});
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setSaving(false);
      setShowSaveConfirm(false);
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
      const res = await standarUmurProduk.export({ search, sort: sortKey, direction: sortDir });
      downloadBlob(res.data, `standar_umur_produk_${new Date().toISOString().split('T')[0]}.xlsx`);
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
      const res = await standarUmurProduk.template();
      downloadBlob(res.data, 'standar_umur_produk_template.xlsx');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengunduh template'));
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await standarUmurProduk.import(selectedFile);
      const data = res.data;
      setSelectedFile(null);
      loadItems();
      setImportResult({
        message: data.message || 'Import berhasil',
        ok: true,
        ...(data.data ?? {}),
      });
    } catch (e) {
      setImportResult({ message: getErrorMessage(e, 'Import failed'), ok: false });
    } finally {
      setImporting(false);
    }
  };

  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;

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

  const skuStatusColor = (status: unknown): string => {
    const s = String(status ?? '').trim().toLowerCase();
    if (!s || s === '-' || s === '0') return 'bg-gray-100 text-gray-500';
    if (s === 'aktif' || s === 'active') return 'bg-emerald-100 text-emerald-700';
    return 'bg-blue-100 text-blue-700';
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

  const renderFormFields = (form: Partial<StandarUmurItem>, setForm: React.Dispatch<React.SetStateAction<Partial<StandarUmurItem>>>) => (
    <div className="grid grid-cols-2 gap-4">
      {allFields.map(([key, label, full, type]) => (
        <div key={key as string} className={full ? 'col-span-2' : ''}>
          <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
          <input
            type={type || 'text'}
            value={(form[key] as string | number) ?? ''}
            onChange={(e) => setForm(prev => ({ ...prev, [key as string]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
            className="input-field"
          />
        </div>
      ))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg aria-hidden="true" className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Standar Umur Produk</h1>
              <p className="text-gray-400 mt-0.5">Kelola standar umur dan DOI produk</p>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(v) => { setSearch(v); setPage(1); }}
                  placeholder="Cari produk..."
                  resultCount={items.length}
                  resultLabel="produk"
                  totalCount={totalCount}
                  currentFrom={items.length > 0 ? (page - 1) * 20 + 1 : 0}
                  currentTo={(page - 1) * 20 + items.length}
                />
              </div>
              <div className="flex items-center gap-2">
                {hasPermission('standar_umur.view') && (
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
                {hasPermission('standar_umur.view') && (
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
                {hasPermission('standar_umur.create') && (
                  <button onClick={() => setShowImport(true)} className="btn-primary">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                      Import
                    </span>
                  </button>
                )}
                {selectedIds.length > 0 && (
                  <button onClick={handleBulkDelete} className="btn-danger">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      Hapus ({selectedIds.length})
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Daftar standar umur produk</caption>
              <thead>
                <tr className="bg-linear-to-r from-gray-50 to-gray-100">
                  {hasPermission('standar_umur.delete') && (
                    <th scope="col" className="excel-header w-10">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                  )}
                  <th scope="col" className="excel-header w-12">No</th>
                  <th scope="col" className={`excel-header excel-header-sortable ${sortKey === 'material' ? 'active' : ''}`} {...sortHeaderProps('material')}>
                    Material <SortIcon column="material" />
                  </th>
                  <th scope="col" className={`excel-header excel-header-sortable ${sortKey === 'material_description' ? 'active' : ''}`} {...sortHeaderProps('material_description')}>
                    Material Description <SortIcon column="material_description" />
                  </th>
                  <th scope="col" className="excel-header">Old material number</th>
                  <th scope="col" className="excel-header">Ext Material Group</th>
                  <th scope="col" className="excel-header">Country</th>
                  <th scope="col" className="excel-header">Principal</th>
                  <th scope="col" className="excel-header">Cluster</th>
                  <th scope="col" className="excel-header">Cluster2</th>
                  <th scope="col" className="excel-header">LOB</th>
                  <th scope="col" className={`excel-header excel-header-sortable ${sortKey === 'category' ? 'active' : ''}`} {...sortHeaderProps('category')}>
                    Category <SortIcon column="category" />
                  </th>
                  <th scope="col" className="excel-header">Sub Category</th>
                  <th scope="col" className={`excel-header excel-header-sortable ${sortKey === 'brand' ? 'active' : ''}`} {...sortHeaderProps('brand')}>
                    Brand <SortIcon column="brand" />
                  </th>
                  <th scope="col" className="excel-header">Incubation</th>
                  <th scope="col" className="excel-header">Isi -SAP</th>
                  <th scope="col" className="excel-header">Isi -BOSnet</th>
                  <th scope="col" className="excel-header">Conversion1</th>
                  <th scope="col" className="excel-header">Conversion2</th>
                  <th scope="col" className="excel-header">MinDOI</th>
                  <th scope="col" className="excel-header">TargetDOI</th>
                  <th scope="col" className="excel-header">MaxDOI</th>
                  <th scope="col" className="excel-header">Trigger Point</th>
                  <th scope="col" className="excel-header">Max Point</th>
                  <th scope="col" className="excel-header">Supply Pattern</th>
                  <th scope="col" className="excel-header">Demand Pattern</th>
                  <th scope="col" className="excel-header">SKUGrp</th>
                  <th scope="col" className="excel-header">SKUConv.</th>
                  <th scope="col" className={`excel-header excel-header-sortable ${sortKey === 'umur' ? 'active' : ''}`} {...sortHeaderProps('umur')}>
                    Umur (bulan) <SortIcon column="umur" />
                  </th>
                  <th scope="col" className="excel-header">Vol (m3)</th>
                  <th scope="col" className="excel-header">Weight (kg)</th>
                  <th scope="col" className="excel-header">MetricTon</th>
                  <th scope="col" className="excel-header">TypeSKU</th>
                  <th scope="col" className="excel-header">Uom</th>
                  <th scope="col" className="excel-header">Allocation Start</th>
                  <th scope="col" className="excel-header">Allocation End</th>
                  <th scope="col" className="excel-header">Uom2</th>
                  <th scope="col" className="excel-header">SKUStatus</th>
                  <th scope="col" className="excel-header">MadeIn</th>
                  <th scope="col" className="excel-header">Supplier ProductId</th>
                  <th scope="col" className="excel-header">NickName</th>
                  <th scope="col" className="excel-header">SKU Fokus NKA</th>
                  <th scope="col" className="excel-header">SKU Fokus MTI</th>
                  <th scope="col" className="excel-header excel-sticky-right text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={`excel-row ${selectedIds.includes(item.id) ? 'excel-row-selected bg-primary-50/50' : ''} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    {hasPermission('standar_umur.delete') && (
                      <td className="excel-cell text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="excel-cell text-center text-gray-500">{(page - 1) * 20 + index + 1}</td>
                    <td className="excel-cell"><span className="text-sm font-mono">{fmt(item.material)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.material_description)}</span></td>
                    <td className="excel-cell"><span className="text-sm font-mono">{fmt(item.old_material_number)}</span></td>
                    <td className="excel-cell"><span className="text-sm font-mono">{fmt(item.ext_material_group)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.country)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.principal)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.cluster)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.cluster2)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.lob)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.category)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.sub_category)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.brand)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.incubation)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.isi_sap)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.isi_bosnet)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.conversion1)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.conversion2)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.min_doi)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.target_doi)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.max_doi)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.trigger_point)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.max_point)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.supply_pattern)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.demand_pattern)}</span></td>
                    <td className="excel-cell"><span className="text-sm font-mono">{fmt(item.skugrp)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.skuconv)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.umur)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.vol_m3)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.weight_kg)}</span></td>
                    <td className="excel-cell text-right tabular-nums"><span className="text-sm">{fmt(item.metric_ton)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.type_sku)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.uom)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.allocation_start)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.allocation_end)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.uom2)}</span></td>
                    <td className="excel-cell"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${skuStatusColor(item.sku_status)}`}>{fmt(item.sku_status)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.made_in)}</span></td>
                    <td className="excel-cell"><span className="text-sm font-mono">{fmt(item.product_id)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.nickname)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.sku_fokus_nka)}</span></td>
                    <td className="excel-cell"><span className="text-sm">{fmt(item.sku_fokus_mti)}</span></td>
                    <td className="excel-cell excel-sticky-right text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewItem(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all duration-200" title="Lihat Detail" aria-label="Lihat Detail">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                        {hasPermission('standar_umur.edit') && (
                          <button onClick={() => handleEdit(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-all duration-200" title="Edit" aria-label="Edit">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                        )}
                        {hasPermission('standar_umur.delete') && (
                          <button onClick={() => handleDelete(item.id)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all duration-200" title="Hapus" aria-label="Hapus">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={allFields.length + 2 + (hasPermission('standar_umur.delete') ? 1 : 0)} className="excel-cell text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 font-medium" role="status">Tidak ada data produk</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <div className="flex justify-between items-center">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman sebelumnya">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  Sebelumnya
                </span>
              </button>
              <span className="text-sm text-gray-600 font-medium">
                Halaman {page} dari {lastPage}
              </span>
              <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Halaman berikutnya">
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
      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Standar Umur" subtitle="Informasi lengkap standar umur produk" size="xl">
        {viewItem && (
          <div className="grid grid-cols-2 gap-3">
            {viewFields.map(([key, label, full]) => (
              <div key={key as string} className={`bg-gray-50 rounded-xl p-3 ${full ? 'col-span-2' : ''}`}>
                <span className="text-xs font-medium text-gray-400 uppercase">{label as string}</span>
                <p className="text-sm text-gray-900 mt-1 font-medium">{fmt(viewItem[key as keyof typeof viewItem])}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => { setEditItem(null); setEditForm({}); }} title="Edit Standar Umur" subtitle="Edit data standar umur produk" size="xl" footer={
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
      }>
        {editItem && renderFormFields(editForm, setEditForm)}
      </Modal>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateForm({ ...emptyForm }); }} title="Tambah Standar Umur" subtitle="Tambah data standar umur produk baru" size="xl" footer={
        <>
          <button onClick={() => { setShowCreate(false); setCreateForm({ ...emptyForm }); }} className="btn-secondary">Batal</button>
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
      }>
        {renderFormFields(createForm, setCreateForm)}
      </Modal>

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportResult(null); setSelectedFile(null); }} title="Import Standar Umur" subtitle="Upload file Excel untuk import data" size="md"
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
                    Import
                  </>
                )}
              </span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${isDragging ? 'border-primary-400 bg-primary-50' : selectedFile ? 'border-primary-300 bg-primary-50/30' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files[0] || null); }}
            role="button"
            aria-label="Pilih file Excel untuk import"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { pickFile(e.target.files?.[0] || null); e.target.value = ''; }}
              className="hidden"
            />
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-gray-600 mb-2">
              {selectedFile ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})` : 'Klik untuk pilih file atau taruh file di sini'}
            </p>
            <p className="text-xs text-gray-400">Format: .xlsx, .xls, .csv (maks 10 MB)</p>
            {selectedFile && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="mt-4 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors min-h-[44px] px-4"
                aria-label="Hapus file terpilih"
              >
                Hapus file
              </button>
            )}
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
                  {importResult.total_rows !== undefined && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="badge badge-info">Total: {importResult.total_rows}</span>
                      <span className="badge badge-success">Imported: {importResult.imported}</span>
                      {(importResult.skipped ?? 0) > 0 && <span className="badge badge-warning">Skipped: {importResult.skipped}</span>}
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
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
        onConfirm={confirmDelete}
        title="Hapus Item"
        message="Apakah Anda yakin ingin menghapus item ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="danger"
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
        message="Apakah Anda yakin ingin menyimpan perubahan pada data ini?"
        confirmLabel="Simpan"
        variant="warning"
        loading={saving}
      />
    </DashboardLayout>
  );
}
