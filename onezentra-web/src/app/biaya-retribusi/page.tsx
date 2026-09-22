'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { biayaRetribusi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import { generateRetribusiPdf, previewRetribusiPdf } from '@/lib/biayaPdf';
import { getBiayaConfig, BIAYA_CONFIG_FALLBACK, type BiayaConfig } from '@/lib/biaya';

interface ThlCandidate {
  id: number;
  biaya_thl_id: number;
  biaya_thl_detail_id: number;
  nama_thl: string;
  driver_name: string;
  nopol_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  nominal_biaya: number;
  kubikasi: number;
  droppoint: string;
  posisi: string;
}

interface DetailRow {
  biaya_thl_id: number;
  biaya_thl_detail_id: number;
  nopol_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  nominal_biaya: number;
  order: number;
  biaya_thl_detail?: {
    nama_thl?: string;
    driver_name?: string;
    kubikasi?: number;
    droppoint?: string;
    posisi?: string;
    jam_datang?: string;
    jam_pulang?: string;
    photos?: { file_path?: string; file_name?: string }[];
  } | null;
}

interface ManualDetailRow {
  nopol_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  nominal_biaya: number;
}

interface DocumentRow {
  document_type: string;
  file: File | null;
  file_name: string;
}

interface BiayaRetribusiItem {
  id: number;
  tanggal_pengajuan: string;
  kode_depo: string;
  nama_depo: string;
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
  documents: { document_type: string; file_name: string; file_path?: string }[];
}

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  draft: { label: 'Draft', badge: 'bg-gray-50 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  checked: { label: 'Checked', badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  approved: { label: 'Approved', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  revisi: { label: 'Revisi', badge: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500' },
};

const DOCUMENT_TYPES = [
  { value: 'BA', label: 'BA (Berita Acara)' },
  { value: 'SJ', label: 'Surat Jalan' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'manifest', label: 'Manifest' },
  { value: 'lainnya', label: 'Dokumen Lain' },
];

const VEHICLE_TYPES = ['CDD', 'Fuso', 'Container 20', 'Container 40'];

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

