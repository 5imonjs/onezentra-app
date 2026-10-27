'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { rencanaKirim, npn, depo, depotSettings, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { type RencanaKirimData } from '@/lib/suratJalanPdf';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Calendar from '@/components/Calendar';
import { downloadSuratJalan, previewSuratJalan } from '@/lib/suratJalanPdf';
import { findDuplicateIndexes, firstIndexOfCode, takenCodesExcept } from '@/lib/itemDuplicates';
import NpnSearchInput, { type NpnProduct } from '@/components/NpnSearchInput';
import { useAuthStore } from '@/store/auth';

interface RencanaKirimItem {
  id?: number;
  npn_id?: number;
  item_number: number;
  kode_barang: string;
  nama_barang: string;
  jumlah: number;
  satuan: string;
  keterangan: string;
  umur?: number | null;
  decVolume?: number | null;
  SAPdecUom?: number | null;
  kubikasi?: number | null;
  npn?: NpnProduct | null;
}

interface RencanaKirim {
  id: number;
  rkh_date: string;
  po_transporter: string;
  driver_name: string;
  nopol: string;
  jenis_kendaraan: string;
  expedisi: string;
  shipper_name: string;
  shipper_address: string;
  shipper_phone: string;
  destination_name: string;
  destination_address: string;
  kode_depo: string;
  nama_depo: string;
  total_qty: number;
  total_kubikasi?: number | null;
  status: string;
  notes: string;
  scheduled_at: string;
  checked_in_at: string;
  verified_at: string;
  completed_at: string;
  items: RencanaKirimItem[];
  created_at: string;
}

interface DepoOption {
  kode_depo: string;
  nama_depo: string;
}

