'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { roles, permissions, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import ToggleSwitch from '@/components/ToggleSwitch';
import { useAuthStore } from '@/store/auth';

// ==================== TYPES ====================
interface Role {
  id: number;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  users_count: number;
  permissions_count?: number;
  menu_groups?: string[];
}

interface Permission {
  id: number;
  name: string;
  slug: string;
  description: string;
  menu_group: string;
  icon: string;
  route: string;
  is_active: boolean;
  roles_count?: number;
}

interface PermissionItem {
  id: number;
  name: string;
  slug: string;
  menu_group: string;
  icon: string;
  assigned: boolean;
}

interface GroupedPermissionItems {
  [key: string]: PermissionItem[];
}

interface GroupedPermissions {
  [key: string]: Permission[];
}

// ==================== MAIN COMPONENT ====================
export default function AccessManagementPage() {
  const [activeTab, setActiveTab] = useState<'roles' | 'permissions'>('roles');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'permissions') {
      setActiveTab('permissions');
    }
  }, []);

  const switchTab = (tab: 'roles' | 'permissions') => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'permissions') {
      url.searchParams.set('tab', 'permissions');
    } else {
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Roles & Permissions</h1>
                <p className="text-gray-400 mt-0.5">Kelola akses pengguna berdasarkan peran</p>
              </div>
            </div>
          </div>
        </div>

        {/* How it works banner */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
               { step: 1, title: 'Role = Peran', desc: 'Contoh: BLC, Cheker, Admin Distribusi. Satu role bisa dipakai banyak user.' },
              { step: 2, title: 'Berikan Akses', desc: 'Klik "Kelola Akses" pada role, lalu nyalakan permission menu yang boleh diakses role tersebut.' },
              { step: 3, title: 'User Melekat pada Role', desc: 'Menu di sidebar otomatis menyesuaikan akses role sang user. Tidak perlu atur satu-satu.' },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-sm font-bold">
                  {item.step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5">
          <div className="flex gap-1" role="tablist">
            <button
              onClick={() => switchTab('roles')}
              role="tab"
              aria-selected={activeTab === 'roles'}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'roles'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Roles
            </button>
            <button
              onClick={() => switchTab('permissions')}
              role="tab"
              aria-selected={activeTab === 'permissions'}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'permissions'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              Permissions
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div role="tabpanel">
          {activeTab === 'roles' ? <RolesTab /> : <PermissionsTab />}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ==================== ROLES TAB ====================
function RolesTab() {
  const { hasPermission } = useAuthStore();
  const [roleList, setRoleList] = useState<Role[]>([]);
  const [totalPermissions, setTotalPermissions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Search
  const [search, setSearch] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ message: string; ok?: boolean; imported?: number; updated?: number; errors?: { row: number; errors: string }[] } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Permission Management State
  const [showPermModal, setShowPermModal] = useState(false);
  const [permRole, setPermRole] = useState<Role | null>(null);
  const [allPermissions, setAllPermissions] = useState<GroupedPermissionItems>({});
  const [assignedIds, setAssignedIds] = useState<number[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [showPermSaveConfirm, setShowPermSaveConfirm] = useState(false);
  const [hasPermChanges, setHasPermChanges] = useState(false);
  const [permSearch, setPermSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => { loadRoles(); }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const loadRoles = async (searchQuery?: string) => {
    try {
      const query = searchQuery ?? search;
      const res = await roles.list(query || undefined);
      setRoleList(res.data.data);
      setTotalPermissions(res.data.meta?.total_permissions || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Search handler with debounce
  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadRoles(value);
    }, 300);
  };

  // Import handler
  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await roles.import(selectedFile);
      const data = res.data.data;
      setImportResult({ message: res.data.message || 'Import selesai', ok: true, ...data });
      setSelectedFile(null);
      loadRoles();
    } catch (e) {
      setImportResult({ message: getErrorMessage(e, 'Import gagal'), ok: false });
    } finally {
      setImporting(false);
    }
  };

  // Export handler
  const handleExport = async () => {
    try {
      const res = await roles.export();
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'roles-export.csv';
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Export role berhasil!');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Export gagal'));
    }
  };

  // Template handler
  const handleTemplate = async () => {
    try {
      const res = await roles.template();
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'role-import-template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
      notifyGlobal('Template unduh!');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengunduh template'));
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (deleteTargetId === null) return;
    try {
      await roles.delete(deleteTargetId);
      loadRoles();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowSubmitConfirm(true);
  };

  const confirmSubmit = async () => {
    setSubmitLoading(true);
    try {
      if (editingRole) {
        await roles.update(editingRole.id, form);
      } else {
        await roles.create(form);
      }
      setShowModal(false);
      setForm({ name: '', slug: '', description: '' });
      setEditingRole(null);
      loadRoles();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setShowSubmitConfirm(false);
      setSubmitLoading(false);
    }
  };

  // Permission Management
  const handleOpenPermissions = async (role: Role) => {
    setPermRole(role);
    setShowPermModal(true);
    setPermLoading(true);
    setHasPermChanges(false);
    setPermSearch('');
    setCollapsedGroups(new Set());
    try {
      const res = await roles.getPermissions(role.id);
      const perms = res.data.permissions as PermissionItem[];
      const grouped: GroupedPermissionItems = {};
      perms.forEach((p) => {
        if (!grouped[p.menu_group]) grouped[p.menu_group] = [];
        grouped[p.menu_group].push(p);
      });
      setAllPermissions(grouped);
      setAssignedIds(res.data.assignedIds || []);
    } catch (e) {
      console.error(e);
    } finally {
      setPermLoading(false);
    }
  };

  const togglePermission = useCallback((permId: number) => {
    setHasPermChanges(true);
    setAssignedIds((prev) =>
      prev.includes(permId)
        ? prev.filter((id) => id !== permId)
        : [...prev, permId]
    );
  }, []);

  const toggleGroup = useCallback((groupName: string) => {
    setHasPermChanges(true);
    const groupPerms = allPermissions[groupName] as PermissionItem[] || [];
    const groupIds = groupPerms.map((p) => p.id);
    const allAssigned = groupIds.every((id) => assignedIds.includes(id));

    if (allAssigned) {
      setAssignedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    } else {
      setAssignedIds((prev) => [...new Set([...prev, ...groupIds])]);
    }
  }, [allPermissions, assignedIds]);

  const toggleAll = useCallback(() => {
    setHasPermChanges(true);
    const allIds = Object.values(allPermissions)
      .flat()
      .map((p) => p.id);
    const allAssigned = allIds.every((id) => assignedIds.includes(id));

    if (allAssigned) {
      setAssignedIds([]);
    } else {
      setAssignedIds(allIds);
    }
  }, [allPermissions, assignedIds]);

  const togglePermGroupExpand = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }, []);

  const setAllPermGroupsCollapsed = useCallback((collapsed: boolean) => {
    if (collapsed) {
      setCollapsedGroups(new Set(Object.keys(allPermissions)));
    } else {
      setCollapsedGroups(new Set());
    }
  }, [allPermissions]);

  const handleSavePermissions = async () => {
    if (!permRole) return;
    setPermSaving(true);
    try {
      await roles.syncPermissions(permRole.id, assignedIds);
      setShowPermModal(false);
      setPermRole(null);
      loadRoles();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setPermSaving(false);
      setShowPermSaveConfirm(false);
    }
  };

  const isGroupFullyAssigned = (groupName: string) => {
    const groupPerms = (allPermissions[groupName] as PermissionItem[]) || [];
    return groupPerms.length > 0 && groupPerms.every((p) => assignedIds.includes(p.id));
  };

  const totalPerms = Object.values(allPermissions).flat().length;
  const totalAssigned = assignedIds.length;

  // Filter grup/item sesuai pencarian; saat mencari, semua grup hasil tampil terbuka.
  const permSearchLower = permSearch.trim().toLowerCase();
  const filteredPermGroups = Object.entries(allPermissions)
    .map(([groupName, perms]) => [
      groupName,
      (perms as PermissionItem[]).filter(
        (p) =>
          !permSearchLower ||
          p.name.toLowerCase().includes(permSearchLower) ||
          p.slug.toLowerCase().includes(permSearchLower)
      ),
    ] as [string, PermissionItem[]])
    .filter(([, perms]) => perms.length > 0);

  return (
    <>
      {/* Toolbar: Search + Action Buttons */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Cari role..."
                className="input-field !pl-11 !py-2.5"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasPermission('roles.template') && (
              <button onClick={handleTemplate} className="btn-secondary whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14a1 1 0 0 0 1-1v-4" /></svg>
                  Template
                </span>
              </button>
            )}
            {hasPermission('roles.export') && (
              <button onClick={handleExport} className="btn-secondary whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14a1 1 0 0 0 1-1v-4" /></svg>
                  Export
                </span>
              </button>
            )}
            {hasPermission('roles.import') && (
              <button onClick={() => { setSelectedFile(null); setImportResult(null); setShowImport(true); }} className="btn-secondary whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14a1 1 0 0 0 1-1v-4" /></svg>
                  Import
                </span>
              </button>
            )}
            {hasPermission('roles.create') && (
              <button
                onClick={() => { setEditingRole(null); setForm({ name: '', slug: '', description: '' }); setShowModal(true); }}
                className="btn-primary"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah Role
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roleList.map((role) => (
          <div key={role.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{role.name}</h3>
                  <span className="text-xs font-mono text-gray-400">{role.slug}</span>
                </div>
              </div>
              {hasPermission('roles.edit') ? (
                <ToggleSwitch
                  checked={role.is_active}
                  disabled={role.is_active && role.users_count > 0}
                  onChange={async (checked) => {
                    try {
                      await roles.update(role.id, { is_active: checked });
                      loadRoles();
                    } catch (e) {
                      notifyGlobal(getErrorMessage(e, 'Gagal mengubah status role. Role yang masih dipakai user tidak dapat dinonaktifkan.'));
                    }
                  }}
                  size="sm"
                />
              ) : (
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${role.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {role.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
              )}
            </div>

            <p className="text-sm text-gray-500 mb-4 line-clamp-2">{role.description || 'Tidak ada deskripsi'}</p>

            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg">
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">{role.users_count} user</span>
                </div>
                <span className="text-xs font-semibold text-primary-700">
                  {role.permissions_count ?? 0}/{totalPermissions || '…'} akses
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${totalPermissions ? Math.round(((role.permissions_count || 0) / totalPermissions) * 100) : 0}%` }}
                ></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(role.menu_groups || []).slice(0, 4).map((mg) => (
                  <span key={mg} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md text-[11px] font-medium">
                    {mg}
                  </span>
                ))}
                {(role.menu_groups || []).length > 4 && (
                  <span className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded-md text-[11px] font-medium">
                    +{(role.menu_groups || []).length - 4} lainnya
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenPermissions(role)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-50 text-primary-700 rounded-xl text-sm font-medium hover:bg-primary-100 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Kelola Akses
              </button>
              {hasPermission('roles.edit') && (
              <button
                onClick={() => { setEditingRole(role); setForm({ name: role.name, slug: role.slug, description: role.description }); setShowModal(true); }}
                aria-label="Edit role"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
              )}
              {hasPermission('roles.delete') && (
              <button
                onClick={() => handleDelete(role.id)}
                aria-label="Hapus role"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
              )}
            </div>
          </div>
        ))}

        {roleList.length === 0 && !loading && (
          <div className="col-span-full">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center" role="status">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <p className="text-gray-500">Belum ada role</p>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Role Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingRole ? 'Edit Role' : 'Tambah Role Baru'}
        subtitle={editingRole ? 'Ubah detail role' : 'Buat role baru'}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
              Batal
            </button>
            <button type="submit" form="role-form" className="btn-primary">
              {editingRole ? 'Simpan' : 'Buat'}
            </button>
          </>
        }
      >
        <form id="role-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="role-name" className="block text-sm font-semibold text-gray-700 mb-2">Nama Role</label>
            <input
              id="role-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="Contoh: Admin Gudang"
              required
            />
          </div>
          <div>
            <label htmlFor="role-slug" className="block text-sm font-semibold text-gray-700 mb-2">Slug</label>
            <input
              id="role-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="input-field"
              placeholder="Contoh: admin_gudang"
              required
            />
          </div>
          <div>
            <label htmlFor="role-description" className="block text-sm font-semibold text-gray-700 mb-2">Deskripsi</label>
            <textarea
              id="role-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field min-h-[80px]"
              placeholder="Deskripsi singkat tentang role ini"
            />
          </div>
        </form>
      </Modal>

      {/* Permission Management Modal */}
      <Modal
        open={showPermModal}
        onClose={() => { if (hasPermChanges) { if (confirm('Ada perubahan yang belum disimpan. Yakin ingin menutup?')) { setShowPermModal(false); setPermRole(null); } } else { setShowPermModal(false); setPermRole(null); } }}
        title={`Kelola Akses: ${permRole?.name || ''}`}
        subtitle={`Atur permission untuk role ini`}
        size="lg"
        footer={
          <>
            <button onClick={() => { if (hasPermChanges) { if (confirm('Ada perubahan yang belum disimpan. Yakin ingin menutup?')) { setShowPermModal(false); setPermRole(null); } } else { setShowPermModal(false); setPermRole(null); } }} className="btn-secondary">
              Batal
            </button>
            {hasPermission('roles.edit') && (
              <button
                onClick={() => setShowPermSaveConfirm(true)}
                disabled={!hasPermChanges || permSaving}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {permSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            )}
          </>
        }
      >
        {permLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4"></div>
            <p className="text-sm text-gray-500">Memuat permission...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Bar */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Total:</span>
                <span className="text-sm font-semibold text-gray-900">{totalAssigned}/{totalPerms} aktif</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAllPermGroupsCollapsed(collapsedGroups.size < Object.keys(allPermissions).length)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  {collapsedGroups.size < Object.keys(allPermissions).length ? 'Ciutkan Semua' : 'Bentangkan Semua'}
                </button>
                {hasPermission('roles.edit') && (
                  <button
                    onClick={toggleAll}
                    className="text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    {totalAssigned === totalPerms ? 'Nonaktifkan Semua' : 'Aktifkan Semua'}
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                placeholder="Cari permission atau grup..."
                className="input-field !pl-11 !py-2.5"
              />
            </div>

            {/* Permission Groups */}
            {filteredPermGroups.map(([groupName, perms]) => {
              const assignedCount = perms.filter(p => assignedIds.includes(p.id)).length;
              const collapsed = !permSearchLower && collapsedGroups.has(groupName);
              return (
              <div key={groupName} className="border border-gray-100 rounded-xl overflow-hidden">
                {/* Group Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => togglePermGroupExpand(groupName)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700">{groupName}</h3>
                      <span className="text-xs text-gray-400">{assignedCount}/{perms.length} aktif</span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {hasPermission('roles.edit') && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={isGroupFullyAssigned(groupName)}
                        onChange={() => toggleGroup(groupName)}
                        size="sm"
                      />
                    </span>
                  )}
                </div>

                {/* Permission Items */}
                {!collapsed && (
                <div className="divide-y divide-gray-50">
                  {perms.map((perm) => (
                    <div key={perm.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${assignedIds.includes(perm.id) ? 'bg-primary-500' : 'bg-gray-200'}`}></div>
                        <div>
                          <span className="text-sm font-medium text-gray-700">{perm.name}</span>
                          <span className="text-xs text-gray-400 ml-2 font-mono">{perm.slug}</span>
                        </div>
                      </div>
                      {hasPermission('roles.edit') && (
                        <ToggleSwitch
                          checked={assignedIds.includes(perm.id)}
                          onChange={() => togglePermission(perm.id)}
                          size="sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
                )}
              </div>
              );
            })}

            {filteredPermGroups.length === 0 && (
              <div className="text-center py-12" role="status">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-gray-500">{permSearch ? `Tidak ada permission cocok "${permSearch}"` : 'Belum ada permission tersedia'}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
        onConfirm={confirmDelete}
        title="Hapus Role"
        message="Yakin ingin menghapus role ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="danger"
      />

      {/* Submit Confirm */}
      <ConfirmDialog
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={confirmSubmit}
        title={editingRole ? 'Simpan Role' : 'Buat Role'}
        message={editingRole ? 'Yakin ingin menyimpan perubahan?' : 'Yakin ingin membuat role baru?'}
        confirmLabel={editingRole ? 'Simpan' : 'Buat'}
        variant="warning"
        loading={submitLoading}
      />

      {/* Import Modal */}
      <Modal
        open={showImport}
        onClose={() => { setShowImport(false); setSelectedFile(null); setImportResult(null); }}
        title="Import Role"
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
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-primary-300"
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            <p className="text-sm font-medium text-gray-700">{selectedFile?.name || 'Klik untuk memilih file'}</p>
            <p className="text-xs text-gray-400 mt-1">Kolom: Nama, Slug, Deskripsi, Aktif (true/false)</p>
          </div>
          {importResult && (
            <div className={`p-4 rounded-xl ${importResult.errors?.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <p className="text-sm font-medium">{importResult.message}</p>
              <p className="text-xs mt-1">
                Baris: {importResult.imported ?? 0} baru · Diperbarui: {importResult.updated ?? 0}
                {importResult.errors?.slice(0, 5).map((error, i) => (
                  <p key={i} className="text-xs mt-1">Baris {error.row}: {error.errors}</p>
                ))}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Permission Save Confirm */}
      <ConfirmDialog
        open={showPermSaveConfirm}
        onClose={() => setShowPermSaveConfirm(false)}
        onConfirm={handleSavePermissions}
        title="Simpan Permission"
        message={`Yakin ingin menyimpan ${totalAssigned} permission yang aktif untuk role "${permRole?.name}"?`}
        confirmLabel="Simpan"
        variant="info"
        loading={permSaving}
      />
    </>
  );
}

// ==================== PERMISSIONS TAB ====================
function PermissionsTab() {
  const { hasPermission } = useAuthStore();
  const [permList, setPermList] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPerm, setEditingPerm] = useState<Permission | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', menu_group: '', icon: '', route: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => { loadPermissions(); }, []);

  const loadPermissions = async () => {
    try {
      const res = await permissions.list();
      setPermList(res.data.data);
      setExpandedGroups(new Set(res.data.groups || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowSubmitConfirm(true);
  };

  const confirmSubmit = async () => {
    setSubmitLoading(true);
    try {
      if (editingPerm) {
        await permissions.update(editingPerm.id, form);
      } else {
        await permissions.create(form);
      }
      setShowModal(false);
      setForm({ name: '', slug: '', description: '', menu_group: '', icon: '', route: '' });
      setEditingPerm(null);
      loadPermissions();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setSubmitLoading(false);
      setShowSubmitConfirm(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (deleteTargetId === null) return;
    try {
      await permissions.delete(deleteTargetId);
      loadPermissions();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  };

  const handleToggleActive = async (perm: Permission) => {
    try {
      await permissions.update(perm.id, { is_active: !perm.is_active });
      loadPermissions();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    }
  };

  const toggleGroupExpand = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  // Group permissions
  const groupedPerms: GroupedPermissions = {};
  permList.forEach((p) => {
    const group = p.menu_group || 'Lainnya';
    if (!groupedPerms[group]) groupedPerms[group] = [];
    groupedPerms[group].push(p);
  });

  // Filter by search
  const filteredGroups = Object.entries(groupedPerms).filter(([groupName, perms]) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return groupName.toLowerCase().includes(searchLower) ||
      (perms as Permission[]).some(p => p.name.toLowerCase().includes(searchLower) || p.slug.toLowerCase().includes(searchLower));
  });

  const totalPerms = permList.length;
  const activePerms = permList.filter(p => p.is_active).length;
  const uniqueGroups = Object.keys(groupedPerms).length;

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalPerms}</p>
              <p className="text-sm text-gray-500">Total Permission</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activePerms}</p>
              <p className="text-sm text-gray-500">Aktif</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{uniqueGroups}</p>
              <p className="text-sm text-gray-500">Menu Group</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Permission Button & Search */}
      <div className="flex items-center gap-4">
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari permission atau grup..."
              className="input-field !pl-12"
            />
          </div>
        </div>
        {hasPermission('roles.create') && (
        <button
          onClick={() => { setEditingPerm(null); setForm({ name: '', slug: '', description: '', menu_group: '', icon: '', route: '' }); setShowModal(true); }}
          className="btn-primary"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Tambah
          </span>
        </button>
        )}
      </div>

      {/* Permission Groups */}
      <div className="space-y-4">
        {filteredGroups.map(([groupName, perms]) => (
          <div key={groupName} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Group Header */}
            <button
              onClick={() => toggleGroupExpand(groupName)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                  </svg>
                </div>
                <div className="text-left">
                  <h2 className="text-base font-semibold text-gray-900">{groupName}</h2>
                  <p className="text-sm text-gray-500">
                    {(perms as Permission[]).filter(p => p.is_active).length}/{perms.length} aktif
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-600">
                  {perms.length}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${expandedGroups.has(groupName) ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </button>

            {/* Permission Items */}
            {expandedGroups.has(groupName) && (
              <div className="border-t border-gray-100">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama</div>
                  <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Slug</div>
                  <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Route</div>
                  <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Dipakai</div>
                  <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Status</div>
                  <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Aksi</div>
                </div>

                {/* Permission Rows */}
                <div className="divide-y divide-gray-50">
                  {(perms as Permission[]).map((perm) => (
                    <div key={perm.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors items-center">
                      <div className="col-span-4">
                        <div className="font-medium text-gray-900">{perm.name}</div>
                        {perm.description && (
                          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{perm.description}</div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-mono">
                          {perm.slug}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-gray-500 font-mono line-clamp-1">{perm.route || '-'}</span>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${perm.roles_count ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                          {perm.roles_count || 0} role
                        </span>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {hasPermission('roles.edit') ? (
                          <ToggleSwitch
                            checked={perm.is_active}
                            onChange={() => handleToggleActive(perm)}
                            size="sm"
                          />
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${perm.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {perm.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        {hasPermission('roles.edit') && (
                        <button
                          onClick={() => { setEditingPerm(perm); setForm(perm); setShowModal(true); }}
                          aria-label="Edit permission"
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        )}
                        {hasPermission('roles.delete') && (
                        <button
                          onClick={() => handleDelete(perm.id)}
                          aria-label="Hapus permission"
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

            {filteredGroups.length === 0 && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center" role="status">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-gray-500">Tidak ada permission ditemukan</p>
          </div>
        )}
      </div>

      {/* Add/Edit Permission Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingPerm ? 'Edit Permission' : 'Tambah Permission Baru'}
        subtitle={editingPerm ? 'Ubah detail permission' : 'Buat permission baru'}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
              Batal
            </button>
            <button type="submit" form="permission-form" className="btn-primary">
              {editingPerm ? 'Simpan' : 'Buat'}
            </button>
          </>
        }
      >
        <form id="permission-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="perm-name" className="block text-sm font-semibold text-gray-700 mb-2">Nama Permission</label>
            <input
              id="perm-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="Contoh: Lihat Produk"
              required
            />
          </div>
          <div>
            <label htmlFor="perm-slug" className="block text-sm font-semibold text-gray-700 mb-2">Slug</label>
            <input
              id="perm-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="input-field"
              placeholder="Contoh: npn.view"
              required
            />
          </div>
          <div>
            <label htmlFor="perm-menu-group" className="block text-sm font-semibold text-gray-700 mb-2">Menu Group</label>
            <input
              id="perm-menu-group"
              value={form.menu_group}
              onChange={(e) => setForm({ ...form, menu_group: e.target.value })}
              className="input-field"
              placeholder="Contoh: NPN Products"
            />
          </div>
          <div>
            <label htmlFor="perm-route" className="block text-sm font-semibold text-gray-700 mb-2">Route</label>
            <input
              id="perm-route"
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              className="input-field"
              placeholder="Contoh: /npn"
            />
          </div>
          <div>
            <label htmlFor="perm-description" className="block text-sm font-semibold text-gray-700 mb-2">Deskripsi</label>
            <textarea
              id="perm-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field min-h-[80px]"
              placeholder="Deskripsi singkat tentang permission ini"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
        onConfirm={confirmDelete}
        title="Hapus Permission"
        message="Yakin ingin menghapus permission ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="danger"
      />

      {/* Submit Confirm */}
      <ConfirmDialog
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={confirmSubmit}
        title={editingPerm ? 'Simpan Permission' : 'Buat Permission'}
        message={editingPerm ? 'Yakin ingin menyimpan perubahan?' : 'Yakin ingin membuat permission baru?'}
        confirmLabel={editingPerm ? 'Simpan' : 'Buat'}
        variant="warning"
        loading={submitLoading}
      />
    </>
  );
}
