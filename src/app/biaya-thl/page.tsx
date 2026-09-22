'use client';

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import Image from 'next/image';
import DashboardLayout from '@/app/dashboard/layout';
import { biayaThl, getErrorMessage, API_ROOT } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { getBiayaConfig, BIAYA_CONFIG_FALLBACK, type BiayaConfig } from '@/lib/biaya';
import { generateTHLPdf, previewTHLPdf } from '@/lib/biayaPdf';

interface StoredPhoto {
  id: number;
  file_path: string;
  file_name?: string;
}

type PhotoItem = File | StoredPhoto;

const isStoredPhoto = (p: PhotoItem): p is StoredPhoto => !(p instanceof File);

interface DetailRow {
  id?: number;
  detailId?: number;
  no_surat_jalan: string;
  nama_thl: string;
  driver_name: string;
  nopol_kendaraan: string;
  type_kendaraan: string;
  nominal_biaya: number;
  kubikasi: number;
  droppoint: string;
  posisi: string;
  jam_datang: string;
  jam_pulang: string;
  kendaraan_tambahan: boolean;
  kendaraan_sj?: string;
  kendaraan_nopol?: string;
  kendaraan_type?: string;
  order: number;
  photos: PhotoItem[];
  photos_remove?: number[];
}

interface FormDetailRow extends DetailRow {
  groupId: string;
  detailId?: number;
}