/** Statistik global rencana kirim dari endpoint /rencana-kirim/stats. */
interface RkStats {
  total: number;
  todayCount: number;
  scheduled: number;
  completed: number;
  calendar: { date: string | null; count: number; breakdown: Record<string, number> }[];
}

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
  DRAFT: { label: 'Draft', color: 'text-gray-600', bg: 'bg-surface-card', dot: 'bg-gray-400', border: 'border-gray-300' },
  SCHEDULED: { label: 'Dijadwalkan', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500', border: 'border-blue-100' },
  CHECKED_IN: { label: 'Check In', color: 'text-yellow-700', bg: 'bg-yellow-50', dot: 'bg-yellow-500', border: 'border-yellow-100' },
  VERIFIED: { label: 'Terverifikasi', color: 'text-purple-700', bg: 'bg-purple-50', dot: 'bg-purple-500', border: 'border-purple-100' },
  IN_PROGRESS: { label: 'Diproses', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500', border: 'border-orange-100' },
  COMPLETED: { label: 'Selesai', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-100' },
  CANCELLED: { label: 'Dibatalkan', color: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500', border: 'border-red-100' },
};

const emptyForm: Partial<RencanaKirim> = {
  rkh_date: '', po_transporter: '',
  driver_name: '', nopol: '',
  jenis_kendaraan: '', expedisi: '',
  shipper_name: '', shipper_address: '', shipper_phone: '',
  destination_name: '', destination_address: '',
  kode_depo: '', nama_depo: '', notes: '',
};

const jenisKendaraanOptions = ['CDD', 'CDE', 'L300', 'FUSO', 'TRONTON', 'CONTAINER 20 FT', 'CONTAINER 40 FT', 'LAINNYA'];

/**
 * Stabil di identitasnya. Dipakai sebagai fallback `takenCodes` agar baris tanpa
 * array hasil memo tidak memaksa `NamaBarangInput` rebuild Set-nya tiap render.
 */
const EMPTY_CODES: string[] = [];

/**
 * Ukuran halaman pencarian NPN. INI BUKAN PEMOTONG: sisa hasilnya ditarik lewat
 * tombol "Muat lebih banyak" dan diumumkan lewat indikator "Menampilkan X dari
 * Y" — sebelumnya `limit(500)` diam-diam memangkas hasil ke-501 dst.
 */

const emptyItem: RencanaKirimItem = {
  npn_id: undefined,
  item_number: 1, kode_barang: '', nama_barang: '',
  jumlah: 0, satuan: 'CRT', keterangan: '', umur: null,
  decVolume: null, SAPdecUom: null, kubikasi: null,
};

function NamaDepoInput({
  value,
  depoList,
  onChange,
  onClear,
  disabled = false,
}: {
  value: string;
  depoList: DepoOption[];
  onChange: (nama: string) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = 'depo-listbox';

  useEffect(() => {
    if (disabled) {
      setShowDropdown(false);
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [disabled]);

  const filtered = depoList.filter((d) =>
    d.nama_depo.toLowerCase().includes(value.trim().toLowerCase())
  );

  const handleSelectIndex = (index: number) => {
    const d = filtered[index];
    if (!d) return;
    onChange(d.nama_depo);
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        id="f-nama-depo"
        type="text"
        role="combobox"
        aria-expanded={showDropdown && filtered.length > 0}
        aria-controls={`${listboxId}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowDropdown(e.target.value.trim().length > 0); setActiveIndex(-1); }}
        onFocus={() => { if (!disabled) setShowDropdown(value.trim().length > 0); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); if (filtered.length > 0) { setShowDropdown(true); setActiveIndex(i => Math.min(filtered.length - 1, i + 1)); } }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { if (showDropdown && activeIndex >= 0 && filtered.length > 0) { e.preventDefault(); handleSelectIndex(activeIndex); } }
          else if (e.key === 'Escape' && showDropdown) { e.stopPropagation(); setShowDropdown(false); setActiveIndex(-1); }
        }}
        placeholder="Nama depo tujuan"
        className="input-field text-sm py-2"
        disabled={disabled}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onClear(); setShowDropdown(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5"
          title="Kosongkan depo"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {showDropdown && filtered.length > 0 && (
        <ul id={`${listboxId}-listbox`} role="listbox" aria-label="Daftar depo" className="absolute z-50 w-full mt-1 bg-surface-card border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-auto">
          {filtered.map((d, i) => (
            <li key={d.kode_depo} role="option" id={`${listboxId}-option-${i}`} aria-selected={i === activeIndex}>
            <button
              type="button"
              onClick={() => handleSelectIndex(i)}
              className={`w-full px-3 py-2.5 text-left transition-colors border-b border-gray-300 last:border-0 ${
                i === activeIndex
                  ? 'bg-row-active text-row-active-text'
                  : 'hover:bg-surface-hover text-gray-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-row-active-icon flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-row-active-text uppercase">{d.kode_depo?.slice(0, 2) || '?'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{d.nama_depo || '-'}</p>
                  <span className="text-xs font-mono uppercase opacity-70">{d.kode_depo}</span>
                </div>
              </div>
            </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RencanaKirimPage() {
  const [items, setItems] = useState<RencanaKirim[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [viewItem, setViewItem] = useState<RencanaKirim | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<RencanaKirim>>({ ...emptyForm });
  const [createItems, setCreateItems] = useState<RencanaKirimItem[]>([{ ...emptyItem }]);
  const [typingItems, setTypingItems] = useState<Set<number>>(new Set());
  // Anti race: respons basi (ketikan sudah berubah) dibuang.
  const reqIdRef = useRef(0);
  // Cermin lastPage agar clamp bisa baca nilai terbaru tanpa jadi dep fetch.
  const lastPageRef = useRef(1);
  // Filter state untuk dropdown
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterKodeDepo, setFilterKodeDepo] = useState<string | null>(null);

  const markTyping = (index: number, isTyping: boolean) => {
    setTypingItems(prev => {
      if (prev.has(index) === isTyping) return prev;
      const next = new Set(prev);
      if (isTyping) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  };
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [poDuplicate, setPoDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  // Statistik global dari server (bukan hitungan halaman aktif).
  const [rkStats, setRkStats] = useState<RkStats | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<string>('');
  const [depoList, setDepoList] = useState<DepoOption[]>([]);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ message: string; ok?: boolean; total_rows?: number; matched?: number; skipped?: number } | null>(null);
  const [showBarangModal, setShowBarangModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Baseline isi form saat mode edit dibuka — deteksi "kotor" diukur dari sini, bukan form kosong.
  const [editSnapshot, setEditSnapshot] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const { hasPermission, user } = useAuthStore();

  const loadItems = useCallback(async (silent = false) => {
    const reqId = ++reqIdRef.current;
    // Clamp sebelum request — jangan setPage di dalam fetch (picu double fetch).
    const requestPage = Math.min(Math.max(1, page), Math.max(1, lastPageRef.current));
    try {
      setLoading(true);
      // Build params filter — only include when filter has a value
      const filterParams: Record<string, unknown> = { search, page: requestPage, per_page: 20 };
      if (filterStatus) filterParams.status = filterStatus;
      if (filterKodeDepo) filterParams.kode_depo = filterKodeDepo;
      const res = await rencanaKirim.list(filterParams);
      if (reqIdRef.current !== reqId) return;
      setItems(res.data.data);
      const nextLast = res.data.last_page ?? 1;
      setLastPage(nextLast);
      lastPageRef.current = nextLast;
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      console.error(e);
      if (!silent) {
        notifyGlobal(getErrorMessage(e, 'Gagal memuat daftar rencana kirim.'), 'error');
      }
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [search, page, filterStatus, filterKodeDepo]);

  useEffect(() => { loadItems(true); }, [loadItems]);

  // Koreksi halaman keluar-jarak setelah lastPage diketahui (di luar fetch
  // agar tak memicu double fetch dari dalam callback fetch itu sendiri).
  useEffect(() => {
    if (page > lastPage) setPage(Math.max(1, lastPage));
  }, [page, lastPage]);

  const loadStats = useCallback(async () => {
    try {
      const res = await rencanaKirim.stats();
      setRkStats({
        total: Number(res.data.total ?? 0),
        todayCount: Number(res.data.today_count ?? 0),
        scheduled: Number(res.data.data?.SCHEDULED?.count ?? 0),
        completed: Number(res.data.data?.COMPLETED?.count ?? 0),
        calendar: Array.isArray(res.data.calendar) ? res.data.calendar : [],
      });
    } catch {
      // Statistik bersifat pelengkap — kegagalan tidak boleh memblokir halaman.
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    depo.list()
      .then(res => setDepoList(res.data?.data ?? []))
      .catch((e) => {
        console.error(e);
        notifyGlobal('Gagal memuat master depo — kode depo mungkin terisi otomatis dari depo Anda.', 'error');
      });
  }, []);

  const handleNamaDepoChange = (nama: string) => {
    setCreateForm(prev => {
      const matched = depoList.find(d => d.nama_depo.trim().toLowerCase() === nama.trim().toLowerCase());
      return {
        ...prev,
        nama_depo: nama,
        kode_depo: matched ? matched.kode_depo : '',
        destination_name: nama,
      };
    });
    // Alamat tujuan terisi otomatis dari setting depo tujuan — user tetap
    // bisa mengubah manual setelahnya. Gagal fetch = tetap manual.
    const matched = depoList.find(d => d.nama_depo.trim().toLowerCase() === nama.trim().toLowerCase());
    if (matched?.kode_depo) {
      depotSettings.get(matched.kode_depo)
        .then(res => {
          const s = res.data?.data ?? {};
          setCreateForm(prev => ({
            ...prev,
            destination_name: s.nama_tujuan?.trim() ? s.nama_tujuan : prev.destination_name,
            destination_address: s.alamat_tujuan ?? prev.destination_address ?? '',
          }));
        })
        .catch(() => { /* setting depo belum ada — isi manual */ });
    }
  };

  const clearNamaDepo = () => {
    setCreateForm(prev => ({
      ...prev,
      nama_depo: '',
      kode_depo: '',
      destination_name: '',
    }));
  };

  // Titik kalender dari agregat server (semua depo yang diizinkan),
  // bukan dari 20 item halaman aktif.
  const calendarEvents = (rkStats?.calendar ?? []).map(entry => ({
    date: entry.date ?? '',
    count: 1,
    status: undefined as string | undefined,
    breakdown: entry.breakdown ?? {},
  }));

  const todayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayCount = rkStats?.todayCount ?? 0;
  const scheduledCount = rkStats?.scheduled ?? 0;
  const completedCountList = rkStats?.completed ?? 0;

  // Cek PO duplikat (debounced) — backend yang memutus, frontend memberi peringatan awal.
  useEffect(() => {
    const po = createForm.po_transporter?.trim().toUpperCase() ?? '';
    if (!po || !showCreate) {
      setPoDuplicate(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await rencanaKirim.list({ po_transporter: po, kode_depo: createForm.kode_depo || undefined, per_page: 1 });
        const rows: Array<{ id?: number }> = res.data.data;
        setPoDuplicate(rows.some(row => row.id !== editingId));
      } catch {
        setPoDuplicate(false); // gagal cek → biarkan backend yang memutus saat simpan
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [createForm.po_transporter, createForm.kode_depo, showCreate, editingId]);

  const openCreate = (date?: string) => {
    if (!hasPermission('rencana_kirim.create')) return;
    // Asal pengirim terisi otomatis dari user yang login (nama depo +
    // alamat yang didaftarkan saat user dibuat) — hanya mengisi kolom yang
    // masih kosong agar tidak menimpa ketikan yang sudah ada.
    setCreateForm(prev => ({
      ...prev,
      rkh_date: date ?? prev.rkh_date ?? todayDateStr(),
      shipper_name: prev.shipper_name?.trim() ? prev.shipper_name : (user?.nama_depo?.trim() ?? prev.shipper_name ?? ''),
      shipper_address: prev.shipper_address?.trim() ? prev.shipper_address : (user?.alamat?.trim() ?? prev.shipper_address ?? ''),
    }));
    setEditingId(null);
    setTypingItems(new Set());
    setCurrentStep(1);
    setShowCreate(true);
    // Asal pengirim terisi otomatis dari setting depo milik planner yang
    // login — hanya mengisi kolom yang masih kosong agar tidak menimpa
    // ketikan yang sudah ada. Gagal fetch = tetap manual seperti dulu.
    const ownDepo = user?.kode_depo?.trim();
    if (ownDepo) {
      depotSettings.get(ownDepo)
        .then(res => {
          const s = res.data?.data ?? {};
          setCreateForm(prev => ({
            ...prev,
            shipper_name: prev.shipper_name?.trim() ? prev.shipper_name : (s.nama_pengirim ?? prev.shipper_name ?? ''),
            shipper_address: prev.shipper_address?.trim() ? prev.shipper_address : (s.alamat_pengirim ?? prev.shipper_address ?? ''),
            shipper_phone: prev.shipper_phone?.trim() ? prev.shipper_phone : (s.telepon_pengirim ?? prev.shipper_phone ?? ''),
          }));
        })
        .catch(() => { /* setting depo belum ada — isi manual */ });
    }
  };

  const handleDateClick = (date: string) => {
    // Tanggal lampau di-clamp ke hari ini — backend menolak rkh_date sebelum hari ini.
    const today = todayDateStr();
    const effective = date < today ? today : date;
    setSelectedDate(effective);
    openCreate(effective);
  };

  const handleEdit = (item: RencanaKirim) => {
    setEditingId(item.id);
    setEditingStatus(item.status ?? '');
    setSelectedDate(item.rkh_date);
    setTypingItems(new Set());
    setCurrentStep(1);
    const editForm = {
      rkh_date: item.rkh_date?.split('T')[0] ?? '', po_transporter: item.po_transporter ?? '',
      driver_name: item.driver_name ?? '', nopol: item.nopol ?? '',
      jenis_kendaraan: item.jenis_kendaraan ?? '', expedisi: item.expedisi ?? '',
      shipper_name: item.shipper_name ?? '', shipper_address: item.shipper_address ?? '', shipper_phone: item.shipper_phone ?? '',
      destination_name: item.nama_depo ?? item.destination_name ?? '', destination_address: item.destination_address ?? '',
      kode_depo: item.kode_depo ?? '', nama_depo: item.nama_depo ?? item.destination_name ?? '', notes: item.notes ?? '',
    };
    const editItems = item.items && item.items.length > 0
      ? item.items.map((it, i) => ({
          id: it.id, npn_id: it.npn_id,
          item_number: i + 1, kode_barang: it.kode_barang ?? '', nama_barang: it.nama_barang ?? '',
          jumlah: Number(it.jumlah) || 0, satuan: it.satuan ?? 'CRT', keterangan: it.keterangan ?? '',
          umur: it.umur ?? null,
          decVolume: it.decVolume ?? it.npn?.decVolume ?? null,
          SAPdecUom: it.SAPdecUom ?? it.npn?.SAPdecUom ?? null,
          kubikasi: it.kubikasi ?? null,
        }))
      : [{ ...emptyItem }];
    setCreateForm(editForm);
    setCreateItems(editItems);
    setEditSnapshot(JSON.stringify({ form: editForm, items: editItems }));
    setShowCreate(true);
  };

  const handleDelete = async (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const changeStatus = async (id: number, newStatus: string) => {
    switch (newStatus) {
      case 'SCHEDULED': return rencanaKirim.schedule(id);
      case 'CANCELLED': return rencanaKirim.cancel(id);
      default: throw new Error('Status tidak dapat diubah di sini');
    }
  };

  // Dipakai tabel desktop & kartu mobile — guard statusBusyId mencegah klik ganda.
  const handleStatusChange = async (item: RencanaKirim, newStatus: 'SCHEDULED' | 'CANCELLED') => {
    if (statusBusyId !== null) return;
    setStatusBusyId(item.id);
    try {
      const res = await changeStatus(item.id, newStatus);
      await loadItems();
      loadStats();
      notifyGlobal(`Status diubah menjadi ${statusConfig[res.data.data.status]?.label || res.data.data.status}`, 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengubah status'), 'error');
    } finally {
      setStatusBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId || deleting) return;
    setDeleting(true);
    try {
      await rencanaKirim.delete(deleteTargetId);
      loadItems();
      loadStats();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Error'));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  };

  // Form dianggap "kotor" bila user pernah mengisi apa pun
  // (rkh_date prefill dari kalender tidak dihitung sebagai isian user).
  // Mode edit: "kotor" = isi saat ini berbeda dari snapshot awal (memulihkan nilai awal = tidak kotor).
  const createDirty = editingId
    ? editSnapshot !== JSON.stringify({ form: createForm, items: createItems })
    : (Object.keys(emptyForm) as (keyof typeof emptyForm)[]).some((key) => {
        if (key === 'rkh_date') return false;
        return String(createForm[key] ?? '').trim() !== String(emptyForm[key] ?? '').trim();
      }) ||
      createItems.some((item) => item.kode_barang !== '' || item.nama_barang.trim().length > 0 || Number(item.jumlah) > 0);

  const resetCreateForm = () => {
    setShowCreate(false);
    setShowBarangModal(false);
    setShowImport(false);
    setCreateForm({ ...emptyForm });
    setCreateItems([{ ...emptyItem }]);
    setEditingId(null);
    setEditingStatus('');
    setTypingItems(new Set());
    setCurrentStep(1);
    setPoDuplicate(false);
    setEditSnapshot('');
  };

  const requestCloseCreate = () => {
    if (createDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    resetCreateForm();
  };

  const handleCreate = async () => {
    const incompleteItem = createItems.some(item => item.nama_barang.trim() && !item.kode_barang);
    const typingItem = [...typingItems].some(index => createItems[index] && !createItems[index].kode_barang);
    const validItems = createItems.filter(item => item.kode_barang && Number(item.jumlah) > 0);
    const zeroQtyItem = createItems.some(item => item.kode_barang && !(Number(item.jumlah) > 0));

    if (typingItem) {
      notifyGlobal('Barang belum dipilih dari hasil pencarian NPN. Pilih produk dari daftar sebelum menyimpan.', 'error');
      return;
    }

    if (incompleteItem || validItems.length === 0 || zeroQtyItem) {
      notifyGlobal(zeroQtyItem ? 'Setiap barang harus memiliki jumlah lebih dari 0.' : 'Maaf, nama barang dengan kode produk yang dicari tidak ditemukan. Silakan hubungi administrator untuk menambahkan barang yang diinput.', 'error');
      return;
    }

    // Field umur hanya tampilan (dihitung backend dari master); jangan dikirim.
    const payloadItems = validItems.map(({ umur: _umur, ...rest }) => rest);

    setSaving(true);
    try {
      if (editingId) {
        await rencanaKirim.update(editingId, { ...createForm, items: payloadItems });
        resetCreateForm();
        loadItems();
        loadStats();
        notifyGlobal(`Rencana kirim berhasil diperbarui untuk Depo ${createForm.nama_depo || createForm.kode_depo || '-'}.`, 'success');
      } else {
        await rencanaKirim.create({ ...createForm, items: payloadItems });
        resetCreateForm();
        loadItems();
        loadStats();
        notifyGlobal(`Rencana kirim berhasil disimpan untuk Depo ${createForm.nama_depo || createForm.kode_depo || '-'}.`, 'success');
      }
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menyimpan rencana kirim.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImportItems = async () => {
    if (!selectedFile || !hasPermission('rencana_kirim.import')) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await rencanaKirim.importItems(selectedFile);
      const data = res.data.data;
      const matched = Number(data?.matched ?? 0);
      setImportResult({
        message: matched > 0 ? (res.data.message || 'Import berhasil') : 'Tidak ada barang yang cocok — tidak ada baris ditambahkan',
        ok: matched > 0,
        ...(data ?? {}),
      });
      if (data?.items && Array.isArray(data.items)) {
        const newItems: RencanaKirimItem[] = data.items.map((item: Record<string, unknown>, i: number) => ({
          npn_id: item.npn_id as number | undefined,
          item_number: createItems.length + i + 1,
          kode_barang: (item.kode_barang as string) || '',
          nama_barang: (item.nama_barang as string) || '',
          jumlah: (item.jumlah as number) || 0,
          satuan: (item.satuan as string) || 'CRT',
          keterangan: (item.keterangan as string) || '',
          umur: (item.umur as number | null) ?? null,
          decVolume: (item.decVolume as number | null) ?? null,
          SAPdecUom: (item.SAPdecUom as number | null) ?? null,
          kubikasi: (item.kubikasi as number | null) ?? null,
        }));
        setCreateItems(prev => {
          const filtered = prev.filter(item => item.kode_barang || item.nama_barang);
          const combined = [...filtered, ...newItems];
          return combined.map((item, i) => ({ ...item, item_number: i + 1 }));
        });
      }
    } catch (e) {
      setImportResult({ message: getErrorMessage(e, 'Import gagal'), ok: false });
    } finally {
      setImporting(false);
    }
  };

  const handleItemTemplate = async () => {
    try {
      const res = await rencanaKirim.itemTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'rencana_kirim_item_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      notifyGlobal('Gagal mengunduh template.', 'error');
    }
  };

  const addItem = () => {
    setTypingItems(new Set());
    setCreateItems([...createItems, { ...emptyItem, item_number: createItems.length + 1 }]);
  };

  const removeItem = (index: number) => {
    if (createItems.length <= 1) return;
    setTypingItems(new Set());
    const updated = createItems.filter((_, i) => i !== index);
    updated.forEach((item, i) => item.item_number = i + 1);
    setCreateItems(updated);
  };

  const updateItem = (index: number, field: keyof RencanaKirimItem, value: string | number) => {
    const updated = [...createItems];
    updated[index] = { ...updated[index], [field]: value };
    setCreateItems(updated);
  };

  const handleNamaBarangSelect = (index: number, product: NpnProduct) => {
    const updated = [...createItems];
    updated[index] = {
      ...updated[index],
      npn_id: product.id,
      kode_barang: product.BOSnetszProductId,
      // Samakan dengan identitas yang dicari/dipilih di picker. Sebelumnya
      // szShortDescription didahulukan, sehingga dua produk berbeda yang
      // deskripsinya sama (atau deskripsinya tidak memuat nickname) tampak
      // seperti satu produk dan nama yang tersimpan tidak sesuai pencarian.
      nama_barang: product.szNickName || product.szNickNameNew || product.szShortDescription || '',
      satuan: product.SAPszUomId || updated[index].satuan,
      umur: typeof product.umur === 'number' ? product.umur : null,
      decVolume: product.decVolume != null ? Number(product.decVolume) : null,
      SAPdecUom: product.SAPdecUom != null ? Number(product.SAPdecUom) : null,
    };
    setCreateItems(updated);
  };

  const handleClearItem = (index: number) => {
    const updated = [...createItems];
    updated[index] = {
      ...updated[index],
      npn_id: undefined,
      kode_barang: '',
      nama_barang: '',
      umur: null,
      decVolume: null,
      SAPdecUom: null,
      kubikasi: null,
    };
    setCreateItems(updated);
  };

  const totalQty = createItems.reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0);
  const itemKubikasi = (item: RencanaKirimItem): number => {
    if (typeof item.kubikasi === 'number') return item.kubikasi;
    const volume = Number(item.decVolume ?? item.npn?.decVolume) || 0;
    const pcs = Number(item.SAPdecUom ?? item.npn?.SAPdecUom) || 1;
    return (Number(item.jumlah) || 0) * volume * pcs / 1_000_000;
  };
  // Total yang TAMPIL = penjumlahan nilai per-baris yang sudah dibulatkan 2 desimal,
  // agar penjumlahan di layar selalu konsisten (0.69 + 7.64 = 8.33, bukan 8.32).
  // Angka final tetap dihitung ulang oleh backend saat simpan — ini hanya penyajian.
  const totalKubikasiDisplay = createItems.reduce((sum, item) => sum + Number(itemKubikasi(item).toFixed(2)), 0);
  // Duplikat dihitung sekali di sini lalu dipakai ulang oleh badge, ringkasan,
  // dropdown dan validasi simpan. Kalau tiap pemakai menghitung sendiri, suatu
  // saat satu layar akan memutuskan "bukan duplikat" dan yang lain sebaliknya.
  const duplicateIndexes = useMemo(() => findDuplicateIndexes(createItems), [createItems]);
  const duplicateCount = duplicateIndexes.size;
  // Kode yang terpakai baris LAIN, per indeks baris. Sebelumnya ini dipanggil
  // inline di JSX, jadi tiap render membuat array baru — useMemo di dalam
  // NamaBarangInput tak pernah bisa cache dan selalu hitung ulang Set-nya.
  const takenCodesByIndex = useMemo(() => {
    const byIndex = new Map<number, string[]>();
    createItems.forEach((_, i) => byIndex.set(i, takenCodesExcept(createItems, i)));
    return byIndex;
  }, [createItems]);
  const sectionComplete = {
    dokumen: !!(createForm.po_transporter?.trim() && createForm.rkh_date),
    kendaraan: !!(createForm.driver_name?.trim() && createForm.nopol?.trim() && createForm.expedisi?.trim() && createForm.jenis_kendaraan),
    pengirim: !!(createForm.shipper_name?.trim() && createForm.nama_depo?.trim() && createForm.kode_depo?.trim()),
    // Duplikat tidak boleh dianggap "selesai" — kalau tidak, satu produk bisa
    // terhitung dua kali dan ikut ter-simpan ke backend.
    barang: createItems.some(i => i.kode_barang && Number(i.jumlah) > 0) && duplicateCount === 0,
    catatan: !!createForm.notes?.trim(),
  };
  const completedCount = Object.values(sectionComplete).filter(Boolean).length;
  const isMainFormValid = sectionComplete.dokumen && sectionComplete.kendaraan && sectionComplete.pengirim;
  const canSave = isMainFormValid && sectionComplete.barang;
  // Backend menolak edit setelah CHECKED_IN — frontend menyetirinya sama: hanya DRAFT/SCHEDULED yang bisa diedit.
  const editLocked = !!editingId && !['DRAFT', 'SCHEDULED'].includes(editingStatus);
  const itemCount = createItems.filter(i => i.kode_barang).length;
  const fmt = (v: unknown): React.ReactNode => (v ?? '-') as React.ReactNode;
  const fmtDateId = (v?: string | null) => {
    if (!v) return '-';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header — reflektif, konsisten dengan pola desain modern */}
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <svg aria-hidden="true" className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Replenishment</h1>
                <p className="mt-0.5 text-ink-fg-muted">Kelola pengiriman • auto kubikasi & umur</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Hari ini
                <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{todayCount}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                Terjadwal
                <span className="rounded-md bg-blue-400 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-blue-950">{scheduledCount}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Selesai
                <span className="rounded-md bg-emerald-400 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-emerald-950">{completedCountList}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                Total
                <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{rkStats?.total ?? 0}</span>
              </span>
            </div>
          </div>
        </header>

        {/* Calendar + Table Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-1">
            <Calendar
              events={calendarEvents}
              onDateClick={handleDateClick}
              selectedDate={selectedDate}
            />
            <p className="mt-3 text-center text-xs text-slate-400">Klik tanggal di kalender untuk langsung membuka form baru pada tanggal tersebut.</p>
          </div>

          {/* Table */}
          <div className="lg:col-span-2">
            {/* Table Card */}
            <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex flex-col gap-4">
                  {/* Baris judul + aksi utama */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-chip-primary flex items-center justify-center">
                        <svg className="w-5 h-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-800">Daftar Rencana Pengiriman</h2>
                        <p className="mt-0.5 text-xs text-slate-400">Pantau jadwal, kendaraan, tujuan, dan status pengiriman</p>
                      </div>
                    </div>
                    {hasPermission('rencana_kirim.create') && (
                      <button onClick={() => openCreate()} aria-label="Buat rencana kirim baru" className="btn-primary text-sm px-4 py-2 shadow-none">
                        <span className="flex items-center gap-2">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          Buat Rencana
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Baris pencarian + filter */}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex-1 lg:max-w-md">
                      <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari PO Transporter/RKH/driver..." resultCount={items.length} totalCount={rkStats?.total} currentFrom={items.length > 0 ? (page - 1) * 20 + 1 : 0} currentTo={(page - 1) * 20 + items.length} resultLabel="rencana" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <select
                          aria-label="Filter status"
                          value={filterStatus ?? ''}
                          onChange={(e) => { setFilterStatus(e.target.value || null); setPage(1); }}
                          className="appearance-none py-2 pl-3 pr-9 border border-slate-300 rounded-xl bg-surface-card text-gray-900 text-sm leading-tight shadow-sm cursor-pointer focus:outline-none focus:ring-primary-500 focus:border-primary-500 min-w-[140px]"
                        >
                          <option value="">Semua</option>
                          <option value="DRAFT">Draft</option>
                          <option value="SCHEDULED">Dijadwalkan</option>
                          <option value="CHECKED_IN">Check In</option>
                          <option value="VERIFIED">Terverifikasi</option>
                          <option value="IN_PROGRESS">Diproses</option>
                          <option value="COMPLETED">Selesai</option>
                          <option value="CANCELLED">Dibatalkan</option>
                        </select>
                        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                      </div>
                      <div className="relative">
                        <select
                          aria-label="Filter depo"
                          value={filterKodeDepo ?? ''}
                          onChange={(e) => { setFilterKodeDepo(e.target.value || null); setPage(1); }}
                          className="appearance-none py-2 pl-3 pr-9 border border-slate-300 rounded-xl bg-surface-card text-gray-900 text-sm leading-tight shadow-sm cursor-pointer focus:outline-none focus:ring-primary-500 focus:border-primary-500 min-w-[160px]"
                        >
                          <option value="">Semua Depo</option>
                          {depoList.map((d) => (
                            <option key={d.kode_depo} value={d.kode_depo}>
                              {d.nama_depo} ({d.kode_depo})
                            </option>
                          ))}
                        </select>
                        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

          <div className="overflow-x-auto overflow-y-auto hidden lg:block max-h-[560px]">
            <table className="w-full min-w-[980px] border-collapse">
              <caption className="sr-only">Daftar rencana pengiriman</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-raised border-b border-slate-300 shadow-sm">
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">No</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Tgl Create</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">PO Transporter</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Tanggal RKH</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Driver</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Nopol</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Expedisi</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Jenis Kendaraan</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Tujuan</th>
                  <th scope="col" className="px-5 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Qty</th>
                  <th scope="col" className="px-5 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Kubikasi (m³)</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th scope="col" className="px-5 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && items.length === 0 && (
                  <>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <tr key={`skel-rk-${i}`} className="animate-pulse">
                        {Array.from({ length: 13 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5"><div className="h-4 w-24 rounded bg-slate-100" /></td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}
                {items.map((item, index) => (
                  <tr key={item.id} className="group hover:bg-overlay-70 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap">{(page - 1) * 20 + index + 1}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap"><span className="font-mono">{item.created_at?.split('T')[0] || '-'}</span></td>
                    <td className="px-5 py-3.5 text-sm text-slate-800 font-medium whitespace-nowrap"><span className="font-mono">{fmt(item.po_transporter)}</span></td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap"><span className="font-mono">{fmt(item.rkh_date?.split('T')[0])}</span></td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 whitespace-nowrap">{fmt(item.driver_name)}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap"><span className="font-mono">{fmt(item.nopol)}</span></td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{fmt(item.expedisi)}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{item.jenis_kendaraan ? <span className="inline-flex rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{item.jenis_kendaraan}</span> : '-'}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 whitespace-nowrap">{fmt(item.destination_name)}</td>
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center min-w-[2.5rem] rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-800">{item.total_qty}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {typeof item.total_kubikasi === 'number'
                        ? <span className="inline-flex items-center justify-center rounded-lg bg-teal-50 px-2.5 py-1 text-sm font-bold text-teal-700">{Number(item.total_kubikasi).toFixed(2)}</span>
                        : '-'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm ${statusConfig[item.status]?.bg || 'bg-surface-card'} ${statusConfig[item.status]?.color || 'text-gray-600'} ${statusConfig[item.status]?.border || 'border-gray-300'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[item.status]?.dot || 'bg-gray-400'}`} />
                        {statusConfig[item.status]?.label || item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {hasPermission('rencana_kirim.edit') && item.status === 'DRAFT' && (
                          <button
                            onClick={() => handleStatusChange(item, 'SCHEDULED')}
                            disabled={statusBusyId === item.id}
                            aria-label={`Jadwalkan rencana kirim ${item.po_transporter || ''}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-50 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-wait shadow-sm shadow-blue-600/25 rounded-lg transition-colors min-h-9"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Jadwalkan
                          </button>
                        )}
                        {hasPermission('rencana_kirim.edit') && item.status === 'SCHEDULED' && (
                          <button
                            onClick={() => handleStatusChange(item, 'CANCELLED')}
                            disabled={statusBusyId === item.id}
                            aria-label={`Batalkan rencana kirim ${item.po_transporter || ''}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-wait border border-red-200 rounded-lg transition-colors min-h-9"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            Batalkan
                          </button>
                        )}
                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-300 bg-surface-card p-0.5 ml-1 shadow-sm">
                          <button onClick={() => setViewItem(item)} aria-label={`Lihat detail rencana kirim ${item.po_transporter || ''}`} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                          {hasPermission('rencana_kirim.edit') && ['DRAFT', 'SCHEDULED'].includes(item.status) && (
                            <button onClick={() => handleEdit(item)} aria-label={`Edit rencana kirim ${item.po_transporter || ''}`} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </button>
                          )}
                          {hasPermission('rencana_kirim.delete') && ['DRAFT', 'CANCELLED'].includes(item.status) && (
                            <button onClick={() => handleDelete(item.id)} disabled={deleting} aria-label={`Hapus rencana kirim ${item.po_transporter || ''}`} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-5 py-16 text-center">
                      <div role="status" className="flex flex-col items-center gap-2">
                        <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                          <svg className="h-7 w-7 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        </div>
                        {search.trim() ? (
                          <>
                            <p className="text-sm font-medium text-slate-600">Tidak ada hasil untuk &quot;{search}&quot;</p>
                            <button onClick={() => { setSearch(''); setPage(1); }} className="text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-slate-600">Belum ada data rencana kirim.</p>
                            <p className="text-xs text-slate-400">Buat rencana baru atau klik tanggal di kalender untuk mulai mengisi form.</p>
                          </>
                        )}
                        {!search.trim() && hasPermission('rencana_kirim.create') && (
                          <button onClick={() => openCreate()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-ink-800 active:scale-[0.98]">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            Buat Rencana
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — tabel desktop disembunyikan di < lg; tanpa kartu ini daftar hilang di ponsel */}
          <div className="lg:hidden divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {loading && items.length === 0 && (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`skel-rk-m-${i}`} className="animate-pulse p-4 space-y-3">
                    <div className="h-4 w-2/3 rounded bg-slate-100" />
                    <div className="h-3 w-1/3 rounded bg-slate-100" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-3 w-full rounded bg-slate-100" />
                      <div className="h-3 w-full rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </>
            )}
            {items.map((item) => {
              const st = statusConfig[item.status];
              return (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-slate-800 truncate">{fmt(item.po_transporter)}</p>
                      <p className="mt-0.5 text-xs text-slate-400">RK {item.rkh_date?.split('T')[0] || '-'} • Dibuat {item.created_at?.split('T')[0] || '-'}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${st?.bg || 'bg-surface-card'} ${st?.color || 'text-gray-600'} ${st?.border || 'border-gray-300'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-gray-400'}`} />
                      {st?.label || item.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div><span className="text-slate-400">Driver: </span><span className="font-medium text-slate-700">{fmt(item.driver_name)}</span></div>
                    <div><span className="text-slate-400">Nopol: </span><span className="font-mono font-medium text-slate-700">{fmt(item.nopol)}</span></div>
                    <div><span className="text-slate-400">Expedisi: </span><span className="font-medium text-slate-700">{fmt(item.expedisi)}</span></div>
                    <div><span className="text-slate-400">Jenis: </span>{item.jenis_kendaraan ? <span className="inline-flex rounded-md bg-blue-50 border border-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">{item.jenis_kendaraan}</span> : '-'}</div>
                    <div className="col-span-2"><span className="text-slate-400">Tujuan: </span><span className="font-medium text-slate-700">{fmt(item.destination_name)}</span></div>
                    <div><span className="text-slate-400">Qty: </span><span className="font-bold text-slate-800">{item.total_qty}</span></div>
                    <div><span className="text-slate-400">Kubikasi: </span>{typeof item.total_kubikasi === 'number' ? <span className="font-bold text-teal-700">{Number(item.total_kubikasi).toFixed(2)} m³</span> : '-'}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasPermission('rencana_kirim.edit') && item.status === 'DRAFT' && (
                      <button onClick={() => handleStatusChange(item, 'SCHEDULED')} disabled={statusBusyId === item.id} aria-label={`Jadwalkan rencana kirim ${item.po_transporter || ''}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-50 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-wait rounded-lg transition-colors min-h-9">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Jadwalkan
                      </button>
                    )}
                    {hasPermission('rencana_kirim.edit') && item.status === 'SCHEDULED' && (
                      <button onClick={() => handleStatusChange(item, 'CANCELLED')} disabled={statusBusyId === item.id} aria-label={`Batalkan rencana kirim ${item.po_transporter || ''}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-wait border border-red-200 rounded-lg transition-colors min-h-9">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Batalkan
                      </button>
                    )}
                    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-300 bg-surface-card p-0.5 ml-auto">
                      <button onClick={() => setViewItem(item)} aria-label={`Lihat detail rencana kirim ${item.po_transporter || ''}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                      {hasPermission('rencana_kirim.edit') && ['DRAFT', 'SCHEDULED'].includes(item.status) && (
                        <button onClick={() => handleEdit(item)} aria-label={`Edit rencana kirim ${item.po_transporter || ''}`} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                      )}
                      {hasPermission('rencana_kirim.delete') && ['DRAFT', 'CANCELLED'].includes(item.status) && (
                        <button onClick={() => handleDelete(item.id)} disabled={deleting} aria-label={`Hapus rencana kirim ${item.po_transporter || ''}`} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && items.length === 0 && (
              <div className="p-10 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <svg className="h-7 w-7 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                </div>
                {search.trim() ? (
                  <>
                    <p className="text-sm font-medium text-slate-600">Tidak ada hasil untuk &quot;{search}&quot;</p>
                    <button onClick={() => { setSearch(''); setPage(1); }} className="mt-2 text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-600">Belum ada data rencana kirim.</p>
                    <p className="mt-0.5 text-xs text-slate-400">Buat rencana baru atau klik tanggal di kalender untuk mulai mengisi form.</p>
                  </>
                )}
                {!search.trim() && hasPermission('rencana_kirim.create') && (
                  <button onClick={() => openCreate()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-ink-800 active:scale-[0.98]">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Buat Rencana
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 bg-overlay-60 px-4 py-3.5 sm:px-5">
            <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
              <span className="text-xs text-slate-500 sm:text-sm">Halaman <strong className="font-semibold text-slate-800">{page}</strong> dari <strong className="font-semibold text-slate-800">{lastPage}</strong></span>
              <div className="flex w-full items-center justify-center gap-2 sm:w-auto">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Halaman sebelumnya" className="btn-secondary flex-1 text-sm px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed sm:flex-none">
                  <span className="flex items-center justify-center gap-1.5"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>Sebelumnya</span>
                </button>
                <button onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} aria-label="Halaman berikutnya" className="btn-primary flex-1 text-sm px-4 py-2 shadow-none disabled:opacity-40 disabled:cursor-not-allowed sm:flex-none">
                  <span className="flex items-center justify-center gap-1.5">Selanjutnya<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></span>
                </button>
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>

      {/* View Modal — premium */}
      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Replenishment" size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {hasPermission('rencana_kirim.view') && (
              <button onClick={() => viewItem && previewSuratJalan(viewItem as RencanaKirimData)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-card border border-slate-300 text-sm font-bold text-slate-700 hover:bg-surface-raised">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Preview
              </button>
              )}
              {hasPermission('rencana_kirim.view') && (
              <button onClick={() => viewItem && downloadSuratJalan(viewItem as RencanaKirimData)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ink-900 text-white text-sm font-bold hover:bg-black shadow-lg">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Download PDF
              </button>
              )}
            </div>
            <button onClick={() => setViewItem(null)} className="px-4 py-2 rounded-xl bg-surface-card border border-slate-300 text-sm font-bold text-slate-600 hover:bg-surface-raised">Tutup</button>
          </div>
        }
      >
        {viewItem && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-ink-900 p-5 text-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-widest text-white/60 uppercase">PO Transporter</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight">{fmt(viewItem.po_transporter)}</h3>
                  <p className="mt-1 text-xs text-white/70"><span className="font-semibold">RK:</span> {fmtDateId(viewItem.rkh_date?.split('T')[0])} <span className="text-white/40">•</span> <span className="font-semibold">Dibuat:</span> {fmtDateId(viewItem.created_at?.split('T')[0])}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-3 py-1 text-xs font-black text-gray-900 ring-1 ring-inset ring-gray-300">
                  <span className={`w-2 h-2 rounded-full ${statusConfig[viewItem.status]?.dot || 'bg-slate-400'}`} />{statusConfig[viewItem.status]?.label || viewItem.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white/10 border border-white/10 p-3 text-center">
                  <p className="text-xs font-bold tracking-widest text-white/60 uppercase">Qty</p>
                  <p className="text-lg font-black tabular-nums">{Number(viewItem.total_qty).toLocaleString('id-ID')}</p>
                </div>
                <div className="rounded-xl bg-white/10 border border-white/10 p-3 text-center">
                  <p className="text-xs font-bold tracking-widest text-white/60 uppercase">Kubikasi</p>
                  <p className="text-lg font-black">{typeof viewItem.total_kubikasi === 'number' ? `${Number(viewItem.total_kubikasi).toFixed(2)}` : '-'} <span className="text-xs font-normal">m³</span></p>
                </div>
                <div className="rounded-xl bg-surface-card text-slate-900 p-3 text-center">
                  <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Tujuan</p>
                  <p className="text-sm font-black truncate">{fmt(viewItem.destination_name)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-surface-card p-4 shadow-sm">                  <h4 className="mb-3 flex items-center gap-2 text-xs font-black tracking-widest text-slate-500 uppercase"><span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg></span> Kendaraan</h4>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Driver</span><span className="font-bold text-slate-900">{fmt(viewItem.driver_name)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Nopol</span><span className="font-mono font-bold">{fmt(viewItem.nopol)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Expedisi</span><span className="font-medium">{fmt(viewItem.expedisi)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Jenis</span><span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{fmt(viewItem.jenis_kendaraan)}</span></div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-surface-card p-4 shadow-sm">                  <h4 className="mb-3 flex items-center gap-2 text-xs font-black tracking-widest text-slate-500 uppercase"><span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg></span> Pengiriman</h4>
                <div className="space-y-2.5 text-sm">
                  <div><p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Pengirim</p><p className="font-bold text-slate-900">{fmt(viewItem.shipper_name)}</p><p className="text-xs text-slate-500">{fmt(viewItem.shipper_address)}</p></div>
                  <div><p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Kepada</p><p className="font-bold text-slate-900">{fmt(viewItem.destination_name)}</p><p className="text-xs text-slate-500">{fmt(viewItem.destination_address) || '-'}</p></div>
                </div>
              </div>
            </div>
            {viewItem.items && viewItem.items.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-surface-card shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 bg-surface-raised border-b border-slate-100">
                  <h4 className="text-xs font-black tracking-widest text-slate-500 uppercase">Daftar barang • {viewItem.items.length}</h4>
                  <span className="text-xs font-mono text-slate-500">{viewItem.items.reduce((s, i) => s + Number(i.jumlah || 0), 0).toLocaleString('id-ID')} qty</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-auto">
                  {viewItem.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised">
                      <span className="w-6 h-6 rounded-lg bg-ink-900 text-white text-xs font-black flex items-center justify-center shrink-0">{item.item_number}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{item.nama_barang}</p>
                        <p className="text-xs font-mono text-slate-400">{item.kode_barang} • {Number(item.jumlah).toLocaleString('id-ID')} {item.satuan}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-slate-900 tabular-nums">{Number(item.jumlah).toLocaleString('id-ID')} <span className="text-xs font-medium text-slate-400">{item.satuan}</span></p>
                        {item.keterangan ? <p className="text-[11px] text-slate-400 max-w-[220px] truncate">{item.keterangan}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {viewItem.notes && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><h4 className="text-xs font-black tracking-widest text-amber-700 uppercase">Catatan</h4><p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{viewItem.notes}</p></div>}
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={requestCloseCreate} onCloseRequest={requestCloseCreate} title={editingId ? 'Edit Replenishment' : 'Buat Replenishment'} subtitle={editingId ? 'Perbarui jadwal, kendaraan, dan daftar barang.' : 'Lengkapi data pengiriman — isi dari atas ke bawah.'} size="2xl"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              {typingItems.size > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 text-white px-3 py-1 font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" /> Lengkapi NPN dulu
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${canSave ? 'bg-emerald-500' : 'bg-gray-300'}`} /> {canSave ? 'Siap simpan' : !isMainFormValid ? 'Lengkapi Dokumen, Kendaraan & Alamat' : 'Isi minimal 1 barang'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={requestCloseCreate} className="btn-secondary px-5">Batal</button>
              <button
                onClick={handleCreate}
                disabled={saving || typingItems.size > 0 || !canSave || poDuplicate || editLocked || (editingId ? !hasPermission('rencana_kirim.edit') : !hasPermission('rencana_kirim.create'))}
                title={poDuplicate ? 'PO Transporter sudah dipakai di depo yang sama' : !canSave ? (!isMainFormValid ? 'Lengkapi Dokumen, Kendaraan & Alamat dulu' : duplicateCount > 0 ? `${duplicateCount} nama barang terduplikasi — gabungkan atau hapus dulu` : 'Isi minimal 1 barang') : undefined}
                className="btn-primary min-w-[160px] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-600/20"
              >
                <span className="flex items-center justify-center gap-2">
                  {saving ? (
                    <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg> {editingId ? 'Menyimpan perubahan...' : 'Menyimpan rencana kirim...'}</>
                  ) : (
                    <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> {editingId ? 'Update Rencana' : 'Simpan Rencana'}</>
                  )}
                </span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {editingId && editLocked && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${editingStatus === 'CANCELLED' ? 'bg-red-50 border-red-200 text-red-700' : editingStatus === 'COMPLETED' ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {editingStatus === 'CANCELLED'
                ? 'Rencana kirim ini sudah dibatalkan. Perubahan tidak dapat disimpan.'
                : editingStatus === 'COMPLETED'
                  ? 'Rencana kirim ini sudah selesai. Perubahan tidak dapat disimpan.'
                  : 'Rencana kirim ini sudah diproses (Check In / Verifikasi / Dikerjakan). Perubahan tidak dapat disimpan.'}
            </div>
          )}
          {/* Modern Stepper */}
          <div className="rounded-2xl border border-gray-100 bg-surface-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              {[
                { n: 1, label: 'Dokumen', key: 'dokumen', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25' },
                { n: 2, label: 'Kendaraan', key: 'kendaraan', icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193' },
                { n: 3, label: 'Alamat', key: 'pengirim', icon: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z' },
                { n: 4, label: 'Barang', key: 'barang', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
                { n: 5, label: 'Catatan', key: 'catatan', icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227' },
              ].map((step, idx) => {
                const isActive = currentStep === step.n;
                const isDone = (sectionComplete as Record<string, boolean>)[step.key];
                const isPast = currentStep > step.n;
                return (
                  <div key={step.n} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (step.n === 1 || (step.n > 1 && (sectionComplete as Record<string, boolean>)[['dokumen','kendaraan','pengirim','barang'][step.n-2] as string] || step.n <= currentStep)) {
                          setCurrentStep(step.n);
                        }
                      }}
                      className={`flex flex-col items-center gap-1.5 flex-1 ${step.n <= currentStep || isDone ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm transition-all ${isActive ? 'bg-primary-600 text-white shadow-primary-600/25 scale-105' : isDone || isPast ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 border border-gray-300'}`}>
                        {isDone && !isActive ? '✓' : step.n}
                      </span>
                      <span className={`text-[11px] font-semibold ${isActive ? 'text-accent-text' : isDone ? 'text-emerald-600' : 'text-gray-400'}`}>{step.label}</span>
                    </button>
                    {idx < 4 && <div className={`h-0.5 flex-1 rounded-full transition-colors ${currentStep > step.n || isDone ? 'bg-emerald-500' : 'bg-gray-200'}`} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-500">Langkah {currentStep} dari 5</span>
              <span className={`font-semibold ${canSave ? 'text-emerald-600' : 'text-accent-text'}`}>{completedCount}/5 lengkap • {canSave ? 'Siap simpan' : 'Lengkapi dulu'}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-linear-to-r from-primary-500 to-emerald-500 transition-all duration-500" style={{ width: `${(completedCount / 5) * 100}%` }} />
            </div>
          </div>

          {currentStep === 1 && (
          <div className="bg-surface-card border border-gray-300 rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-chip-primary flex items-center justify-center text-accent-text text-xs font-bold">1</span> Informasi Dokumen</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-po-transporter" className="block text-xs font-medium text-gray-500 mb-1">PO Transporter <span className="text-red-500">*</span></label>
                <input id="f-po-transporter" aria-invalid={poDuplicate || undefined} type="text" value={createForm.po_transporter ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, po_transporter: e.target.value }))} placeholder="cth: PO-2026-0001" className="input-field text-sm py-2 uppercase" />
                <p className="text-[10px] text-gray-400 mt-0.5">Nomor PO transporter (SJ/BA)</p>
                {poDuplicate && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-amber-600">PO Transporter ini sudah dipakai rencana kirim lain di depo yang sama.</p>
                )}
              </div>
              <div>
                <label htmlFor="f-rkh-date" className="block text-xs font-medium text-gray-500 mb-1">Tanggal RKH <span className="text-red-500">*</span></label>
                <input id="f-rkh-date" type="date" min={editingId ? undefined : todayDateStr()} value={createForm.rkh_date ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, rkh_date: e.target.value }))} className="input-field text-sm py-2" />
                <p className="text-[10px] text-gray-400 mt-0.5">Tanggal pengiriman rencana</p>
              </div>
            </div>
          </div>
          )}

          {currentStep === 2 && (
          <div className="bg-surface-card border border-gray-300 rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">2</span> Kendaraan & Driver</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-driver" className="block text-xs font-medium text-gray-500 mb-1">Nama Driver <span className="text-red-500">*</span></label>
                <input id="f-driver" type="text" value={createForm.driver_name ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, driver_name: e.target.value }))} placeholder="cth: Budi Santoso" className="input-field text-sm py-2" />
              </div>
              <div>
                <label htmlFor="f-expedisi" className="block text-xs font-medium text-gray-500 mb-1">Expedisi / Nama Kendaraan <span className="text-red-500">*</span></label>
                <input id="f-expedisi" type="text" value={createForm.expedisi ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, expedisi: e.target.value }))} placeholder="cth: CTP / Nama ekspedisi" className="input-field text-sm py-2" />
              </div>
              <div>
                <label htmlFor="f-nopol" className="block text-xs font-medium text-gray-500 mb-1">Nopol <span className="text-red-500">*</span></label>
                <input id="f-nopol" type="text" value={createForm.nopol ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, nopol: e.target.value }))} placeholder="cth: DA 8323 BU" className="input-field text-sm py-2 uppercase" />
              </div>
              <div>
                <label htmlFor="f-jenis" className="block text-xs font-medium text-gray-500 mb-1">Jenis Kendaraan <span className="text-red-500">*</span></label>
                <select id="f-jenis" value={createForm.jenis_kendaraan ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, jenis_kendaraan: e.target.value }))} className="select-field text-sm py-2">
                  <option value="">Pilih jenis kendaraan</option>
                  {jenisKendaraanOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
              </div>
            </div>
          </div>
          )}

          {currentStep === 3 && (
          <div className="bg-surface-card border border-gray-300 rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">3</span> Alamat Pengiriman & Tujuan</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-3 rounded-xl bg-overlay-70 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Asal Pengirim</h4>
                <div>
                  <label htmlFor="f-shipper-name" className="block text-xs font-medium text-gray-500 mb-1">Asal Pengirim <span className="text-red-500">*</span></label>
                  <input id="f-shipper-name" type="text" value={createForm.shipper_name ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, shipper_name: e.target.value }))} placeholder="cth: PT Sinar Abadi" className="input-field text-sm py-2" />
                </div>
                <div>
                  <label htmlFor="f-shipper-addr" className="block text-xs font-medium text-gray-500 mb-1">Alamat Pengirim</label>
                  <textarea id="f-shipper-addr" value={createForm.shipper_address ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, shipper_address: e.target.value }))} placeholder="cth: Jl. Raya Singkawang No.1, Singkawang" rows={2} className="input-field resize-none text-sm py-2" />
                </div>
                <div>
                  <label htmlFor="f-shipper-phone" className="block text-xs font-medium text-gray-500 mb-1">No. HP Pengirim</label>
                  <input id="f-shipper-phone" type="text" value={createForm.shipper_phone ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, shipper_phone: e.target.value }))} placeholder="cth: 08xx-xxxx-xxxx" className="input-field text-sm py-2" />
                </div>
              </div>
              <div className="space-y-3 rounded-xl bg-overlay-70 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Ditujukan</h4>
                <div>
                  <label htmlFor="f-nama-depo" className="block text-xs font-medium text-gray-500 mb-1">Nama Depo <span className="text-red-500">*</span>{!!editingId && !hasPermission('depot.move') && (<span className="ml-1 font-normal normal-case text-gray-400">(terkunci — butuh izin Pindah Depo)</span>)}</label>
                  <NamaDepoInput value={createForm.nama_depo ?? ''} depoList={depoList} onChange={handleNamaDepoChange} onClear={clearNamaDepo} disabled={!!editingId && !hasPermission('depot.move')} />
                </div>
                <div>
                  <label htmlFor="f-kode-depo" className="block text-xs font-medium text-gray-500 mb-1">Kode Depo</label>
                  <input id="f-kode-depo" type="text" value={createForm.kode_depo ?? ''} disabled className="input-field text-sm py-2 uppercase" placeholder="Otomatis terisi" />
                </div>
                <div>
                  <label htmlFor="f-dest-name" className="block text-xs font-medium text-gray-500 mb-1">Ditujukan <span className="text-red-500">*</span></label>
                  <input id="f-dest-name" type="text" value={createForm.destination_name ?? createForm.nama_depo ?? ''} disabled placeholder="Otomatis dari Nama Depo" className="input-field cursor-not-allowed bg-gray-100 text-sm py-2 text-gray-600" />
                </div>
                <div>
                  <label htmlFor="f-dest-addr" className="block text-xs font-medium text-gray-500 mb-1">Alamat Tujuan</label>
                  <textarea id="f-dest-addr" value={createForm.destination_address ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, destination_address: e.target.value }))} placeholder="cth: Jl. Karang Intan No.1, Singkawang" rows={2} className="input-field resize-none text-sm py-2" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Terisi otomatis dari depo tujuan — boleh diubah manual</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Alamat lengkap tujuan (akan tampil di Detail & PDF di bawah Singkawang)</p>
                </div>
              </div>
            </div>
          </div>
          )}

          {currentStep === 4 && (
          <div className="animate-fade-in space-y-4">
            {/* Header card - lebih premium */}
            <div className="rounded-2xl border border-amber-200/50 bg-amber-50 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow shrink-0">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">Daftar Barang</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Kelola produk NPN • auto hitung umur & kubikasi</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border ${sectionComplete.barang ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm' : 'bg-surface-card text-amber-700 border-amber-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sectionComplete.barang ? 'bg-surface-card' : 'bg-amber-500'}`} />{sectionComplete.barang ? `${itemCount} barang siap` : 'Belum ada barang'}
                      </span>
                      {sectionComplete.barang && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-ink-900 text-white px-2.5 py-1 text-xs font-bold">{totalQty} Qty</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 text-white px-2.5 py-1 text-xs font-bold">{totalKubikasiDisplay.toFixed(2)} m³</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border shadow-sm ${sectionComplete.barang ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-surface-card text-gray-400 border-gray-300'}`}>
                  {sectionComplete.barang ? '✓ Lengkap' : '• Belum'}
                </span>
              </div>
            </div>

            {!isMainFormValid ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-3 3h6M12 3v3m0 12.75h.008v.008H12v-.008z" /></svg></div>
                <div className="text-xs leading-relaxed text-amber-800"><b>Lengkapi dulu</b> Informasi Dokumen, Kendaraan & Alamat — baru kelola barang. Progress {completedCount}/5.</div>
              </div>
            ) : itemCount === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-overlay-50 p-8 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-card border border-gray-100 shadow-sm flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                </div>
                <h4 className="text-sm font-bold text-gray-800">Belum ada barang</h4>
                <p className="text-xs text-gray-500 mt-1">Tambah manual atau import Excel — minimal 1 barang dengan jumlah &gt;0</p>
                <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
                  <button onClick={() => setShowBarangModal(true)} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-black shadow-lg">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Barang
                  </button>
                  {hasPermission('rencana_kirim.import') && (
                  <button onClick={() => { setShowBarangModal(true); setTimeout(()=>{ setShowImport(true); }, 150); }} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface-card border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-surface-raised">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Import Excel
                  </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-300 bg-surface-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-surface-raised border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Ringkasan barang</span>
                  <button onClick={() => setShowBarangModal(true)} className="text-xs font-semibold text-accent-text hover:text-accent-text flex items-center gap-1">
                    Kelola <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>
                <div className="divide-y divide-gray-100 max-h-52 overflow-auto">
                  {createItems.filter(i=>i.kode_barang).map((it, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-raised">
                      <span className="w-6 h-6 rounded-lg bg-ink-900 text-white text-xs font-bold flex items-center justify-center shrink-0">{idx+1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{it.nama_barang}</p>
                        <p className="text-xs font-mono text-gray-400">{it.kode_barang} • {it.umur != null ? `${it.umur} bln` : '-'}</p>
                      </div>
                      <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{it.jumlah} <span className="text-xs font-normal text-gray-500">{it.satuan}</span></span>
                      <span className="text-xs font-mono font-semibold text-teal-600 whitespace-nowrap">{itemKubikasi(it).toFixed(2)} m³</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-ink-900 text-white">
                  <span className="text-xs font-medium text-ink-fg-muted">Total {itemCount} barang</span>
                  <span className="text-sm font-bold">{totalQty} Qty • {totalKubikasiDisplay.toFixed(2)} m³</span>
                </div>
              </div>
            )}

          </div>
          )}

          {currentStep === 5 && (
          <div className="bg-surface-card border border-gray-300 rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">5</span> Catatan</h3>
            <textarea id="f-notes" aria-label="Catatan tambahan" value={createForm.notes ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Catatan tambahan untuk pengiriman ini..." rows={3} className="input-field text-sm py-2 w-full resize-none" />
          </div>
          )}

          {/* Wizard Navigation — setelah Barang (4) tidak ada Selanjutnya, langsung Simpan */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
              disabled={currentStep === 1}
              className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Sebelumnya
            </button>
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 1 && !sectionComplete.dokumen) { notifyGlobal('Lengkapi PO Transporter & Tanggal RKH dulu', 'error'); return; }
                  if (currentStep === 2 && !sectionComplete.kendaraan) { notifyGlobal('Lengkapi Nama Driver, Nopol, Expedisi & Jenis Kendaraan dulu', 'error'); return; }
                  if (currentStep === 3 && !sectionComplete.pengirim) { notifyGlobal('Lengkapi Asal Pengirim & Nama Depo dulu', 'error'); return; }
                  setCurrentStep(s => Math.min(5, s + 1));
                }}
                className="btn-primary text-sm"
              >
                Selanjutnya →
              </button>
            ) : currentStep === 4 ? (
              <span className="text-xs text-gray-400">Isi barang lalu Simpan</span>
            ) : (
              <span className="text-xs text-emerald-600 font-semibold">Siap simpan ✓</span>
            )}
          </div>
        </div>
      </Modal>

      {/* Daftar Barang Popup — kelola setelah informasi dokumen/kendaraan/alamat lengkap */}
      <Modal
        open={showBarangModal}
        onClose={() => setShowBarangModal(false)}
        title="Kelola Daftar Barang"
        subtitle={`${itemCount} barang • ${totalQty} qty • ${totalKubikasiDisplay.toFixed(2)} m³`}
        size="2xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-gray-500">
              {duplicateCount > 0
                ? `${duplicateCount} baris duplikat — gabungkan atau hapus dulu`
                : sectionComplete.barang
                  ? 'Barang siap disimpan'
                  : 'Isi minimal 1 barang dengan jumlah >0'}
            </span>
            <button onClick={() => setShowBarangModal(false)} className="btn-primary">Selesai</button>
          </div>
        }
      >
        <div className="space-y-4">
          {duplicateCount > 0 && (
            <div role="alert" className="flex gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="text-xs leading-relaxed text-red-800">
                <b>{duplicateCount} nama barang terduplikasi.</b> Satu produk hanya boleh muncul sekali per rencana —
                gabungkan jumlahnya ke baris pertama, atau hapus baris yang tidak dipakai. Rencana tidak bisa disimpan selama duplikat ada.
              </div>
            </div>
          )}

          <div className="space-y-3">
            {createItems.map((item, index) => {
              const isDuplicate = duplicateIndexes.has(index);
              const duplicateOf = isDuplicate
                ? firstIndexOfCode(createItems, item.kode_barang)
                : -1;
              const needsAttention = typingItems.has(index) || (item.nama_barang.trim().length > 0 && !item.kode_barang) || isDuplicate;
              const rowKubikasi = itemKubikasi(item);
              return (
              <div key={index} className={`group relative rounded-2xl border bg-surface-card p-5 shadow-sm transition-all ${needsAttention ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100 hover:border-slate-300 hover:shadow-md'}`}>
                <div className="flex items-start gap-3">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${needsAttention ? 'bg-amber-500 text-white' : 'bg-surface-card border border-slate-300 text-slate-700 shadow-sm'}`}>{item.item_number}</span>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <label htmlFor={`item-nama-${index}`} className="block text-xs font-semibold text-slate-600 mb-1.5">Nama Barang <span className="text-red-500">*</span></label>
                      <NpnSearchInput
                        inputId={`item-nama-${index}`}
                        namaValue={item.nama_barang}
                        onSelect={(p) => handleNamaBarangSelect(index, p)}
                        onClear={() => handleClearItem(index)}
                        onTypingChange={(v) => markTyping(index, v)}
                        takenCodes={takenCodesByIndex.get(index) ?? EMPTY_CODES}
                      />
                      {item.kode_barang ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink-900 text-white px-2.5 py-1 text-xs font-mono font-bold">{item.kode_barang}</span>
                          <span title="Umur diambil dari master Standar Umur Produk" className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${item.umur != null ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{item.umur != null ? `${item.umur} bulan` : 'Umur belum diset'}</span>
                          <span className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 text-xs font-bold">{rowKubikasi > 0 ? `${rowKubikasi.toFixed(2)} m³` : '0 m³'}</span>
                          {isDuplicate && (
                            <span role="alert" className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 border border-red-300 px-2.5 py-1 text-xs font-bold">
                              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                              </svg>
                              Duplikat dari baris #{duplicateOf + 1} — gabungkan ke sana
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-slate-500">Ketik nama barang lalu pilih dari NPN</p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 sm:col-span-1">
                        <label htmlFor={`item-jumlah-${index}`} className="block text-xs font-semibold text-slate-600 mb-1">Jumlah <span className="text-red-500">*</span></label>
                        <input id={`item-jumlah-${index}`} type="number" value={item.jumlah || ''} onChange={(e) => updateItem(index, 'jumlah', parseFloat(e.target.value) || 0)} placeholder="0" min="0" className="w-full px-3 py-2.5 text-center text-base font-black text-slate-900 bg-surface-card border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm" />
                      </div>
                      <div>
                        <label htmlFor={`item-satuan-${index}`} className="block text-xs font-semibold text-slate-600 mb-1">Satuan</label>
                        <select id={`item-satuan-${index}`} value={item.satuan} onChange={(e) => updateItem(index, 'satuan', e.target.value)} className="w-full px-3 py-2.5 text-sm font-bold bg-surface-card border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 text-center">
                          <option value="CRT">CRT</option><option value="PCS">PCS</option><option value="DUS">DUS</option><option value="BOX">BOX</option><option value="KG">KG</option><option value="LUSIN">LUSIN</option><option value="ZAK">ZAK</option>
                        </select>
                      </div>
                      <div className="hidden sm:block">
                        <label htmlFor={`item-ket-${index}`} className="block text-xs font-semibold text-slate-600 mb-1">Keterangan</label>
                        <input id={`item-ket-${index}`} type="text" value={item.keterangan} onChange={(e) => updateItem(index, 'keterangan', e.target.value)} placeholder="Opsional" className="w-full px-3 py-2.5 text-sm bg-surface-card border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500" />
                      </div>
                    </div>
                    <div className="sm:hidden">
                      <input type="text" aria-label="Keterangan barang (opsional)" value={item.keterangan} onChange={(e) => updateItem(index, 'keterangan', e.target.value)} placeholder="Keterangan (opsional)" className="w-full px-3 py-2 text-sm bg-surface-raised border border-slate-300 rounded-xl focus:bg-surface-card focus:ring-2 focus:ring-primary-500" />
                    </div>
                  </div>
                  <button onClick={() => removeItem(index)} disabled={createItems.length <= 1} aria-label={`Hapus barang ${item.item_number}`} className="w-8 h-8 rounded-xl bg-surface-card border border-slate-300 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-30 shrink-0 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              );
            })}
            <button onClick={addItem} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-slate-300 bg-surface-card text-sm font-bold text-slate-600 hover:border-primary-300 hover:bg-chip-primary hover:text-accent-text transition-colors">
              <span className="w-7 h-7 rounded-xl bg-ink-900 text-white flex items-center justify-center"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></span>
              Tambah barang lagi
            </button>
            <div className="flex items-center justify-between rounded-2xl bg-ink-900 text-white px-4 py-3">
              <span className="text-xs font-bold tracking-widest text-ink-fg-muted uppercase">Total • {itemCount} barang</span>
              <span className="text-sm font-black">{totalQty} Qty • {totalKubikasiDisplay.toFixed(2)} m³</span>
            </div>
            {createItems.some(i => i.kode_barang && i.umur == null) && (
              <p className="px-1 text-[11px] leading-relaxed text-gray-400">Umur produk diambil dari master Standar Umur Produk dan dipakai untuk pemeriksaan sisa umur di Validasi SJ. Produk tanpa umur tidak dapat diperiksa sisa umurnya — hubungi administrator untuk melengkapi master.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Import Barang Modal */}
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportResult(null); setSelectedFile(null); }} title="Import Barang" subtitle="Upload file Excel untuk import daftar barang" size="md"
        footer={
          <>
            <button onClick={() => { setShowImport(false); setImportResult(null); setSelectedFile(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleImportItems} disabled={!selectedFile || importing} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
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
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-gray-700">File Excel</label>
            <button onClick={handleItemTemplate} className="text-xs text-accent-text hover:text-accent-text font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-chip-primary transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Download Template
            </button>
          </div>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${selectedFile ? 'border-amber-300 bg-amber-50/30' : 'border-gray-300 hover:border-amber-300 hover:bg-surface-raised'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">Klik untuk ganti file</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Klik untuk pilih file</p>
                  <p className="text-xs text-gray-400 mt-1">Mendukung .xlsx, .xls, .csv (maks 10MB)</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400">Format: 1 baris = 1 barang. Kolom: Kode Barang, Nama Barang, Jumlah, Satuan, Keterangan. Barang akan dicocokkan dengan data NPN.</p>

          {importResult && (
            <div className={`p-4 rounded-xl animate-fade-in ${importResult.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${importResult.ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {importResult.ok ? (
                    <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${importResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>{importResult.message}</p>
                  {importResult.matched !== undefined && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="badge badge-success">Cocok: {importResult.matched} barang</span>
                      <span className="badge badge-info">Total: {importResult.total_rows} baris</span>
                      <span className="badge badge-warning">Skip: {importResult.skipped}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)} onConfirm={() => { setConfirmCloseOpen(false); resetCreateForm(); }} title="Buang perubahan?" message="Ada isian yang belum disimpan. Tutup form dan buang semua perubahan?" confirmLabel="Buang & Tutup" cancelLabel="Lanjut Mengisi" variant="warning" />
      <ConfirmDialog open={showDeleteConfirm} onClose={() => { if (deleting) return; setShowDeleteConfirm(false); setDeleteTargetId(null); }} onConfirm={confirmDelete} title="Hapus Replenishment" message="Apakah Anda yakin ingin menghapus rencana kirim ini?" confirmLabel="Hapus" variant="danger" loading={deleting} />
    </DashboardLayout>
  );
}
