'use client';

import { useEffect, useMemo, useState, useRef, useCallback, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import { rencanaKirim, depo, depotSettings, getErrorMessage, reports } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { type RencanaKirimData } from '@/lib/suratJalanPdf';
import SearchInput from '@/components/SearchInput';
import DmyDateInput from '@/components/DmyDateInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Calendar from '@/components/Calendar';
import { downloadSuratJalan, previewSuratJalan } from '@/lib/suratJalanPdf';
import { findDuplicateIndexes, takenCodesExcept } from '@/lib/itemDuplicates';
import { type NpnProduct } from '@/components/NpnSearchInput';
import { useAuthStore } from '@/store/auth';
import dynamic from 'next/dynamic';

const DynRencanaKirimCreateModal = dynamic(() => import('./RencanaKirimCreateModal'));
const DynRencanaKirimBarangModal = dynamic(() => import('./RencanaKirimBarangModal'));
const DynRencanaKirimImportModal = dynamic(() => import('./RencanaKirimImportModal'));
const DynRencanaKirimSavePreviewModal = dynamic(() => import('./RencanaKirimSavePreviewModal'));
const DynRencanaKirimDuplicatePoModal = dynamic(() => import('./RencanaKirimDuplicatePoModal'));

import type { DepoOption, RencanaKirim, RencanaKirimCreator, RencanaKirimItem } from './RencanaKirimCreateModal';

/** Statistik global rencana kirim dari endpoint /rencana-kirim/stats. */
interface RkStats {
  total: number;
  todayCount: number;
  scheduled: number;
  completed: number;
  calendar: { date: string | null; count: number; breakdown: Record<string, number> }[];
  calendarEta: { date: string | null; count: number; breakdown: Record<string, number> }[];
}

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
  DRAFT: { label: 'Draft', color: 'text-foreground', bg: 'bg-card', dot: 'bg-muted-foreground', border: 'border-border' },
  SCHEDULED: { label: 'Dijadwalkan', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500', border: 'border-blue-100' },
  CHECKED_IN: { label: 'Check In', color: 'text-yellow-700', bg: 'bg-yellow-50', dot: 'bg-yellow-500', border: 'border-yellow-100' },
  VERIFIED: { label: 'Terverifikasi', color: 'text-purple-700', bg: 'bg-purple-50', dot: 'bg-purple-500', border: 'border-purple-100' },
  IN_PROGRESS: { label: 'Diproses', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500', border: 'border-orange-100' },
  COMPLETED: { label: 'Selesai', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-100' },
  CANCELLED: { label: 'Dibatalkan', color: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500', border: 'border-red-100' },
};

const emptyForm: Partial<RencanaKirim> = {
  rkh_date: '', eta_date: '', po_transporter: '',
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
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-0.5"
          title="Kosongkan depo"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {showDropdown && filtered.length > 0 && (
        <ul id={`${listboxId}-listbox`} role="listbox" aria-label="Daftar depo" className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-auto">
          {filtered.map((d, i) => (
            <li key={d.kode_depo} role="option" id={`${listboxId}-option-${i}`} aria-selected={i === activeIndex}>
            <button
              type="button"
              onClick={() => handleSelectIndex(i)}
              className={`w-full px-3 py-2.5 text-left transition-colors border-b border-border last:border-0 ${
                i === activeIndex
                  ? 'bg-row-active text-row-active-text'
                  : 'hover:bg-muted text-foreground'
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

const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Konversi string tanggal ISO dari API (UTC, mis. `2026-11-30T17:00:00.000000Z`) ke tanggal lokal `Y-m-d`. */
const toLocalYmd = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.split('T')[0] : toYmd(d);
};

const addDaysYmd = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
};

/** Preset tanggal kirim -> param date_from/date_to yang sudah didukung backend. */
const dateRangeFor = (preset: string, from: string, to: string): { from?: string; to?: string } => {
  const today = toYmd(new Date());
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'tomorrow': return { from: addDaysYmd(today, 1), to: addDaysYmd(today, 1) };
    case 'next7': return { from: today, to: addDaysYmd(today, 7) };
    case 'custom': return { from: from || undefined, to: to || undefined };
    default: return {};
  }
};

/** Label grup tanggal kirim di tabel. */
const kirimGroupLabel = (ymd: string): string => {
  if (!ymd || ymd === '-') return 'Kirim: tanpa tanggal';
  const today = toYmd(new Date());
  const label = new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  if (ymd === today) return `Kirim: Hari ini, ${label}`;
  if (ymd === addDaysYmd(today, 1)) return `Kirim: Besok, ${label}`;
  return `Kirim: ${label}`;
};

export default function RencanaKirimPage() {
  const [items, setItems] = useState<RencanaKirim[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [viewItem, setViewItem] = useState<RencanaKirim | null>(null);
  const [excelExporting, setExcelExporting] = useState(false);
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
  // Dokumen lama yang bentrok PO-nya — dipakai popup konfirmasi saat Simpan.
  const [duplicatePo, setDuplicatePo] = useState<RencanaKirim | null>(null);
  const [showDuplicatePoConfirm, setShowDuplicatePoConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  // Simpan harus lewat matriks verifikasi: klik "Simpan" TIDAK langsung
  // menulis — tampil pratinjau dokumen + barang; baru setelah eksplisit
  // "sudah benar" data dikirim. Jika tidak, salah input barang langsung
  // mengalir ke bongkar/penerimaan tanpa sempat diperhatikan.
  const [showSavePreview, setShowSavePreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  // Filter tanggal KIRIM (rkh_date) — backend sudah menerima date_from/date_to.
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [calendarBasis, setCalendarBasis] = useState<'rkh' | 'eta'>('rkh');
  const router = useRouter();
  const searchParams = useSearchParams();
  const etaParam = searchParams.get('eta');
  const statusParam = searchParams.get('status');
  const [etaFilter, setEtaFilter] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Statistik global dari server (bukan hitungan halaman aktif).
  const [rkStats, setRkStats] = useState<RkStats | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<string>('');
  const [depoList, setDepoList] = useState<DepoOption[]>([]);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    message: string;
    ok?: boolean;
    total_rows?: number;
    matched?: number;
    skipped?: number;
    errors?: Array<{ row: number; message: string }>;
  } | null>(null);
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
      const range = dateRangeFor(filterDate, dateFrom, dateTo);
      if (range.from) filterParams.date_from = range.from;
      if (range.to) filterParams.date_to = range.to;
      if (etaFilter === 'overdue') {
        filterParams.eta_overdue = 1;
      } else if (etaFilter) {
        const etaDay = etaFilter === 'tomorrow'
          ? addDaysYmd(toYmd(new Date()), 1)
          : toYmd(new Date());
        filterParams.eta_from = etaDay;
        filterParams.eta_to = etaDay;
      }
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
  }, [search, page, filterStatus, filterKodeDepo, filterDate, dateFrom, dateTo, etaFilter]);

  useEffect(() => {
    setEtaFilter(
      etaParam === 'today' || etaParam === 'tomorrow' || etaParam === 'overdue'
        ? etaParam
        : '',
    );
    const allowed = ['DRAFT', 'SCHEDULED', 'CHECKED_IN', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (statusParam && allowed.includes(statusParam)) setFilterStatus(statusParam);
    setPage(1);
  }, [etaParam, statusParam]);

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
        calendarEta: Array.isArray(res.data.calendar_eta) ? res.data.calendar_eta : [],
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
  // Satu event per status agar warna titik kalender membedakan "rencana"
  // dari "sudah receiving". Backend sudah mengirim breakdown per tanggal.
  const calendarEvents = (calendarBasis === 'eta' ? (rkStats?.calendarEta ?? []) : (rkStats?.calendar ?? [])).flatMap(entry =>
    Object.entries(entry.breakdown ?? {}).map(([status, count]) => ({
      date: entry.date ?? '',
      count: Number(count) || 0,
      status,
    })),
  );

  const todayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayCount = rkStats?.todayCount ?? 0;
  const scheduledCount = rkStats?.scheduled ?? 0;
  const completedCountList = rkStats?.completed ?? 0;

  // Cek PO duplikat (debounced) — backend yang memutus, frontend memberi
  // peringatan awal sekaligus menyiapkan data dokumen lama untuk popup Simpan.
  const findDuplicatePo = useCallback(async (): Promise<RencanaKirim | null> => {
    const po = createForm.po_transporter?.trim().toUpperCase() ?? '';
    if (!po) {
      return null;
    }
    try {
      const res = await rencanaKirim.list({
        po_transporter: po,
        kode_depo: createForm.kode_depo || undefined,
        per_page: 5,
      });
      const rows: RencanaKirim[] = res.data.data ?? [];
      return rows.find(row => row.id !== editingId) ?? null;
    } catch {
      return null; // gagal cek → biarkan backend yang memutus saat simpan
    }
  }, [createForm.po_transporter, createForm.kode_depo, editingId]);

  useEffect(() => {
    if (!showCreate) {
      setPoDuplicate(false);
      setDuplicatePo(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await findDuplicatePo();
      if (cancelled) return;
      setDuplicatePo(found);
      setPoDuplicate(found !== null);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showCreate, findDuplicatePo]);

  /**
   * Tombol Simpan selalu aktif. Kalau PO sudah dipakai, popup konfirmasi
   * menampilkan dokumen lama — simpan tetap diblokir sesuai aturan backend.
   */
  const requestSavePreview = async () => {
    if (editingId) {
      setShowSavePreview(true);
      return;
    }
    const found = await findDuplicatePo();
    setDuplicatePo(found);
    setPoDuplicate(found !== null);
    if (found) {
      setShowDuplicatePoConfirm(true);
      return;
    }
    setShowSavePreview(true);
  };

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
    // Klik kalender sekarang memfilter daftar ke tanggal itu (boleh lampau),
    // bukan langsung membuka form. Tombol terpisah dipakai untuk membuat.
    setSelectedDate(date);
    setFilterDate('custom');
    setDateFrom(date);
    setDateTo(date);
    setPage(1);
  };

  const handleDownloadExcel = async () => {
    if (!viewItem) return;
    setExcelExporting(true);
    try {
      const res = await reports.rencanaKirimDetailExport(viewItem.id);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const safePo = String(viewItem.po_transporter).replace(/[^A-Za-z0-9_-]/g, '_') || 'rencana-kirim';
      const filename = `rencana-kirim-detail-${safePo}-${stamp}.xlsx`;
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal generate Excel.'), 'error');
    } finally {
      setExcelExporting(false);
    }
  };

  const handleEdit = (item: RencanaKirim) => {
    setEditingId(item.id);
    setEditingStatus(item.status ?? '');
    setSelectedDate(toLocalYmd(item.rkh_date));
    setTypingItems(new Set());
    setCurrentStep(1);
    const editForm = {
      rkh_date: toLocalYmd(item.rkh_date), eta_date: toLocalYmd(item.eta_date), po_transporter: item.po_transporter ?? '',
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
    setDuplicatePo(null);
    setShowDuplicatePoConfirm(false);
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
    // Backend memakai `min:1` untuk setiap items.*.jumlah. Filter lama hanya
    // menolak <= 0 sehingga nilai pecahan (mis. 0.5 dari import Excel) lolos
    // dan memicu 422 "items.N.jumlah must be at least 1" saat simpan.
    const validItems = createItems.filter(item => item.kode_barang && Number(item.jumlah) >= 1);
    const invalidQtyItem = createItems.some(item => item.kode_barang && !(Number(item.jumlah) >= 1));

    if (typingItem) {
      notifyGlobal('Barang belum dipilih dari hasil pencarian NPN. Pilih produk dari daftar sebelum menyimpan.', 'error');
      return;
    }

    if (incompleteItem || validItems.length === 0 || invalidQtyItem) {
      notifyGlobal(invalidQtyItem
        ? 'Jumlah setiap barang harus minimal 1. Periksa kembali qty yang diinput.'
        : 'Maaf, nama barang dengan kode produk yang dicari tidak ditemukan. Silakan hubungi administrator untuk menambahkan barang yang diinput.', 'error');
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
    dokumen: !!(createForm.po_transporter?.trim() && createForm.rkh_date && createForm.eta_date),
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
  // Nama pembuat dokumen. `created_by` sudah tersimpan sejak awal; tampilkan
  // agar user bisa menelusuri siapa yang membuat rencana kirim (mis. PO tes).
  const creatorName = (creator?: RencanaKirimCreator | null): string => {
    const name = creator?.full_name?.trim();
    if (name) return name;
    return creator?.email?.trim() || 'Tidak tercatat';
  };
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
        <div className={`grid grid-cols-1 gap-6 transition-all duration-300 ${calendarOpen ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
          {/* Calendar */}
          {calendarOpen && (
          <div className="lg:col-span-1">
            <Calendar
              events={calendarEvents}
              onDateClick={handleDateClick}
              selectedDate={selectedDate}
            />
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                onClick={() => setCalendarBasis('rkh')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${calendarBasis === 'rkh' ? 'bg-primary-600 text-white' : 'bg-popover text-muted-foreground hover:text-foreground'}`}
              >
                Rencana Kirim
              </button>
              <button
                onClick={() => setCalendarBasis('eta')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${calendarBasis === 'eta' ? 'bg-info text-background' : 'bg-popover text-muted-foreground hover:text-foreground'}`}
              >
                Rencana Tiba
              </button>
            </div>
            {selectedDate && hasPermission('rencana_kirim.create') && (
              <button
                onClick={() => openCreate(selectedDate >= todayDateStr() ? selectedDate : todayDateStr())}
                className="btn-secondary mt-3 w-full text-xs"
              >
                Buat rencana untuk {selectedDate}
              </button>
            )}
            <button onClick={() => setCalendarOpen(false)} className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-popover">
              Tutup kalender
            </button>
          </div>
          )}

          {/* Table */}
          <div className={calendarOpen ? 'lg:col-span-2' : 'lg:col-span-1'}>
            {etaFilter && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-2.5 text-sm text-foreground">
                <span>
                  {etaFilter === 'overdue'
                    ? <>Menampilkan <strong className="text-destructive">ETA terlewat & belum check-in</strong></>
                    : <>Menampilkan rencana tiba <strong className="text-info">{etaFilter === 'today' ? 'hari ini' : 'besok'}</strong></>}
                </span>
                <button onClick={() => { setEtaFilter(''); router.replace('/rencana-kirim'); }} className="ml-auto text-xs font-bold text-info hover:underline">Hapus filter</button>
              </div>
            )}
            {/* Table Card */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <div className="flex flex-col gap-4">
                  {/* Baris judul + aksi utama */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-chip-primary flex items-center justify-center">
                        <svg className="w-5 h-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-foreground">Daftar Rencana Pengiriman</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">Pantau jadwal, kendaraan, tujuan, dan status pengiriman</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setCalendarOpen((open) => !open)}
                      aria-label={calendarOpen ? 'Sembunyikan kalender' : 'Tampilkan kalender'}
                      aria-expanded={calendarOpen}
                      className="btn-secondary text-sm px-3 py-2"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d={calendarOpen ? 'M15.75 19.5L8.25 12l7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} /></svg>
                        {calendarOpen ? 'Tutup Kalender' : 'Buka Kalender'}
                      </span>
                    </button>
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
                      <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari PO Transporter/tanggal kirim/driver..." resultCount={items.length} totalCount={rkStats?.total} currentFrom={items.length > 0 ? (page - 1) * 20 + 1 : 0} currentTo={(page - 1) * 20 + items.length} resultLabel="rencana" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <select
                          aria-label="Filter status"
                          value={filterStatus ?? ''}
                          onChange={(e) => { setFilterStatus(e.target.value || null); setPage(1); }}
                          className="appearance-none py-2 pl-3 pr-9 border border-border rounded-xl bg-card text-foreground text-sm leading-tight shadow-sm cursor-pointer focus:outline-none focus:ring-primary-500 focus:border-primary-500 min-w-[140px]"
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
                        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                      </div>
                      <div className="relative">
                        <select
                          aria-label="Filter tanggal kirim"
                          value={filterDate}
                          onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
                          className="appearance-none py-2 pl-3 pr-9 border border-border rounded-xl bg-card text-foreground text-sm leading-tight shadow-sm cursor-pointer focus:outline-none focus:ring-primary-500 focus:border-primary-500 min-w-[150px]"
                        >
                          <option value="">Semua tanggal</option>
                          <option value="today">Hari ini</option>
                          <option value="tomorrow">Besok</option>
                          <option value="next7">7 hari ke depan</option>
                          <option value="custom">Rentang tanggal…</option>
                        </select>
                        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                      </div>
                      {filterDate === 'custom' && (
                        <div className="flex items-center gap-2">
                          <DmyDateInput id="rkh-date-from" ariaLabel="Dari tanggal kirim" value={dateFrom} onChange={(iso) => { setDateFrom(iso); setPage(1); }} className="input-field text-sm py-2" />
                          <span className="text-xs text-muted-foreground">s/d</span>
                          <DmyDateInput id="rkh-date-to" ariaLabel="Sampai tanggal kirim" value={dateTo} onChange={(iso) => { setDateTo(iso); setPage(1); }} className="input-field text-sm py-2" />
                        </div>
                      )}
                      <div className="relative">
                        <select
                          aria-label="Filter depo"
                          value={filterKodeDepo ?? ''}
                          onChange={(e) => { setFilterKodeDepo(e.target.value || null); setPage(1); }}
                          className="appearance-none py-2 pl-3 pr-9 border border-border rounded-xl bg-card text-foreground text-sm leading-tight shadow-sm cursor-pointer focus:outline-none focus:ring-primary-500 focus:border-primary-500 min-w-[160px]"
                        >
                          <option value="">Semua Depo</option>
                          {depoList.map((d) => (
                            <option key={d.kode_depo} value={d.kode_depo}>
                              {d.nama_depo} ({d.kode_depo})
                            </option>
                          ))}
                        </select>
                        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

          <div className="overflow-x-auto overflow-y-auto hidden lg:block max-h-[560px]">
            <table className="w-full min-w-[980px] border-collapse">
              <caption className="sr-only">Daftar rencana pengiriman</caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-popover border-b border-border shadow-sm">
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">No</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Dibuat</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">PO Transporter</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap" title="RKH = tanggal barang direncanakan berangkat.">Tgl Rencana Kirim</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-info uppercase tracking-wider whitespace-nowrap" title="Kapan barang diharapkan tiba di depo tujuan.">Rencana Tiba</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Driver</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Nopol</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Expedisi</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Jenis Kendaraan</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Tujuan</th>
                  <th scope="col" className="px-5 py-3 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Total Qty</th>
                  <th scope="col" className="px-5 py-3 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Kubikasi (m³)</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th scope="col" className="px-5 py-3 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && items.length === 0 && (
                  <>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <tr key={`skel-rk-${i}`} className="animate-pulse">
                        {Array.from({ length: 14 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5"><div className="h-4 w-24 rounded bg-muted" /></td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}
                {items.map((item, index) => {
                  const groupKey = toLocalYmd(item.rkh_date) || '-';
                  const previousKey = toLocalYmd(items[index - 1]?.rkh_date) || '-';
                  const showGroup = index === 0 || groupKey !== previousKey;
                  const groupCount = items.filter((it) => (toLocalYmd(it.rkh_date) || '-') === groupKey).length;
                  return (
                    <Fragment key={item.id}>
                      {showGroup && (
                        <tr>
                          <td colSpan={14} className="bg-chip-primary/40 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-accent-text">
                            {kirimGroupLabel(groupKey)} · {groupCount} PO
                          </td>
                        </tr>
                      )}
                      <tr className="group hover:bg-overlay-70 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{(page - 1) * 20 + index + 1}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">
                      <span className="block font-mono">{item.created_at?.split('T')[0] || '-'}</span>
                      <span className="block text-xs text-muted-foreground" title={`Dibuat oleh ${creatorName(item.creator)}`}>{creatorName(item.creator)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-foreground font-medium whitespace-nowrap"><span className="font-mono">{fmt(item.po_transporter)}</span></td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap"><span className="font-mono">{fmt(toLocalYmd(item.rkh_date))}</span></td>
                    <td className="px-5 py-3.5 text-sm whitespace-nowrap"><span className="inline-flex items-center gap-1 font-mono font-semibold text-info">{item.eta_date ? fmt(toLocalYmd(item.eta_date)) : '-'}</span></td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">{fmt(item.driver_name)}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap"><span className="font-mono">{fmt(item.nopol)}</span></td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">{fmt(item.expedisi)}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">{item.jenis_kendaraan ? <span className="inline-flex rounded-md bg-info/10 border border-info/30 px-2 py-0.5 text-xs font-semibold text-info">{item.jenis_kendaraan}</span> : '-'}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">{fmt(item.destination_name)}</td>
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center min-w-[2.5rem] rounded-lg bg-muted px-2.5 py-1 text-sm font-bold text-foreground">{item.total_qty}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {typeof item.total_kubikasi === 'number' && item.total_kubikasi > 0
                        ? <span className="inline-flex items-center justify-center rounded-lg bg-info/10 px-2.5 py-1 text-sm font-bold text-info">{Number(item.total_kubikasi).toFixed(2)}</span>
                        : (item.items_tanpa_npn ?? 0) > 0
                          ? <span className="inline-flex items-center gap-1 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-bold text-warning" title={`${item.items_tanpa_npn} item belum terhubung ke master NPN`}>NPN belum terhubung</span>
                          : <span className="text-sm text-muted-foreground">0.00</span>}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm ${statusConfig[item.status]?.bg || 'bg-card'} ${statusConfig[item.status]?.color || 'text-foreground'} ${statusConfig[item.status]?.border || 'border-border'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[item.status]?.dot || 'bg-muted-foreground'}`} />
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-background bg-info hover:opacity-90 disabled:opacity-50 disabled:cursor-wait shadow-sm shadow-blue-600/25 rounded-lg transition-colors min-h-9"
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-wait border border-destructive/30 rounded-lg transition-colors min-h-9"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            Batalkan
                          </button>
                        )}
                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 ml-1 shadow-sm">
                          <button onClick={() => setViewItem(item)} aria-label={`Lihat detail rencana kirim ${item.po_transporter || ''}`} className="p-1.5 text-muted-foreground hover:text-info hover:bg-info/10 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                          {hasPermission('rencana_kirim.edit') && ['DRAFT', 'SCHEDULED'].includes(item.status) && (
                            <button onClick={() => handleEdit(item)} aria-label={`Edit rencana kirim ${item.po_transporter || ''}`} className="p-1.5 text-muted-foreground hover:text-warning hover:bg-warning/10 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </button>
                          )}
                          {hasPermission('rencana_kirim.delete') && ['DRAFT', 'CANCELLED'].includes(item.status) && (
                            <button onClick={() => handleDelete(item.id)} disabled={deleting} aria-label={`Hapus rencana kirim ${item.po_transporter || ''}`} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                      </tr>
                    </Fragment>
                  );
                })}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-5 py-16 text-center">
                      <div role="status" className="flex flex-col items-center gap-2">
                        <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                          <svg className="h-7 w-7 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        </div>
                        {search.trim() ? (
                          <>
                            <p className="text-sm font-medium text-foreground">Tidak ada hasil untuk &quot;{search}&quot;</p>
                            <button onClick={() => { setSearch(''); setPage(1); }} className="text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-foreground">Belum ada data rencana kirim.</p>
                            <p className="text-xs text-muted-foreground">Buat rencana baru atau klik tanggal di kalender untuk mulai mengisi form.</p>
                          </>
                        )}
                        {!search.trim() && hasPermission('rencana_kirim.create') && (
                          <button onClick={() => openCreate()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-[0.98]">
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
          <div className="lg:hidden divide-y divide-border max-h-[560px] overflow-y-auto">
            {loading && items.length === 0 && (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`skel-rk-m-${i}`} className="animate-pulse p-4 space-y-3">
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-1/3 rounded bg-muted" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-3 w-full rounded bg-muted" />
                      <div className="h-3 w-full rounded bg-muted" />
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
                      <p className="font-mono text-sm font-bold text-foreground truncate">{fmt(item.po_transporter)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Kirim {toLocalYmd(item.rkh_date) || '-'} • Tiba <span className="font-semibold text-info">{toLocalYmd(item.eta_date) || '-'}</span> • Dibuat {item.created_at?.split('T')[0] || '-'} • oleh {creatorName(item.creator)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${st?.bg || 'bg-card'} ${st?.color || 'text-foreground'} ${st?.border || 'border-border'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-muted-foreground'}`} />
                      {st?.label || item.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div><span className="text-muted-foreground">Driver: </span><span className="font-medium text-foreground">{fmt(item.driver_name)}</span></div>
                    <div><span className="text-muted-foreground">Nopol: </span><span className="font-mono font-medium text-foreground">{fmt(item.nopol)}</span></div>
                    <div><span className="text-muted-foreground">Expedisi: </span><span className="font-medium text-foreground">{fmt(item.expedisi)}</span></div>
                    <div><span className="text-muted-foreground">Jenis: </span>{item.jenis_kendaraan ? <span className="inline-flex rounded-md bg-info/10 border border-info/30 px-1.5 py-0.5 text-[11px] font-semibold text-info">{item.jenis_kendaraan}</span> : '-'}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">Tujuan: </span><span className="font-medium text-foreground">{fmt(item.destination_name)}</span></div>
                    <div><span className="text-muted-foreground">Qty: </span><span className="font-bold text-foreground">{item.total_qty}</span></div>
                    <div><span className="text-muted-foreground">Kubikasi: </span>{typeof item.total_kubikasi === 'number' ? <span className="font-bold text-info">{Number(item.total_kubikasi).toFixed(2)} m³</span> : '-'}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasPermission('rencana_kirim.edit') && item.status === 'DRAFT' && (
                      <button onClick={() => handleStatusChange(item, 'SCHEDULED')} disabled={statusBusyId === item.id} aria-label={`Jadwalkan rencana kirim ${item.po_transporter || ''}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-background bg-info hover:opacity-90 disabled:opacity-50 disabled:cursor-wait rounded-lg transition-colors min-h-9">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Jadwalkan
                      </button>
                    )}
                    {hasPermission('rencana_kirim.edit') && item.status === 'SCHEDULED' && (
                      <button onClick={() => handleStatusChange(item, 'CANCELLED')} disabled={statusBusyId === item.id} aria-label={`Batalkan rencana kirim ${item.po_transporter || ''}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-wait border border-destructive/30 rounded-lg transition-colors min-h-9">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Batalkan
                      </button>
                    )}
                    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 ml-auto">
                      <button onClick={() => setViewItem(item)} aria-label={`Lihat detail rencana kirim ${item.po_transporter || ''}`} className="p-2 text-muted-foreground hover:text-info hover:bg-info/10 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                      {hasPermission('rencana_kirim.edit') && ['DRAFT', 'SCHEDULED'].includes(item.status) && (
                        <button onClick={() => handleEdit(item)} aria-label={`Edit rencana kirim ${item.po_transporter || ''}`} className="p-2 text-muted-foreground hover:text-warning hover:bg-warning/10 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center">
                          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                      )}
                      {hasPermission('rencana_kirim.delete') && ['DRAFT', 'CANCELLED'].includes(item.status) && (
                        <button onClick={() => handleDelete(item.id)} disabled={deleting} aria-label={`Hapus rencana kirim ${item.po_transporter || ''}`} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all min-w-9 min-h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
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
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <svg className="h-7 w-7 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                </div>
                {search.trim() ? (
                  <>
                    <p className="text-sm font-medium text-foreground">Tidak ada hasil untuk &quot;{search}&quot;</p>
                    <button onClick={() => { setSearch(''); setPage(1); }} className="mt-2 text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">Belum ada data rencana kirim.</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Buat rencana baru atau klik tanggal di kalender untuk mulai mengisi form.</p>
                  </>
                )}
                {!search.trim() && hasPermission('rencana_kirim.create') && (
                  <button onClick={() => openCreate()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-[0.98]">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Buat Rencana
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border bg-overlay-60 px-4 py-3.5 sm:px-5">
            <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
              <span className="text-xs text-muted-foreground sm:text-sm">Halaman <strong className="font-semibold text-foreground">{page}</strong> dari <strong className="font-semibold text-foreground">{lastPage}</strong></span>
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
              <button onClick={() => viewItem && previewSuratJalan(viewItem as RencanaKirimData)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-popover">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Preview
              </button>
              )}
              {hasPermission('reports.rencana_kirim') && (
                <button onClick={() => void handleDownloadExcel()} disabled={excelExporting} title="Export detail rencana kirim ke Excel (detailReplenishment)" aria-label="Download Excel" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-popover disabled:opacity-50 disabled:cursor-not-allowed">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v2m0 0H7a2 2 0 01-2-2v-4a2 2 0 012-2h10a2 2 0 012 2v4a2 2 0 01-2 2h-2m0 0L15 17m0 0l2-2m-2 2l2 2m-2-2v-3m0 0v-3l1.5-1.5a2 2 0 013.004 0l1.5 1.5a2 2 0 010 3.004V21" /></svg>
                  {excelExporting ? 'Mengekspor...' : 'Download Excel'}
                </button>
              )}
              {hasPermission('rencana_kirim.view') && (
                <button onClick={() => viewItem && downloadSuratJalan(viewItem as RencanaKirimData)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 shadow-lg">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Download PDF
                </button>
              )}
            </div>
            <button onClick={() => setViewItem(null)} className="px-4 py-2 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-popover">Tutup</button>
          </div>
        }
      >
        {viewItem && (
          <div className="space-y-5">
            {/* Permukaan ink selalu gelap di tema terang maupun gelap, jadi
                teks white/xx dan panel white/10 tidak berbalik kontras. */}
            <div className="rounded-2xl bg-ink-900 p-5 text-white ring-1 ring-white/10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-widest text-white/60 uppercase">PO Transporter</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight">{fmt(viewItem.po_transporter)}</h3>
                  <p className="mt-1 text-xs text-white/70"><span className="font-semibold">Rencana kirim:</span> {fmtDateId(toLocalYmd(viewItem.rkh_date))} <span className="text-white/40">•</span> <span className="font-semibold text-info">Rencana tiba:</span> {viewItem.eta_date ? fmtDateId(toLocalYmd(viewItem.eta_date)) : '-'} <span className="text-white/40">•</span> <span className="font-semibold">Dibuat:</span> {fmtDateId(viewItem.created_at?.split('T')[0])} <span className="text-white/40">•</span> <span className="font-semibold">Oleh:</span> {creatorName(viewItem.creator)}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white ring-1 ring-inset ring-white/20">
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
                <div className="rounded-xl bg-white/10 border border-white/10 p-3 text-center">
                  <p className="text-xs font-bold tracking-widest text-white/60 uppercase">Tujuan</p>
                  <p className="text-sm font-black truncate">{fmt(viewItem.destination_name)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">                  <h4 className="mb-3 flex items-center gap-2 text-xs font-black tracking-widest text-muted-foreground uppercase"><span className="w-6 h-6 rounded-lg bg-info/10 text-info flex items-center justify-center"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg></span> Kendaraan</h4>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Driver</span><span className="font-bold text-foreground">{fmt(viewItem.driver_name)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Nopol</span><span className="font-mono font-bold">{fmt(viewItem.nopol)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Expedisi</span><span className="font-medium">{fmt(viewItem.expedisi)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Jenis</span><span className="rounded-full bg-info/10 border border-info/30 px-2 py-0.5 text-xs font-bold text-info">{fmt(viewItem.jenis_kendaraan)}</span></div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">                  <h4 className="mb-3 flex items-center gap-2 text-xs font-black tracking-widest text-muted-foreground uppercase"><span className="w-6 h-6 rounded-lg bg-success/10 text-success flex items-center justify-center"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg></span> Pengiriman</h4>
                <div className="space-y-2.5 text-sm">
                  <div><p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Pengirim</p><p className="font-bold text-foreground">{fmt(viewItem.shipper_name)}</p><p className="text-xs text-muted-foreground">{fmt(viewItem.shipper_address)}</p></div>
                  <div><p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Kepada</p><p className="font-bold text-foreground">{fmt(viewItem.destination_name)}</p><p className="text-xs text-muted-foreground">{fmt(viewItem.destination_address) || '-'}</p></div>
                </div>
              </div>
            </div>
            {viewItem.items && viewItem.items.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 bg-popover border-b border-border">
                  <h4 className="text-xs font-black tracking-widest text-muted-foreground uppercase">Daftar barang • {viewItem.items.length}</h4>
                  <span className="text-xs font-mono text-muted-foreground">{viewItem.items.reduce((s, i) => s + Number(i.jumlah || 0), 0).toLocaleString('id-ID')} qty</span>
                </div>
                <div className="divide-y divide-border max-h-64 overflow-auto">
                  {viewItem.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-3 hover:bg-popover">
                      <span className="w-6 h-6 rounded-lg bg-foreground text-background text-xs font-black flex items-center justify-center shrink-0">{item.item_number}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{item.nama_barang}</p>
                        <p className="text-xs font-mono text-muted-foreground">{item.kode_barang} • {Number(item.jumlah).toLocaleString('id-ID')} {item.satuan}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-foreground tabular-nums">{Number(item.jumlah).toLocaleString('id-ID')} <span className="text-xs font-medium text-muted-foreground">{item.satuan}</span></p>
                        {item.keterangan ? <p className="text-[11px] text-muted-foreground max-w-[220px] truncate">{item.keterangan}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {viewItem.notes && <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4"><h4 className="text-xs font-black tracking-widest text-foreground uppercase">Catatan</h4><p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{viewItem.notes}</p></div>}
          </div>
        )}
      </Modal>

      {/* Create Modal — di-lazy-load agar tidak ikut bundle halaman utama. */}
      <DynRencanaKirimCreateModal
        showCreate={showCreate}
        requestCloseCreate={requestCloseCreate}
        editingId={editingId}
        editingStatus={editingStatus}
        createForm={createForm}
        setCreateForm={setCreateForm}
        createItems={createItems}
        setCurrentStep={setCurrentStep}
        currentStep={currentStep}
        depoList={depoList}
        setShowBarangModal={setShowBarangModal}
        setShowImport={setShowImport}
        onRequestSave={requestSavePreview}
        clearNamaDepo={clearNamaDepo}
        handleNamaDepoChange={handleNamaDepoChange}
        poDuplicate={poDuplicate}
        duplicateCount={duplicateCount}
        saving={saving}
        typingItems={typingItems}
        sectionComplete={sectionComplete}
        completedCount={completedCount}
        isMainFormValid={isMainFormValid}
        canSave={canSave}
        editLocked={editLocked}
        itemCount={itemCount}
        totalQty={totalQty}
        totalKubikasiDisplay={totalKubikasiDisplay}
        itemKubikasi={itemKubikasi}
        jenisKendaraanOptions={jenisKendaraanOptions}
        todayDateStr={todayDateStr}
        hasPermission={hasPermission}
        NamaDepoInput={NamaDepoInput}
      />

      {/* Save Preview Modal — di-lazy-load; pencegahan salah input barang sebelum disimpan. */}
      <DynRencanaKirimSavePreviewModal
        showSavePreview={showSavePreview}
        setShowSavePreview={setShowSavePreview}
        createForm={createForm}
        createItems={createItems}
        handleCreate={handleCreate}
        saving={saving}
      />
      {/* Popup konfirmasi PO duplikat — tampil saat Simpan diklik dan PO sudah dipakai. */}
      <DynRencanaKirimDuplicatePoModal
        show={showDuplicatePoConfirm}
        onClose={() => setShowDuplicatePoConfirm(false)}
        existing={duplicatePo}
        onViewExisting={() => {
          const target = duplicatePo;
          setShowDuplicatePoConfirm(false);
          setShowSavePreview(false);
          setShowCreate(false);
          setViewItem(target);
        }}
      />
      {/* Daftar Barang Popup — kelola setelah informasi dokumen/kendaraan/alamat lengkap. Di-lazy-load. */}
      <DynRencanaKirimBarangModal
        showBarangModal={showBarangModal}
        setShowBarangModal={setShowBarangModal}
        createItems={createItems}
        duplicateIndexes={duplicateIndexes}
        duplicateCount={duplicateCount}
        sectionComplete={sectionComplete}
        totalQty={totalQty}
        totalKubikasiDisplay={totalKubikasiDisplay}
        itemKubikasi={itemKubikasi}
        itemCount={itemCount}
        takenCodesByIndex={takenCodesByIndex}
        typingItems={typingItems}
        markTyping={markTyping}
        EMPTY_CODES={EMPTY_CODES}
        addItem={addItem}
        updateItem={updateItem}
        removeItem={removeItem}
        handleClearItem={handleClearItem}
        handleNamaBarangSelect={handleNamaBarangSelect}
      />

      {/* Import Barang Modal — di-lazy-load. */}
      <DynRencanaKirimImportModal
        showImport={showImport}
        setShowImport={setShowImport}
        importing={importing}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        importResult={importResult}
        setImportResult={setImportResult}
        fileInputRef={fileInputRef}
        handleImportItems={handleImportItems}
        handleItemTemplate={handleItemTemplate}
      />

      <ConfirmDialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)} onConfirm={() => { setConfirmCloseOpen(false); resetCreateForm(); }} title="Buang perubahan?" message="Ada isian yang belum disimpan. Tutup form dan buang semua perubahan?" confirmLabel="Buang & Tutup" cancelLabel="Lanjut Mengisi" variant="warning" />
      <ConfirmDialog open={showDeleteConfirm} onClose={() => { if (deleting) return; setShowDeleteConfirm(false); setDeleteTargetId(null); }} onConfirm={confirmDelete} title="Hapus Replenishment" message="Apakah Anda yakin ingin menghapus rencana kirim ini?" confirmLabel="Hapus" variant="danger" loading={deleting} />
    </DashboardLayout>
  );
}
