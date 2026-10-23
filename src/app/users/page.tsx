'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import React from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { users, depotSettings, regions, partnerSites, getErrorMessage, type PartnerSiteOption, type UserDepot } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuthStore } from '@/store/auth';

interface UserItem {
  id: number;
  kode_depo: string;
  nama_depo: string;
  depot_codes?: string[];
  scope_level: 'master' | 'region' | 'depot' | 'ps';
  kode_ps: string | null;
  region_id?: string | null;
  has_region_permission?: boolean;
  uses_global_scope?: boolean;
  full_name: string;
  alamat: string;
  email: string;
  level: string;
  status: string;
  role_id: number;
  roles: { id: number; name: string; slug: string }[];
  created_at: string;
  updated_at: string;
}

type DepotOption = Pick<UserDepot, 'kode_depo' | 'nama_depo' | 'region_id'>;

interface RegionOption {
  code: string;
  name: string;
}

interface RoleOption {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  has_global_depot_access: boolean;
}

const emptyForm = {
  kode_depo: '', nama_depo: '', region_id: '', scope_level: 'depot', kode_ps: '', full_name: '', alamat: '', email: '',
  password: '', password_confirmation: '',
  level: '', status: 'active',
};

export default function UsersPage() {
  const { hasPermission, user } = useAuthStore();
  const canViewUsers = hasPermission('users.view');
  const isMasterScope = user?.scope_level === 'master';
  const canCreateDepot = isMasterScope || user?.scope_level === 'region';
  const canCreatePartnerSite = isMasterScope || user?.scope_level === 'depot';
  const [items, setItems] = useState<UserItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [groupByDepo, setGroupByDepo] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, admin_master: 0 });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyForm });
  const [createDepotCodes, setCreateDepotCodes] = useState<string[]>([]);
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
  const [editTab, setEditTab] = useState<'profile' | 'depots'>('profile');
  const [userDepots, setUserDepots] = useState<UserDepot[]>([]);
  const [editDepotCodes, setEditDepotCodes] = useState<string[]>([]);
  const [loadingDepots, setLoadingDepots] = useState(false);
  const [depotLoadError, setDepotLoadError] = useState<string | null>(null);
  const [usesGlobalScope, setUsesGlobalScope] = useState(false);
  const [depotOptions, setDepotOptions] = useState<DepotOption[]>([]);
  const [partnerSiteOptions, setPartnerSiteOptions] = useState<PartnerSiteOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [roleOptionsError, setRoleOptionsError] = useState<string | null>(null);
  const [regionAssignments, setRegionAssignments] = useState<Record<string, string>>({});
  const [showRegionMapping, setShowRegionMapping] = useState(false);
  const [savingRegionDepot, setSavingRegionDepot] = useState<string | null>(null);
  const [regionMappingError, setRegionMappingError] = useState<string | null>(null);
  const [showNewRegionFields, setShowNewRegionFields] = useState(false);
  const [newRegionCode, setNewRegionCode] = useState('');
  const [newRegionName, setNewRegionName] = useState('');
  const [creatingRegion, setCreatingRegion] = useState(false);
  const [regionNameEditCode, setRegionNameEditCode] = useState('');
  const [regionNameEditValue, setRegionNameEditValue] = useState('');
  const [savingRegionName, setSavingRegionName] = useState(false);
  const [showNewDepotFields, setShowNewDepotFields] = useState(false);
  const [newDepotCode, setNewDepotCode] = useState('');
  const [newDepotName, setNewDepotName] = useState('');
  const [creatingDepot, setCreatingDepot] = useState(false);
  const [showNewPartnerSiteFields, setShowNewPartnerSiteFields] = useState(false);
  const [newPartnerSiteCode, setNewPartnerSiteCode] = useState('');
  const [newPartnerSiteName, setNewPartnerSiteName] = useState('');
  const [creatingPartnerSite, setCreatingPartnerSite] = useState(false);
  const [masterDataError, setMasterDataError] = useState<string | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveMode, setSaveMode] = useState<'create' | 'edit'>('create');

  const loadItems = useCallback(async () => {
    try {
      const res = await users.list({ search, level: levelFilter, status: statusFilter, region_id: regionFilter, page, per_page: 20 });
      setItems(res.data.data);
      setLastPage(res.data.last_page ?? 1);
      setTotalCount(res.data.total ?? res.data.data?.length ?? 0);
      setStats(res.data.meta ?? { total: 0, active: 0, inactive: 0, admin_master: 0 });
      setError(null);
    } catch (e) {
      // Jangan biarkan error menyamar sebagai 'belum ada data'
      setError(getErrorMessage(e, 'Gagal memuat data pengguna.'));
    }
  }, [search, levelFilter, statusFilter, regionFilter, page]);

  useEffect(() => {
    if (canViewUsers) loadItems();
  }, [canViewUsers, loadItems]);

  useEffect(() => {
    if (!canViewUsers) return;
    setDepotLoadError(null);
    Promise.all([depotSettings.list(), regions.list(), partnerSites.list()])
      .then(([depotResponse, regionResponse, partnerSiteResponse]) => {
        const list = (depotResponse.data.data ?? []) as DepotOption[];
        setDepotOptions(list);
        setRegionAssignments(Object.fromEntries(list.map(depot => [depot.kode_depo, depot.region_id ?? ''])));
        const options = (regionResponse.data.data ?? []) as RegionOption[];
        setRegionOptions(options);
        setPartnerSiteOptions(partnerSiteResponse.data.data ?? []);
      })
      .catch(e => {
        setDepotOptions([]);
        setRegionOptions([]);
        setPartnerSiteOptions([]);
        setDepotLoadError(getErrorMessage(e, 'Gagal memuat lookup region dan depo.'));
      });
  }, [canViewUsers]);

  useEffect(() => {
    if (!canViewUsers) return;
    users.roleOptions()
      .then(res => {
        const options = (res.data.data ?? []) as RoleOption[];
        setRoleOptions(options);
        setRoleOptionsError(null);
        setCreateForm(current => current.level
          ? current
          : {
            ...current,
            level: options.find(role => role.is_active && role.slug === 'staff_logistic' && !role.has_global_depot_access)?.slug
              ?? options.find(role => role.is_active && !role.has_global_depot_access)?.slug
              ?? '',
          });
      })
      .catch(error => {
        setRoleOptions([]);
        setRoleOptionsError(getErrorMessage(error, 'Gagal memuat pilihan role.'));
      });
  }, [canViewUsers]);

  const createRegionDepots = depotOptions.filter(depot => (depot.region_id ?? '') === createForm.region_id);
  const editRegionDepots = userDepots.filter(depot => (depot.region_id ?? '') === (editForm.region_id || ''));
  const createPartnerSites = partnerSiteOptions.filter(site => site.kode_depo === createForm.kode_depo);
  const editPartnerSites = partnerSiteOptions.filter(site => site.kode_depo === editForm.kode_depo);
  const createScopeOptions: UserItem['scope_level'][] = isMasterScope
    ? ['master', 'region', 'depot', 'ps']
    : user?.scope_level === 'region'
      ? ['depot', 'ps']
      : user?.scope_level === 'depot'
        ? ['ps']
        : [];
  const regionDepotGroups = regionOptions.reduce<Record<string, DepotOption[]>>((groups, region) => {
    groups[region.code] = [];
    return groups;
  }, {});
  depotOptions.forEach(depot => {
    const region = depot.region_id || 'Tanpa Region';
    regionDepotGroups[region] = regionDepotGroups[region] || [];
    regionDepotGroups[region].push(depot);
  });
  const roleLabel = (slug: string) => roleOptions.find(role => role.slug === slug)?.name || slug;
  const scopeLabel = (scope: UserItem['scope_level']) => ({
    master: 'Master',
    region: 'Region',
    depot: 'Depo',
    ps: 'Partner Site',
  })[scope];
  const regionLabel = (code: string) => {
    const region = regionOptions.find(option => option.code === code);
    return region ? `${region.code} · ${region.name}` : code;
  };
  const activeRoleOptions = roleOptions.filter(role => role.is_active);
  const createRole = activeRoleOptions.find(role => role.slug === createForm.level);
  const editRole = roleOptions.find(role => role.slug === editForm.level);
  const editRoleHasGlobalAccess = editRole?.has_global_depot_access ?? usesGlobalScope;
  const isEditingOwnAccount = editItem?.id === user?.id;

  const handleCreate = () => {
    setSaveMode('create');
    setShowSaveConfirm(true);
  };

  const handleCreateRegion = async () => {
    const code = newRegionCode.trim();
    const name = newRegionName.trim();
    if (!code || !name) {
      setMasterDataError('Kode dan nama region wajib diisi.');
      return;
    }
    setCreatingRegion(true);
    setMasterDataError(null);
    try {
      const response = await regions.create({ code, name });
      const createdRegion = response.data.data as RegionOption;
      setRegionOptions(current => [...current.filter(region => region.code !== createdRegion.code), createdRegion].sort((a, b) => a.code.localeCompare(b.code)));
      setCreateForm(current => ({ ...current, region_id: createdRegion.code, kode_depo: '', nama_depo: '', kode_ps: '' }));
      setCreateDepotCodes([]);
      setNewRegionCode('');
      setNewRegionName('');
      setShowNewRegionFields(false);
    } catch (error) {
      setMasterDataError(getErrorMessage(error, 'Gagal membuat region.'));
    } finally {
      setCreatingRegion(false);
    }
  };

  const handleCreateDepot = async () => {
    const code = newDepotCode.trim();
    const name = newDepotName.trim();
    if (!createForm.region_id || !code || !name) {
      setMasterDataError('Pilih region, lalu isi kode dan nama depo.');
      return;
    }
    if (depotOptions.some(depot => depot.kode_depo.toLowerCase() === code.toLowerCase())) {
      setMasterDataError(`Kode depo ${code} sudah terdaftar. Pilih depo tersebut dari daftar.`);
      return;
    }
    setCreatingDepot(true);
    setMasterDataError(null);
    try {
      const response = await depotSettings.create({
        kode_depo: code,
        nama_depo: name,
        region_id: createForm.region_id,
      });
      const createdDepot = response.data.data as DepotOption;
      setDepotOptions(current => [...current, createdDepot].sort((a, b) => a.kode_depo.localeCompare(b.kode_depo)));
      setRegionAssignments(current => ({ ...current, [createdDepot.kode_depo]: createForm.region_id }));
      setCreateDepotCodes([createdDepot.kode_depo]);
      setCreateForm(current => ({
        ...current,
        kode_depo: createdDepot.kode_depo,
        nama_depo: createdDepot.nama_depo,
        kode_ps: '',
      }));
      setNewDepotCode('');
      setNewDepotName('');
      setShowNewDepotFields(false);
    } catch (error) {
      setMasterDataError(getErrorMessage(error, 'Gagal membuat depo.'));
    } finally {
      setCreatingDepot(false);
    }
  };

  const handleCreatePartnerSite = async () => {
    const code = newPartnerSiteCode.trim();
    const name = newPartnerSiteName.trim();
    if (!createForm.kode_depo || !code || !name) {
      setMasterDataError('Pilih depo, lalu isi kode dan nama Partner Site.');
      return;
    }
    setCreatingPartnerSite(true);
    setMasterDataError(null);
    try {
      const response = await partnerSites.create({
        kode_ps: code,
        nama_ps: name,
        kode_depo: createForm.kode_depo,
      });
      const createdSite = response.data.data as PartnerSiteOption;
      setPartnerSiteOptions(current => [...current.filter(site => site.kode_ps !== createdSite.kode_ps), createdSite]);
      setCreateForm(current => ({ ...current, kode_ps: createdSite.kode_ps }));
      setNewPartnerSiteCode('');
      setNewPartnerSiteName('');
      setShowNewPartnerSiteFields(false);
    } catch (error) {
      setMasterDataError(getErrorMessage(error, 'Gagal membuat Partner Site.'));
    } finally {
      setCreatingPartnerSite(false);
    }
  };

  const handleSaveRegionName = async () => {
    const region = regionOptions.find(option => option.code === regionNameEditCode);
    const name = regionNameEditValue.trim();
    if (!region || !name) {
      setRegionMappingError('Pilih region dan isi nama region.');
      return;
    }
    setSavingRegionName(true);
    setRegionMappingError(null);
    try {
      const response = await regions.update(region.code, { name });
      const updatedRegion = response.data.data as RegionOption;
      setRegionOptions(current => current.map(option => option.code === updatedRegion.code ? updatedRegion : option));
      setRegionNameEditValue(updatedRegion.name);
      notifyGlobal(`Nama region ${updatedRegion.code} berhasil diperbarui.`);
    } catch (error) {
      setRegionMappingError(getErrorMessage(error, 'Gagal memperbarui nama region.'));
    } finally {
      setSavingRegionName(false);
    }
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
      region_id: item.region_id || '',
      scope_level: item.scope_level || 'depot',
      kode_ps: item.kode_ps || '',
      full_name: item.full_name || '',
      alamat: item.alamat || '',
      email: item.email || '',
      password: '',
      password_confirmation: '',
      current_password: '',
      level: item.level || 'staff_logistic',
      status: item.status || 'active',
    });
    setEditTab('profile');
    setLoadingDepots(true);
    setDepotLoadError(null);
    setUsesGlobalScope(false);
    users.getDepots(item.id)
      .then(res => {
        setUserDepots(res.data.data);
        setEditDepotCodes(res.data.data.filter(depot => depot.assigned).map(depot => depot.kode_depo));
        setUsesGlobalScope(Boolean(res.data.uses_global_scope));
      }).catch(e => {
        setUserDepots([]);
        setEditDepotCodes([]);
        setDepotLoadError(getErrorMessage(e, 'Gagal memuat akses depo user.'));
      })
      .finally(() => {
        setLoadingDepots(false);
      });
  };

  const handleToggleDepot = (kodeDepo: string, assigned: boolean) => {
    const nextCodes = assigned ? [kodeDepo] : [];
    setEditDepotCodes(nextCodes);
    const depot = userDepots.find(option => option.kode_depo === kodeDepo);
    setEditForm(current => ({
      ...current,
      kode_depo: assigned ? kodeDepo : '',
      nama_depo: assigned ? (depot?.nama_depo ?? '') : '',
      kode_ps: assigned && current.kode_depo === kodeDepo ? current.kode_ps : '',
    }));
  };

  const saveDepotRegion = async (depot: DepotOption) => {
    const regionId = regionAssignments[depot.kode_depo]?.trim() ?? '';
    setSavingRegionDepot(depot.kode_depo);
    setRegionMappingError(null);
    try {
      await depotSettings.upsert(depot.kode_depo, { region_id: regionId || null });
      const updatedDepots = depotOptions.map(item => item.kode_depo === depot.kode_depo
        ? { ...item, region_id: regionId || null }
        : item);
      setDepotOptions(updatedDepots);
      notifyGlobal(`Region depo ${depot.kode_depo} berhasil diperbarui.`);
    } catch (error) {
      setRegionMappingError(getErrorMessage(error, `Gagal mengubah region depo ${depot.kode_depo}.`));
    } finally {
      setSavingRegionDepot(null);
    }
  };

  const handleSaveEdit = () => {
    if (editDepotCodes.length !== 1) {
      notifyGlobal('Pilih tepat satu depo aktif sebelum menyimpan perubahan user.');
      return;
    }
    setSaveMode('edit');
    setShowSaveConfirm(true);
  };

  const doSave = async () => {
    setShowSaveConfirm(false);
    setSaving(true);
    try {
      if (saveMode === 'create') {
        const primaryDepot = depotOptions.find(depot => depot.kode_depo === createDepotCodes[0]);
        await users.create({
          ...createForm,
          kode_depo: primaryDepot?.kode_depo ?? '',
          nama_depo: primaryDepot?.nama_depo ?? '',
          depot_codes: createDepotCodes,
        });
        setShowCreate(false);
        setCreateForm({ ...emptyForm });
        setCreateDepotCodes([]);
      } else {
        if (!editItem) return;
        if (editDepotCodes.length !== 1) {
          notifyGlobal('Pilih tepat satu depo aktif sebelum menyimpan perubahan user.');
          return;
        }
        const selectedDepot = userDepots.find(depot => depot.kode_depo === editDepotCodes[0]);
        if (!selectedDepot?.region_id || selectedDepot.region_id !== editForm.region_id) {
          notifyGlobal('Depo terpilih tidak sesuai dengan region user. Pilih ulang region dan depo.');
          return;
        }
        const data = { ...editForm };
        if (!data.password) {
          delete data.password;
          delete data.password_confirmation;
          delete data.current_password;
        } else if (!isEditingOwnAccount) {
          delete data.current_password;
        }
        if (!data.kode_depo?.trim()) {
          delete data.kode_depo;
        }
        if (!data.nama_depo?.trim()) {
          delete data.nama_depo;
        }
        await users.update(editItem.id, {
          ...data,
          region_id: selectedDepot.region_id,
          kode_depo: selectedDepot.kode_depo,
          nama_depo: selectedDepot.nama_depo,
          depot_codes: [selectedDepot.kode_depo],
        });
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
      ga: 'bg-violet-100 text-violet-700',
      bh: 'bg-indigo-100 text-indigo-700',
    };
    return colors[level] || 'bg-gray-100 text-gray-700';
  };

  const fromCount = totalCount === 0 ? 0 : (page - 1) * 20 + 1;
  const toCount = Math.min(page * 20, totalCount);

  const displayRegion = (item: UserItem): { regionId: string; regionName?: string; inferred: boolean } | null => {
    if (item.region_id) {
      return {
        regionId: item.region_id,
        regionName: regionOptions.find(region => region.code === item.region_id)?.name,
        inferred: false,
      };
    }

    const codes = item.depot_codes?.length ? item.depot_codes : item.kode_depo ? [item.kode_depo] : [];
    const mappedRegions = codes.map(code => depotOptions.find(depot => depot.kode_depo === code)?.region_id);
    if (mappedRegions.length === 0 || mappedRegions.some(region => !region)) {
      return null;
    }

    const uniqueRegions = Array.from(new Set(mappedRegions));
    const inferredRegion = uniqueRegions[0];
    return uniqueRegions.length === 1 && inferredRegion
      ? {
        regionId: inferredRegion,
        regionName: regionOptions.find(region => region.code === inferredRegion)?.name,
        inferred: true,
      }
      : null;
  };

  /** Display the depot's mapped region when legacy user data has no region_id. */
  const regionBadge = (item: UserItem) => {
    const region = displayRegion(item);
    if (!region) return null;
    const hasRegionPermission = Boolean(item.has_region_permission);
    return (
      <span
        title={`${region.inferred ? 'Region berdasarkan pemetaan depo' : 'Region user'}; akses data tetap dibatasi ke depo yang ditetapkan.`}
        className={`inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
          hasRegionPermission
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : 'bg-slate-100 text-slate-600 ring-slate-200'
        }`}
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
        {region.regionId}{region.regionName ? ` · ${region.regionName}` : ''}{region.inferred ? ' · dari depo' : ''}
      </span>
    );
  };

  const depotCellContent = (item: UserItem) => (
    <div className="flex flex-col items-start gap-1">
      <div className="text-sm">
        {item.uses_global_scope ? (
          <span className="font-medium text-sky-700">Semua depo (akses global)</span>
        ) : (
          (item.depot_codes?.length ? item.depot_codes : item.kode_depo ? [item.kode_depo] : []).length > 0
            ? (item.depot_codes?.length ? item.depot_codes : [item.kode_depo]).map(code => {
              const depot = depotOptions.find(option => option.kode_depo === code);
              return (
                <span key={code} className="mr-1 inline-block">
                  <span className="font-mono font-medium text-gray-700">{code}</span>
                  {(depot?.nama_depo || (code === item.kode_depo ? item.nama_depo : '')) && (
                    <span className="ml-1 text-gray-400">· {depot?.nama_depo || item.nama_depo}</span>
                  )}
                </span>
              );
            })
            : <span className="font-medium text-amber-700">Belum ada depo</span>
        )}
      </div>
      {regionBadge(item)}
    </div>
  );

  const depotGroupName = (item: UserItem): string => {
    if (item.uses_global_scope) {
      return 'Akses global';
    }
    const codes = item.depot_codes?.length ? item.depot_codes.join(', ') : item.kode_depo || 'Tanpa depo';
    const region = displayRegion(item);
    const regionLabel = region
      ? `Region ${region.regionId}${region.regionName ? ` · ${region.regionName}` : ''}${region.inferred ? ' (dari pemetaan depo)' : ''}`
      : 'Region belum dipetakan';
    return `${regionLabel} · ${codes}`;
  };

  const groupedItems = items.reduce<Record<string, UserItem[]>>((groups, item) => {
    const groupName = depotGroupName(item);
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
        <div className="min-w-0">{depotCellContent(item)}</div>
        <span className="flex flex-col items-end gap-1">
          <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{scopeLabel(item.scope_level)}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ring-1 ring-inset ring-black/5 ${getLevelBadge(item.level)}`}>{roleLabel(item.level)}</span>
        </span>
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

  if (!canViewUsers) {
    return (
      <DashboardLayout>
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat manajemen pengguna.
        </div>
      </DashboardLayout>
    );
  }

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
                {activeRoleOptions.map(role => <option key={role.id} value={role.slug}>{role.name}</option>)}
              </select>
              <select
                value={regionFilter}
                onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }}
                className="select-field-sm whitespace-nowrap"
                aria-label="Filter region"
              >
                <option value="">Semua Region</option>
                {regionOptions.map(region => <option key={region.code} value={region.code}>{region.code} · {region.name}</option>)}
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
              {isMasterScope && (hasPermission('users.import') || hasPermission('users.create')) && (
                <button onClick={() => setShowImport(true)} className="btn-secondary whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14a1 1 0 0 0 1-1v-4" />
                    </svg>
                    Import
                  </span>
                </button>
              )}
              {hasPermission('users.create') && createScopeOptions.length > 0 && (
                <button onClick={() => {
                  const initialScope = createScopeOptions.includes('depot')
                    ? 'depot'
                    : (createScopeOptions[0] ?? 'depot');
                  const initialRegion = user?.scope_level === 'master' ? '' : (user?.region_id ?? '');
                  const initialDepot = user?.scope_level === 'depot' ? user.kode_depo : '';
                  setCreateForm({
                    ...emptyForm,
                    scope_level: initialScope,
                    region_id: initialRegion,
                    kode_depo: initialDepot,
                    nama_depo: user?.scope_level === 'depot' ? user.nama_depo : '',
                    level: activeRoleOptions.find(role => role.slug === 'staff_logistic' && !role.has_global_depot_access)?.slug
                      ?? activeRoleOptions.find(role => !role.has_global_depot_access)?.slug
                      ?? '',
                  });
                  setCreateDepotCodes(initialDepot ? [initialDepot] : []);
                  setMasterDataError(null);
                  setShowNewRegionFields(false);
                  setShowNewDepotFields(false);
                  setShowNewPartnerSiteFields(false);
                  setShowCreate(true);
                }} className="btn-primary whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Region and depot overview */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Pemetaan Induk Region → Anak Depo</h2>
              <p className="mt-1 text-sm text-gray-500">Setiap depo terdaftar di satu region. Akses user tetap dibatasi ke depo yang ditetapkan.</p>
            </div>
            {isMasterScope && (
              <button
                type="button"
                onClick={() => { setShowRegionMapping(current => !current); setRegionMappingError(null); }}
                aria-expanded={showRegionMapping}
                className="btn-secondary whitespace-nowrap"
              >
                {showRegionMapping ? 'Tutup Pengaturan Region' : 'Atur Region → Depo'}
              </button>
            )}
          </div>
          {depotLoadError ? (
            <p role="alert" className="p-5 text-sm text-red-700">{depotLoadError}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <caption className="sr-only">Pemetaan region dan depo</caption>
                <thead>
                  <tr className="bg-surface-raised">
                    <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Region</th>
                    <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Depo dalam Region</th>
                    <th scope="col" className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Jumlah Depo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(regionDepotGroups).sort(([regionA], [regionB]) => regionA.localeCompare(regionB)).map(([region, depots]) => (
                    <tr key={region} className="hover:bg-overlay-70">
                      <th scope="row" className="px-5 py-4 text-left align-top text-sm font-semibold text-gray-900">
                        {regionOptions.find(option => option.code === region)?.name
                          ? `${region} · ${regionOptions.find(option => option.code === region)?.name}`
                          : region}
                      </th>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {depots.map(depot => (
                            <span key={depot.kode_depo} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                              <span className="font-mono font-semibold">{depot.kode_depo}</span>
                              <span className="text-slate-500">· {depot.nama_depo}</span>
                            </span>
                          ))}
                          {depots.length === 0 && <span className="text-sm text-gray-400">Belum ada depo</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-medium text-gray-600">{depots.length}</td>
                    </tr>
                  ))}
                  {Object.keys(regionDepotGroups).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-sm text-gray-500">Belum ada data region dan depo.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {showRegionMapping && isMasterScope && !depotLoadError && (
            <div className="border-t border-gray-100 p-5">
              <div className="mb-4 rounded-lg border border-chip-primary-border bg-brand-wash px-4 py-3 text-sm text-primary-900">
                <p className="font-semibold">Tetapkan region induk untuk setiap depo</p>
                <p className="mt-1 text-xs leading-relaxed">Pilih region dari master region. Jika belum tersedia, buat region terlebih dahulu melalui form tambah user. Setiap depo hanya memiliki satu region induk.</p>
                <p className="mt-2 text-xs font-medium leading-relaxed">Mengubah region depo dapat mencabut akses user yang assignment-nya tidak lagi cocok dengan region baru. Periksa kembali user terkait setelah memindahkan depo.</p>
              </div>
              {regionMappingError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{regionMappingError}</p>}
              <div className="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-surface-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-xs font-medium text-gray-700">Region master
                  <select
                    aria-label="Pilih region untuk ubah nama"
                    value={regionNameEditCode}
                    onChange={event => {
                      const code = event.target.value;
                      setRegionNameEditCode(code);
                      setRegionNameEditValue(regionOptions.find(option => option.code === code)?.name ?? '');
                    }}
                    className="select-field mt-1"
                  >
                    <option value="">Pilih region</option>
                    {regionOptions.map(region => <option key={region.code} value={region.code}>{region.code} · {region.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-700">Nama region
                  <input aria-label="Nama region master" value={regionNameEditValue} onChange={event => setRegionNameEditValue(event.target.value)} maxLength={100} className="input-field mt-1" disabled={!regionNameEditCode} />
                </label>
                <button type="button" onClick={handleSaveRegionName} disabled={!regionNameEditCode || savingRegionName} className="btn-secondary disabled:opacity-50">
                  {savingRegionName ? 'Menyimpan...' : 'Simpan nama'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <caption className="sr-only">Pengaturan region induk setiap depo</caption>
                  <thead>
                    <tr className="bg-surface-raised">
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">Kode Depo</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">Nama Depo</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">Kode Region Induk</th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {depotOptions.map(depot => (
                      <tr key={depot.kode_depo}>
                        <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900">{depot.kode_depo}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{depot.nama_depo}</td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Kode region untuk depo ${depot.kode_depo}`}
                            value={regionAssignments[depot.kode_depo] ?? ''}
                            onChange={event => setRegionAssignments(current => ({ ...current, [depot.kode_depo]: event.target.value }))}
                            className="select-field !py-2"
                          >
                            <option value="">— Belum dipetakan —</option>
                            {regionOptions.map(region => (
                              <option key={region.code} value={region.code}>{region.code} · {region.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => saveDepotRegion(depot)}
                            disabled={savingRegionDepot !== null || (regionAssignments[depot.kode_depo]?.trim() ?? '') === (depot.region_id ?? '')}
                            aria-label={`Simpan region ${depot.kode_depo}`}
                            className="btn-secondary !px-3 !py-2 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {savingRegionDepot === depot.kode_depo ? 'Menyimpan...' : 'Simpan'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

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
                  <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Scope / Role</th>
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
                      {depotCellContent(item)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{scopeLabel(item.scope_level)}</span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getLevelBadge(item.level)}`}>
                          {roleLabel(item.level)}
                        </span>
                      </div>
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
                    <td className="table-cell">{depotCellContent(item)}</td>
                    <td className="table-cell"><div className="flex flex-col items-start gap-1"><span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{scopeLabel(item.scope_level)}</span><span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${getLevelBadge(item.level)}`}>{roleLabel(item.level)}</span></div></td>
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
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateForm({ ...emptyForm }); setCreateDepotCodes([]); }} title="Tambah User" subtitle="Buat akun pengguna baru" size="md"
        footer={
          <>
            <button type="button" onClick={() => { setShowCreate(false); setCreateForm({ ...emptyForm }); setCreateDepotCodes([]); }} className="btn-secondary">Batal</button>
            <button type="submit" form="create-user-form" disabled={saving || activeRoleOptions.length === 0 || roleOptionsError !== null} className="btn-primary disabled:opacity-50">
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
        <form id="create-user-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); handleCreate(); }}>
          <div className="rounded-lg border border-chip-primary-border bg-brand-wash px-4 py-3 text-sm text-primary-900">
            <p className="font-semibold">Urutan pengaturan user</p>
            <p className="mt-1 text-xs leading-relaxed">Pilih scope hierarki, satu region dan satu depo, lalu tentukan role operasional secara terpisah.</p>
          </div>
          <section aria-labelledby="create-account-heading" className="space-y-4">
            <h3 id="create-account-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">1. Akun User</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="full-name">Full Name *</label>
              <input id="full-name" value={createForm.full_name} onChange={(e) => setCreateForm(prev => ({ ...prev, full_name: e.target.value }))} className="input-field" placeholder="Nama lengkap" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="email">Email *</label>
              <input id="email" type="email" value={createForm.email} onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="email@contoh.com" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="password">Password *</label>
              <input id="password" type="password" autoComplete="new-password" minLength={8} value={createForm.password} onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))} className="input-field" placeholder="Minimal 8 karakter" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="konfirmasi-password">Konfirmasi Password *</label>
              <input id="konfirmasi-password" type="password" autoComplete="new-password" value={createForm.password_confirmation} onChange={(e) => setCreateForm(prev => ({ ...prev, password_confirmation: e.target.value }))} className="input-field" placeholder="Ulangi password" />
            </div>
          </div>
          </section>
          <section aria-labelledby="create-data-scope-heading" className="space-y-4">
          <div>
            <h3 id="create-data-scope-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">2. Scope &amp; Hierarki</h3>
            <p className="mt-1 text-xs text-gray-500">Scope menentukan entitas yang dapat dikelola. Setiap akun harus memiliki satu region dan satu depo.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="scope-level">Scope hierarki *</label>
            <select
              id="scope-level"
              value={createForm.scope_level}
              onChange={event => setCreateForm(current => ({ ...current, scope_level: event.target.value, kode_ps: '' }))}
              className="select-field"
              required
            >
              {createScopeOptions.map(scope => (
                <option key={scope} value={scope}>
                  {scope === 'master' ? 'Master — kelola seluruh hierarki' :
                    scope === 'region' ? 'Region — kelola depo di region' :
                      scope === 'depot' ? 'Depo — kelola Partner Site di depo' :
                        'PS — akun operasional Partner Site'}
                </option>
              ))}
            </select>
            {createScopeOptions.length === 0 && (
              <p role="alert" className="mt-1 text-xs text-amber-700">Scope akun Anda tidak dapat membuat akun bawahan.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="region">Region User</label>
            <select id="region" value={createForm.region_id} onChange={(e) => {
              const regionId = e.target.value;
              setCreateForm(prev => ({ ...prev, region_id: regionId, kode_depo: '', nama_depo: '', kode_ps: '' }));
              setCreateDepotCodes([]);
              setMasterDataError(null);
            }} className="select-field" required disabled={!isMasterScope}>
              <option value="">— Pilih region —</option>
              {regionOptions.map(region => <option key={region.code} value={region.code}>{region.code} · {region.name}</option>)}
            </select>
            {isMasterScope && (
              <button type="button" className="mt-2 text-sm font-medium text-primary-700 hover:text-primary-800" onClick={() => {
                setShowNewRegionFields(current => !current);
                setMasterDataError(null);
              }}>
                {showNewRegionFields ? 'Batal buat region' : '+ Buat region baru'}
              </button>
            )}
            {showNewRegionFields && isMasterScope && (
              <div className="mt-3 space-y-3 rounded-lg border border-chip-primary-border bg-brand-wash p-3">
                <p className="text-sm font-semibold text-primary-900">Buat master region</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">Kode region
                    <input aria-label="Kode region baru" value={newRegionCode} onChange={event => setNewRegionCode(event.target.value)} maxLength={20} className="input-field mt-1" placeholder="Contoh: REG-A" />
                  </label>
                  <label className="text-xs font-medium text-gray-700">Nama region
                    <input aria-label="Nama region baru" value={newRegionName} onChange={event => setNewRegionName(event.target.value)} maxLength={100} className="input-field mt-1" placeholder="Contoh: Region Kalimantan Barat" />
                  </label>
                </div>
                <button type="button" onClick={handleCreateRegion} disabled={creatingRegion} className="btn-secondary disabled:opacity-50">
                  {creatingRegion ? 'Menyimpan region...' : 'Simpan dan pilih region'}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Region adalah induk pengelompokan depo; hak akses data tetap ditentukan oleh depo yang dipilih.</p>
            {masterDataError && <p role="alert" className="mt-2 text-sm text-red-700">{masterDataError}</p>}
          </div>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3">
              <div>
                <p className="font-medium text-gray-900">Pilih satu depo akun</p>
                <p className="text-xs text-gray-500">{createForm.region_id ? regionLabel(createForm.region_id) : 'Pilih region terlebih dahulu'}</p>
              </div>
              <div className="flex items-center gap-3">
              {canCreateDepot && createForm.region_id && (
                <button type="button" onClick={() => {
                  setShowNewDepotFields(current => !current);
                  setMasterDataError(null);
                }} className="text-xs font-medium text-primary-700 hover:text-primary-800">
                  {showNewDepotFields ? 'Batal' : '+ Buat depo'}
                </button>
              )}
              </div>
            </div>
            {showNewDepotFields && canCreateDepot && createForm.region_id && (
              <div className="space-y-3 border-b border-gray-200 bg-brand-wash p-4">
                <p className="text-sm font-semibold text-primary-900">Buat depo baru di {regionLabel(createForm.region_id)}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">Kode depo
                    <input aria-label="Kode depo baru" value={newDepotCode} onChange={event => setNewDepotCode(event.target.value)} maxLength={20} className="input-field mt-1" placeholder="Contoh: A-ABC" />
                  </label>
                  <label className="text-xs font-medium text-gray-700">Nama depo
                    <input aria-label="Nama depo baru" value={newDepotName} onChange={event => setNewDepotName(event.target.value)} maxLength={100} className="input-field mt-1" placeholder="Contoh: Depo ABC" />
                  </label>
                </div>
                <button type="button" onClick={handleCreateDepot} disabled={creatingDepot} className="btn-secondary disabled:opacity-50">
                  {creatingDepot ? 'Menyimpan depo...' : 'Simpan depo dan tetapkan ke user'}
                </button>
              </div>
            )}
            {depotLoadError ? (
              <p role="alert" className="p-4 text-sm text-red-700">{depotLoadError}</p>
            ) : createRegionDepots.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                {createForm.region_id ? 'Belum ada depo aktif pada region ini.' : 'Tidak ada depo aktif tanpa region.'}
              </p>
            ) : (
              <div className="max-h-48 divide-y divide-gray-100 overflow-y-auto">
                {createRegionDepots.map(depot => (
                  <label key={depot.kode_depo} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="create-kode-depo"
                      required
                      checked={createForm.kode_depo === depot.kode_depo}
                      onChange={() => {
                        setCreateDepotCodes([depot.kode_depo]);
                        setCreateForm(current => ({
                          ...current,
                          kode_depo: depot.kode_depo,
                          nama_depo: depot.nama_depo,
                          kode_ps: '',
                        }));
                      }}
                      className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="font-mono text-sm font-medium text-gray-900">{depot.kode_depo}</span>
                    <span className="text-sm text-gray-500">{depot.nama_depo}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="border-t border-gray-100 bg-surface-card px-4 py-2 text-xs text-gray-500">
              Pilih tepat satu depo untuk akun ini.
            </p>
          </div>
          {canCreatePartnerSite && createForm.kode_depo && (
            <div className="space-y-2">
              <button type="button" onClick={() => setShowNewPartnerSiteFields(current => !current)} className="text-sm font-medium text-primary-700 hover:text-primary-800">
                {showNewPartnerSiteFields ? 'Batal buat Partner Site' : '+ Buat Partner Site'}
              </button>
              {showNewPartnerSiteFields && (
                <div className="space-y-3 rounded-lg border border-chip-primary-border bg-brand-wash p-3">
                  <p className="text-sm font-semibold text-primary-900">Buat PS baru di depo {createForm.kode_depo}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-gray-700">Kode PS
                      <input aria-label="Kode PS baru" value={newPartnerSiteCode} onChange={event => setNewPartnerSiteCode(event.target.value)} maxLength={20} className="input-field mt-1" />
                    </label>
                    <label className="text-xs font-medium text-gray-700">Nama PS
                      <input aria-label="Nama PS baru" value={newPartnerSiteName} onChange={event => setNewPartnerSiteName(event.target.value)} maxLength={100} className="input-field mt-1" />
                    </label>
                  </div>
                  <button type="button" onClick={handleCreatePartnerSite} disabled={creatingPartnerSite} className="btn-secondary disabled:opacity-50">
                    {creatingPartnerSite ? 'Menyimpan PS...' : 'Simpan Partner Site'}
                  </button>
                </div>
              )}
            </div>
          )}
          {createForm.scope_level === 'ps' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="kode-ps">Partner Site *</label>
              <select id="kode-ps" value={createForm.kode_ps} required onChange={event => setCreateForm(current => ({ ...current, kode_ps: event.target.value }))} className="select-field">
                <option value="">— Pilih Partner Site —</option>
                {createPartnerSites.map(site => <option key={site.kode_ps} value={site.kode_ps}>{site.kode_ps} · {site.nama_ps}</option>)}
              </select>
            </div>
          )}
          </section>
          <section aria-labelledby="create-role-heading" className="space-y-3">
          <div>
            <h3 id="create-role-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">3. Hak Tindakan User</h3>
            <p className="mt-1 text-xs text-gray-500">Role menentukan menu dan tindakan yang boleh dilakukan. Role tidak memilih depo user.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="alamat">Alamat</label>
            <textarea id="alamat" value={createForm.alamat} onChange={(e) => setCreateForm(prev => ({ ...prev, alamat: e.target.value }))} className="input-field" rows={2} placeholder="Alamat domisili" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="level">Role / Peran *</label>
              <select id="level" value={createForm.level} onChange={(e) => setCreateForm(prev => ({ ...prev, level: e.target.value }))} className="select-field" disabled={activeRoleOptions.length === 0 || roleOptionsError !== null} required>
                <option value="">{roleOptionsError ? 'Role tidak tersedia' : 'Pilih role'}</option>
                {activeRoleOptions.map(role => <option key={role.id} value={role.slug}>{role.name}</option>)}
              </select>
              {roleOptionsError ? (
                <p role="alert" className="mt-1 text-xs text-red-700">{roleOptionsError}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">Permission role diatur di Roles &amp; Permissions. Pilih sesuai pekerjaan user.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="status">Status</label>
              <select id="status" value={createForm.status} onChange={(e) => setCreateForm(prev => ({ ...prev, status: e.target.value }))} className="select-field">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          {createRole?.has_global_depot_access && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">Role ini memberi akses data operasional lintas depo</p>
              <p className="mt-1 text-xs leading-relaxed">Hak mengelola Region, Depo, dan Partner Site tetap dibatasi oleh Scope hierarki; role ini tidak memperluas hak kelola entitas.</p>
            </div>
          )}
          <div aria-label="Ringkasan akses user baru" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold">Periksa sebelum menyimpan</p>
            <p className="mt-1 text-xs">Scope hierarki: {scopeLabel(createForm.scope_level as UserItem['scope_level'])} · Region: {createForm.region_id || 'Belum dipilih'} · Depo: {createDepotCodes.length ? createDepotCodes.join(', ') : 'Belum dipilih'}</p>
            <p className="mt-1 text-xs">Role operasional: {createRole?.name || 'Belum dipilih'} · Akses data: {createRole?.has_global_depot_access ? 'Lintas depo' : 'Sesuai izin role dalam scope akun'}</p>
          </div>
          </section>
        </form>
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
            <p className="text-xs text-gray-500 mt-2">
              Kolom: email, full_name, alamat, scope_level, region_id, kode_depo, kode_ps, level, status. Setiap akun wajib memiliki satu region dan tepat satu depo aktif. Untuk scope PS, kode_ps harus berada di depo yang sama. Import hanya dapat dilakukan oleh scope Master; level harus memakai slug role aktif.
            </p>
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
      <Modal open={!!editItem} onClose={() => { setEditItem(null); setEditForm({}); setUserDepots([]); setEditDepotCodes([]); setDepotLoadError(null); setEditTab('profile'); }} title="Edit User" subtitle="Edit data pengguna" size="lg"
        footer={
          <>
            <button type="button" onClick={() => { setEditItem(null); setEditForm({}); setUserDepots([]); setEditDepotCodes([]); setDepotLoadError(null); setEditTab('profile'); }} className="btn-secondary">Batal</button>
            <button type="submit" form="edit-user-form" disabled={saving || loadingDepots || depotLoadError !== null || editDepotCodes.length !== 1} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
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
        <form id="edit-user-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); handleSaveEdit(); }}>
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-1" role="tablist" aria-label="Edit user tabs">
              <button
                type="button"
                role="tab"
                aria-selected={editTab === 'profile'}
                onClick={() => setEditTab('profile')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  editTab === 'profile'
                    ? 'bg-surface-card text-primary-600 border-b-2 border-primary-600 -mb-px'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                1. Profil &amp; Role
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editTab === 'depots'}
                onClick={() => setEditTab('depots')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  editTab === 'depots'
                    ? 'bg-surface-card text-primary-600 border-b-2 border-primary-600 -mb-px'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V5.25L12 3l6.75 2.25V21" />
                </svg>
                2. Cakupan Depo
              </button>
            </nav>
          </div>

          {/* Tab Panels */}
          <div className="space-y-4" role="tabpanel">
            <div className="rounded-lg border border-chip-primary-border bg-brand-wash px-4 py-3 text-sm text-primary-900">
              <p className="font-semibold">Dua pengaturan yang berbeda</p>
              <p className="mt-1 text-xs leading-relaxed"><strong>Scope</strong> membatasi hierarki yang dikelola. <strong>Role</strong> mengatur menu dan tindakan. Akun selalu terikat ke satu region dan satu depo.</p>
            </div>
            {/* Data User Tab */}
            {editTab === 'profile' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="full-name-2">Full Name</label>
                    <input id="full-name-2" value={editForm.full_name || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, full_name: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="email-2">Email</label>
                    <input id="email-2" type="email" value={editForm.email || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, email: e.target.value }))} className="input-field" />
                  </div>
                </div>
                {(isMasterScope || isEditingOwnAccount) && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="password-kosongkan-jika-tidak-diubah">Password (kosongkan jika tidak diubah)</label>
                        <input id="password-kosongkan-jika-tidak-diubah" type="password" autoComplete="new-password" minLength={8} value={editForm.password || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, password: e.target.value }))} className="input-field" placeholder="Minimal 8 karakter" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="konfirmasi-password-2">Konfirmasi Password</label>
                        <input id="konfirmasi-password-2" type="password" autoComplete="new-password" required={Boolean(editForm.password)} value={editForm.password_confirmation || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, password_confirmation: e.target.value }))} className="input-field" placeholder="Ulangi password" />
                      </div>
                    </div>
                    {isEditingOwnAccount && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="password-saat-ini">Password saat ini</label>
                        <input id="password-saat-ini" type="password" autoComplete="current-password" required={Boolean(editForm.password)} value={editForm.current_password || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, current_password: e.target.value }))} className="input-field" />
                        <p className="mt-1 text-xs text-gray-500">Wajib diisi untuk mengganti password akun sendiri.</p>
                      </div>
                    )}
                  </>
                )}
                {isMasterScope ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="scope-level-2">Scope hierarki</label>
                    <select
                      id="scope-level-2"
                      value={editForm.scope_level || 'depot'}
                      onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setEditForm(current => ({
                        ...current,
                        scope_level: event.target.value,
                        kode_ps: '',
                      }))}
                      className="select-field"
                    >
                      <option value="master">Master — kelola seluruh hierarki</option>
                      <option value="region">Region — kelola depo di region</option>
                      <option value="depot">Depo — kelola Partner Site di depo</option>
                      <option value="ps">PS — akun operasional Partner Site</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700">Scope hierarki: <strong>{editForm.scope_level}</strong></p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="region-2">Region akun</label>
                  <select id="region-2" value={editForm.region_id || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const regionId = e.target.value;
                    setEditForm((prev: Record<string, string>) => ({
                      ...prev,
                      region_id: regionId,
                      kode_depo: '',
                      nama_depo: '',
                      kode_ps: '',
                    }));
                    setEditDepotCodes([]);
                  }} className="select-field" required disabled={!isMasterScope}>
                    <option value="">— Pilih region —</option>
                    {regionOptions.map(region => <option key={region.code} value={region.code}>{region.code} · {region.name}</option>)}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Region adalah induk scope akun; akun harus terikat pada satu depo di region ini.
                  </p>
                  {editItem && (editForm.region_id || '') !== (editItem.region_id || '') && (
                    <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Region berubah. Assignment depo lama sudah dikosongkan; pilih depo yang sesuai di tab Cakupan Depo sebelum menyimpan.
                    </p>
                  )}
                  {editDepotCodes.length !== 1 && (
                    <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Pilih tepat satu depo aktif di tab Cakupan Depo sebelum menyimpan user.
                    </p>
                  )}
                </div>
                {editForm.scope_level === 'ps' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="kode-ps-2">Partner Site *</label>
                    <select id="kode-ps-2" value={editForm.kode_ps || ''} required onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setEditForm(current => ({ ...current, kode_ps: event.target.value }))} className="select-field">
                      <option value="">— Pilih Partner Site —</option>
                      {editPartnerSites.map(site => <option key={site.kode_ps} value={site.kode_ps}>{site.kode_ps} · {site.nama_ps}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="alamat-2">Alamat</label>
                  <textarea id="alamat-2" value={editForm.alamat || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, alamat: e.target.value }))} className="input-field" rows={2} placeholder="Alamat domisili" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="level-2">Role / Peran</label>
                    <select id="level-2" value={editForm.level || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, level: e.target.value }))} className="select-field" disabled={!isMasterScope || roleOptions.length === 0 || roleOptionsError !== null}>
                      {!activeRoleOptions.some(role => role.slug === editForm.level) && editForm.level && (
                        <option value={editForm.level}>{roleOptions.find(role => role.slug === editForm.level)?.name || editItem?.roles?.find(role => role.slug === editForm.level)?.name || editForm.level} (nonaktif)</option>
                      )}
                      {activeRoleOptions.map(role => <option key={role.id} value={role.slug}>{role.name}</option>)}
                    </select>
                    {roleOptionsError ? (
                      <p role="alert" className="mt-1 text-xs text-red-700">{roleOptionsError}</p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">Role menentukan menu dan tindakan user; pengaturan depo dilakukan terpisah.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="status-2">Status</label>
                    <select id="status-2" value={editForm.status || 'active'} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm((prev: Record<string, string>) => ({ ...prev, status: e.target.value }))} className="select-field" disabled={!isMasterScope}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                {editRoleHasGlobalAccess && (
                  <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <p className="font-semibold">Role ini memberi akses data operasional lintas depo</p>
                    <p className="mt-1 text-xs leading-relaxed">Hak mengelola Region, Depo, dan Partner Site tetap dibatasi oleh Scope hierarki; role ini tidak memperluas hak kelola entitas.</p>
                  </div>
                )}
                <div aria-label="Ringkasan akses user" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold">Ringkasan akses</p>
                  <p className="mt-1 text-xs">Scope hierarki: {scopeLabel((editForm.scope_level || 'depot') as UserItem['scope_level'])} · Region: {editForm.region_id || 'Belum dipilih'} · Depo: {editDepotCodes.length ? editDepotCodes.join(', ') : 'Belum dipilih'}</p>
                  <p className="mt-1 text-xs">Role operasional: {editRole?.name || editItem?.roles?.find(role => role.slug === editForm.level)?.name || editForm.level || 'Belum dipilih'} · Akses data: {editRoleHasGlobalAccess ? 'Lintas depo' : 'Sesuai izin role dalam scope akun'}</p>
                </div>
              </div>
            )}

            {/* Depot Akses Tab */}
            {editTab === 'depots' && (
              <div className="space-y-4">
                <div className={`border rounded-xl p-4 ${
                  usesGlobalScope
                      ? 'bg-sky-50 border-sky-200'
                      : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      usesGlobalScope ? 'text-sky-600' : 'text-amber-600'
                    }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <div className={`text-sm ${
                      usesGlobalScope ? 'text-sky-800' : 'text-amber-800'
                    }`}>
                      {usesGlobalScope ? (
                        <>
                          <p className="font-medium">Role user ini memegang permission <code>depot.view_all</code></p>
                          <p>Akses global berasal dari permission role ini. Cabut permission tersebut di <strong>Roles &amp; Permissions</strong> agar user dibatasi pada depo yang dicentang.</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium">Akses data dibatasi ke depo yang dipilih</p>
                          <p>Region hanya pengelompokan. Permission role mengatur aksi, bukan menambahkan akses ke depo lain.</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Pilih satu depo akun</h3>
                  {loadingDepots && <span className="text-xs text-gray-500 animate-pulse">Memuat...</span>}
                </div>

                {depotLoadError ? (
                  <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{depotLoadError}</p>
                ) : editRegionDepots.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {Object.entries(editRegionDepots.reduce((groups, depot) => {
                      const region = depot.region_id || 'Tanpa Region';
                      groups[region] = groups[region] || [];
                      groups[region].push(depot);
                      return groups;
                    }, {} as Record<string, UserDepot[]>)).map(([regionId, depots]) => (
                      <div key={regionId} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V5.25L12 3l6.75 2.25V21M8.25 8.25h.008v.008H8.25V8.25zm0 3.75h.008v.008H8.25V12zm0 3.75h.008v.008H8.25v-.008zm3.75-7.5h.008v.008H12V8.25zm0 3.75h.008v.008H12V12zm0 3.75h.008v.008H12v-.008zM15.75 8.25h.008v.008h-.008V8.25zm0 3.75h.008v.008h-.008V12zm0 3.75h.008v.008h-.008v-.008z" />
                            </svg>
                            <span className="font-medium text-gray-900">{regionId}</span>
                          </div>
                          <span className="text-xs text-gray-500">Pilih satu</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {depots.map(depot => (
                            <label key={depot.kode_depo} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="edit-kode-depo"
                                  required
                                  checked={editDepotCodes.includes(depot.kode_depo)}
                                  onChange={event => handleToggleDepot(depot.kode_depo, event.target.checked)}
                                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 focus:ring-2"
                                />
                                <div>
                                  <p className="font-mono font-medium text-gray-900">{depot.kode_depo}</p>
                                  <p className="text-sm text-gray-500">{depot.nama_depo}</p>
                                </div>
                              </div>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${editDepotCodes.includes(depot.kode_depo) ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                {editDepotCodes.includes(depot.kode_depo) ? 'Terpilih' : 'Tidak dipilih'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : loadingDepots ? null : (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V5.25L12 3l6.75 2.25V21" />
                    </svg>
                    <p className="mt-2">{editForm.region_id ? 'Belum ada depo aktif di region ini.' : 'Pilih region untuk menampilkan depo.'}</p>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  {editDepotCodes.length === 1 ? `Depo akun: ${editDepotCodes[0]}` : 'Pilih tepat satu depo akun sebelum menyimpan.'}
                </p>
              </div>
            )}
          </div>
        </form>
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
        message={saveMode === 'create'
          ? createRole?.has_global_depot_access
            ? `Role ${createRole.name} membuka akses semua depo lintas region. Yakin memberikan akses global ini?`
            : 'Apakah Anda yakin membuat user dengan cakupan region, depo, dan role yang ditampilkan?'
          : editRoleHasGlobalAccess
            ? `Role ${editRole?.name || editForm.level} membuka akses semua depo lintas region. Yakin menyimpan akses global ini?`
            : 'Apakah Anda yakin menyimpan perubahan profil, cakupan depo, dan role user?'}
        confirmLabel="Simpan"
        variant="warning"
        loading={saving}
      />
    </DashboardLayout>
  );
}
