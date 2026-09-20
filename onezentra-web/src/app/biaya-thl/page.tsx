'use client';

import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import Image from 'next/image';
import DashboardLayout from '@/app/dashboard/layout';
import { biayaThl } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import { generateTHLPdf, previewTHLPdf } from '@/lib/biayaPdf';

interface DetailRow {
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
  order: number;
  photos: File[];
}

interface FormDetailRow extends DetailRow {
  groupId: string;
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
  draft: { label: 'Draft', badge: 'bg-gray-50 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  checked: { label: 'Checked', badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  approved: { label: 'Approved', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  revisi: { label: 'Revisi', badge: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500' },
};

const VEHICLE_TYPES = ['CDD', 'Fuso', 'Container 20', 'Container 40', 'Box', 'Pickup'];
const POSITIONS = ['THL HELPER', 'THL DRIVER', 'THL GUDANG'];

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

const normalizeThlDetail = (detail: DetailRow): DetailRow => {
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
  if (!detail.nopol_kendaraan.trim()) missing.push('Plat Kendaraan');
  if (!detail.type_kendaraan) missing.push('Type Kendaraan');
  if (!Number.isFinite(Number(detail.nominal_biaya)) || Number(detail.nominal_biaya) < 0) missing.push('Nominal Biaya');
  if (requiresDriverName(position)) {
    if (!detail.driver_name.trim()) missing.push('Nama Driver');
    if (Number(detail.kubikasi) <= 0) missing.push('Kubikasi');
    if (!detail.droppoint.trim()) missing.push('Droppoint');
  }
  if (requiresWorkHours(position)) {
    if (!detail.jam_datang) missing.push('Jam Datang');
    if (!detail.jam_pulang) missing.push('Jam Pulang');
  }
  return missing;
};

const isDetailReady = (detail: FormDetailRow): boolean => getMissingFields(detail).length === 0;

const formatCurrency = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
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