function ApprovalStepper({ item }: { item: BiayaRetribusiItem }) {
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
              <p className="text-xs text-amber-700 mt-0.5">Nominal melebihi Rp 1.000.000, memerlukan pemantauan {item.rfah_name || '-'}.</p>
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

export default function BiayaRetribusiPage() {
  const { user, hasPermission } = useAuthStore();
  const [biayaConfig, setBiayaConfig] = useState<BiayaConfig>(BIAYA_CONFIG_FALLBACK);

  useEffect(() => { getBiayaConfig(user?.kode_depo).then(setBiayaConfig).catch(() => {}); }, [user?.kode_depo]);
  const [items, setItems] = useState<BiayaRetribusiItem[]>([]);
  const [decision, setDecision] = useState<{ action: 'approve' | 'reject' | 'revise'; item: BiayaRetribusiItem } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openModal, setOpenModal] = useState(false);
  const [viewItem, setViewItem] = useState<BiayaRetribusiItem | null>(null);
  const [candidates, setCandidates] = useState<ThlCandidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [formData, setFormData] = useState<{ tanggal_pengajuan: string; details: DetailRow[]; documents: DocumentRow[] }>({ tanggal_pengajuan: '', details: [], documents: [] });
  const [manualDetails, setManualDetails] = useState<ManualDetailRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await biayaRetribusi.list({ search, status: statusFilter, page, per_page: 50 });
      setItems(res.data.data || res.data);
      setTotalPages(res.data.last_page || 1);
    } catch {
      notifyGlobal('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const fetchCandidates = async () => {
    setBusy(true);
    try {
      const res = await biayaRetribusi.candidates({});
      setCandidates(res.data || []);
      setSelectedCandidates([]);
    } catch {
      notifyGlobal('Gagal memuat kandidat', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);

      selectedCandidates.forEach((cId, i) => {
        const c = candidates.find((c2) => c2.id === cId);
        if (!c) return;
        fd.append(`details[${i}][biaya_thl_id]`, String(c.biaya_thl_id));
        fd.append(`details[${i}][biaya_thl_detail_id]`, String(c.biaya_thl_detail_id));
        fd.append(`details[${i}][nopol_kendaraan]`, c.nopol_kendaraan);
        fd.append(`details[${i}][type_kendaraan]`, c.type_kendaraan);
        fd.append(`details[${i}][no_surat_jalan]`, c.no_surat_jalan || '');
        fd.append(`details[${i}][nominal_biaya]`, String(c.nominal_biaya));
        fd.append(`details[${i}][order]`, String(i));
      });

      manualDetails.forEach((md, i) => {
        const idx = selectedCandidates.length + i;
        fd.append(`details[${idx}][nopol_kendaraan]`, md.nopol_kendaraan);
        fd.append(`details[${idx}][type_kendaraan]`, md.type_kendaraan);
        fd.append(`details[${idx}][no_surat_jalan]`, md.no_surat_jalan);
        fd.append(`details[${idx}][nominal_biaya]`, String(md.nominal_biaya));
        fd.append(`details[${idx}][order]`, String(idx));
      });

      formData.documents.forEach((doc, i) => {
        if (doc.file) {
          fd.append(`files[${i}]`, doc.file);
        }
      });

      await biayaRetribusi.create(fd);
      notifyGlobal('Biaya Retribusi berhasil dibuat', 'success');
      setOpenModal(false);
      setSelectedCandidates([]);
      setCandidates([]);
      setManualDetails([]);
      setFormData({ tanggal_pengajuan: '', details: [], documents: [] });
      fetchItems();
    } catch (e: unknown) {
      notifyGlobal((e as Error).message || 'Gagal membuat Biaya Retribusi', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);
      fd.append('_method', 'PUT');

      formData.details.forEach((d, i) => {
        fd.append(`details[${i}][biaya_thl_id]`, String(d.biaya_thl_id || ''));
        fd.append(`details[${i}][biaya_thl_detail_id]`, String(d.biaya_thl_detail_id || ''));
        fd.append(`details[${i}][nopol_kendaraan]`, d.nopol_kendaraan);
        fd.append(`details[${i}][type_kendaraan]`, d.type_kendaraan);
        fd.append(`details[${i}][no_surat_jalan]`, d.no_surat_jalan || '');
        fd.append(`details[${i}][nominal_biaya]`, String(d.nominal_biaya));
        fd.append(`details[${i}][order]`, String(i));
      });

      manualDetails.forEach((md, i) => {
        const idx = formData.details.length + i;
        fd.append(`details[${idx}][nopol_kendaraan]`, md.nopol_kendaraan);
        fd.append(`details[${idx}][type_kendaraan]`, md.type_kendaraan);
        fd.append(`details[${idx}][no_surat_jalan]`, md.no_surat_jalan);
        fd.append(`details[${idx}][nominal_biaya]`, String(md.nominal_biaya));
        fd.append(`details[${idx}][order]`, String(idx));
      });

      formData.documents.forEach((doc, i) => {
        if (doc.file) {
          fd.append(`files[${i}]`, doc.file);
        }
      });

      await biayaRetribusi.update(editingId, fd);
      notifyGlobal('Biaya Retribusi berhasil diperbarui', 'success');
      setOpenModal(false);
      setEditingId(null);
      setManualDetails([]);
      fetchItems();
    } catch (e: unknown) {
      notifyGlobal((e as Error).message || 'Gagal memperbarui', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus?')) return;
    try {
      await biayaRetribusi.delete(id);
      notifyGlobal('Biaya Retribusi berhasil dihapus', 'success');
      fetchItems();
    } catch {
      notifyGlobal('Gagal menghapus', 'error');
    }
  };

  const downloadPdf = (item: BiayaRetribusiItem) => {
    try {
      generateRetribusiPdf(item);
    } catch {
      notifyGlobal('Gagal generate PDF', 'error');
    }
  };

  const approvalAction = async (action: 'submit' | 'check' | 'rfahApprove') => {
    if (!viewItem) return;
    try {
      const response = action === 'submit'
        ? await biayaRetribusi.submit(viewItem.id)
        : action === 'check'
          ? await biayaRetribusi.check(viewItem.id)
          : await biayaRetribusi.rfahApprove(viewItem.id);
      setViewItem((response as { data: { data: BiayaRetribusiItem } }).data.data);
      await fetchItems();
      notifyGlobal('Status pengajuan berhasil diperbarui', 'success');
    } catch {
      notifyGlobal('Aksi approval tidak dapat diproses', 'error');
    }
  };

  const openDecision = (action: 'approve' | 'reject' | 'revise', item: BiayaRetribusiItem) => {
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
        ? await biayaRetribusi.approve(decision.item.id)
        : decision.action === 'revise'
          ? await biayaRetribusi.revise(decision.item.id, decisionReason)
          : await biayaRetribusi.reject(decision.item.id, decisionReason);
      setViewItem((response as { data: { data: BiayaRetribusiItem } }).data.data);
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

  const toggleCandidate = (id: number) => {
    setSelectedCandidates((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const totalNominal = selectedCandidates.reduce((sum, id) => {
    const c = candidates.find((c2) => c2.id === id);
    return sum + (Number(c?.nominal_biaya) || 0);
  }, 0) + manualDetails.reduce((sum, md) => sum + (Number(md.nominal_biaya) || 0), 0);
  const isRfahRequired = totalNominal > biayaConfig.retribusi_rfah_threshold;
  const hasIncompleteManualRows = manualDetails.some((row) => !row.nopol_kendaraan || !row.type_kendaraan || Number(row.nominal_biaya || 0) <= 0);

  const previewRetribusi = () => {
    if (!formData.tanggal_pengajuan) return;
    const candidateDetails = selectedCandidates.flatMap((id) => {
      const candidate = candidates.find((item) => item.id === id);
      if (!candidate) return [];
      return [{
        nopol_kendaraan: candidate.nopol_kendaraan,
        type_kendaraan: candidate.type_kendaraan,
        no_surat_jalan: candidate.no_surat_jalan || '',
        nominal_biaya: candidate.nominal_biaya,
        biaya_thl_detail: {
          nama_thl: candidate.nama_thl || candidate.driver_name || '-',
          driver_name: candidate.driver_name || '',
          kubikasi: candidate.kubikasi || 0,
          droppoint: candidate.droppoint || '0',
          posisi: candidate.posisi || 'THL GUDANG',
          jam_datang: '',
          jam_pulang: '',
          photos: [],
        },
      }];
    });
    previewRetribusiPdf({
      tanggal_pengajuan: formData.tanggal_pengajuan,
      kode_depo: user?.kode_depo ?? '',
      nama_depo: user?.nama_depo ?? '',
      nominal_biaya: totalNominal,
      is_rfah_required: isRfahRequired,
      rfah_name: isRfahRequired ? biayaConfig.rfah_name : '',
      status: 'draft',
      details: [...candidateDetails, ...manualDetails.map((item) => ({ ...item, biaya_thl_detail: null }))],
      documents: formData.documents.map((document) => ({ document_type: document.document_type, file_name: document.file_name })),
    });
  };

  const addManualDetail = () => {
    setManualDetails([...manualDetails, { nopol_kendaraan: '', type_kendaraan: '', no_surat_jalan: '', nominal_biaya: 0 }]);
  };

  const updateManualDetail = (index: number, field: keyof ManualDetailRow, value: string | number) => {
    setManualDetails(prev => prev.map((md, i) => i === index ? { ...md, [field]: value } : md));
  };

  const removeManualDetail = (index: number) => {
    setManualDetails(prev => prev.filter((_, i) => i !== index));
  };

  const addDocument = () => {
    setFormData(prev => ({
      ...prev,
      documents: [...prev.documents, { document_type: 'BA', file: null, file_name: '' }],
    }));
  };

  const updateDocument = (index: number, field: keyof DocumentRow, value: string | File | null) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.map((doc, i) => i === index ? { ...doc, [field]: value } : doc),
    }));
  };

  const removeDocument = (index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  const openCreateModal = () => {
    setEditingId(null);
    setSelectedCandidates([]);
    setCandidates([]);
    setManualDetails([]);
    setFormData({ tanggal_pengajuan: '', details: [], documents: [] });
    setOpenModal(true);
  };

  const openEditModal = (item: BiayaRetribusiItem) => {
    setEditingId(item.id);
    setFormData({
      tanggal_pengajuan: item.tanggal_pengajuan,
      details: item.details.map((d) => ({ ...d })),
      documents: (item.documents || []).map((doc: unknown) => {
        const d = doc as { document_type: string; file_path: string; file_name: string };
        return { document_type: d.document_type, file: null, file_name: d.file_name };
      }),
    });
    setManualDetails([]);
    setOpenModal(true);
  };

  const openViewModal = (item: BiayaRetribusiItem) => {
    setViewItem(item);
  };

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
                <svg className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Biaya Retribusi</h1>
                <p className="mt-0.5 text-gray-400">Queue pengajuan biaya retribusi berbasis kandidat THL</p>
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
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari nopol, depo..." />
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
                      <td className="px-5 py-3 text-sm text-slate-600">{item.nama_depo}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-slate-800 tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</td>
                      <td className="table-cell">{item.is_rfah_required ? <span className="text-amber-600 text-xs font-medium">{item.rfah_name}</span> : '-'}</td>
                      <td className="px-5 py-3">{badge(item.status)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewModal(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Lihat" aria-label="Lihat">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </button>
                          {hasPermission('biaya_retribusi.edit') && (
                          <button onClick={() => openEditModal(item)} className="min-h-[44px] min-w-[44px] p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Edit" aria-label="Edit">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                          </button>
                          )}
                          {hasPermission('biaya_retribusi.delete') && (
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
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{item.nama_depo}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(item.tanggal_pengajuan)}</p>
                    </div>
                  </div>
                  {badge(item.status)}
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {item.is_rfah_required && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                        RFAH
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</span>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button onClick={() => openViewModal(item)} className="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Lihat
                  </button>
                   {hasPermission('biaya_retribusi.edit') && (
                   <button onClick={() => openEditModal(item)} className="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-sm font-semibold text-amber-600 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                     Edit
                   </button>
                   )}
                   {hasPermission('biaya_retribusi.delete') && (
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

        {/* Create/Edit Modal */}
        <Modal open={openModal} onClose={() => { setOpenModal(false); setEditingId(null); }} title={editingId ? 'Edit Biaya Retribusi' : 'Buat Biaya Retribusi'} subtitle="Pilih sumber biaya, lampirkan dokumen, lalu kirim pengajuan" size="2xl" footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={() => { setOpenModal(false); setEditingId(null); }} className="btn-secondary w-full sm:w-auto">Batal</button>
            <button type="button" onClick={previewRetribusi} disabled={busy || !formData.tanggal_pengajuan || (selectedCandidates.length === 0 && manualDetails.length === 0) || hasIncompleteManualRows} className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Preview PDF
            </button>
            <button type="button" onClick={editingId ? handleUpdate : handleCreate} disabled={busy || !formData.tanggal_pengajuan || (!editingId && selectedCandidates.length === 0 && manualDetails.length === 0) || hasIncompleteManualRows} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
              {busy ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Buat Pengajuan'}
            </button>
          </div>
        }>
          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="hidden rounded-3xl bg-slate-950 p-5 text-white shadow-xl lg:block">
              <div className="mb-8">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-200">Retribusi Claim</span>
                <h3 className="mt-4 text-xl font-black tracking-tight">Susun biaya dengan cepat.</h3>
                <p className="mt-2 text-xs leading-5 text-slate-300">Gunakan kandidat THL atau tambahkan baris manual, lalu lampirkan dokumen pendukung.</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Informasi', note: formData.tanggal_pengajuan ? 'Tanggal sudah diisi' : 'Menunggu tanggal', active: !formData.tanggal_pengajuan },
                  { label: 'Sumber biaya', note: `${selectedCandidates.length + manualDetails.length} baris dipilih`, active: formData.tanggal_pengajuan && selectedCandidates.length + manualDetails.length > 0 },
                  { label: 'Lampiran', note: `${formData.documents.length} dokumen`, active: formData.documents.length > 0 },
                ].map((item, index) => (
                  <div key={item.label} className={`flex items-center gap-3 rounded-2xl p-3 ${item.active ? 'bg-white/15' : ''}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${item.active ? 'bg-primary-500 text-white' : 'bg-white/10 text-slate-300'}`}>{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black">{item.label}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">{item.note}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-200">Total pengajuan</p>
                <p className="mt-2 text-2xl font-black tabular-nums">{formatCurrency(totalNominal)}</p>
                <p className="mt-1 text-[10px] text-slate-400">{isRfahRequired ? 'RFAH diperlukan untuk pengajuan ini' : 'Belum melewati ambang RFAH'}</p>
              </div>
            </aside>
            <div className="min-w-0">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Alur pengajuan</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">Data utama <span className="text-slate-300">→</span> Sumber biaya <span className="text-slate-300">→</span> Lampiran</p>
                </div>
                <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[10px] font-black text-primary-700">
                  {selectedCandidates.length + manualDetails.length} baris
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-linear-to-r from-primary-500 to-indigo-500 transition-all"
                  style={{ width: `${formData.tanggal_pengajuan && selectedCandidates.length + manualDetails.length > 0 ? (formData.documents.length > 0 ? 100 : 66) : formData.tanggal_pengajuan ? 33 : 8}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-400">
                <span className={formData.tanggal_pengajuan ? 'text-primary-700' : ''}>1. Informasi</span>
                <span className={selectedCandidates.length + manualDetails.length > 0 ? 'text-primary-700' : ''}>2. Biaya</span>
                <span className={formData.documents.length > 0 ? 'text-primary-700' : ''}>3. Lampiran</span>
              </div>
            </div>

            {/* Depo Badge */}
            <div className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-linear-to-r from-primary-50 to-indigo-50 p-4 sm:flex-row sm:items-center">
              <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-primary-600 uppercase tracking-wider">Depo Aktif</p>
                <p className="text-sm font-bold text-gray-900 truncate">{user?.kode_depo} — {user?.nama_depo}</p>
              </div>
            </div>

            {/* Tanggal */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                Tanggal Pengajuan <span className="text-red-500">*</span>
              </label>
              <input type="date" value={formData.tanggal_pengajuan} onChange={(e) => setFormData({ ...formData, tanggal_pengajuan: e.target.value })} className="input-field py-3 text-sm" />
            </div>

            {/* Pilih Kandidat */}
            {!editingId && (
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                  Pilih Kandidat THL
                  {selectedCandidates.length > 0 && (
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700">{selectedCandidates.length} dipilih</span>
                  )}
                </label>

                <button onClick={() => fetchCandidates()} disabled={busy} className="w-full mb-3 rounded-xl bg-primary-600 text-white py-2.5 text-sm font-bold hover:bg-primary-700 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>}
                  {busy ? 'Mencari...' : 'Muat Kandidat dari Biaya THL'}
                </button>

                {candidates.length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-xl border border-gray-200 shadow-sm">
                    <table className="min-w-[720px] w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          <th className="table-header text-center w-10">
                            <input type="checkbox" checked={selectedCandidates.length === candidates.length} onChange={() => setSelectedCandidates(selectedCandidates.length === candidates.length ? [] : candidates.map(c => c.id))} className="rounded border-gray-300 text-primary-600 w-4 h-4" />
                          </th>
                          <th className="table-header">Nama THL</th>
                          <th className="table-header">Nopol</th>
                          <th className="table-header">Type</th>
                          <th className="table-header">No. SJ</th>
                          <th className="table-header text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {candidates.map((c) => (
                          <tr key={c.id} className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${selectedCandidates.includes(c.id) ? 'bg-primary-50/50' : ''}`} onClick={() => toggleCandidate(c.id)}>
                            <td className="table-cell text-center"><input type="checkbox" checked={selectedCandidates.includes(c.id)} onChange={() => toggleCandidate(c.id)} className="rounded border-gray-300 text-primary-600 w-4 h-4" onClick={(e) => e.stopPropagation()} /></td>
                            <td className="table-cell font-medium">{c.nama_thl}</td>
                            <td className="table-cell font-mono">{c.nopol_kendaraan}</td>
                            <td className="table-cell">{c.type_kendaraan}</td>
                            <td className="table-cell font-mono text-gray-500">{c.no_surat_jalan || '-'}</td>
                            <td className="table-cell text-right font-semibold">{formatCurrency(Number(c.nominal_biaya))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Baris Manual */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  Baris Manual
                  {manualDetails.length > 0 && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{manualDetails.length}</span>
                  )}
                </label>
                <button type="button" onClick={addManualDetail} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Tambah
                </button>
              </div>

              {manualDetails.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                  <p className="text-xs text-gray-400">Belum ada baris manual</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {manualDetails.map((md, i) => (
                    <details key={i} open className="group relative rounded-lg border border-gray-100 bg-white">
                      <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors list-none">
                        <div className="w-6 h-6 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-gray-800 block truncate">{md.nopol_kendaraan || `Manual #${i + 1}`}</span>
                          <span className="text-[11px] text-gray-400">{md.type_kendaraan || 'Pilih type'} · {formatCurrency(Number(md.nominal_biaya) || 0)}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </summary>
                      <button type="button" onClick={() => removeManualDetail(i)} className="absolute right-10 top-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus baris manual ${i + 1}`}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>

                      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Plat Kendaraan <span className="text-red-400">*</span>
                            </label>
                            <input type="text" value={md.nopol_kendaraan} onChange={(e) => updateManualDetail(i, 'nopol_kendaraan', e.target.value)} placeholder="KB 1234 XX" className="input-field py-2 text-sm font-mono uppercase" />
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Type Kendaraan <span className="text-red-400">*</span>
                            </label>
                            <select value={md.type_kendaraan} onChange={(e) => updateManualDetail(i, 'type_kendaraan', e.target.value)} className="select-field py-2 text-sm">
                              <option value="">Pilih</option>
                              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              No. SJ
                            </label>
                            <input type="text" value={md.no_surat_jalan} onChange={(e) => updateManualDetail(i, 'no_surat_jalan', e.target.value)} placeholder="Nomor SJ" className="input-field py-2 text-sm font-mono" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Nominal (Rp) <span className="text-red-400">*</span>
                            </label>
                            <input type="number" min="0" value={md.nominal_biaya || ''} onChange={(e) => updateManualDetail(i, 'nominal_biaya', Number(e.target.value))} placeholder="0" className="input-field py-2 text-sm font-bold" />
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>

            {/* Dokumen Lampiran */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
                  Dokumen Lampiran
                  {formData.documents.length > 0 && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{formData.documents.length}</span>
                  )}
                </label>
                <button type="button" onClick={addDocument} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Tambah
                </button>
              </div>

              {formData.documents.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                  <p className="text-xs text-gray-400">Belum ada dokumen lampiran</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {formData.documents.map((doc, i) => (
                    <details key={i} open className="group relative rounded-lg border border-gray-100 bg-white">
                      <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors list-none">
                        <div className="w-6 h-6 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-600 shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-gray-800 block truncate">{doc.file_name || `Dokumen #${i + 1}`}</span>
                          <span className="text-[11px] text-gray-400">{DOCUMENT_TYPES.find(dt => dt.value === doc.document_type)?.label || 'Pilih tipe'}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </summary>
                      <button type="button" onClick={() => removeDocument(i)} className="absolute right-10 top-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus dokumen ${i + 1}`}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>

                      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Tipe Dokumen <span className="text-red-400">*</span>
                            </label>
                            <select value={doc.document_type} onChange={(e) => updateDocument(i, 'document_type', e.target.value)} className="select-field py-2 text-sm">
                              {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              File <span className="text-red-400">*</span>
                            </label>
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" id={`doc-file-${i}`} onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                updateDocument(i, 'file', file);
                                updateDocument(i, 'file_name', file.name);
                              }
                            }} />
                            <label htmlFor={`doc-file-${i}`} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 hover:border-primary-400 hover:bg-primary-50/50 cursor-pointer transition-colors">
                              <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.939A4 4 0 1118.8 7.372l-10.94 10.938a2.5 2.5 0 01-3.536-3.536l10.94-10.938a1 1 0 011.414 1.414l-10.94 10.938a.5.5 0 01-.707-.707l7.693-7.693a1 1 0 011.414 1.414z" /></svg>
                              {doc.file_name || 'Pilih file (PDF, JPG, PNG, WEBP)'}
                            </label>
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>

            {/* Total */}
            <div className={`rounded-2xl border-2 p-4 transition-all sm:p-5 ${isRfahRequired ? 'border-amber-300 bg-linear-to-r from-amber-50 via-orange-50 to-amber-50 shadow-amber-100/50 shadow-lg' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isRfahRequired ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-500'}`}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659 1.171-1.671a4.5 4.5 0 015.07-1.651 3 3 0 011.482 5.369L12 12" /></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Pengajuan</p>
                    <p className="text-xl font-black text-gray-900 tabular-nums">{formatCurrency(totalNominal)}</p>
                    <p className="text-[11px] text-gray-400">{selectedCandidates.length + manualDetails.length} kandidat terpilih</p>
                  </div>
                </div>
                {isRfahRequired && (
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                      RFAH Required
                    </span>
                    <p className="text-[11px] text-amber-600 mt-1 font-medium">Total &gt; Rp {biayaConfig.retribusi_rfah_threshold.toLocaleString('id-ID')}</p>
                    <p className="text-[10px] font-bold text-amber-500 mt-0.5">{biayaConfig.rfah_name}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
            </div>
          </div>
        </Modal>

        {/* View Modal */}
        <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Biaya Retribusi" subtitle="Informasi lengkap pengajuan" size="lg" footer={
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3">
            {viewItem?.status === 'draft' || viewItem?.status === 'rejected' || viewItem?.status === 'revisi' ? (viewItem?.created_by === user?.id && hasPermission('approval.submit') ? <button onClick={() => void approvalAction('submit')} className="btn-secondary w-full sm:w-auto">Kirim</button> : null) : null}
            {viewItem?.status === 'pending' ? <>{hasPermission('approval.check') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}{hasPermission('approval.check') ? <button onClick={() => void approvalAction('check')} className="btn-secondary w-full sm:w-auto">Periksa</button> : null}</> : null}
            {viewItem?.status === 'checked' && viewItem ? <>{hasPermission('approval.reject') ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600">Perlu Revisi</button> : null}{hasPermission('approval.approve') ? <button onClick={() => openDecision('approve', viewItem)} className="btn-primary w-full sm:w-auto">Setujui</button> : null}</> : null}
            {viewItem?.status === 'rlh_approved' ? <>{hasPermission('approval.rfah') ? <button onClick={() => void approvalAction('rfahApprove')} className="btn-primary w-full sm:w-auto">Setujui RFAH</button> : null}{hasPermission('approval.reject') ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}</> : null}
            {viewItem?.status === 'approved' ? <button onClick={() => downloadPdf(viewItem)} className="btn-primary inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Cetak PDF
            </button> : null}
            <button onClick={() => setViewItem(null)} className="btn-secondary w-full sm:w-auto">Tutup</button>
          </div>
        }>
          {viewItem && (
            <div className="space-y-5">
              {/* Dark header card */}
              <div className="rounded-2xl bg-slate-950 p-5 sm:p-6 text-white shadow-lg">
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-900 shadow-lg ring-1 ring-white/20">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-300/80">Biaya Retribusi</p>
                      <p className="mt-1 text-base sm:text-lg font-black tracking-tight text-white truncate">{viewItem.nama_depo}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                        <span className="font-mono text-gray-300">{viewItem.kode_depo}</span>
                        <span className="text-gray-600">•</span>
                        <span>Total <strong className="font-semibold text-slate-200 tabular-nums">{formatCurrency(viewItem.nominal_biaya)}</strong></span>
                        <span className="text-gray-600">•</span>
                        <span>{viewItem.details?.length || 0} detail</span>
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
                    Tanggal
                  </span>
                  <p className="text-sm text-slate-800 mt-1.5 font-semibold">{formatDate(viewItem.tanggal_pengajuan)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    Depo
                  </span>
                  <p className="text-sm text-slate-800 mt-1.5 font-semibold break-words">{viewItem.nama_depo}</p>
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
                    <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-800">Detail Retribusi</h3>
                    <span className="ml-auto inline-flex items-center rounded-full bg-primary-50 border border-primary-100 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">
                      {viewItem.details.length} baris
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="table-header text-center">#</th>
                          <th className="table-header">Nama THL</th>
                          <th className="table-header">Nopol</th>
                          <th className="table-header">Type</th>
                          <th className="table-header">No. SJ</th>
                          <th className="table-header text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewItem.details.map((d, i) => (
                          <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                            <td className="table-cell text-center font-bold text-slate-400">{i + 1}</td>
                            <td className="table-cell font-semibold text-slate-800">{d.biaya_thl_detail?.nama_thl || d.nopol_kendaraan || '-'}</td>
                            <td className="table-cell font-mono">{d.nopol_kendaraan || '-'}</td>
                            <td className="table-cell">{d.type_kendaraan || '-'}</td>
                            <td className="table-cell font-mono text-slate-600">{d.no_surat_jalan || '-'}</td>
                            <td className="table-cell text-right font-bold text-slate-800 tabular-nums">{formatCurrency(Number(d.nominal_biaya))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Documents */}
              {viewItem.documents && (viewItem.documents as unknown[]).length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-5 w-1 rounded-full bg-primary-500" aria-hidden="true" />
                    <h3 className="text-xs font-black uppercase tracking-[0.14em] text-gray-800">Lampiran Dokumen</h3>
                  </div>
                  <div className="space-y-2">
                    {(viewItem.documents as { document_type: string; file_name: string }[]).map((doc, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-700">{doc.document_type.toUpperCase()}</p>
                          <p className="text-[11px] text-gray-500 truncate">{doc.file_name}</p>
                        </div>
                      </div>
                    ))}
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
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-300/80">Biaya Retribusi</p>
                    <p className="text-sm font-bold truncate">{decision.item.nama_depo}</p>
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