interface BiayaThlItem {
  id: number;
  tanggal_pengajuan: string;
  kode_depo: string;
  nama_depo: string;
  no_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  kubikasi_base: number;
  nominal_biaya: number;
  is_rfah_required: boolean;
  rfah_name: string;
  approval_pengajuan: string;
  approval_pengajuan_level?: string;
  status: string;
  created_by: number;
  submitted_at: string | null;
  checked_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  revised_at: string | null;
  revisi_reason: string | null;
  submittedBy?: { id: number; full_name: string } | null;
  checkedBy?: { id: number; full_name: string } | null;
  approvedBy?: { id: number; full_name: string } | null;
  rejectedBy?: { id: number; full_name: string } | null;
  revisedBy?: { id: number; full_name: string } | null;
  details: DetailRow[];
  photos: unknown[];
}

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  draft: { label: 'Draft', badge: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  checked: { label: 'Checked', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  approved: { label: 'Approved', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  revisi: { label: 'Revisi', badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
};

const VEHICLE_TYPES = ['CDD', 'Fuso', 'Container 20', 'Container 40', 'Box', 'Pickup'];
const POSITIONS = ['THL HELPER', 'THL DRIVER', 'THL GUDANG'];

// Identitas visual per grup SJ: warna + nomor selalu tampil berpasangan agar
// grup mudah dibedakan sekilas tanpa mengandalkan warna saja (aksesibilitas).
// Kelas ditulis statis penuh agar terdeteksi Tailwind JIT.
const GROUP_ACCENTS = [
  { solid: 'bg-indigo-600', soft: 'bg-indigo-50', text: 'text-indigo-700', bar: 'from-indigo-600 to-indigo-300' },
  { solid: 'bg-emerald-600', soft: 'bg-emerald-50', text: 'text-emerald-700', bar: 'from-emerald-600 to-emerald-300' },
  { solid: 'bg-amber-600', soft: 'bg-amber-50', text: 'text-amber-700', bar: 'from-amber-600 to-amber-300' },
  { solid: 'bg-rose-600', soft: 'bg-rose-50', text: 'text-rose-700', bar: 'from-rose-600 to-rose-300' },
  { solid: 'bg-sky-600', soft: 'bg-sky-50', text: 'text-sky-700', bar: 'from-sky-600 to-sky-300' },
  { solid: 'bg-violet-600', soft: 'bg-violet-50', text: 'text-violet-700', bar: 'from-violet-600 to-violet-300' },
];

const createEmptyDetail = (order: number, sj: string, groupId: string): FormDetailRow => ({
  no_surat_jalan: sj,
  nama_thl: '',
  driver_name: '',
  nopol_kendaraan: '',
  type_kendaraan: '',
  nominal_biaya: 0,
  kubikasi: 0,
  droppoint: '',
  posisi: '',
  jam_datang: '',
  jam_pulang: '',
  kendaraan_tambahan: false,
  order,
  photos: [],
  groupId,
});

const createGroupId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `grp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeThlDetail = <T extends DetailRow>(detail: T): T => {
  const normalized = { ...detail };
  const position = normalized.posisi?.trim().toUpperCase();

  if (position === 'THL GUDANG') {
    normalized.kubikasi = 0;
    normalized.droppoint = '';
  }

  return normalized;
};

const requiresDriverName = (position: string) => {
  const normalizedPosition = position.trim().toUpperCase();
  return normalizedPosition === 'THL HELPER' || normalizedPosition === 'THL DRIVER';
};

const requiresWorkHours = (position: string) => {
  const normalizedPosition = position.trim().toUpperCase();
  return normalizedPosition === 'THL HELPER'
    || normalizedPosition === 'THL DRIVER'
    || normalizedPosition === 'THL GUDANG';
};

const getMissingFields = (detail: FormDetailRow): string[] => {
  const position = detail.posisi?.trim().toUpperCase();
  const missing: string[] = [];
  if (!detail.nama_thl.trim()) missing.push('Nama THL');
  if (!detail.posisi) missing.push('Posisi');
  // Dokumentasi: plat + type kendaraan diisi per baris untuk SEMUA posisi,
  // termasuk THL GUDANG.
  if (!detail.nopol_kendaraan.trim()) missing.push('Plat Kendaraan');
  if (!detail.type_kendaraan) missing.push('Type Kendaraan');
  if (!Number.isFinite(Number(detail.nominal_biaya)) || Number(detail.nominal_biaya) < 1) missing.push('Nominal Biaya');
  // Dokumentasi §2.1 langkah 6: satu baris valid wajib memiliki satu foto
  // bukti. Draft tetap boleh disimpan tanpa foto (jalur draft tak dicek di sini).
  if (detail.photos.length === 0) missing.push('Foto Bukti');
  if (requiresDriverName(position)) {
    if (!detail.driver_name.trim()) missing.push('Nama Driver');
    if (Number(detail.kubikasi) <= 0) missing.push('Kubikasi');
    if (!detail.droppoint.trim()) missing.push('Droppoint');
  }
  if (requiresWorkHours(position)) {
    if (!detail.jam_datang) missing.push('Jam Datang');
    if (!detail.jam_pulang) missing.push('Jam Pulang');
    if (detail.jam_datang && detail.jam_pulang && detail.jam_pulang <= detail.jam_datang) {
      missing.push('Jam Pulang harus setelah Jam Datang');
    }
  }
  return missing;
};

const isDetailReady = (detail: FormDetailRow): boolean => getMissingFields(detail).length === 0;

const formatCurrency = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

/**
 * Kompresi foto lapangan (HP 8–12MP) ke JPEG ≤1280px kualitas 0.8 sebelum
 * upload: hemat kuota sinyal gudang tanpa mengorbankan keterbacaan bukti.
 */
const compressImage = (file: File): Promise<File> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      if (scale >= 1 && file.type === 'image/jpeg' && file.size <= 2 * 1024 * 1024) {
        resolve(file);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });

const formatRibuan = (value: number | string): string => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';

  // Nilai decimal dari Laravel dapat diterima sebagai string, misalnya
  // "131000.00". Jangan menganggap angka desimal tersebut sebagai digit rupiah.
  const numericValue = typeof value === 'string' && /^\d+\.\d{2}$/.test(rawValue)
    ? Number(rawValue)
    : Number(rawValue.replace(/\./g, '').replace(',', '.'));

  if (!Number.isFinite(numericValue)) return '';
  return Math.trunc(numericValue).toLocaleString('id-ID');
};

const parseRibuan = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Normalisasi nilai tanggal API (ISO datetime `2026-09-22T00:00:00...Z`
 * atau `YYYY-MM-DD`) ke format `input[type=date]`. Parsing tekstual agar
 * tidak terpengaruh timezone browser.
 */
const toDateInputValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

/**
 * Normalisasi ke `input[datetime-local]` (`YYYY-MM-DDTHH:mm`).
 * Menerima `YYYY-MM-DD HH:mm:ss`, ISO `...T...Z`, atau sudah `...THH:mm`.
 */
const toDatetimeLocalValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const s = String(value).trim().replace(' ', 'T');
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(s);
  return m ? m[1] : '';
};

type StepState = 'done' | 'current' | 'todo';

const stepStateAt = (status: string, index: number): StepState => {
  if (status === 'rejected') return 'done';
  const order = ['draft', 'pending', 'checked', 'revisi', 'approved'];
  const currentIndex = order.indexOf(status);
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'todo';
};

function ApprovalStepper({ item }: { item: BiayaThlItem }) {
  const rejected = item.status === 'rejected';
  const revised = item.status === 'revisi';
  const steps = [
    { label: 'Diajukan', role: item.approval_pengajuan_level || 'BLC', at: item.submitted_at, by: item.submittedBy?.full_name },
    { label: 'Diperiksa', role: 'BAC', at: item.checked_at, by: item.checkedBy?.full_name },
    {
      label: revised ? 'Perlu Revisi' : rejected ? 'Ditolak' : 'Disetujui',
      role: 'RLH',
      at: item.revised_at ?? item.rejected_at ?? item.approved_at,
      by: item.revisedBy?.full_name ?? item.rejectedBy?.full_name ?? item.approvedBy?.full_name,
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <span className="h-5 w-1 rounded-full bg-primary-500" aria-hidden="true" />
        <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-800">Alur Persetujuan</h3>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
          <span className={`w-1.5 h-1.5 rounded-full ${revised ? 'bg-orange-500' : rejected ? 'bg-red-500' : item.status === 'approved' ? 'bg-emerald-500' : item.status === 'checked' ? 'bg-blue-500' : item.status === 'pending' ? 'bg-amber-500' : 'bg-gray-400'}`} />
          {revised ? 'Perlu Revisi' : rejected ? 'Ditolak' : STATUS_META[item.status]?.label ?? item.status}
        </span>
      </div>
      <div className="px-4 py-4">
        <ol>
          {steps.map((step, i) => {
            const state = stepStateAt(item.status, i);
            return (
              <li key={step.role} className="relative flex gap-3 pb-6 last:pb-0">
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[15px] top-8 bottom-0 w-[2px] rounded-full ${state === 'done' ? 'bg-emerald-200' : 'bg-slate-200'}`}
                  />
                )}
                <div className="shrink-0 mt-0.5">
                  {state === 'done' ? (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-4 ring-emerald-500/10">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </span>
                  ) : state === 'current' ? (
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white border-2 border-primary-500 text-primary-500 shadow-sm">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary-500/20 animate-ping" aria-hidden="true" />
                      <span className="relative block h-2.5 w-2.5 rounded-full bg-primary-500" />
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-400">
                      <span className="block h-2 w-2 rounded-full bg-slate-300" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${state === 'done' ? 'text-slate-900' : state === 'current' ? 'text-primary-700' : 'text-slate-500'}`}>{step.label}</p>
                    <span className="inline-flex rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-500">{step.role}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {step.at ? (
                      <>
                        {step.by ? <span className="font-medium text-slate-600">{step.by}</span> : null}{step.by && ' · '}{formatDateTime(step.at)}
                      </>
                    ) : state === 'current'
                      ? 'Menunggu aksi saat ini'
                      : 'Belum diproses'}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {item.is_rfah_required && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-800">RFAH* — nilai di atas ketentuan</p>
              <p className="text-xs text-amber-700 mt-0.5">Nominal melebihi Rp 750.000, memerlukan pemantauan {item.rfah_name || '-'}.</p>
            </div>
          </div>
        )}
        {revised && item.revisi_reason ? (
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-orange-800">Perlu revisi — {item.revisedBy?.full_name || '-'} ({formatDateTime(item.revised_at)})</p>
              <p className="text-xs text-orange-700 mt-0.5 whitespace-pre-line">{item.revisi_reason}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailPhotoThumb({ photo }: { photo: PhotoItem }) {
  const storedUrl = isStoredPhoto(photo)
    ? (photo.file_path.startsWith('http') ? photo.file_path : `${API_ROOT}/storage/${photo.file_path}`)
    : '';
  // URL blob dibuat di effect-state (bukan memo+cleanup): cleanup StrictMode
  // double-invoke akan mencabut URL yang masih dipakai <img> bila pola memo
  // dipakai, menghasilkan ERR_FILE_NOT_FOUND di konsol.
  const [url, setUrl] = useState(storedUrl);
  useEffect(() => {
    if (!isStoredPhoto(photo)) {
      const next = URL.createObjectURL(photo);
      setUrl(next);
      return () => URL.revokeObjectURL(next);
    }
    setUrl(storedUrl);
  }, [photo, storedUrl]);
  if (!url) return null;
  return <Image src={url} alt="Foto pendukung" className="w-full h-full object-cover" width={96} height={96} unoptimized />;
}

export default function BiayaThlPage() {
  const { user, hasPermission } = useAuthStore();
  const [items, setItems] = useState<BiayaThlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openModal, setOpenModal] = useState(false);
  const [viewItem, setViewItem] = useState<BiayaThlItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<{ action: 'approve' | 'reject' | 'revise'; item: BiayaThlItem } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [formData, setFormData] = useState({
    tanggal_pengajuan: '',
    details: [] as FormDetailRow[],
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [formStep, setFormStep] = useState(1);
  const [biayaConfig, setBiayaConfig] = useState<BiayaConfig>(BIAYA_CONFIG_FALLBACK);

  useEffect(() => { getBiayaConfig(user?.kode_depo).then(setBiayaConfig).catch(() => {}); }, [user?.kode_depo]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<{ total: number; total_nominal: number; pending: number; checked: number; approved: number; rejected: number; revisi: number; my_drafts: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const reqIdRef = useRef(0);

  const fetchItems = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    try {
      const res = await biayaThl.list({ search: debouncedSearch, status: statusFilter, page, per_page: 50 });
      if (reqIdRef.current !== reqId) return;
      setItems(res.data.data || res.data);
      setTotalPages(res.data.last_page || 1);
      if (res.data.summary) setSummary(res.data.summary);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      notifyGlobal(getErrorMessage(e, 'Gagal memuat data'), 'error');
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);


  const toggleCard = (idx: number) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const buildFinalPayload = () => {
    const normalizedDetails = applyGroupVehicle(formData.details.map(normalizeThlDetail));
    const fd = new FormData();
    fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);
    normalizedDetails.forEach((d, i) => {
      const fdRow = d as FormDetailRow;
      if (fdRow.detailId) fd.append(`details[${i}][id]`, String(fdRow.detailId));
      (fdRow.photos_remove ?? []).forEach((pid) => fd.append(`details[${i}][photos_remove][]`, String(pid)));
      fd.append(`details[${i}][no_surat_jalan]`, d.no_surat_jalan);
      fd.append(`details[${i}][nama_thl]`, d.nama_thl);
      fd.append(`details[${i}][driver_name]`, d.driver_name);
      fd.append(`details[${i}][nopol_kendaraan]`, d.nopol_kendaraan);
      fd.append(`details[${i}][type_kendaraan]`, d.type_kendaraan);
      fd.append(`details[${i}][nominal_biaya]`, String(d.nominal_biaya));
      fd.append(`details[${i}][kubikasi]`, String(d.kubikasi ?? 0));
      fd.append(`details[${i}][droppoint]`, d.droppoint || '0');
      if (d.posisi) fd.append(`details[${i}][posisi]`, d.posisi);
      if (d.jam_datang) fd.append(`details[${i}][jam_datang]`, d.jam_datang);
      if (d.jam_pulang) fd.append(`details[${i}][jam_pulang]`, d.jam_pulang);
      if (d.kendaraan_tambahan) fd.append(`details[${i}][kendaraan_tambahan]`, '1');
      if (d.kendaraan_sj) fd.append(`details[${i}][kendaraan_sj]`, d.kendaraan_sj);
      if (d.kendaraan_nopol) fd.append(`details[${i}][kendaraan_nopol]`, d.kendaraan_nopol);
      if (d.kendaraan_type) fd.append(`details[${i}][kendaraan_type]`, d.kendaraan_type);
      fd.append(`details[${i}][order]`, String(i));
      d.photos.forEach((photo) => { if (!isStoredPhoto(photo)) fd.append(`details[${i}][photos][]`, photo); });
    });
    return fd;
  };

  const persistFinal = async (): Promise<number | null> => {
    if (editingId) {
      const res = await biayaThl.update(editingId, buildFinalPayload());
      return (res.data?.data?.id as number) ?? editingId;
    }
    const res = await biayaThl.create(buildFinalPayload());
    return (res.data?.data?.id as number) ?? null;
  };

  const finishAfterSave = async () => {
    setOpenModal(false);
    setEditingId(null);
    setEditingStatus(null);
    resetForm();
    setFormStep(1);
    await fetchItems();
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      await persistFinal();
      notifyGlobal('Pengajuan tersimpan sebagai draft — buka detail lalu Kirim untuk masuk antrean.', 'success');
      await finishAfterSave();
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Gagal membuat Biaya THL'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndSubmit = async () => {
    setBusy(true);
    try {
      const id = await persistFinal();
      if (id == null) throw new Error('empty');
      await biayaThl.submit(id);
      notifyGlobal('Pengajuan dikirim ke antrean pemeriksaan.', 'success');
      await finishAfterSave();
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengirim pengajuan'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      await persistFinal();
      notifyGlobal('Biaya THL berhasil diperbarui', 'success');
      await finishAfterSave();
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Gagal memperbarui Biaya THL'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const canSaveDraft = editingId === null || ['draft', 'rejected', 'revisi'].includes(editingStatus ?? '');

  const buildDraftPayload = () => {
    const fd = new FormData();
    fd.append('is_draft', '1');
    if (formData.tanggal_pengajuan) fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);
    applyGroupVehicle(formData.details.map(normalizeThlDetail)).forEach((d, i) => {
      const put = (key: string, value: unknown) => {
        if (value === undefined || value === null || value === '') return;
        fd.append(`details[${i}][${key}]`, value instanceof File ? value : String(value));
      };
      put('no_surat_jalan', d.no_surat_jalan);
      put('nama_thl', d.nama_thl);
      put('driver_name', d.driver_name);
      put('nopol_kendaraan', d.nopol_kendaraan);
      put('type_kendaraan', d.type_kendaraan);
      put('nominal_biaya', d.nominal_biaya);
      put('kubikasi', d.kubikasi);
      put('droppoint', d.droppoint);
      put('posisi', d.posisi);
      put('jam_datang', d.jam_datang);
      put('jam_pulang', d.jam_pulang);
      if (d.kendaraan_tambahan) fd.append(`details[${i}][kendaraan_tambahan]`, '1');
      put('kendaraan_sj', d.kendaraan_sj);
      put('kendaraan_nopol', d.kendaraan_nopol);
      put('kendaraan_type', d.kendaraan_type);
      const fdRow = d as FormDetailRow;
      if (fdRow.detailId) fd.append(`details[${i}][id]`, String(fdRow.detailId));
      (fdRow.photos_remove ?? []).forEach((pid) => fd.append(`details[${i}][photos_remove][]`, String(pid)));
      fd.append(`details[${i}][order]`, String(i));
      d.photos.forEach((photo) => { if (!isStoredPhoto(photo)) fd.append(`details[${i}][photos][]`, photo); });
    });
    return fd;
  };

  const handleSaveDraft = async () => {
    if (!canSaveDraft) return;
    setBusy(true);
    try {
      const fd = buildDraftPayload();
      if (editingId) {
        await biayaThl.update(editingId, fd);
      } else {
        await biayaThl.create(fd);
      }
      notifyGlobal('Draft tersimpan. Lengkapi dan kirim saat siap.', 'success');
      setOpenModal(false);
      setEditingId(null);
      setEditingStatus(null);
      resetForm();
      setFormStep(1);
      fetchItems();
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Gagal menyimpan draft'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (deleteTargetId === null) return;
    try {
      await biayaThl.delete(deleteTargetId);
      notifyGlobal('Biaya THL berhasil dihapus', 'success');
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      fetchItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menghapus'), 'error');
    }
  };

  const downloadPdf = (item: BiayaThlItem) => {
    try {
      generateTHLPdf(item);
    } catch {
      notifyGlobal('Gagal generate PDF', 'error');
    }
  };

  const approvalAction = async (action: 'submit' | 'check' | 'rfahApprove') => {
    if (!viewItem) return;
    try {
      const response = action === 'submit'
        ? await biayaThl.submit(viewItem.id)
        : action === 'check'
          ? await biayaThl.check(viewItem.id)
          : await biayaThl.rfahApprove(viewItem.id);
      setViewItem(response.data.data);
      await fetchItems();
      notifyGlobal('Status pengajuan berhasil diperbarui', 'success');
    } catch {
      notifyGlobal('Aksi approval tidak dapat diproses', 'error');
    }
  };

  const openDecision = (action: 'approve' | 'reject' | 'revise', item: BiayaThlItem) => {
    setDecision({ action, item });
    setDecisionReason('');
  };

  const submitDecision = async () => {
    if (!decision) return;
    if ((decision.action === 'reject' || decision.action === 'revise') && !decisionReason.trim()) {
      notifyGlobal(decision.action === 'reject' ? 'Alasan penolakan wajib diisi' : 'Catatan revisi wajib diisi', 'error');
      return;
    }
    setDecisionBusy(true);
    try {
      const response = decision.action === 'approve'
        ? await biayaThl.approve(decision.item.id)
        : decision.action === 'revise'
          ? await biayaThl.revise(decision.item.id, decisionReason)
          : await biayaThl.reject(decision.item.id, decisionReason);
      setViewItem(response.data.data);
      await fetchItems();
      notifyGlobal(decision.action === 'approve' ? 'Pengajuan disetujui' : decision.action === 'revise' ? 'Pengajuan diminta revisi' : 'Pengajuan ditolak', 'success');
      setDecision(null);
      setDecisionReason('');
    } catch {
      notifyGlobal('Aksi approval tidak dapat diproses', 'error');
    } finally {
      setDecisionBusy(false);
    }
  };

  const resetForm = () => {
    setFormData({ tanggal_pengajuan: '', details: [] });
    setSjVehicle({});
  };

  const insertSjGroupBefore = (nextGroupId: string | null) => {
    setFormData(prev => {
      const insertAt = nextGroupId ? prev.details.findIndex(d => d.groupId === nextGroupId) : prev.details.length;
      if (nextGroupId && insertAt < 0) return prev;
      const newRow = createEmptyDetail(prev.details.length, '', createGroupId());
      const details = [...prev.details];
      details.splice(insertAt, 0, newRow);
      return { ...prev, details: details.map((d, i) => ({ ...d, order: i })) };
    });
  };

  const addSjGroup = () => {
    insertSjGroupBefore(null);
  };

  const addDetailRow = (groupId: string) => {
    const newIndex = formData.details.length;
    setFormData(prev => {
      const groupRows = prev.details.filter(d => d.groupId === groupId);
      const source = groupRows.length > 0 ? groupRows[groupRows.length - 1] : null;
      const newRow: FormDetailRow = source
        ? { ...source, nama_thl: '', photos: [], groupId, order: prev.details.length }
        : createEmptyDetail(prev.details.length, '', groupId);
      return { ...prev, details: [...prev.details, newRow] };
    });
    scrollToWorker(newIndex);
  };

  const removeSjGroup = (groupId: string) => {
    setSjVehicle((prev) => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    setFormData(prev => ({
      ...prev,
      details: prev.details
        .filter((d) => d.groupId !== groupId)
        .map((d, i) => ({ ...d, order: i })),
    }));
  };

  // Duplikat grup SJ: salin semua baris pekerja (nama, posisi, kendaraan,
  // nominal, jam) ke grup baru tepat di bawahnya. Nomor SJ dikosongkan agar
  // wajib diisi baru; foto dan id tidak ikut disalin (baris baru butuh bukti
  // dan id sendiri).
  const duplicateSjGroup = (groupId: string, groupIndex: number) => {
    const newGroupId = createGroupId();
    setFormData((prev) => {
      const groupRows = prev.details.filter((d) => d.groupId === groupId);
      if (groupRows.length === 0) return prev;
      const copies: FormDetailRow[] = groupRows.map((d) => ({
        ...d,
        id: undefined,
        detailId: undefined,
        groupId: newGroupId,
        no_surat_jalan: '',
        photos: [],
        photos_remove: [],
      }));
      const details = [...prev.details];
      const lastIdx = details.map((d) => d.groupId).lastIndexOf(groupId);
      details.splice(lastIdx + 1, 0, ...copies);
      return { ...prev, details: details.map((d, i) => ({ ...d, order: i })) };
    });
    requestAnimationFrame(() => {
      const el = document.getElementById(`sj-group-${groupIndex + 1}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el?.querySelector('input:not([disabled])') as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
    });
    // Foto sengaja tidak ikut disalin: bukti milik kejadian bongkar asal,
    // baris baru wajib difoto ulang. Aturan foto wajib (1/baris) akan
    // menandai baris salinan sampai fotonya dilengkapi.
    notifyGlobal('Grup diduplikat — isi SJ baru dan upload foto bukti tiap baris', 'success');
  };

  const updateSjNumber = (groupId: string, value: string) => {    setErrorSJGroupIndex((prev) => (prev === Object.values(sjGroups).findIndex((g) => g.groupId === groupId) ? null : prev));
    setFormData(prev => ({
      ...prev,
      details: prev.details.map((d) =>
        d.groupId === groupId ? { ...d, no_surat_jalan: value } : d
      ),
    }));
  };

  const scrollToWorker = (globalIdx: number) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`worker-card-${globalIdx}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el?.querySelector('input:not([disabled])') as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
    });
  };

  const insertDetailBefore = (groupId: string, atIndex: number) => {
    const source = formData.details[atIndex - 1];
    const row: FormDetailRow = source
      ? { ...source, nama_thl: '', photos: [], groupId, order: atIndex }
      : createEmptyDetail(atIndex, '', groupId);
    setFormData((prev) => {
      const details = [...prev.details];
      details.splice(atIndex, 0, row);
      return { ...prev, details: details.map((d, i) => ({ ...d, order: i })) };
    });
    scrollToWorker(atIndex);
  };

  const removeDetail = (index: number) => {
    setFormData(prev => ({
      ...prev,
      details: prev.details.filter((_, i) => i !== index).map((d, i) => ({ ...d, order: i })),
    }));
  };

  const updateDetail = (index: number, field: string, value: unknown) => {
    setErrorWorkerIndex((prev) => (prev === index ? null : prev));
    setFormData(prev => {
      const newDetails = [...prev.details];
      (newDetails[index] as unknown as Record<string, unknown>)[field] = value;
      return { ...prev, details: newDetails };
    });
  };

  const MAX_PHOTOS_PER_DETAIL = 1;

  const addDetailPhoto = (detailIndex: number, files: File[]) => {
    setFormData(prev => {
      const newDetails = [...prev.details];
      const current = newDetails[detailIndex];
      const maxRemaining = MAX_PHOTOS_PER_DETAIL - current.photos.length;
      const toAdd = files.slice(0, maxRemaining);
      newDetails[detailIndex] = { ...current, photos: [...current.photos, ...toAdd] };
      return { ...prev, details: newDetails };
    });
  };

  const removeDetailPhoto = (detailIndex: number, photoIndex: number) => {
    setFormData(prev => {
      const newDetails = [...prev.details];
      const current = newDetails[detailIndex];
      const removed = current.photos[photoIndex];
      newDetails[detailIndex] = {
        ...current,
        photos: current.photos.filter((_, j) => j !== photoIndex),
        photos_remove: removed && isStoredPhoto(removed)
          ? [...(current.photos_remove ?? []), removed.id]
          : current.photos_remove,
      };
      return { ...prev, details: newDetails };
    });
  };

  const totalNominal = formData.details.reduce((sum, d) => sum + (Number(d.nominal_biaya) || 0), 0);
  const totalKubikasi = formData.details.reduce((sum, d) => sum + (Number(d.kubikasi) || 0), 0);
  const positionCounts = formData.details.reduce<Record<string, number>>((acc, d) => {
    const key = String(d.posisi ?? '').trim().toUpperCase();
    if (key === 'THL GUDANG' || key === 'THL HELPER' || key === 'THL DRIVER') acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const compositionLabel = ['THL GUDANG', 'THL HELPER', 'THL DRIVER']
    .map((k) => positionCounts[k] ? `${positionCounts[k]} ${k.replace('THL ', '').toLowerCase()}` : '')
    .filter(Boolean)
    .join(' · ') || '—';
  // Checklist "kendaraan tambahan" per grup SJ (khusus GUDANG): kru yang
  // sama membongkar 2+ kendaraan. Foto absen milik kru (per grup) sehingga
  // tidak diduplikat — cukup centang + isi SJ/plat/type kendaraan ke-2.
  // Berbeda dari versi lama: plat/type BARIS tidak disentuh (milik
  // kendaraan utama sesuai dokumentasi); tambahan tersimpan di
  // kendaraan_sj/nopol/type per baris GUDANG.
  const [sjVehicle, setSjVehicle] = useState<Record<string, { enabled: boolean; sj: string; nopol: string; type: string }>>({});
  // Plat tampil di ringkasan: plat baris + plat kendaraan tambahan grup.
  const platList = [...new Set([
    ...formData.details.map((d) => (d.nopol_kendaraan || '').trim().toUpperCase()),
    ...Object.values(sjVehicle).map((gv) => (gv.enabled ? (gv.nopol || '').trim().toUpperCase() : '')),
  ].filter(Boolean))];
  const isRfahRequired = totalNominal > biayaConfig.thl_rfah_threshold;
  const hasIncompleteThlRows = formData.details.some((detail) => !isDetailReady(detail));
  const [errorWorkerIndex, setErrorWorkerIndex] = useState<number | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Set<number>>(new Set());
  // Filter "hanya yang belum lengkap" untuk grup besar: sembunyikan kartu
  // yang sudah Siap agar scroll pendek. Index stabil (pakai hidden, bukan
  // filter array) sehingga anchor worker-card-* dan order tidak bergeser.
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  // Grup review Step 3 per posisi (terbuka semua secara default).
  const [reviewGroupsOpen, setReviewGroupsOpen] = useState<Set<string>>(() => new Set(POSITIONS));
  const toggleReviewGroup = (pos: string) => {
    setReviewGroupsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };
  const prevReadyRef = useRef<Record<number, boolean>>({});
  const [errorSJGroupIndex, setErrorSJGroupIndex] = useState<number | null>(null);
  // Lipat otomatis kartu yang baru lengkap (kecuali fokus sedang di dalamnya);
  // buka kembali kartu yang ditandai error.
  useEffect(() => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      let changed = false;
      const active = document.activeElement as HTMLElement | null;
      formData.details.forEach((d, i) => {
        const ready = isDetailReady(d);
        const was = prevReadyRef.current[i] ?? false;
        if (ready && !was && errorWorkerIndex !== i) {
          const card = document.getElementById(`worker-card-${i}`);
          if (!card || !card.contains(active)) {
            next.add(i);
            changed = true;
          }
        }
        if (!ready && was) {
          next.delete(i);
          changed = true;
        }
        prevReadyRef.current[i] = ready;
      });
      return changed ? next : prev;
    });
  }, [formData.details, errorWorkerIndex]);


  const previewThl = () => {
    const firstDetail = formData.details[0];
    if (!formData.tanggal_pengajuan || !firstDetail) return;
    previewTHLPdf({
      tanggal_pengajuan: formData.tanggal_pengajuan,
      kode_depo: user?.kode_depo,
      nama_depo: user?.nama_depo,
      no_kendaraan: firstDetail.nopol_kendaraan,
      type_kendaraan: firstDetail.type_kendaraan,
      no_surat_jalan: firstDetail.no_surat_jalan,
      kubikasi_base: totalKubikasi,
      nominal_biaya: totalNominal,
      is_rfah_required: isRfahRequired,
      rfah_name: isRfahRequired ? biayaConfig.rfah_name : '',
      status: 'draft',
      details: applyGroupVehicle(formData.details.map(normalizeThlDetail)),
    });
  };

  const sjGroups = formData.details.reduce<Record<string, { groupId: string; sj: string; indices: number[] }>>((acc, d, i) => {
    const gid = d.groupId;
    if (!acc[gid]) acc[gid] = { groupId: gid, sj: d.no_surat_jalan, indices: [] };
    acc[gid].indices.push(i);
    return acc;
  }, {});

  const isGudangGroup = (groupId: string): boolean =>
    formData.details.some((d) => d.groupId === groupId && String(d.posisi ?? '').trim().toUpperCase() === 'THL GUDANG');

  /**
   * Menerjemahkan checklist grup ke kontrak per-baris backend. Hanya flag +
   * kolom kendaraan tambahan yang ditulis; nopol/type baris (kendaraan
   * utama) tidak disentuh.
   */
  const applyGroupVehicle = (rows: FormDetailRow[]): FormDetailRow[] =>
    rows.map((d) => {
      if (String(d.posisi ?? '').trim().toUpperCase() !== 'THL GUDANG') return d;
      const gv = sjVehicle[d.groupId];
      if (gv?.enabled) {
        return { ...d, kendaraan_tambahan: true, kendaraan_sj: gv.sj, kendaraan_nopol: gv.nopol, kendaraan_type: gv.type };
      }
      return { ...d, kendaraan_tambahan: false, kendaraan_sj: '', kendaraan_nopol: '', kendaraan_type: '' };
    });

  const getGroupVehicleError = (groupId: string): string | null => {
    if (!isGudangGroup(groupId)) return null;
    const gv = sjVehicle[groupId];
    if (!gv?.enabled) return null;
    const problems: string[] = [];
    if (!gv.sj.trim()) problems.push('No. SJ kendaraan ke-2');
    if (!gv.nopol.trim()) problems.push('plat kendaraan ke-2');
    if (!gv.type.trim()) problems.push('type kendaraan ke-2');
    if (problems.length === 0) return null;
    return `Kendaraan tambahan SJ ${Object.values(sjGroups).findIndex((g) => g.groupId === groupId) + 1} belum lengkap: ${problems.join(', ')}.`;
  };

  const sjVehicleErrorInfo = (() => {
    for (const g of Object.values(sjGroups)) {
      const err = getGroupVehicleError(g.groupId);
      if (err) return { error: err, groupId: g.groupId };
    }
    return { error: null as string | null, groupId: null as string | null };
  })();

  const sjGroupErrorInfo = (() => {
    const groups = Object.values(sjGroups);
    const seen = new Map<string, number>();
    for (let i = 0; i < groups.length; i++) {
      const sj = groups[i].sj.trim();
      if (!sj) return { error: `Nomor Surat Jalan ${i + 1} belum diisi.`, groupIndex: i };
      const key = sj.toLowerCase();
      if (seen.has(key)) return { error: `Nomor Surat Jalan "${sj}" terduplikasi dengan Surat Jalan ${(seen.get(key) ?? 0) + 1}.`, groupIndex: i };
      seen.set(key, i);
    }
    return { error: null, groupIndex: null };
  })();
  const sjGroupError = sjGroupErrorInfo.error;
  const vehicleError = sjVehicleErrorInfo.error;
  const hasBlockingError = !!sjGroupError || !!vehicleError;

  const goToStep = (step: number) => {
    if (step > 1 && !formData.tanggal_pengajuan) {
      notifyGlobal('Isi tanggal pengajuan terlebih dahulu', 'error');
      setFormStep(1);
      return;
    }
    if (step === 3) {
      if (sjGroupError || vehicleError) {
        const errGroupIndex = sjGroupError ? sjGroupErrorInfo.groupIndex : null;
        setErrorSJGroupIndex(errGroupIndex);
        setErrorWorkerIndex(null);
        notifyGlobal(vehicleError ?? sjGroupError ?? '', 'error');
        requestAnimationFrame(() => {
          const targetId = vehicleError && sjVehicleErrorInfo.groupId
            ? `sj-vehicle-${sjVehicleErrorInfo.groupId}`
            : errGroupIndex !== null && errGroupIndex !== undefined
              ? `sj-group-${errGroupIndex}`
              : null;
          if (targetId) document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return;
      }
      if (hasIncompleteThlRows) {
        const firstIncompleteIdx = formData.details.findIndex((detail) => !isDetailReady(detail));
        const firstIncomplete = firstIncompleteIdx >= 0 ? formData.details[firstIncompleteIdx] : null;
        setErrorWorkerIndex(firstIncompleteIdx);
        if (firstIncomplete) {
          const gid = firstIncomplete.groupId;
          const sjGroupIdx = Object.values(sjGroups).findIndex((g) => g.groupId === gid);
          setErrorSJGroupIndex(sjGroupIdx);
          // Buka kartu yang error agar user langsung melihat kolom yang kurang.
          setCollapsedCards((prev) => {
            if (!prev.has(firstIncompleteIdx)) return prev;
            const next = new Set(prev);
            next.delete(firstIncompleteIdx);
            return next;
          });
          const workerNum = (formData.details.filter((d) => d.groupId === gid).findIndex((d) => d === firstIncomplete)) + 1;
          const missingFields = getMissingFields(firstIncomplete);
          notifyGlobal(
            `Pekerja ${workerNum}${sjGroupIdx >= 0 ? ` (Surat Jalan ${sjGroupIdx + 1})` : ''} belum lengkap: ${missingFields.join(', ')}.`,
            'error'
          );
          scrollToWorker(firstIncompleteIdx);
          return;
        }
        notifyGlobal('Lengkapi semua data pekerja sebelum lanjut', 'error');
        return;
      }
    }
    setFormStep(step);
  };

  // Step 2 butuh tanggal; Step 3 butuh tanggal + minimal 1 baris valid.
  const isStepBlocked = (step: number): string | null => {
    if (step <= formStep) return null;
    if (step > 1 && !formData.tanggal_pengajuan) return 'Isi tanggal pengajuan terlebih dahulu';
    if (step > 2 && (formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError)) {
      return 'Lengkapi data pekerja terlebih dahulu';
    }
    return null;
  };

  const isFormDirty = formData.tanggal_pengajuan !== '' || formData.details.length > 0;

  const requestClose = () => {
    if (isFormDirty && !busy) {
      setShowDiscardConfirm(true);
      return;
    }
    setOpenModal(false);
    setEditingId(null);
    setEditingStatus(null);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setEditingStatus(null);
    resetForm();
    setFormStep(1);
    setOpenModal(true);
  };

  const openEditModal = (item: BiayaThlItem) => {
    setEditingId(item.id);
    setEditingStatus(item.status);
    const sjGroupIds = new Map<string, string>();
    const details = (item.details as unknown as DetailRow[]).map((d): FormDetailRow => {
      const sj = d.no_surat_jalan || '';
      if (!sjGroupIds.has(sj)) sjGroupIds.set(sj, createGroupId());
      return {
        ...d,
        detailId: d.detailId ?? d.id,
        jam_datang: toDatetimeLocalValue(d.jam_datang),
        jam_pulang: toDatetimeLocalValue(d.jam_pulang),
        photos: Array.isArray(d.photos) ? [...d.photos] : [],
        groupId: sjGroupIds.get(sj) as string,
      } as FormDetailRow;
    });
    setFormData({
      tanggal_pengajuan: toDateInputValue(item.tanggal_pengajuan),
      details,
    });
    // Pulihkan checklist kendaraan tambahan dari baris GUDANG bertanda
    // (groupId di atas baru dibangkitkan — turunkan dari details yang sama).
    const restored: Record<string, { enabled: boolean; sj: string; nopol: string; type: string }> = {};
    for (const d of details) {
      if (restored[d.groupId]) continue;
      if (String(d.posisi ?? '').trim().toUpperCase() !== 'THL GUDANG') continue;
      if (d.kendaraan_tambahan === true) {
        restored[d.groupId] = {
          enabled: true,
          sj: (d as unknown as { kendaraan_sj?: string }).kendaraan_sj || '',
          nopol: (d as unknown as { kendaraan_nopol?: string }).kendaraan_nopol || '',
          type: (d as unknown as { kendaraan_type?: string }).kendaraan_type || '',
        };
      }
    }
    setSjVehicle(restored);
    setFormStep(1);
    setOpenModal(true);
  };

  const openViewModal = (item: BiayaThlItem) => setViewItem(item);

  const badge = (status: string) => {
    const meta = STATUS_META[status] || STATUS_META.draft;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };



  return (
    <DashboardLayout>
      <div className="space-y-5">
        <header className="rounded-2xl bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <svg className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Biaya THL</h1>
                <p className="mt-0.5 text-gray-400">Queue pengajuan biaya tenaga kerja lepas</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                Total
                <span className="rounded-md bg-primary-500 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{summary?.total ?? items.length}</span>
              </span>
            </div>
          </div>
        </header>

        <div className={`rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-opacity ${loading && summary ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="px-2 py-1">
            <p className="text-xs text-slate-500">Total Nominal</p>
            <p className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{formatCurrency(summary?.total_nominal ?? 0)}</p>
          </div>
          <div className="border-l border-slate-100 px-2 py-1 sm:pl-5">
            <p className="text-xs text-slate-500">Menunggu</p>
            <p className="mt-1 text-2xl font-bold text-amber-600 tabular-nums">{summary?.pending ?? 0}</p>
          </div>
          <div className="border-l border-slate-100 px-2 py-1 sm:pl-5">
            <p className="text-xs text-slate-500">Disetujui</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{summary?.approved ?? 0}</p>
          </div>
          <div className="border-l border-slate-100 px-2 py-1 sm:pl-5">
            <p className="text-xs text-slate-500">Ditolak</p>
            <p className="mt-1 text-2xl font-bold text-red-600 tabular-nums">{summary?.rejected ?? 0}</p>
          </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col items-start gap-3 border-b border-gray-100 px-5 py-3 sm:flex-row sm:items-center">
            <div className="flex-1 w-full sm:w-auto">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari no kendaraan, depo..." />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="select-field-sm w-full sm:w-auto">
              <option value="">Semua Status</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="checked">Checked</option>
              <option value="revisi">Revisi</option>
            </select>
            {hasPermission('biaya_thl.create') && (
            <button onClick={openCreateModal} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.98] sm:w-auto">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Buat Pengajuan
            </button>
            )}
          </div>

        {/* Table - Desktop */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="table-header">Tanggal</th>
                  <th scope="col" className="table-header">No Kendaraan</th>
                  <th scope="col" className="table-header">Depo</th>
                  <th scope="col" className="table-header text-right">Total</th>
                  <th scope="col" className="table-header">Status</th>
                  <th scope="col" className="table-header text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="table-cell py-10">
                      <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                        <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        <span className="text-sm font-medium">Memuat data...</span>
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-cell py-12">
                      <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        <span className="text-sm font-medium">Tidak ada data</span>
                        <button onClick={fetchItems} className="mt-1 text-xs font-bold text-primary-600 hover:text-primary-700 hover:underline inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                          Muat ulang
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(item.tanggal_pengajuan)}</td>
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{item.no_kendaraan || '-'}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{item.nama_depo}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-slate-800 tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</td>
                      <td className="px-5 py-3">{badge(item.status)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewModal(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Lihat" aria-label="Lihat">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </button>
                          {hasPermission('biaya_thl.edit') && (
                          <button onClick={() => openEditModal(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Edit" aria-label="Edit">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                          </button>
                          )}
                          {hasPermission('biaya_thl.delete') && (
                          <button onClick={() => handleDelete(item.id)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Hapus" aria-label="Hapus">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"></path></svg>
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        {/* Cards - Mobile */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                <span className="text-sm font-medium">Memuat data...</span>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                <span className="text-sm font-medium">Tidak ada data</span>
                <button onClick={fetchItems} className="mt-1 text-xs font-bold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  Muat ulang
                </button>
              </div>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.no_kendaraan || '-'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatDate(item.tanggal_pengajuan)}</p>
                    </div>
                  </div>
                  {badge(item.status)}
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {item.is_rfah_required && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        RFAH
                      </span>
                    )}
                    <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12M15 3a3 3 0 003 3m-3-3h3m-3 15h3a2.25 2.25 0 002.25-2.25V12" /></svg>
                    {item.nama_depo}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</span>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button onClick={() => openViewModal(item)} className="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Lihat
                  </button>
                   {hasPermission('biaya_thl.edit') && (
                   <button onClick={() => openEditModal(item)} className="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-sm font-semibold text-amber-600 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                     Edit
                   </button>
                   )}
                   {hasPermission('biaya_thl.delete') && (
                   <button onClick={() => handleDelete(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-400 bg-red-50 rounded-xl hover:bg-red-100 transition-colors">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"></path></svg>
                   </button>
                   )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i + 1} onClick={() => setPage(i + 1)} className={`min-h-[44px] min-w-[44px] rounded-xl text-sm font-medium transition-all ${page === i + 1 ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{i + 1}</button>
            ))}
          </div>
        )}

        {/* Create/Edit Modal - Step Wizard */}
        <Modal open={openModal} onClose={requestClose} title={editingId ? 'Edit Biaya THL' : 'Buat Biaya THL'} subtitle={editingId ? 'Periksa perubahan sebelum disimpan' : 'Lengkapi pengajuan dalam 3 langkah sederhana'} size="2xl" footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
            <button type="button" onClick={requestClose} disabled={busy} className="btn-secondary w-full sm:w-auto">Batal</button>
            {formStep < 3 && canSaveDraft && (
              <button type="button" onClick={handleSaveDraft} disabled={busy} title="Simpan sebagai draft — bisa dilengkapi dan dikirim nanti" className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
                Simpan Draft
              </button>
            )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
            {formStep > 1 && (
              <button type="button" onClick={() => goToStep(formStep - 1)} disabled={busy} title="Kembali ke langkah sebelumnya" className="btn-secondary inline-flex w-full items-center justify-center gap-1.5 sm:w-auto">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                Kembali
              </button>
            )}
            {formStep === 3 && (
            // Sengaja tanpa gate permission: preview me-render data form yang
            // sudah terlihat pengguna (client-side, tidak menyimpan/mengirim).
            // Akses modal sudah digerbang biaya_thl.create/edit; backend PDF
            // tetap butuh biaya_thl.view + authorizeCreator.
            <button type="button" onClick={previewThl} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError} title="Pratinjau PDF ringkasan pengajuan (tidak menyimpan)" className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Preview PDF
            </button>
            )}
            {formStep === 3 && (!editingId || (canSaveDraft && hasPermission('approval.submit'))) ? (
              <>
                <button type="button" onClick={editingId ? handleUpdate : handleCreate} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError} title="Hanya menyimpan — belum masuk antrean pemeriksaan" className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-600" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                  {busy ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Draft'}
                </button>
                <button type="button" onClick={handleCreateAndSubmit} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError} title="Simpan dan langsung kirim ke antrean pemeriksaan" className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                  Simpan & Kirim
                </button>
              </>
            ) : (
            <>
            {formStep === 1 ? (
              <button type="button" onClick={() => goToStep(2)} disabled={busy || !formData.tanggal_pengajuan} title={!formData.tanggal_pengajuan ? 'Isi tanggal pengajuan terlebih dahulu' : 'Lanjut ke pengisian data pekerja'} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                Lanjut ke Data Pekerja
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </button>
            ) : formStep === 2 ? (
              <button type="button" onClick={() => goToStep(3)} disabled={busy || formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError} title={formData.details.length === 0 ? 'Tambahkan minimal 1 pekerja' : hasIncompleteThlRows || hasBlockingError ? 'Lengkapi data pekerja yang belum valid' : 'Lanjut ke ringkasan akhir'} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                Lanjut ke Review
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </button>
            ) : (
              <button type="button" onClick={editingId ? handleUpdate : handleCreate} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError} title="Simpan pengajuan" className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                {busy ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Buat Pengajuan'}
              </button>
            )}
            </>
            )}
          </div>
        </div>
        }>
          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="hidden rounded-3xl bg-slate-950 p-5 text-white shadow-xl lg:block">
              <div className="mb-8">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-200">THL Claim</span>
                <h3 className="mt-4 text-xl font-black tracking-tight">Siapkan pengajuan dengan rapi.</h3>
                <p className="mt-2 text-xs leading-5 text-slate-300">Isi informasi, data pekerja, lalu periksa total sebelum dikirim.</p>
              </div>
              <div className="space-y-2">
                {[
                  { step: 1, label: 'Informasi', note: 'Tanggal & depo' },
                  { step: 2, label: 'Data pekerja', note: `${formData.details.length} pekerja` },
                  { step: 3, label: 'Review', note: formatCurrency(totalNominal) },
                ].map((item) => {
                  const blockedReason = isStepBlocked(item.step);
                  return (
                  <button key={item.step} type="button" onClick={() => goToStep(item.step)} disabled={!!blockedReason} title={blockedReason ?? undefined} aria-current={formStep === item.step ? 'step' : undefined} aria-disabled={!!blockedReason} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${formStep === item.step ? 'bg-white text-slate-900 shadow-lg' : blockedReason ? 'text-slate-500 opacity-50 cursor-not-allowed' : 'text-slate-300 hover:bg-white/10'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${formStep === item.step ? 'bg-primary-600 text-white' : 'bg-white/10 text-white'}`}>{item.step}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black">{item.label}</span>
                      <span className={`mt-0.5 block truncate text-[10px] ${formStep === item.step ? 'text-slate-500' : 'text-slate-400'}`}>{blockedReason ?? item.note}</span>
                    </span>
                  </button>
                  );
                })}
              </div>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-200">Ringkasan live</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-slate-400">Total nominal</span><span className="text-sm font-black tabular-nums">{formatCurrency(totalNominal)}</span></div>
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-slate-400">Kubikasi</span><span className="text-sm font-black tabular-nums">{totalKubikasi} m³</span></div>
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-slate-400">Komposisi</span><span className="text-xs font-bold tabular-nums text-right">{compositionLabel}</span></div>
                  <div className="flex items-start justify-between gap-3"><span className="text-xs text-slate-400 pt-0.5">Plat</span>{platList.length > 0 ? (
                    <span className="flex flex-wrap justify-end gap-1 max-w-[130px]">
                      {platList.slice(0, 4).map((p) => (
                        <span key={p} title={p} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-200 truncate max-w-full">{p}</span>
                      ))}
                      {platList.length > 4 && <span className="text-[10px] font-bold text-slate-400">+{platList.length - 4}</span>}
                    </span>
                  ) : <span className="text-xs text-slate-500">—</span>}</div>
                  <div className="h-px bg-white/10" />
                  <p className="text-[10px] leading-4 text-slate-400">Validasi otomatis aktif. Data yang belum lengkap tidak dapat dikirim.</p>
                </div>
              </div>
            </aside>
            <div className="min-w-0">
          {/* Step Indicator */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 sm:p-3">
            <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              <span>Progress pengajuan</span>
              <span className="text-primary-600">Langkah {formStep} dari 3</span>
            </div>
            <div className="flex items-center justify-between">
            {[
              { step: 1, label: 'Informasi', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg> },
              { step: 2, label: 'Data Pekerja', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> },
              { step: 3, label: 'Review', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> }
            ].map((s, i) => {
              const blockedReason = isStepBlocked(s.step);
              return (
              <Fragment key={s.step}>
                <button type="button" onClick={() => goToStep(s.step)} disabled={!!blockedReason} title={blockedReason ?? undefined} aria-current={formStep === s.step ? 'step' : undefined} aria-disabled={!!blockedReason} className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${formStep === s.step ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : formStep > s.step ? 'bg-primary-50 text-primary-700' : blockedReason ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${formStep === s.step ? 'bg-white text-primary-600' : formStep > s.step ? 'bg-primary-200 text-primary-700' : 'bg-gray-200 text-gray-400'}`}>
                    {formStep > s.step ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : s.step}
                  </div>
                  <span className="text-xs font-bold hidden sm:inline">{s.label}</span>
                </button>
                {i < 2 && <div className={`flex-1 h-0.5 mx-2 rounded ${formStep > s.step ? 'bg-primary-300' : 'bg-gray-200'}`} />}
              </Fragment>
              );
            })}
            </div>
          </div>

          {/* Step 1: Informasi */}
          {formStep === 1 && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-linear-to-br from-primary-50 via-blue-50 to-primary-50 p-5 border border-primary-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-lg shadow-primary-200">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-black text-primary-800">{user?.kode_depo} — {user?.nama_depo}</p>
                    <p className="text-[11px] text-primary-600 font-medium">Depo aktif untuk pengajuan ini</p>
                  </div>
                </div>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-widest text-primary-600 mb-2 block">Tanggal Pengajuan</span>
                  <input type="date" value={toDateInputValue(formData.tanggal_pengajuan)} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setFormData({ ...formData, tanggal_pengajuan: e.target.value })} className="w-full bg-white/80 backdrop-blur border-2 border-primary-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 transition-all" />
                </label>
              </div>

              <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500">Gunakan tombol <span className="font-bold text-slate-700">Lanjut ke Data Pekerja</span> di bawah dialog untuk melanjutkan.</p>
            </div>
          )}

          {/* Step 2: Data Pekerja */}
          {formStep === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => goToStep(1)} className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-primary-600 transition-colors shrink-0" aria-label="Kembali ke Informasi">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-gray-900">Data Pekerja</h3>
                  <p className="text-xs text-gray-500 mt-0.5">1 baris = 1 pekerja × 1 bongkaran — pekerja yang sama boleh muncul di SJ berbeda</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {formData.details.length > 0 && (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200 text-primary-700 px-3 py-1 text-xs font-bold whitespace-nowrap shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                      {formData.details.length} pekerja
                    </span>
                  )}
                  <button type="button" onClick={addSjGroup} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition-colors shrink-0 ${formData.details.length === 0 ? 'border border-gray-200 bg-white text-gray-500 hover:border-primary-300 hover:text-primary-600' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-200'}`}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Surat Jalan
                  </button>
                </div>
              </div>

              {formData.details.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-600">
                    <input
                      type="checkbox"
                      checked={showIncompleteOnly}
                      onChange={(e) => setShowIncompleteOnly(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                    />
                    Hanya yang belum lengkap
                  </label>
                  <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden="true" />
                  <button type="button" onClick={() => setCollapsedCards(new Set(formData.details.map((_, i) => i)))} className="text-[11px] font-black text-slate-500 hover:text-primary-600 transition-colors">
                    Lipatkan semua
                  </button>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <button type="button" onClick={() => setCollapsedCards(new Set())} className="text-[11px] font-black text-slate-500 hover:text-primary-600 transition-colors">
                    Bentangkan semua
                  </button>
                </div>
              )}

              {formData.details.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-base font-black text-gray-800">Belum ada data pekerja</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Mulai dengan menambahkan Surat Jalan pertama, lalu isi detail masing-masing pekerja</p>
                  <button type="button" onClick={addSjGroup} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-black text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200 mx-auto">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Surat Jalan
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.values(sjGroups).map((group, gIdx) => {
                    const accent = GROUP_ACCENTS[gIdx % GROUP_ACCENTS.length];
                    const readyCount = group.indices.filter((i) => isDetailReady(formData.details[i])).length;
                    if (showIncompleteOnly && readyCount === group.indices.length) return null;
                    return (
                      <Fragment key={group.groupId}>
                        {gIdx > 0 && (
                          <div className="flex items-center gap-3 py-1">
                            <div className="h-px flex-1 border-t-2 border-dashed border-gray-200" />
                            <button type="button" onClick={() => insertSjGroupBefore(group.groupId)} title={`Sisipkan Surat Jalan sebelum nomor ${gIdx + 1}`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-gray-300 bg-white px-3 py-1 text-[11px] font-black text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors shrink-0">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                              Tambah Surat Jalan di sini
                            </button>
                            <div className="h-px flex-1 border-t-2 border-dashed border-gray-200" />
                          </div>
                        )}
                    <div key={group.groupId} id={`sj-group-${gIdx}`} className={`rounded-2xl border bg-white overflow-hidden shadow-sm scroll-mt-2 ${errorSJGroupIndex === gIdx ? 'border-red-300 ring-2 ring-red-200' : 'border-gray-200'}`}>
                      <div className={`h-1 bg-gradient-to-r ${accent.bar}`} aria-hidden="true" />
                      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-5 py-4 bg-white border-b border-gray-100">
                        <div className={`w-8 h-8 rounded-lg ${accent.solid} text-white flex items-center justify-center text-xs font-black shadow-sm shrink-0`} aria-hidden="true">
                          {gIdx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Nomor Surat Jalan <span className="text-red-400">*</span></label>
                          <input type="text" value={group.sj} onChange={(e) => updateSjNumber(group.groupId, e.target.value)} placeholder="Contoh: SJ-2025-0001" className={`w-full rounded-xl border px-3 py-2 font-mono text-sm font-bold text-gray-800 placeholder:text-gray-300 transition-colors focus:outline-none focus:ring-4 bg-white ${errorSJGroupIndex === gIdx ? 'border-red-400 focus:border-red-400 focus:ring-red-50' : 'border-slate-200 focus:border-primary-400 focus:ring-primary-50'}`} />
                        </div>
                        <span className={`inline-flex items-center rounded-full ${accent.soft} ${accent.text} px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0`}>{group.indices.length} pekerja</span>
                        <button type="button" onClick={() => duplicateSjGroup(group.groupId, gIdx)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-colors shrink-0" title="Duplikat grup — salin pekerja, tinggal isi SJ baru" aria-label={`Duplikat Surat Jalan ${gIdx + 1}`}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-7.5A2.25 2.25 0 018.25 18v-2.25m8.25-7.5H18m-8.25 7.5h7.5" /></svg>
                        </button>
                        <button type="button" onClick={() => removeSjGroup(group.groupId)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="Hapus Surat Jalan" aria-label={`Hapus Surat Jalan ${gIdx + 1}`}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-4 sm:px-5 py-1.5" aria-hidden="true">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-1 rounded-full bg-gradient-to-r ${accent.bar} transition-all`} style={{ width: `${group.indices.length === 0 ? 0 : Math.round((readyCount / group.indices.length) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-black tabular-nums text-slate-400">{readyCount}/{group.indices.length} siap</span>
                      </div>
<div className="p-3 sm:p-4 space-y-2">
                        {isGudangGroup(group.groupId) && (
                          <div id={`sj-vehicle-${group.groupId}`} className={`rounded-2xl border bg-white overflow-hidden shadow-sm scroll-mt-2 ${sjVehicle[group.groupId]?.enabled ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'}`}>
                            <label className="flex items-center gap-3 px-4 py-3.5 sm:px-5 cursor-pointer">
                              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${sjVehicle[group.groupId]?.enabled ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-black text-slate-900">Kendaraan tambahan</span>
                                <span className="block text-[11px] text-slate-500">Centang bila kru grup ini juga membongkar kendaraan ke-2 (SJ berbeda)</span>
                              </span>
                              <input
                                type="checkbox"
                                aria-label="Kendaraan tambahan untuk grup ini"
                                checked={!!sjVehicle[group.groupId]?.enabled}
                                onChange={(e) => setSjVehicle((prev) => ({ ...prev, [group.groupId]: { enabled: e.target.checked, sj: prev[group.groupId]?.sj ?? '', nopol: prev[group.groupId]?.nopol ?? '', type: prev[group.groupId]?.type ?? '' } }))}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-5 h-5 shrink-0"
                              />
                            </label>
                            {sjVehicle[group.groupId]?.enabled && (
                              <div className="border-t border-amber-100 bg-amber-50/50 px-4 py-3 sm:px-5">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <label htmlFor={`sjv-sj-${group.groupId}`} className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                      No. SJ Kendaraan ke-2 <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                      id={`sjv-sj-${group.groupId}`}
                                      type="text"
                                      value={sjVehicle[group.groupId]?.sj ?? ''}
                                      onChange={(e) => setSjVehicle((prev) => {
                                        const cur = prev[group.groupId] ?? { enabled: true, sj: '', nopol: '', type: '' };
                                        return { ...prev, [group.groupId]: { ...cur, sj: e.target.value } };
                                      })}
                                      placeholder="SJ kendaraan ke-2"
                                      className="input-field py-2 text-sm font-mono uppercase"
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor={`sjv-nopol-${group.groupId}`} className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                      Plat Kendaraan ke-2 <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                      id={`sjv-nopol-${group.groupId}`}
                                      type="text"
                                      value={sjVehicle[group.groupId]?.nopol ?? ''}
                                      onChange={(e) => setSjVehicle((prev) => {
                                        const cur = prev[group.groupId] ?? { enabled: true, sj: '', nopol: '', type: '' };
                                        return { ...prev, [group.groupId]: { ...cur, nopol: e.target.value } };
                                      })}
                                      placeholder="KB 1234 XX"
                                      className="input-field py-2 text-sm font-mono uppercase"
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor={`sjv-type-${group.groupId}`} className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                      Type Kendaraan ke-2 <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                      id={`sjv-type-${group.groupId}`}
                                      value={sjVehicle[group.groupId]?.type ?? ''}
                                      onChange={(e) => setSjVehicle((prev) => {
                                        const cur = prev[group.groupId] ?? { enabled: true, sj: '', nopol: '', type: '' };
                                        return { ...prev, [group.groupId]: { ...cur, type: e.target.value } };
                                      })}
                                      className="select-field py-2 text-sm"
                                    >
                                      <option value="">Pilih</option>
                                      {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {group.indices.map((idx) => {
                          const detail = formData.details[idx];
                          const rowNum = group.indices.indexOf(idx) + 1;
                          return (
                            <Fragment key={idx}>
                              {rowNum > 1 && (
                                <div className="flex items-center gap-3 py-1">
                                  <div className="h-px flex-1 border-t-2 border-dashed border-gray-200" />
                                  <button type="button" onClick={() => insertDetailBefore(group.groupId, idx)} title={`Sisipkan pekerja sebelum nomor ${rowNum}`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-gray-300 bg-white px-3 py-1 text-[11px] font-black text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors shrink-0">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                    Sisipkan di sini
                                  </button>
                                  <div className="h-px flex-1 border-t-2 border-dashed border-gray-200" />
                                </div>
                              )}
                            <div id={`worker-card-${idx}`} className={`rounded-2xl border bg-white overflow-hidden shadow-sm scroll-mt-2 ${showIncompleteOnly && isDetailReady(detail) ? 'hidden' : ''} ${errorWorkerIndex === idx ? 'border-red-300 ring-2 ring-red-200' : 'border-slate-200'}`}>
                              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
                                <div className={`w-9 h-9 rounded-xl ${accent.solid} flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0`}>
                                  {rowNum}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-black text-slate-900 truncate">
                                    {detail.nama_thl || `Data pekerja ${rowNum}`}
                                    {(() => {
                                      const nm = detail.nama_thl.trim().toLowerCase();
                                      if (!nm) return null;
                                      const twinIdx = group.indices.find((j) => j !== idx && formData.details[j]?.nama_thl.trim().toLowerCase() === nm);
                                      if (twinIdx === undefined) return null;
                                      const twinNo = group.indices.indexOf(twinIdx) + 1;
                                      return (
                                        <span className="ml-1.5 inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-black text-orange-700 align-middle" title={`Nama yang sama muncul juga di pekerja ${twinNo} SJ ini — pastikan bukan input ganda`}>
                                          Duplikat?
                                        </span>
                                      );
                                    })()}
                                  </span>
                                  {errorWorkerIndex === idx ? (
                                    <span className="block text-[11px] font-bold text-red-600 mt-0.5">
                                      Kurang: {getMissingFields(detail).join(', ')}
                                    </span>
                                  ) : collapsedCards.has(idx) ? (
                                    <span className="text-[11px] text-slate-500 truncate block">
                                      {detail.posisi || 'Tanpa posisi'} · {formatCurrency(Number(detail.nominal_biaya) || 0)} · {Number(detail.kubikasi) || 0} m³
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-500 truncate block">Lengkapi semua kolom bertanda <span className="font-bold text-red-500">*</span></span>
                                  )}
                                </div>
                                <span className={`hidden rounded-full border px-2.5 py-1 text-[10px] font-black sm:inline-flex ${isDetailReady(detail) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                  {isDetailReady(detail) ? 'Siap' : 'Belum lengkap'}
                                </span>
                                <button type="button" onClick={() => toggleCard(idx)} aria-expanded={!collapsedCards.has(idx)} title={collapsedCards.has(idx) ? 'Bentangkan' : 'Lipatkan'} aria-label={collapsedCards.has(idx) ? `Bentangkan pekerja ${rowNum}` : `Lipatkan pekerja ${rowNum}`} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors shrink-0">
                                  <svg className={`w-4 h-4 transition-transform ${collapsedCards.has(idx) ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                </button>
                                <button type="button" onClick={() => removeDetail(idx)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="Hapus pekerja" aria-label={`Hapus pekerja ${rowNum}`}>
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              {!collapsedCards.has(idx) && (
                              <>
                              <nav aria-label="Lompat ke bagian" className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-white px-4 py-2 sm:px-5">
                                {[
                                  ['Data', `wp-${idx}-data`],
                                  ['Kendaraan', `wp-${idx}-kendaraan`],
                                  ['Biaya', `wp-${idx}-biaya`],
                                  ['Jam', `wp-${idx}-jam`],
                                  ['Foto', `wp-${idx}-foto`],
                                ].map(([label, href]) => (
                                  <a key={href} href={`#${href}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:border-primary-300 hover:text-primary-600 transition-colors">
                                    {label}
                                  </a>
                                ))}
                              </nav>

                              <div className="space-y-6 px-4 py-5 sm:px-5">
                                {/* Data Pekerja */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                    </div>
                                    <h4 id={`wp-${idx}-data`} className="text-[11px] font-black text-gray-600 uppercase tracking-wider scroll-mt-2">Data Pekerja</h4>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Nama THL <span className="text-red-400">*</span>
                                      </label>
                                      <input type="text" value={detail.nama_thl} onChange={(e) => updateDetail(idx, 'nama_thl', e.target.value)} placeholder="Nama pekerja" className="input-field py-2 text-sm" />
                                    </div>
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Posisi <span className="text-red-400">*</span>
                                      </label>
                                      <select value={detail.posisi} onChange={(e) => {
                                        const position = e.target.value;
                                        updateDetail(idx, 'posisi', position);
                                        if (position.trim().toUpperCase() === 'THL GUDANG') {
                                          updateDetail(idx, 'kubikasi', 0);
                                          updateDetail(idx, 'droppoint', '');
                                          updateDetail(idx, 'driver_name', '');
                                        }
                                        if (!requiresWorkHours(position)) {
                                          updateDetail(idx, 'jam_datang', '');
                                          updateDetail(idx, 'jam_pulang', '');
                                        }
                                      }} className="select-field py-2 text-sm">
                                        <option value="">Pilih Posisi</option>
                                        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                      </select>
                                    </div>
{requiresDriverName(detail.posisi) && (
                      <div>
                        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          Nama Driver <span className="text-red-400">*</span>
                        </label>
                        <input type="text" value={detail.driver_name} onChange={(e) => updateDetail(idx, 'driver_name', e.target.value)} placeholder="Nama driver" className="input-field py-2 text-sm" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Kendaraan — plat + type per baris untuk SEMUA posisi (dokumentasi). */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                    </div>
                    <h4 id={`wp-${idx}-kendaraan`} className="text-[11px] font-black text-gray-600 uppercase tracking-wider scroll-mt-2">Kendaraan</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
<div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Plat Kendaraan <span className="text-red-400">*</span>
                                      </label>
                                      <input type="text" value={detail.nopol_kendaraan} onChange={(e) => updateDetail(idx, 'nopol_kendaraan', e.target.value)} placeholder="KB 1234 XX" title="Nomor polisi kendaraan, contoh: KB 1234 XX" className="input-field py-2 text-sm font-mono uppercase" />
                                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Type Kendaraan <span className="text-red-400">*</span>
                      </label>
                      <select value={detail.type_kendaraan} onChange={(e) => updateDetail(idx, 'type_kendaraan', e.target.value)} className="select-field py-2 text-sm">
                        <option value="">Pilih</option>
                        {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                                {/* Biaya & Muatan */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                                    </div>
                                    <h4 id={`wp-${idx}-biaya`} className="text-[11px] font-black text-gray-600 uppercase tracking-wider scroll-mt-2">Biaya & Muatan</h4>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Nominal Biaya (Rp) <span className="text-red-400">*</span>
                                      </label>
                                      <input type="text" inputMode="decimal" value={detail.nominal_biaya ? formatRibuan(detail.nominal_biaya) : ''} onChange={(e) => updateDetail(idx, 'nominal_biaya', parseRibuan(e.target.value))} placeholder="0" title="Besaran biaya/honor THL dalam rupiah (minimal Rp 1)" className="input-field py-2 text-sm font-bold tabular-nums" />
                                      <p className="mt-1 text-[10px] text-gray-400">Contoh: 150000 = Rp 150.000</p>
                                    </div>
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Kubikasi (m³) {requiresDriverName(detail.posisi) && <span className="text-red-400">*</span>}
                                      </label>
                                      <input type="number" min="0" step="0.01" value={detail.posisi === 'THL GUDANG' ? 0 : detail.kubikasi || ''} onChange={(e) => updateDetail(idx, 'kubikasi', Number(e.target.value))} placeholder="0" disabled={detail.posisi === 'THL GUDANG'} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                    </div>
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Droppoint {requiresDriverName(detail.posisi) && <span className="text-red-400">*</span>}
                                      </label>
                                      <input type="text" value={detail.posisi === 'THL GUDANG' ? '' : detail.droppoint} onChange={(e) => updateDetail(idx, 'droppoint', e.target.value)} placeholder={detail.posisi === 'THL GUDANG' ? 'Tidak diperlukan' : 'Lokasi tujuan'} disabled={detail.posisi === 'THL GUDANG'} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                    </div>
                                  </div>
                                </div>

                                {/* Jam Kerja — wajib untuk SEMUA posisi, jadi selalu tampil.
                                    Hanya disabled sebelum posisi dipilih (sejajar pola kubikasi/droppoint),
                                    bukan show/hide yang menggeser layout. */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      </div>
                                      <h4 id={`wp-${idx}-jam`} className="text-[11px] font-black text-gray-600 uppercase tracking-wider scroll-mt-2">Jam Kerja</h4>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                          Jam Datang <span className="text-red-400">*</span>
                                        </label>
                                        <input type="datetime-local" value={detail.jam_datang} onChange={(e) => updateDetail(idx, 'jam_datang', e.target.value)} disabled={!detail.posisi} title={!detail.posisi ? 'Pilih posisi terlebih dahulu' : undefined} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                      </div>
                                      <div>
                                        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                          Jam Pulang <span className="text-red-400">*</span>
                                        </label>
                                        <input type="datetime-local" value={detail.jam_pulang} onChange={(e) => updateDetail(idx, 'jam_pulang', e.target.value)} disabled={!detail.posisi} title={!detail.posisi ? 'Pilih posisi terlebih dahulu' : undefined} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                      </div>
                                    </div>
                                  </div>

                                {/* Foto */}
                                <div className="pt-1 border-t border-slate-100">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                                    </div>
                                    <h4 id={`wp-${idx}-foto`} className="text-[11px] font-black text-gray-600 uppercase tracking-wider scroll-mt-2">Foto Bukti <span className="text-red-400">*</span></h4>
                                    <span className={`ml-auto text-[10px] font-black rounded-full px-2 py-0.5 ${detail.photos.length === 0 ? 'text-red-600 bg-red-100' : 'text-gray-400 bg-gray-100'}`}>{detail.photos.length}/{MAX_PHOTOS_PER_DETAIL}</span>
                                  </div>
                                  <div className="flex items-start gap-3">
                                    {detail.photos.length > 0 && (
                                      <div className="relative w-24 h-24 shrink-0">
                                        <div className="w-full h-full rounded-xl border-2 border-gray-200 bg-gray-100 overflow-hidden">
                                          <DetailPhotoThumb photo={detail.photos[0]} />
                                        </div>
                                        <button type="button" onClick={() => removeDetailPhoto(idx, 0)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors" title="Hapus foto" aria-label="Hapus foto">
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </div>
                                    )}
                                    <label className="block cursor-pointer grow">
                                      <div className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 text-center transition-colors ${detail.photos.length > 0 ? 'border-primary-300 bg-primary-50/40 hover:bg-primary-50' : 'border-gray-200 bg-gray-50 hover:border-primary-300 hover:bg-primary-50/50'}`}>
                                        <svg className={`w-5 h-5 ${detail.photos.length > 0 ? 'text-primary-400' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                        <span className="text-xs font-bold text-gray-500">{detail.photos.length > 0 ? 'Ganti foto' : 'Upload foto bukti *'}</span>
                                      </div>
                                      <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={async (e) => {
                                        const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS_PER_DETAIL);
                                        e.target.value = '';
                                        const compressed = await Promise.all(files.map(compressImage));
                                        const valid = compressed.filter(f => f.size <= 2 * 1024 * 1024);
                                        if (valid.length < files.length) notifyGlobal('Foto melebihi 2MB setelah kompresi', 'error');
                                        addDetailPhoto(idx, valid);
                                      }} />
                                    </label>
                                  </div>
                                </div>
                              </div>
                              </>
                              )}
                            </div>
                            </Fragment>
                          );
                        })}

                        <button type="button" onClick={() => addDetailRow(group.groupId)} className="w-full rounded-xl border border-dashed border-primary-300 bg-primary-50/40 py-3 text-xs font-bold text-primary-600 hover:bg-primary-50 hover:border-primary-400 transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          Tambah Pekerja (salin data terakhir)
                        </button>
                      </div>
                    </div>
                      </Fragment>
                    );
                  })}
                </div>
              )}

              {sjGroupError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700" role="alert">
                  <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">Periksa nomor Surat Jalan</p>
                    <p className="text-xs mt-0.5">{sjGroupError}</p>
                  </div>
                </div>
              )}
              {vehicleError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800" role="alert">
                  <svg className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">Lengkapi kendaraan tambahan</p>
                    <p className="text-xs mt-0.5">{vehicleError}</p>
                  </div>
                </div>
              )}
              {formData.details.length > 0 && (
                <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500">Gunakan tombol <span className="font-bold text-slate-700">Lanjut ke Review</span> di bawah dialog untuk melanjutkan.</p>
              )}
            </div>
          )}

          {/* Step 3: Total & Submit */}
          {formStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-black text-gray-800">Ringkasan Pengajuan</h3>
                <span className="text-[11px] font-bold text-gray-400">Langkah 3 • periksa total sebelum dikirim</span>
              </div>

              <div className={`rounded-2xl p-5 transition-all ${isRfahRequired ? 'bg-linear-to-br from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 shadow-lg shadow-amber-100/50' : 'bg-gray-50 border border-gray-200'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isRfahRequired ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-500'}`}>
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659 1.171-1.671a4.5 4.5 0 015.07-1.651 3 3 0 011.482 5.369L12 12" /></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Pengajuan</p>
                    <p className="text-3xl font-black text-gray-900 tabular-nums mt-1">{formatCurrency(totalNominal)}</p>
                    <p className="text-xs text-gray-400 mt-1">{formData.details.length} pekerja · {totalKubikasi > 0 ? `${totalKubikasi} m³` : 'tanpa kubikasi'}</p>
                  </div>
                </div>

                {isRfahRequired && (
                  <div className="mt-4 p-3 bg-white/60 backdrop-blur rounded-xl border border-amber-200">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                      <div>
                        <p className="text-xs font-black text-amber-800">RFAH Required</p>
                        <p className="text-[11px] text-amber-600">Total &gt; Rp {biayaConfig.thl_rfah_threshold.toLocaleString('id-ID')} · {biayaConfig.rfah_name}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-2">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">Detail Pekerja</h4>
                {(['THL GUDANG', 'THL HELPER', 'THL DRIVER'] as const).map((pos) => {
                  const rows = formData.details
                    .map((d, i) => ({ d, i }))
                    .filter(({ d }) => String(d.posisi ?? '').trim().toUpperCase() === pos);
                  if (rows.length === 0) return null;
                  const open = reviewGroupsOpen.has(pos);
                  const subtotal = rows.reduce((s, { d }) => s + (Number(d.nominal_biaya) || 0), 0);
                  const kubikasi = rows.reduce((s, { d }) => s + (Number(d.kubikasi) || 0), 0);
                  const badge = pos === 'THL GUDANG'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : pos === 'THL HELPER'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200';
                  return (
                    <div key={pos} className="rounded-xl border border-slate-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleReviewGroup(pos)}
                        aria-expanded={open}
                        aria-label={`${open ? 'Tutup' : 'Buka'} rincian ${pos}`}
                        className="flex w-full items-center gap-3 bg-slate-50/70 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-1.5 text-[11px] font-black ${badge}`}>{rows.length}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-black text-slate-800">{pos}</span>
                          <span className="block truncate text-[10px] text-slate-400">
                            {rows.length} pekerja{ kubikasi > 0 ? ` · ${kubikasi} m³` : ''}
                          </span>
                        </span>
                        <span className="text-xs font-black tabular-nums text-slate-800">{formatCurrency(subtotal)}</span>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                      {open && (
                        <div className="divide-y divide-gray-50 px-3">
                          {rows.map(({ d, i }) => (
                            <div key={i} className="flex items-center gap-3 py-2">
                              <span className="w-6 h-6 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-bold text-gray-800 block truncate">{d.nama_thl || `Pekerja ${i + 1}`}</span>
                                <span className="text-[11px] text-gray-400 block truncate">{d.nopol_kendaraan} · {d.no_surat_jalan || '—'}</span>
                                {d.kendaraan_tambahan ? (
                                  <span className="mt-0.5 inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-px text-[10px] font-bold text-amber-700">+ Kendaraan ke-2 ({d.kendaraan_sj || 'SJ?'})</span>
                                ) : null}
                              </div>
                              <span className="text-xs font-bold text-gray-600 tabular-nums">{formatCurrency(Number(d.nominal_biaya))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
            </div>
          </div>
        </Modal>

        {/* View Modal */}
        <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Biaya THL" subtitle="Informasi lengkap pengajuan" size="lg" footer={
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3">
            {viewItem?.status === 'draft' || viewItem?.status === 'rejected' || viewItem?.status === 'revisi' ? (viewItem?.created_by === user?.id && hasPermission('approval.submit') ? <button onClick={() => void approvalAction('submit')} className="btn-secondary w-full sm:w-auto">Kirim</button> : null) : null}
            {viewItem?.status === 'pending' ? <>{hasPermission('approval.check') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}{hasPermission('approval.check') ? <button onClick={() => void approvalAction('check')} className="btn-secondary w-full sm:w-auto">Periksa</button> : null}</> : null}
            {viewItem?.status === 'checked' && viewItem ? <>{hasPermission('approval.reject') ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600">Perlu Revisi</button> : null}{hasPermission('approval.approve') ? <button onClick={() => openDecision('approve', viewItem)} className="btn-primary w-full sm:w-auto">Setujui</button> : null}</> : null}
            {viewItem?.status === 'rlh_approved' ? <>{hasPermission('approval.rfah') ? <button onClick={() => void approvalAction('rfahApprove')} className="btn-primary w-full sm:w-auto">Setujui RFAH</button> : null}{hasPermission('approval.reject') ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}</> : null}
            {viewItem && <button onClick={() => { try { previewTHLPdf(viewItem); } catch { notifyGlobal('Gagal membuka preview PDF', 'error'); } }} className="btn-secondary inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Preview PDF
            </button>}
            {viewItem?.status === 'approved' ? <button onClick={() => viewItem && downloadPdf(viewItem)} className="btn-primary inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Cetak PDF
            </button> : null}
            <button onClick={() => setViewItem(null)} className="btn-secondary w-full sm:w-auto">Tutup</button>
          </div>
        }>
          {viewItem && (
            <div className="space-y-5">
              {/* Dark header card - konsisten dengan header halaman */}
              <div className="rounded-2xl bg-slate-950 p-5 sm:p-6 text-white shadow-lg">
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-900 shadow-lg ring-1 ring-white/20">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-300/80">Biaya THL</p>
                      <p className="mt-1 text-base sm:text-lg font-black tracking-tight text-white truncate">{viewItem.no_kendaraan || viewItem.details?.[0]?.nopol_kendaraan || '-'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                        <span className="font-mono text-gray-300">{viewItem.nama_depo}</span>
                        <span className="text-gray-600">•</span>
                        <span>Total <strong className="font-semibold text-slate-200 tabular-nums">{formatCurrency(viewItem.nominal_biaya)}</strong></span>
                        <span className="text-gray-600">•</span>
                        <span>{viewItem.details?.length || 0} pekerja</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {badge(viewItem.status)}
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    Tanggal Pengajuan
                  </span>
                  <p className="text-sm text-slate-800 mt-1.5 font-semibold">{formatDate(viewItem.tanggal_pengajuan)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    No Surat Jalan
                  </span>
                  <p className="text-sm text-slate-800 mt-1.5 font-semibold font-mono break-words">{[...new Set((viewItem.details || []).map((d: DetailRow) => d.no_surat_jalan).filter(Boolean))].join(', ') || '-'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    Total Biaya
                  </span>
                  <p className="text-sm text-slate-800 mt-1.5 font-black tabular-nums">{formatCurrency(viewItem.nominal_biaya)}</p>
                </div>
              </div>

              {/* Alur persetujuan */}
              <ApprovalStepper item={viewItem} />

              {/* Detail table */}
              {viewItem.details.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-5 w-1 rounded-full bg-primary-500" aria-hidden="true" />
                    <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-800">Daftar Pekerja</h3>
                    <span className="ml-auto inline-flex items-center rounded-full bg-primary-50 border border-primary-100 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">
                      {viewItem.details.length} pekerja
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="table-header text-center">#</th>
                          <th className="table-header">No. SJ</th>
                          <th className="table-header">Nama THL</th>
                          <th className="table-header">Posisi</th>
                          <th className="table-header">Plat Kendaraan</th>
                          <th className="table-header">Type</th>
                          <th className="table-header text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewItem.details.map((d, i) => (
                          <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                            <td className="table-cell text-center font-bold text-slate-400">{i + 1}</td>
                            <td className="table-cell font-mono text-slate-600">{d.no_surat_jalan || '-'}</td>
                            <td className="table-cell font-semibold text-slate-800">{d.nama_thl}</td>
                            <td className="table-cell">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${d.posisi === 'THL GUDANG' ? 'border-sky-200 bg-sky-50 text-sky-700' : d.posisi === 'THL DRIVER' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-primary-200 bg-primary-50 text-primary-700'}`}>
                                {d.posisi || '-'}
                              </span>
                            </td>
                            <td className="table-cell font-mono">{d.nopol_kendaraan || '-'}</td>
                            <td className="table-cell">{d.type_kendaraan || '-'}</td>
                            <td className="table-cell text-right font-bold text-slate-800 tabular-nums">{formatCurrency(Number(d.nominal_biaya))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status footer */}
              <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-slate-500">Status pengajuan</p>
                {badge(viewItem.status)}
              </div>
            </div>
          )}
        </Modal>

        {/* Modal Keputusan Approval */}
        <Modal
          open={!!decision}
          onClose={() => { if (!decisionBusy) setDecision(null); }}
          title={decision?.action === 'reject' ? 'Tolak Pengajuan' : decision?.action === 'revise' ? 'Perlu Revisi' : 'Setujui Pengajuan'}
          subtitle={decision ? 'Konfirmasi keputusan approval' : undefined}
          size="md"
          footer={
            <>
              <button onClick={() => setDecision(null)} disabled={decisionBusy} className="btn-secondary w-full sm:w-auto">Batal</button>
              {decision?.action === 'approve' ? (
                <button onClick={() => void submitDecision()} disabled={decisionBusy} className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  {decisionBusy ? 'Memproses...' : 'Setujui'}
                </button>
              ) : decision?.action === 'revise' ? (
                <button onClick={() => void submitDecision()} disabled={decisionBusy} className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  {decisionBusy ? 'Memproses...' : 'Kirim Revisi'}
                </button>
              ) : (
                <button onClick={() => void submitDecision()} disabled={decisionBusy} className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  {decisionBusy ? 'Memproses...' : 'Tolak'}
                </button>
              )}
            </>
          }
        >
          {decision && (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border border-slate-200">
                <div className="bg-slate-900 px-4 py-3 text-white flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10 text-primary-300">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-300/80">Biaya THL</p>
                    <p className="text-sm font-bold truncate">{decision.item.no_kendaraan || decision.item.details?.[0]?.nopol_kendaraan || '-'}</p>
                  </div>
                  <span className="ml-auto shrink-0">{badge(decision.item.status)}</span>
                </div>
                <div className="divide-y divide-slate-100 bg-white text-sm">
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-slate-500">Depo</span>
                    <span className="font-semibold text-slate-800 font-mono">{decision.item.nama_depo}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-slate-500">Total Biaya</span>
                    <span className="font-black text-slate-800 tabular-nums">{formatCurrency(decision.item.nominal_biaya)}</span>
                  </div>
                  {decision.item.is_rfah_required && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-slate-500">RFAH*</span>
                      <span className="font-semibold text-amber-700">{decision.item.rfah_name || 'Diperlukan'}</span>
                    </div>
                  )}
                </div>
              </div>

              {decision.action === 'reject' ? (
                <div>
                  <label htmlFor="reject-reason" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Alasan penolakan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="reject-reason"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={4}
                    disabled={decisionBusy}
                    placeholder="Jelaskan alasan pengajuan ditolak (wajib)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-400 resize-none"
                  />
                </div>
              ) : decision.action === 'revise' ? (
                <div>
                  <label htmlFor="revise-reason" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Catatan revisi <span className="text-orange-500">*</span>
                  </label>
                  <textarea
                    id="revise-reason"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={4}
                    disabled={decisionBusy}
                    placeholder="Jelaskan apa yang harus diperbaiki pengaju (wajib)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-400 resize-none"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Pengajuan akan dikembalikan ke pengaju dengan status <strong className="text-orange-600">Revisi</strong>. Pengaju dapat memperbaiki lalu mengirim ulang.</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                  Pengajuan ini akan berstatus <strong className="text-emerald-700">Approved</strong> setelah disetujui.
                </p>
              )}
            </div>
          )}
        </Modal>
        <ConfirmDialog
          open={showDeleteConfirm}
          onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
          onConfirm={confirmDelete}
          title="Hapus Pengajuan"
          message="Apakah Anda yakin ingin menghapus pengajuan ini? Tindakan ini tidak dapat dibatalkan."
          confirmLabel="Hapus"
          variant="danger"
        />
        <ConfirmDialog
          open={showDiscardConfirm}
          onClose={() => setShowDiscardConfirm(false)}
          onConfirm={() => { setShowDiscardConfirm(false); setOpenModal(false); setEditingId(null); setEditingStatus(null); }}
          title="Buang Perubahan?"
          message="Formulir belum disimpan. Gunakan Simpan Draft bila ingin melanjutkan nanti."
          confirmLabel="Buang"
          variant="warning"
        />
      </div>
    </DashboardLayout>
  );
}