function DetailPhotoThumb({ photo }: { photo: File }) {
  const url = useMemo(() => URL.createObjectURL(photo), [photo]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
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
  const [formStep, setFormStep] = useState(1);

  const fetchItems = useCallback(async () => {
    try {
      const res = await biayaThl.list({ search, status: statusFilter, page, per_page: 50 });
      setItems(res.data.data || res.data);
      setTotalPages(res.data.last_page || 1);
    } catch {
      notifyGlobal('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const normalizedDetails = formData.details.map(normalizeThlDetail);
      const fd = new FormData();
      fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);
      normalizedDetails.forEach((d, i) => {
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
        fd.append(`details[${i}][order]`, String(i));
        d.photos.forEach((photo) => fd.append(`details[${i}][photos][]`, photo));
      });
      await biayaThl.create(fd);
      notifyGlobal('Biaya THL berhasil dibuat', 'success');
      setOpenModal(false);
      resetForm();
      fetchItems();
    } catch (e: unknown) {
      notifyGlobal((e as Error).message || 'Gagal membuat Biaya THL', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      const normalizedDetails = formData.details.map(normalizeThlDetail);
      const fd = new FormData();
      fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);
      fd.append('_method', 'PUT');
      normalizedDetails.forEach((d, i) => {
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
        fd.append(`details[${i}][order]`, String(i));
        d.photos.forEach((photo) => fd.append(`details[${i}][photos][]`, photo));
      });
      await biayaThl.update(editingId, fd);
      notifyGlobal('Biaya THL berhasil diperbarui', 'success');
      setOpenModal(false);
      setEditingId(null);
      resetForm();
      fetchItems();
    } catch (e: unknown) {
      notifyGlobal((e as Error).message || 'Gagal memperbarui Biaya THL', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus?')) return;
    try {
      await biayaThl.delete(id);
      notifyGlobal('Biaya THL berhasil dihapus', 'success');
      fetchItems();
    } catch {
      notifyGlobal('Gagal menghapus', 'error');
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
    setFormData(prev => {
      const groupRows = prev.details.filter(d => d.groupId === groupId);
      const source = groupRows.length > 0 ? groupRows[groupRows.length - 1] : null;
      if (source) {
        const duplicatedRow: FormDetailRow = {
          ...source,
          nama_thl: '',
          photos: [],
          groupId,
          order: prev.details.length,
        };
        return { ...prev, details: [...prev.details, duplicatedRow] };
      }
      return {
        ...prev,
        details: [...prev.details, createEmptyDetail(prev.details.length, '', groupId)],
      };
    });
  };

  const removeSjGroup = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      details: prev.details
        .filter((d) => d.groupId !== groupId)
        .map((d, i) => ({ ...d, order: i })),
    }));
  };

  const updateSjNumber = (groupId: string, value: string) => {
    setErrorSJGroupIndex((prev) => (prev === Object.values(sjGroups).findIndex((g) => g.groupId === groupId) ? null : prev));
    setFormData(prev => ({
      ...prev,
      details: prev.details.map((d) =>
        d.groupId === groupId ? { ...d, no_surat_jalan: value } : d
      ),
    }));
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
      newDetails[detailIndex] = { ...current, photos: current.photos.filter((_, j) => j !== photoIndex) };
      return { ...prev, details: newDetails };
    });
  };

  const totalNominal = formData.details.reduce((sum, d) => sum + (Number(d.nominal_biaya) || 0), 0);
  const totalKubikasi = formData.details.reduce((sum, d) => sum + (Number(d.kubikasi) || 0), 0);
  const isRfahRequired = totalNominal > 750000;
  const hasIncompleteThlRows = formData.details.some((detail) => !isDetailReady(detail));
  const [errorWorkerIndex, setErrorWorkerIndex] = useState<number | null>(null);
  const [errorSJGroupIndex, setErrorSJGroupIndex] = useState<number | null>(null);

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
      rfah_name: isRfahRequired ? 'Umi Marzuqoh' : '',
      status: 'draft',
      details: formData.details,
    });
  };

  const sjGroups = formData.details.reduce<Record<string, { groupId: string; sj: string; indices: number[] }>>((acc, d, i) => {
    const gid = d.groupId;
    if (!acc[gid]) acc[gid] = { groupId: gid, sj: d.no_surat_jalan, indices: [] };
    acc[gid].indices.push(i);
    return acc;
  }, {});

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

  const goToStep = (step: number) => {
    if (step === 3) {
      if (sjGroupError) {
        setErrorSJGroupIndex(sjGroupErrorInfo.groupIndex);
        setErrorWorkerIndex(null);
        notifyGlobal(sjGroupError, 'error');
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
          const workerNum = (formData.details.filter((d) => d.groupId === gid).findIndex((d) => d === firstIncomplete)) + 1;
          const missingFields = getMissingFields(firstIncomplete);
          notifyGlobal(
            `Pekerja ${workerNum}${sjGroupIdx >= 0 ? ` (Surat Jalan ${sjGroupIdx + 1})` : ''} belum lengkap: ${missingFields.join(', ')}.`,
            'error'
          );
          return;
        }
        notifyGlobal('Lengkapi semua data pekerja sebelum lanjut', 'error');
        return;
      }
    }
    setFormStep(step);
  };

  const openCreateModal = () => {
    setEditingId(null);
    resetForm();
    setFormStep(1);
    setOpenModal(true);
  };

  const openEditModal = (item: BiayaThlItem) => {
    setEditingId(item.id);
    const sjGroupIds = new Map<string, string>();
    const details = (item.details as unknown as DetailRow[]).map((d): FormDetailRow => {
      const sj = d.no_surat_jalan || '';
      if (!sjGroupIds.has(sj)) sjGroupIds.set(sj, createGroupId());
      return { ...d, photos: [], groupId: sjGroupIds.get(sj) as string } as FormDetailRow;
    });
    setFormData({
      tanggal_pengajuan: item.tanggal_pengajuan,
      details,
    });
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

  const totalNominalValue = items.reduce((sum, item) => sum + (Number(item.nominal_biaya) || 0), 0);
  const pendingCount = items.filter((item) => item.status === 'pending').length;
  const approvedCount = items.filter((item) => item.status === 'approved').length;

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
                <span className="rounded-md bg-primary-500 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{items.length}</span>
              </span>
            </div>
          </div>
        </header>

        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="px-2 py-1">
            <p className="text-xs text-slate-500">Total Nominal</p>
            <p className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{formatCurrency(totalNominalValue)}</p>
          </div>
          <div className="border-l border-slate-100 px-2 py-1 sm:pl-5">
            <p className="text-xs text-slate-500">Menunggu</p>
            <p className="mt-1 text-2xl font-bold text-amber-600 tabular-nums">{pendingCount}</p>
          </div>
          <div className="border-l border-slate-100 px-2 py-1 sm:pl-5">
            <p className="text-xs text-slate-500">Disetujui</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{approvedCount}</p>
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
            </select>
            <button onClick={openCreateModal} className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.98] sm:w-auto">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Buat Pengajuan
            </button>
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
                  <th scope="col" className="table-header">RFAH</th>
                  <th scope="col" className="table-header">Status</th>
                  <th scope="col" className="table-header text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="table-cell py-10">
                      <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                        <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        <span className="text-sm font-medium">Memuat data...</span>
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-cell py-12">
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
                      <td className="table-cell">{item.is_rfah_required ? <span className="text-amber-600 text-xs font-medium">{item.rfah_name}</span> : '-'}</td>
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
        <Modal open={openModal} onClose={() => { setOpenModal(false); setEditingId(null); }} title={editingId ? 'Edit Biaya THL' : 'Buat Biaya THL'} subtitle="Lengkapi pengajuan dalam 3 langkah sederhana" size="2xl" footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={() => { setOpenModal(false); setEditingId(null); }} className="btn-secondary w-full sm:w-auto">Batal</button>
            <button type="button" onClick={previewThl} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || !!sjGroupError} className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Preview PDF
            </button>
            <button type="button" onClick={editingId ? handleUpdate : handleCreate} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || !!sjGroupError} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
              {busy ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Buat Pengajuan'}
            </button>
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
                ].map((item) => (
                  <button key={item.step} type="button" onClick={() => goToStep(item.step)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${formStep === item.step ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-300 hover:bg-white/10'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${formStep === item.step ? 'bg-primary-600 text-white' : 'bg-white/10 text-white'}`}>{item.step}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black">{item.label}</span>
                      <span className={`mt-0.5 block truncate text-[10px] ${formStep === item.step ? 'text-slate-500' : 'text-slate-400'}`}>{item.note}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-200">Ringkasan live</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-slate-400">Total nominal</span><span className="text-sm font-black tabular-nums">{formatCurrency(totalNominal)}</span></div>
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-slate-400">Kubikasi</span><span className="text-sm font-black tabular-nums">{totalKubikasi} m³</span></div>
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
              { step: 3, label: 'Total & Submit', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> }
            ].map((s, i) => (
              <Fragment key={s.step}>
                <button type="button" onClick={() => goToStep(s.step)} className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${formStep === s.step ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : formStep > s.step ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-400'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${formStep === s.step ? 'bg-white text-primary-600' : formStep > s.step ? 'bg-primary-200 text-primary-700' : 'bg-gray-200 text-gray-400'}`}>
                    {formStep > s.step ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : s.step}
                  </div>
                  <span className="text-xs font-bold hidden sm:inline">{s.label}</span>
                </button>
                {i < 2 && <div className={`flex-1 h-0.5 mx-2 rounded ${formStep > s.step ? 'bg-primary-300' : 'bg-gray-200'}`} />}
              </Fragment>
            ))}
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
                  <input type="date" value={formData.tanggal_pengajuan} onChange={(e) => setFormData({ ...formData, tanggal_pengajuan: e.target.value })} className="w-full bg-white/80 backdrop-blur border-2 border-primary-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 transition-all" />
                </label>
              </div>

              <button type="button" onClick={() => goToStep(2)} disabled={!formData.tanggal_pengajuan} className="w-full py-3.5 bg-primary-600 text-white rounded-xl font-black text-sm hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-200 flex items-center justify-center gap-2">
                Lanjut ke Data Pekerja
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </button>
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
                  <p className="text-xs text-gray-500 mt-0.5">Input detail pekerja per Surat Jalan</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {formData.details.length > 0 && (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200 text-primary-700 px-3 py-1 text-xs font-bold whitespace-nowrap shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                      {formData.details.length} pekerja
                    </span>
                  )}
                  <button type="button" onClick={addSjGroup} className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-black text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200 shrink-0">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Surat Jalan
                  </button>
                </div>
              </div>

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
                    <div key={group.groupId} className={`rounded-2xl border bg-white overflow-hidden shadow-sm ${errorSJGroupIndex === gIdx ? 'border-red-300 ring-2 ring-red-200' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-3 px-4 sm:px-5 py-4 bg-linear-to-r from-gray-50 to-white border-b border-gray-100">
                        <div className="w-8 h-8 rounded-lg bg-white border border-primary-200 text-primary-700 flex items-center justify-center text-xs font-black shadow-sm shrink-0">
                          {gIdx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Nomor Surat Jalan <span className="text-red-400">*</span></label>
                          <input type="text" value={group.sj} onChange={(e) => updateSjNumber(group.groupId, e.target.value)} placeholder="Contoh: SJ-2025-0001" className={`w-full rounded-xl border px-3 py-2 font-mono text-sm font-bold text-gray-800 placeholder:text-gray-300 transition-colors focus:outline-none focus:ring-4 bg-white ${errorSJGroupIndex === gIdx ? 'border-red-400 focus:border-red-400 focus:ring-red-50' : 'border-slate-200 focus:border-primary-400 focus:ring-primary-50'}`} />
                        </div>
                        <span className="inline-flex items-center rounded-full bg-primary-100/70 text-primary-700 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0">{group.indices.length} pekerja</span>
                        <button type="button" onClick={() => removeSjGroup(group.groupId)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="Hapus Surat Jalan">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>

                      <div className="p-3 sm:p-4 space-y-2">
                        {group.indices.map((idx) => {
                          const detail = formData.details[idx];
                          const rowNum = group.indices.indexOf(idx) + 1;
                          return (
                            <div key={idx} className={`rounded-2xl border bg-white overflow-hidden shadow-sm ${errorWorkerIndex === idx ? 'border-red-300 ring-2 ring-red-200' : 'border-slate-200'}`}>
                              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
                                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-primary-500 to-primary-600 flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0">
                                  {rowNum}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-black text-slate-900 block truncate">{detail.nama_thl || `Data pekerja ${rowNum}`}</span>
                                  {errorWorkerIndex === idx ? (
                                    <span className="block text-[11px] font-bold text-red-600 mt-0.5">
                                      Kurang: {getMissingFields(detail).join(', ')}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-500 truncate block">Lengkapi semua kolom bertanda <span className="font-bold text-red-500">*</span></span>
                                  )}
                                </div>
                                <span className={`hidden rounded-full border px-2.5 py-1 text-[10px] font-black sm:inline-flex ${isDetailReady(detail) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                  {isDetailReady(detail) ? 'Siap' : 'Belum lengkap'}
                                </span>
                                <button type="button" onClick={() => removeDetail(idx)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="Hapus pekerja" aria-label={`Hapus pekerja ${rowNum}`}>
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>

                              <div className="space-y-6 px-4 py-5 sm:px-5">
                                {/* Data Pekerja */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                    </div>
                                    <h4 className="text-[11px] font-black text-gray-600 uppercase tracking-wider">Data Pekerja</h4>
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

                {/* Kendaraan */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                    </div>
                    <h4 className="text-[11px] font-black text-gray-600 uppercase tracking-wider">Kendaraan</h4>
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
                  {detail.posisi?.trim().toUpperCase() === 'THL GUDANG' && (
                    <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mt-4">
                      <input type="checkbox" checked={detail.kendaraan_tambahan} onChange={(e) => updateDetail(idx, 'kendaraan_tambahan', e.target.checked)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
                      Kendaraan Tambahan
                    </label>
                  )}
                </div>

                                {/* Biaya & Muatan */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                                    </div>
                                    <h4 className="text-[11px] font-black text-gray-600 uppercase tracking-wider">Biaya & Muatan</h4>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Nominal Biaya (Rp) <span className="text-red-400">*</span>
                                      </label>
                                      <input type="number" min="0" step="0.01" inputMode="decimal" value={detail.nominal_biaya || ''} onChange={(e) => updateDetail(idx, 'nominal_biaya', Number(e.target.value))} placeholder="0" title="Besaran biaya/honor THL dalam rupiah" className="input-field py-2 text-sm font-bold" />
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

                                {/* Jam Kerja */}
                                {requiresWorkHours(detail.posisi) && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      </div>
                                      <h4 className="text-[11px] font-black text-gray-600 uppercase tracking-wider">Jam Kerja</h4>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                          Jam Datang <span className="text-red-400">*</span>
                                        </label>
                                        <input type="datetime-local" value={detail.jam_datang} onChange={(e) => updateDetail(idx, 'jam_datang', e.target.value)} className="input-field py-2 text-sm" />
                                      </div>
                                      <div>
                                        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                          Jam Pulang <span className="text-red-400">*</span>
                                        </label>
                                        <input type="datetime-local" value={detail.jam_pulang} onChange={(e) => updateDetail(idx, 'jam_pulang', e.target.value)} className="input-field py-2 text-sm" />
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Foto */}
                                <div className="pt-1 border-t border-slate-100">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                                    </div>
                                    <h4 className="text-[11px] font-black text-gray-600 uppercase tracking-wider">Foto Pendukung</h4>
                                    <span className="ml-auto text-[10px] font-black text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{detail.photos.length}/{MAX_PHOTOS_PER_DETAIL}</span>
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
                                        <span className="text-xs font-bold text-gray-500">{detail.photos.length > 0 ? 'Ganti foto' : 'Upload foto (opsional)'}</span>
                                      </div>
                                      <input type="file" accept="image/jpeg,image/png,image/gif" className="sr-only" onChange={(e) => {
                                        const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS_PER_DETAIL);
                                        const valid = files.filter(f => f.size <= 2 * 1024 * 1024);
                                        if (valid.length < files.length) notifyGlobal('Foto melebihi 2MB', 'error');
                                        addDetailPhoto(idx, valid);
                                        e.target.value = '';
                                      }} />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>
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
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
                  <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">Periksa nomor Surat Jalan</p>
                    <p className="text-xs mt-0.5">{sjGroupError}</p>
                  </div>
                </div>
              )}

              {formData.details.length > 0 && (
                <button type="button" onClick={() => goToStep(3)} className="w-full py-3.5 bg-primary-600 text-white rounded-xl font-black text-sm hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 flex items-center justify-center gap-2">
                  Lanjut ke Total & Submit
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                </button>
              )}
            </div>
          )}

          {/* Step 3: Total & Submit */}
          {formStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={() => goToStep(2)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                </button>
                <h3 className="text-sm font-black text-gray-800">Ringkasan Pengajuan</h3>
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
                        <p className="text-[11px] text-amber-600">Total &gt; Rp 750.000 · Umi Marzuqoh</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-2">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">Detail Pekerja</h4>
                {formData.details.slice(0, 5).map((d, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="w-6 h-6 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-gray-800 block truncate">{d.nama_thl}</span>
                      <span className="text-[11px] text-gray-400">{d.nopol_kendaraan} · {d.posisi}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-600">{formatCurrency(Number(d.nominal_biaya))}</span>
                  </div>
                ))}
                {formData.details.length > 5 && (
                  <p className="text-[11px] text-gray-400 text-center pt-2">+{formData.details.length - 5} pekerja lainnya</p>
                )}
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
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4m0 4h.01" /></svg>
                    RFAH
                  </span>
                  <p className="text-sm text-slate-800 mt-1.5 font-semibold">{viewItem.is_rfah_required ? viewItem.rfah_name : '-'}</p>
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
      </div>
    </DashboardLayout>
  );
}
