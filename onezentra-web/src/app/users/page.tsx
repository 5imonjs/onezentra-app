'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import React from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { users, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuthStore } from '@/store/auth';

interface UserItem {
  id: number;
  kode_depo: string;
  nama_depo: string;
  full_name: string;
  email: string;
  level: string;
  status: string;
  role_id: number;
  roles: { id: number; name: string; slug: string }[];
  created_at: string;
  updated_at: string;
}

const levels = [
  { value: 'admin_master', label: 'Admin Master' },
  { value: 'staff_logistic', label: 'Staff Logistik' },
  { value: 'rlh', label: 'RLH' },
  { value: 'rfah', label: 'RFAH' },
  { value: 'rh', label: 'RH' },
  { value: 'blc', label: 'BLC' },
  { value: 'bac', label: 'BAC' },
  { value: 'admin_distirbusi', label: 'Admin Distribusi' },
  { value: 'admin_planner', label: 'Admin Planner' },
  { value: 'cheker', label: 'Cheker' },
  { value: 'sac', label: 'SAC' },
];

const emptyForm = {
  kode_depo: '', nama_depo: '', full_name: '', email: '',
  password: '', password_confirmation: '',
  level: 'staff_logistic', status: 'active',
};

export default function UsersPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<UserItem[]>([]);
  const [_error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [groupByDepo, setGroupByDepo] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, admin_master: 0 });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyForm });
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ message: string; ok?: boolean; total_rows?: number; imported?: number; updated?: number; errors?: { row: number; errors: string }[] } | null>(null);

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editItem, setEditItem] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveMode, setSaveMode] = useState<'create' | 'edit'>('create');

  const loadItems = useCallback(async () => {
    try {
      const res = await users.list({ search, level: levelFilter, status: statusFilter, page, per_page: 20 });
      setItems(res.data.data);
      setLastPage(res.data.last_page ?? 1);
      setTotalCount(res.data.total ?? res.data.data?.length ?? 0);
      setStats(res.data.meta ?? { total: 0, active: 0, inactive: 0, admin_master: 0 });
    } catch (e) {
      // Jangan biarkan error menyamar sebagai 'belum ada data'
      setError(getErrorMessage(e, 'Gagal memuat data pengguna.'));
    }
  }, [search, levelFilter, statusFilter, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCreate = () => {
    setSaveMode('create');
    setShowSaveConfirm(true);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await users.import(selectedFile);
      const data = res.data.data;
      setImportResult({ message: res.data.message || 'Import selesai', ok: true, ...data });
      setSelectedFile(null);
      loadItems();
    } catch (e) {
      setImportResult({ message: getErrorMessage(e, 'Import gagal'), ok: false });
    } finally {
      setImporting(false);
    }
  };

  const handleEdit = (item: UserItem) => {
    setEditItem(item);
    setEditForm({
      kode_depo: item.kode_depo || '',
      nama_depo: item.nama_depo || '',
      full_name: item.full_name || '',
      email: item.email || '',
      password: '',
      password_confirmation: '',
      level: item.level || 'staff_logistic',
      status: item.status || 'active',
    });
  };

  const handleSaveEdit = () => {
    setSaveMode('edit');
    setShowSaveConfirm(true);
  };

  const doSave = async () => {
    setShowSaveConfirm(false);
    setSaving(true);
    try {
      if (saveMode === 'create') {
        await users.create(createForm);
        setShowCreate(false);
        setCreateForm({ ...emptyForm });
      } else {
        if (!editItem) return;
        const data = { ...editForm };
        if (!data.password) {
          delete data.password;
          delete data.password_confirmation;
        }
        await users.update(editItem.id, data);
        setEditItem(null);
        setEditForm({});
      }
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menyimpan user'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const doDelete = async () => {
    if (deleteTargetId === null || deleting) return;
    setDeleting(true);
    try {
      await users.delete(deleteTargetId);
      loadItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal hapus user'));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  };

  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = {
      admin_master: 'bg-red-100 text-red-700',
      staff_logistic: 'bg-blue-100 text-blue-700',
      rlh: 'bg-emerald-100 text-emerald-700',
      rfah: 'bg-amber-100 text-amber-700',
      rh: 'bg-purple-100 text-purple-700',
      blc: 'bg-cyan-100 text-cyan-700',
      bac: 'bg-pink-100 text-pink-700',
      admin_distirbusi: 'bg-chip-primary text-accent-text',
      admin_planner: 'bg-teal-100 text-teal-700',
      cheker: 'bg-orange-100 text-orange-700',
      sac: 'bg-lime-100 text-lime-700',
    };
    return colors[level] || 'bg-gray-100 text-gray-700';
  };

  const fromCount = totalCount === 0 ? 0 : (page - 1) * 20 + 1;
  const toCount = Math.min(page * 20, totalCount);
  const groupedItems = items.reduce<Record<string, UserItem[]>>((groups, item) => {
    const groupName = item.nama_depo || item.kode_depo || 'Depo belum diatur';
    groups[groupName] = groups[groupName] || [];
    groups[groupName].push(item);
    return groups;
  }, {});

  const mobileCard = (item: UserItem) => (
    <div className="flex flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-linear-to-br from-primary-500 to-primary-600 flex items-center justify-center text-sm font-bold text-white">
              {item.full_name?.charAt(0) || 'U'}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${item.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{item.full_name}</p>
            <p className="text-xs text-gray-500">{item.email}</p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-300'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          {item.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{item.kode_depo || '-'}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ring-1 ring-inset ring-black/5 ${getLevelBadge(item.level)}`}>{levels.find(l => l.value === item.level)?.label || item.level}</span>
      </div>
      <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
        {hasPermission('users.edit') && (
          <button onClick={() => handleEdit(item)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
            Edit
          </button>
        )}
        {hasPermission('users.delete') && (
          <button onClick={() => handleDelete(item.id)} disabled={deleting} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            Hapus
          </button>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Users Management</h1>
              <p className="text-ink-fg-muted mt-0.5">Kelola akun pengguna sistem</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-chip-primary flex items-center justify-center">
              <svg className="w-6 h-6 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total User</p>
            </div>
          </div>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-sm text-gray-500">User Aktif</p>
            </div>
          </div>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
<p className="text-2xl font-bold text-gray-900">{stats.admin_master}</p>
                <p className="text-sm text-gray-500">Admin Master</p>
            </div>
          </div>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.inactive}</p>
              <p className="text-sm text-gray-500">User Nonaktif</p>
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 min-w-0">
              <SearchInput
                value={search}
                onChange={(v) => { setSearch(v); setPage(1); }}
                placeholder="Cari user..."
                filters={[
                  { key: 'active', label: 'Active', value: 'active' },
                  { key: 'inactive', label: 'Inactive', value: 'inactive' },
                ]}
                activeFilter={statusFilter}
                onFilterChange={(f) => { setStatusFilter(f); setPage(1); }}
                resultCount={totalCount}
                resultLabel="user"
              />
            </div>
            <div className="flex items-center gap-3">
              <select
                value={levelFilter}
                onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
                className="select-field-sm whitespace-nowrap"
              >
                <option value="">Semua Level</option>
                {levels.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setGroupByDepo(prev => !prev)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${groupByDepo ? 'border-chip-primary-border bg-chip-primary text-accent-text' : 'border-gray-300 bg-surface-card text-gray-600 hover:bg-surface-raised'}`}
                aria-pressed={groupByDepo}
                title="Kelompokkan user berdasarkan nama depo"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h15M4.5 12h15M4.5 17.25h15" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5v15" />
                </svg>
                <span className="hidden xl:inline">Kelompokkan depo</span>
                <span className="xl:hidden">Depo</span>
              </button>
              {(hasPermission('users.import') || hasPermission('users.create')) && (
                <button onClick={() => setShowImport(true)} className="btn-secondary whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14a1 1 0 0 0 1-1v-4" />
                    </svg>
                    Import
                  </span>
                </button>
              )}
              {hasPermission('users.create') && (
                <button onClick={() => setShowCreate(true)} className="btn-primary whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Table */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px]">
              <caption className="sr-only">Daftar pengguna</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-raised">
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">No</th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">User</th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Depo</th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Level</th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(groupByDepo ? Object.entries(groupedItems).flatMap(([depoName, depoItems]) => [
                  <tr key={`depo-${depoName}`} className="bg-overlay-70">
                    <td colSpan={6} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-chip-primary text-accent-text">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V5.25L12 3l6.75 2.25V21M8.25 8.25h.008v.008H8.25V8.25zm0 3.75h.008v.008H8.25V12zm0 3.75h.008v.008H8.25v-.008zm3.75-7.5h.008v.008H12V8.25zm0 3.75h.008v.008H12V12zm0 3.75h.008v.008H12v-.008zM15.75 8.25h.008v.008h-.008V8.25zm0 3.75h.008v.008h-.008V12zm0 3.75h.008v.008h-.008v-.008z" />
                            </svg>
                          </span>
                          <span className="font-bold text-slate-700">{depoName}</span>
                        </div>
                        <span className="rounded-full bg-surface-card px-2.5 py-1 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-300">
                          {depoItems.length} user
                        </span>
                      </div>
                    </td>
                  </tr>,
                  ...depoItems.map((item) => (
                    <tr key={item.id} className="group hover:bg-overlay-70 transition-colors">
                    <td className="px-5 py-4 text-sm text-slate-500">{(page - 1) * 20 + items.indexOf(item) + 1}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-linear-to-br from-primary-500 to-primary-600 flex items-center justify-center text-sm font-bold text-white">
                            {item.full_name?.charAt(0) || 'U'}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${item.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{item.full_name}</div>
                          <div className="text-xs text-gray-500">{item.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm">
                        <span className="font-mono font-medium text-gray-700">{item.kode_depo || '-'}</span>
                        {item.nama_depo && <span className="text-gray-400 ml-1">· {item.nama_depo}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getLevelBadge(item.level)}`}>
                        {levels.find(l => l.value === item.level)?.label || item.level}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-300'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                        {item.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission('users.edit') && (
                        <button onClick={() => handleEdit(item)} className="p-2 min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200" title="Edit" aria-label="Edit">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                        )}
                        {hasPermission('users.delete') && (
                        <button onClick={() => handleDelete(item.id)} disabled={deleting} className="p-2 min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed" title="Hapus" aria-label="Hapus">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                        )}
                      </div>
                    </td>
                    </tr>
                  )),
                ]) : items.map((item, index) => (
                  <tr key={item.id} className="group hover:bg-overlay-70 transition-colors">
                    <td className="table-cell text-sm text-slate-500">{(page - 1) * 20 + index + 1}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-linear-to-br from-primary-500 to-primary-600 flex items-center justify-center text-sm font-bold text-white">
                            {item.full_name?.charAt(0) || 'U'}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${item.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{item.full_name}</div>
                          <div className="text-xs text-gray-500">{item.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell"><div className="text-sm"><span className="font-mono font-medium text-gray-700">{item.kode_depo || '-'}</span>{item.nama_depo && <span className="text-gray-400 ml-1">· {item.nama_depo}</span>}</div></td>
                    <td className="table-cell"><span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getLevelBadge(item.level)}`}>{levels.find(l => l.value === item.level)?.label || item.level}</span></td>
                    <td className="table-cell"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-300'}`}><span className={`w-1.5 h-1.5 rounded-full ${item.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>{item.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                    <td className="table-cell"><div className="flex items-center justify-end gap-1">{hasPermission('users.edit') && (<button onClick={() => handleEdit(item)} className="p-2 min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200" title="Edit" aria-label="Edit"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg></button>)}{hasPermission('users.delete') && (<button onClick={() => handleDelete(item.id)} className="p-2 min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200" title="Hapus" aria-label="Hapus"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>)}</div></td>
                  </tr>
                )))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-cell py-16 text-center">
                      <div className="flex flex-col items-center gap-3" role="status">
                        <svg className="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                        <p className="text-sm text-gray-500">Tidak ada data user</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-gray-100 md:hidden">
            {groupByDepo ? (
              Object.entries(groupedItems).flatMap(([depoName, depoItems]) => [
                <div key={`depo-${depoName}`} className="flex items-center justify-between gap-3 bg-overlay-70 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-chip-primary text-accent-text">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V5.25L12 3l6.75 2.25V21M8.25 8.25h.008v.008H8.25V8.25zm0 3.75h.008v.008H8.25V12zm0 3.75h.008v.008H8.25v-.008zm3.75-7.5h.008v.008H12V8.25zm0 3.75h.008v.008H12V12zm0 3.75h.008v.008H12v-.008zM15.75 8.25h.008v.008h-.008V8.25zm0 3.75h.008v.008h-.008V12zm0 3.75h.008v.008h-.008v-.008z" /></svg>
                    </span>
                    <span className="font-bold text-slate-700 text-sm">{depoName}</span>
                  </div>
                  <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-gray-300">{depoItems.length} user</span>
                </div>,
                ...depoItems.map((item) => <React.Fragment key={item.id}>{mobileCard(item)}</React.Fragment>)
              ])
            ) : items.map((item) => <React.Fragment key={item.id}>{mobileCard(item)}</React.Fragment>)}
          </div>

          {/* Pagination */}
          {lastPage > 1 && (
            <div className="border-t border-gray-100 bg-overlay-50 px-5 py-4">
              <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-slate-500">
                Menampilkan <span className="font-medium text-slate-700">{fromCount}</span>–<span className="font-medium text-slate-700">{toCount}</span> dari <span className="font-medium text-slate-700">{totalCount}</span> user
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-lg border border-gray-300 bg-surface-card px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed">← Sebelumnya</button>
                <span className="text-xs text-slate-500">Halaman <span className="font-medium text-gray-700">{page}</span> / <span className="font-medium text-gray-700">{lastPage}</span></span>
                <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="rounded-lg border border-gray-300 bg-surface-card px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed">Selanjutnya →</button>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateForm({ ...emptyForm }); }} title="Tambah User" subtitle="Buat akun pengguna baru" size="md"
        footer={
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
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input value={createForm.full_name} onChange={(e) => setCreateForm(prev => ({ ...prev, full_name: e.target.value }))} className="input-field" placeholder="Nama lengkap" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
              <input type="email" value={createForm.email} onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="email@contoh.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
              <input type="password" value={createForm.password} onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))} className="input-field" placeholder="Minimal 8 karakter" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Konfirmasi Password *</label>
              <input type="password" value={createForm.password_confirmation} onChange={(e) => setCreateForm(prev => ({ ...prev, password_confirmation: e.target.value }))} className="input-field" placeholder="Ulangi password" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kode Depo *</label>
              <input value={createForm.kode_depo} onChange={(e) => setCreateForm(prev => ({ ...prev, kode_depo: e.target.value }))} className="input-field" placeholder="Masukkan kode depo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama Depo *</label>
              <input value={createForm.nama_depo} onChange={(e) => setCreateForm(prev => ({ ...prev, nama_depo: e.target.value }))} className="input-field" placeholder="Masukkan nama depo" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Level *</label>
              <select value={createForm.level} onChange={(e) => setCreateForm(prev => ({ ...prev, level: e.target.value }))} className="select-field">
                {levels.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select value={createForm.status} onChange={(e) => setCreateForm(prev => ({ ...prev, status: e.target.value }))} className="select-field">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={showImport}
        onClose={() => { setShowImport(false); setSelectedFile(null); setImportResult(null); }}
        title="Import User"
        subtitle="Upload file Excel atau CSV"
        size="md"
        footer={
          <>
            <button onClick={() => { setShowImport(false); setSelectedFile(null); setImportResult(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleImport} disabled={!selectedFile || importing} className="btn-primary disabled:opacity-50">
              {importing ? 'Mengimpor...' : 'Import Sekarang'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-300"
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            <p className="text-sm font-medium text-gray-700">{selectedFile?.name || 'Klik untuk memilih file'}</p>
            <p className="text-xs text-gray-400 mt-1">Kolom: email, full_name, kode_depo, nama_depo, level, status</p>
          </div>
          {importResult && (
            <div className={`p-4 rounded-xl ${importResult.errors?.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <p className="text-sm font-medium">{importResult.message}</p>
              <p className="text-xs mt-1">Baris: {importResult.total_rows ?? 0} · Baru: {importResult.imported ?? 0} · Diperbarui: {importResult.updated ?? 0}</p>
              {importResult.errors?.slice(0, 5).map((error) => <p key={error.row} className="text-xs mt-1">Baris {error.row}: {error.errors}</p>)}
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => { setEditItem(null); setEditForm({}); }} title="Edit User" subtitle="Edit data pengguna" size="md"
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <input value={editForm.full_name || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, full_name: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={editForm.email || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, email: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password (kosongkan jika tidak diubah)</label>
              <input type="password" value={editForm.password || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, password: e.target.value }))} className="input-field" placeholder="Minimal 8 karakter" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Konfirmasi Password</label>
              <input type="password" value={editForm.password_confirmation || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, password_confirmation: e.target.value }))} className="input-field" placeholder="Ulangi password" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kode Depo</label>
              <input value={editForm.kode_depo || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, kode_depo: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama Depo</label>
              <input value={editForm.nama_depo || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, nama_depo: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Level</label>
              <select value={editForm.level || 'staff_logistic'} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, level: e.target.value }))} className="select-field">
                {levels.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select value={editForm.status || 'active'} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, status: e.target.value }))} className="select-field">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => { if (deleting) return; setShowDeleteConfirm(false); setDeleteTargetId(null); }}
        onConfirm={doDelete}
        title="Hapus User"
        message="Apakah Anda yakin ingin menghapus user ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="danger"
        loading={deleting}
      />
      <ConfirmDialog
        open={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={doSave}
        title={saveMode === 'create' ? 'Tambah User' : 'Edit User'}
        message={saveMode === 'create' ? 'Apakah Anda yakin ingin membuat user baru?' : 'Apakah Anda yakin ingin menyimpan perubahan user?'}
        confirmLabel="Simpan"
        variant="warning"
        loading={saving}
      />
    </DashboardLayout>
  );
}
