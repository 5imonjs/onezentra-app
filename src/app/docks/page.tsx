'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { docks, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';

interface Dock {
  id: number;
  name: string;
  code: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  capacity: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  AVAILABLE: { label: 'Tersedia', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  OCCUPIED: { label: 'Ditempati', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  MAINTENANCE: { label: 'Perawatan', badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

const EMPTY_FORM = { name: '', code: '', capacity: '', notes: '' };

export default function DocksPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<Dock[]>([]);
  const [_error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await docks.list({ search, page, per_page: 20 });
      const data = res.data as { data: Dock[]; last_page: number; total: number };
      setItems(data.data);
      setLastPage(data.last_page);
      setTotal(data.total);
    } catch (e) {
      setError(getErrorMessage(e, 'Gagal memuat data perkerabat.'));
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await docks.create({
        name: formData.name,
        code: formData.code || null,
        capacity: formData.capacity ? Number(formData.capacity) : null,
        notes: formData.notes || null,
      });
      setShowCreate(false);
      setFormData(EMPTY_FORM);
      notifyGlobal('Dock berhasil dibuat', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal membuat dock'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (editId === null) return;
    setSaving(true);
    try {
      await docks.update(editId, {
        name: formData.name,
        code: formData.code || null,
        capacity: formData.capacity ? Number(formData.capacity) : null,
        notes: formData.notes || null,
      });
      setShowEdit(false);
      setEditId(null);
      setFormData(EMPTY_FORM);
      notifyGlobal('Dock berhasil diperbarui', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memperbarui dock'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTargetId === null) return;
    setDeleting(true);
    try {
      await docks.delete(deleteTargetId);
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      notifyGlobal('Dock berhasil dihapus', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menghapus dock'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await docks.import(file);
      notifyGlobal('Import dock berhasil', 'success');
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Import gagal'), 'error');
    }
    e.target.value = '';
  };

  const handleExport = async () => {
    try {
      const res = await docks.export();
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `docks-${todayLocal()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Export dimulai', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Export gagal'), 'error');
    }
  };

  const handleTemplate = async () => {
    try {
      const res = await docks.template();
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'docks_template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Template diunduh', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Template gagal'), 'error');
    }
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setShowCreate(true);
  };

  const openEdit = (item: Dock) => {
    setEditId(item.id);
    setFormData({
      name: item.name,
      code: item.code || '',
      capacity: item.capacity?.toString() || '',
      notes: item.notes || '',
    });
    setShowEdit(true);
  };

  const confirmSave = () => {
    if (editId !== null) {
      setShowSaveConfirm(true);
    } else {
      handleCreate();
    }
  };

  const confirmEditSave = () => {
    setShowSaveConfirm(false);
    handleUpdate();
  };

  const badge = (status: string) => {
    const meta = STATUS_CONFIG[status] || { label: status, badge: 'bg-slate-100 text-slate-600 border-slate-300', dot: 'bg-slate-400' };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 lg:p-7 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg aria-hidden="true" className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21a3 3 0 003 3h2a3 3 0 003-3V21a3 3 0 00-3-3h-2a3 3 0 00-3 3zm0 0h18" />
              </svg>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-fg-muted">Master data</p>
              <h1 className="text-2xl font-bold leading-tight">Docks</h1>
              <p className="text-ink-fg-muted mt-0.5 text-sm">Kelola daftar dock/gudang</p>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        {hasPermission('receiving.delete') && (
          <div className="flex items-center gap-2">
            {hasPermission('receiving.import') && (
              <label className="btn-secondary shrink-0 cursor-pointer">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Import
                </span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
              </label>
            )}
            {hasPermission('receiving.export') && (
              <button onClick={handleExport} className="btn-secondary shrink-0">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 18v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>
                  Export
                </span>
              </button>
            )}
            {hasPermission('receiving.template') && (
              <button onClick={handleTemplate} className="btn-secondary shrink-0">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Template
                </span>
              </button>
            )}
          </div>
        )}

        {/* Table Card */}
        <div className="bg-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(v) => { setSearch(v); setPage(1); }}
                  placeholder="Cari dock..."
                  resultCount={items.length}
                  resultLabel="dock"
                  totalCount={total}
                  currentFrom={items.length > 0 ? (page - 1) * 20 + 1 : 0}
                  currentTo={(page - 1) * 20 + items.length}
                />
              </div>
              {hasPermission('receiving.create') && (
                <button onClick={openCreate} className="btn-primary shrink-0">
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
              <caption className="sr-only">Daftar dock</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-popover border-b border-slate-300">
                  <th scope="col" className="table-header">Nama</th>
                  <th scope="col" className="table-header">Kode</th>
                  <th scope="col" className="table-header">Depo</th>
                  <th scope="col" className="table-header text-center">Kapasitas</th>
                  <th scope="col" className="table-header text-center">Status</th>
                  <th scope="col" className="table-header text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="table-cell"><div className="h-4 w-40 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                      <td className="table-cell text-center"><div className="h-4 w-12 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                      <td className="table-cell text-center"><div className="h-5 w-20 bg-slate-100 rounded-full animate-pulse mx-auto" /></td>
                      <td className="table-cell" />
                    </tr>
                  ))
                ) : items.map((item) => (
                  <tr key={item.id} className="hover:bg-overlay-50 transition-colors">
                    <td className="table-cell">
                      <span className="text-sm font-medium text-slate-800">{item.name}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-slate-600 font-mono">{item.code || '-'}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-slate-600">{item.nama_depo || item.kode_depo || '-'}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-sm text-slate-600">{item.capacity ?? '-'}</span>
                    </td>
                    <td className="table-cell text-center">{badge(item.status)}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission('receiving.edit') && (
                          <button onClick={() => openEdit(item)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200" title="Edit" aria-label="Edit">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                        )}
                        {hasPermission('receiving.delete') && (
                          <button onClick={() => { setDeleteTargetId(item.id); setShowDeleteConfirm(true); }} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200" title="Hapus" aria-label="Hapus">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-cell text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21a3 3 0 003 3h2a3 3 0 003-3V21a3 3 0 00-3-3h-2a3 3 0 00-3 3zm0 0h18" /></svg>
                        </div>
                        <p className="text-sm text-slate-500 font-medium" role="status">Tidak ada dock</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 tabular-nums">Halaman {page} dari {lastPage}</p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Halaman sebelumnya">
                <span className="flex items-center gap-2"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>Sebelumnya</span>
              </button>
              <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Halaman berikutnya">
                <span className="flex items-center gap-2">Selanjutnya<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Tambah Dock"
        subtitle="Buat dock/gudang baru"
        size="md"
        footer={
          <>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Batal</button>
            <button onClick={confirmSave} disabled={saving || !formData.name.trim()} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="flex items-center gap-2">
                {saving ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Menyimpan...</> : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Simpan</>}
              </span>
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="dock-name" className="block text-xs font-medium text-slate-500 mb-1.5">Nama <span className="text-slate-400">*</span></label>
            <input id="dock-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field text-sm" placeholder="Nama dock" />
          </div>
          <div>
            <label htmlFor="dock-code" className="block text-xs font-medium text-slate-500 mb-1.5">Kode</label>
            <input id="dock-code" type="text" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="input-field text-sm" placeholder="Kode dock" />
          </div>
          <div>
            <label htmlFor="dock-capacity" className="block text-xs font-medium text-slate-500 mb-1.5">Kapasitas</label>
            <input id="dock-capacity" type="number" min="0" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} className="input-field text-sm" placeholder="Kapasitas" />
          </div>
          <div className="col-span-2">
            <label htmlFor="dock-notes" className="block text-xs font-medium text-slate-500 mb-1.5">Catatan</label>
            <textarea id="dock-notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field text-sm" rows={3} placeholder="Catatan tambahan" />
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEdit}
        onClose={() => { setShowEdit(false); setEditId(null); setFormData(EMPTY_FORM); }}
        title="Edit Dock"
        subtitle="Edit data dock"
        size="md"
        footer={
          <>
            <button onClick={() => { setShowEdit(false); setEditId(null); setFormData(EMPTY_FORM); }} className="btn-secondary">Batal</button>
            <button onClick={() => setShowSaveConfirm(true)} disabled={saving || !formData.name.trim()} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="flex items-center gap-2">
                {saving ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Menyimpan...</> : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Simpan</>}
              </span>
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="edit-dock-name" className="block text-xs font-medium text-slate-500 mb-1.5">Nama <span className="text-slate-400">*</span></label>
            <input id="edit-dock-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field text-sm" placeholder="Nama dock" />
          </div>
          <div>
            <label htmlFor="edit-dock-code" className="block text-xs font-medium text-slate-500 mb-1.5">Kode</label>
            <input id="edit-dock-code" type="text" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="input-field text-sm" placeholder="Kode dock" />
          </div>
          <div>
            <label htmlFor="edit-dock-capacity" className="block text-xs font-medium text-slate-500 mb-1.5">Kapasitas</label>
            <input id="edit-dock-capacity" type="number" min="0" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} className="input-field text-sm" placeholder="Kapasitas" />
          </div>
          <div className="col-span-2">
            <label htmlFor="edit-dock-notes" className="block text-xs font-medium text-slate-500 mb-1.5">Catatan</label>
            <textarea id="edit-dock-notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field text-sm" rows={3} placeholder="Catatan tambahan" />
          </div>
        </div>
      </Modal>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
        onConfirm={handleDelete}
        title="Hapus Dock"
        message="Apakah Anda yakin ingin menghapus dock ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="danger"
        loading={deleting}
      />
      <ConfirmDialog
        open={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={confirmEditSave}
        title="Simpan Perubahan"
        message="Apakah Anda yakin ingin menyimpan perubahan pada dock ini?"
        confirmLabel="Simpan"
        variant="warning"
        loading={saving}
      />
    </DashboardLayout>
  );
}
