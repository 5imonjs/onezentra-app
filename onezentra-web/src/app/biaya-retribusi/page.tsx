'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { biayaRetribusi, retribusiRates, getErrorMessage, compressPdf } from '@/lib/api';
import { AUTHENTICATED_FILE_REL, storageFileUrl } from '@/lib/storageFile';
import { pageWindow } from '@/lib/pagination';
import { useAuthStore } from '@/store/auth';
import { todayLocal } from '@/lib/dates';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { generateRetribusiPdf, previewRetribusiPdf, type ApprovalSection } from '@/lib/biayaPdf';
import { getBiayaConfigFresh, getBiayaConfigFreshWithStatus, clearBiayaConfigCache, BIAYA_CONFIG_FALLBACK, type BiayaConfig } from '@/lib/biaya';
import ApprovalPipeline, { type ApprovalPipelineStep } from '@/components/ApprovalPipeline';

interface ReceivingCandidate {
  id: number;
  receiving_id: number;
  tanggal_selesai: string;
  nopol_kendaraan: string;
  type_kendaraan: string;
  po_transporter: string;
  driver_name: string;
  checker_name: string;
  kode_depo: string;
  nama_depo: string;
  no_surat_jalan: string;
  /** Hasil bersih penerimaan — otomatis dari receiving, bukan input. */
  qty_zak: number;
  qty_crt: number;
}

interface DetailRow {
  biaya_thl_id: number;
  biaya_thl_detail_id: number;
  receiving_id?: number | null;
  nopol_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  qty_zak?: number;
  qty_crt?: number;
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
  qty_zak: number;
  qty_crt: number;
  nominal_biaya: number;
}

interface DocumentRow {
  id?: number;
  document_type: string;
  file: File | null;
  file_name: string;
  file_path?: string;
  file_size?: number;
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
  approval_sections?: ApprovalSection[];
  status: string;
  created_by: number;
  submitted_at: string | null;
  checked_at: string | null;
  rlh_approved_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  revised_at: string | null;
  revisi_reason: string | null;
  submittedBy?: { id: number; full_name: string } | null;
  checkedBy?: { id: number; full_name: string } | null;
  rlhApprovedBy?: { id: number; full_name: string } | null;
  approvedBy?: { id: number; full_name: string; level?: string } | null;
  rejectedBy?: { id: number; full_name: string; level?: string } | null;
  revisedBy?: { id: number; full_name: string; level?: string } | null;
  details: DetailRow[];
  documents: { id?: number; document_type: string; file_name: string; file_path?: string; file_size?: number }[];
  approvalHistories?: ApprovalHistoryItem[] | null;
}

/** Laravel 13 me-snake-case kunci relasi (submittedBy -> submitted_by, menimpa FK).
 * Normalizer ini memulihkan bentuk camel + created_by numerik (pola THL). */
const normalizeBiayaRetribusiItem = (item: BiayaRetribusiItem): BiayaRetribusiItem => {
  const raw = item as unknown as Record<string, { id?: number; full_name?: string; level?: string } | number | null | undefined>;
  const pickBy = (key: string): { id: number; full_name: string; level?: string } | null => {
    const v = raw[key] as { id?: number; full_name?: string; level?: string } | null | undefined;
    if (v && typeof v === 'object' && typeof v.id === 'number') {
      return { id: v.id, full_name: v.full_name ?? '', level: v.level };
    }
    return null;
  };
  const createdRaw = raw['created_by'];
  return {
    ...item,
    created_by: typeof createdRaw === 'object' && createdRaw !== null && typeof createdRaw.id === 'number'
      ? createdRaw.id
      : Number(createdRaw) || 0,
    submittedBy: item.submittedBy ?? pickBy('submitted_by'),
    checkedBy: item.checkedBy ?? pickBy('checked_by'),
    rlhApprovedBy: item.rlhApprovedBy ?? pickBy('rlh_approved_by'),
    approvedBy: item.approvedBy ?? pickBy('approved_by'),
    rejectedBy: item.rejectedBy ?? pickBy('rejected_by'),
    revisedBy: item.revisedBy ?? pickBy('revised_by'),
    details: Array.isArray(item.details) ? item.details : [],
    documents: Array.isArray(item.documents) ? item.documents : [],
  };
};

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  draft: { label: 'Draft', badge: 'bg-surface-raised text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  checked: { label: 'Checked', badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  rlh_approved: { label: 'Disetujui RLH', badge: 'bg-chip-primary text-accent-text ring-brand-wash-strong', dot: 'bg-primary-500' },
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

/** Plat/SJ/type kendaraan selalu kapital (ketikan user dinormalkan saat input). */
const upper = (value: string | null | undefined): string => (value || '').toString().trim().toUpperCase();

/**
 * Normalisasi ke input[date] (YYYY-MM-DD). API mengembalikan ISO datetime
 * sehingga nilai mentah membuat input tanggal tampil kosong saat edit.
 */
const toDateInputValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

/** State tiap tahap pengajuan untuk pipeline ringkas di daftar. RFAH tampil
 *  bila is_rfah_required (senada chip RFAH); saat status rlh_approved tahap
 *  RFAH menjadi yang menunggu. Sumber timestamp sama dengan modal detail. */
const retribusiPipelineSteps = (item: BiayaRetribusiItem): ApprovalPipelineStep[] => {
  const rejected = item.status === 'rejected';
  const revised = item.status === 'revisi';
  const revisionAtBac = revised && (item.revisedBy?.level?.toLowerCase() === 'bac');
  const stages: { role: string; at: string | null | undefined }[] = [
    { role: item.approval_pengajuan_level || 'BLC', at: item.submitted_at },
    { role: 'BAC', at: item.checked_at },
    { role: 'RLH', at: item.rejected_at ?? item.approved_at },
  ];
  if (item.is_rfah_required) stages.push({ role: 'RFAH', at: item.approved_at });

  if (item.status === 'draft') {
    return stages.map((stage) => ({ role: stage.role, state: 'todo' }));
  }

  const firstOpen = stages.findIndex((s) => !s.at);
  return stages.map((stage, i) => {
    if (item.status === 'approved') return { role: stage.role, state: 'done' };
    if (item.status === 'rlh_approved') return { role: stage.role, state: i === 3 ? 'current' : 'done' };
    if (rejected && i === 2) return { role: stage.role, state: 'reject' };
    if (rejected) return { role: stage.role, state: stage.at ? 'done' : 'todo' };
    if (revised && (revisionAtBac ? i === 1 : i === 2)) return { role: stage.role, state: 'revisi' };
    if (revised) return { role: stage.role, state: stage.at ? 'done' : 'todo' };
    if (stage.at) return { role: stage.role, state: 'done' };
    return { role: stage.role, state: i === firstOpen ? 'current' : 'todo' };
  });
};

const formatCurrency = (amount: number | string | null | undefined) => {
  const numericAmount = Number(amount || 0);
  return `Rp ${Number.isFinite(numericAmount) ? numericAmount.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '0'}`;
};

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

export interface ApprovalHistoryItem {
  id: number;
  from_status: string | null;
  to_status: string;
  action: string;
  reason: string | null;
  created_at: string;
  actor?: { id: number; full_name: string } | null;
}

const APPROVAL_ACTION_META: Record<string, { label: string; badge: string }> = {
  submit: { label: 'Dikirim', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  check: { label: 'Diperiksa', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  approve: { label: 'Disetujui', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rfah_approve: { label: 'Disetujui RFAH', badge: 'bg-chip-primary text-accent-text border-chip-primary-border' },
  reject: { label: 'Ditolak', badge: 'bg-red-50 text-red-700 border-red-200' },
  revise: { label: 'Revisi Diminta', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
};

function ApprovalHistoryList({ histories }: { histories?: ApprovalHistoryItem[] | null }) {
  if (!histories || histories.length === 0) return null;
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </span>
        <div>
          <h3 className="text-sm font-black text-slate-800">Riwayat Persetujuan</h3>
          <p className="text-[11px] text-slate-400">Jejak aksi tiap tahap approval</p>
        </div>
        <span className="ml-auto inline-flex items-center rounded-full bg-chip-primary border border-chip-primary-border px-2.5 py-0.5 text-[11px] font-bold text-accent-text">{histories.length} aktivitas</span>
      </div>
      <ol className="space-y-0">
        {histories.map((h, i) => {
          const meta = APPROVAL_ACTION_META[h.action] ?? { label: h.action, badge: 'bg-surface-raised text-gray-600 border-gray-300' };
          return (
            <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < histories.length - 1 && (
                <span aria-hidden="true" className="absolute left-3.75 top-9 bottom-0 w-0.5 rounded-full bg-slate-200" />
              )}
              <div className="shrink-0 mt-0.5">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-black ${meta.badge}`}>
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                  {h.from_status ? <span className="text-[10px] font-mono text-slate-400">{h.from_status} → {h.to_status}</span> : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {h.actor?.full_name ? <span className="font-medium text-slate-600">{h.actor.full_name}</span> : null}{h.actor?.full_name && ' · '}{formatDateTime(h.created_at)}
                </p>
                {h.reason ? <p className="mt-1 text-xs text-slate-600 whitespace-pre-line rounded-lg bg-surface-raised border border-slate-100 px-2.5 py-1.5">{h.reason}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ApprovalStepper({ item, rfahThreshold }: { item: BiayaRetribusiItem; rfahThreshold?: number }) {
  const rejected = item.status === 'rejected';
  const revised = item.status === 'revisi';
  const deciderLevel = (item.revisedBy?.level || item.rejectedBy?.level || item.approvedBy?.level || 'rlh').toUpperCase().replace('_', ' ');
  /** Langkah tempat revisi diminta (pola THL): BAC -> 1, selainnya -> 2. */
  const revisionIndex = revised ? ((item.revisedBy?.level || '').toLowerCase() === 'bac' ? 1 : 2) : -1;
  const steps = [
    { label: 'Diajukan', role: item.approval_pengajuan_level || 'BLC', at: item.submitted_at, by: item.submittedBy?.full_name },
    revisionIndex === 1
      ? { label: 'Perlu Revisi', role: deciderLevel, at: item.revised_at, by: item.revisedBy?.full_name }
      : { label: 'Diperiksa', role: 'BAC', at: item.checked_at, by: item.checkedBy?.full_name },
    {
      label: revisionIndex === 2 ? 'Perlu Revisi' : rejected ? 'Ditolak' : 'Disetujui',
      role: revisionIndex === 2 ? deciderLevel : 'RLH',
      at: revisionIndex === 2 ? item.revised_at : item.rejected_at ?? item.approved_at,
      by: revisionIndex === 2 ? item.revisedBy?.full_name : item.rejectedBy?.full_name ?? item.approvedBy?.full_name,
    },
  ];
  /**
   * Jujur berbasis timestamp: selesai = aksi benar terjadi. Status revisi/
   * ditolak adalah terminal (bola di pengaju) sehingga tak ada langkah
   * "berjalan" — tak ada lagi done -> current -> done yang rancu.
   */
  const honestState = (index: number): StepState => {
    if (item.status === 'approved') return 'done';
    if (steps[index].at) return 'done';
    if (rejected || revised) return 'todo';
    const firstOpen = steps.findIndex((s) => !s.at);
    return index === firstOpen ? 'current' : 'todo';
  };

  return (
    <div className="sticky top-0 z-10 rounded-2xl border border-slate-300 overflow-hidden shadow-sm bg-surface-card">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-linear-to-r from-slate-50 to-surface-card border-b border-slate-100">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M7 17L21 3m0 0h-5.5M21 3v5.5" /></svg>
        </span>
        <div>
          <h3 className="text-sm font-black text-slate-800">Alur Persetujuan</h3>
          <p className="text-[11px] text-slate-400">Tahapan approval pengajuan ini</p>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${revised ? 'bg-orange-50 text-orange-700 border-orange-200' : rejected ? 'bg-red-50 text-red-700 border-red-200' : item.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.status === 'rlh_approved' ? 'bg-chip-primary text-accent-text border-chip-primary-border' : item.status === 'checked' ? 'bg-blue-50 text-blue-700 border-blue-200' : item.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-surface-raised text-gray-600 border-gray-300'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${revised ? 'bg-orange-500' : rejected ? 'bg-red-500' : item.status === 'approved' ? 'bg-emerald-500' : item.status === 'rlh_approved' ? 'bg-primary-500' : item.status === 'checked' ? 'bg-blue-500' : item.status === 'pending' ? 'bg-amber-500' : 'bg-gray-400'}`} />
          {revised ? 'Perlu Revisi' : rejected ? 'Ditolak' : STATUS_META[item.status]?.label ?? item.status}
        </span>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <ol>
          {steps.map((step, i) => {
            const state = honestState(i);
            return (
              <li key={`${step.role}-${i}`} className="relative flex gap-3 pb-6 last:pb-0">
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-3.75 top-8 bottom-0 w-0.5 rounded-full ${state === 'done' ? 'bg-emerald-200' : 'bg-slate-200'}`}
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
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 border border-slate-300 text-slate-400">
                      <span className="block h-2 w-2 rounded-full bg-slate-300" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${state === 'done' ? 'text-slate-900' : state === 'current' ? 'text-accent-text' : 'text-slate-500'}`}>{step.label}</p>
                    <span className="inline-flex rounded-md bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-500">{step.role}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {step.at ? (
                      <>
                        {step.by ? <span className="font-medium text-slate-600">{step.by}</span> : null}{step.by && ' · '}{formatDateTime(step.at)}
                        {revised && revisionIndex === i && item.revisi_reason ? (
                          <span className="block font-medium text-orange-700 whitespace-pre-line">Catatan revisi: {item.revisi_reason}</span>
                        ) : null}
                        {rejected && i === 2 && item.rejection_reason ? (
                          <span className="block font-medium text-red-700 whitespace-pre-line">Alasan ditolak: {item.rejection_reason}</span>
                        ) : null}
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
              <p className="text-xs text-amber-700 mt-0.5">Nominal melebihi Rp {Number(rfahThreshold ?? 1000000).toLocaleString('id-ID')}, memerlukan pemantauan {item.rfah_name || '-'}.</p>
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
  const { user, hasPermission, hasRole } = useAuthStore();
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [biayaConfig, setBiayaConfig] = useState<BiayaConfig>(BIAYA_CONFIG_FALLBACK);
  /** true bila tarif yang dipakai adalah fallback (config gagal dimuat) — tampilkan banner. */
  const [configFallback, setConfigFallback] = useState(false);
  const [configRetry, setConfigRetry] = useState(0);

  const [items, setItems] = useState<BiayaRetribusiItem[]>([]);
  const [decision, setDecision] = useState<{ action: 'approve' | 'reject' | 'revise'; item: BiayaRetribusiItem } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<{ total: number; total_nominal: number; pending: number; checked: number; approved: number; rejected: number; revisi: number } | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [editingDepo, setEditingDepo] = useState('');
  const [editingNamaDepo, setEditingNamaDepo] = useState('');
  /** Sumber baris pengajuan: receiving otomatis atau manual (borongan). null = belum pilih. */
  const [sourceType, setSourceType] = useState<'receiving' | 'manual' | null>(null);
  /** Wizard: 1 Tipe · 2 Data · 3 Lampiran · 4 Review. */
  const [formStep, setFormStep] = useState(1);
  const [documentsRemove, setDocumentsRemove] = useState<number[]>([]);
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };
  const sortIndicator = (field: string) => {
    if (sortField !== field) return <span className="text-slate-300 ml-1 text-xs">↕</span>;
    return <span className="text-accent-text ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };
  /** Daftar unik dari details pengajuan (fallback ke kolom header bila kosong). */
  const uniqVals = (vals: (string | undefined)[]): string[] => [...new Set(vals.map((v) => upper(v)).filter(Boolean))];
  const getSJShorts = (item: BiayaRetribusiItem): string[] => {
    const fromDetails = uniqVals((item.details || []).map((d) => d.no_surat_jalan));
    return fromDetails.map((sj) => (sj.length > 4 ? sj.slice(-4) : sj));
  };
  const getSJFull = (item: BiayaRetribusiItem): string => uniqVals((item.details || []).map((d) => d.no_surat_jalan)).join(', ') || '-';
  const getSJList = (item: BiayaRetribusiItem): string[] => uniqVals((item.details || []).map((d) => d.no_surat_jalan));
  const getKendaraanTypes = (item: BiayaRetribusiItem): string[] => uniqVals((item.details || []).map((d) => d.type_kendaraan));
  const getNopols = (item: BiayaRetribusiItem): string[] => uniqVals((item.details || []).map((d) => d.nopol_kendaraan));
  const getQtyLabel = (item: BiayaRetribusiItem): string => {
    const zak = (item.details || []).reduce((s, d) => s + (Number(d.qty_zak) || 0), 0);
    const crt = (item.details || []).reduce((s, d) => s + (Number(d.qty_crt) || 0), 0);
    if (zak <= 0 && crt <= 0) return '-';
    return `${zak > 0 ? `${Number(zak).toLocaleString('id-ID')} zak` : ''}${zak > 0 && crt > 0 ? ' · ' : ''}${crt > 0 ? `${Number(crt).toLocaleString('id-ID')} crt` : ''}`;
  };
  const renderChips = (values: string[], fullTitle: string) => {
    if (values.length === 0) return <span className="text-slate-400">-</span>;
    const shown = values.slice(0, 2);
    const rest = values.length - shown.length;
    return (
      <span className="flex flex-wrap gap-1" title={fullTitle}>
        {shown.map((v) => (
          <span key={v} className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{v}</span>
        ))}
        {rest > 0 && (
          <span className="inline-flex items-center rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-600">+{rest}</span>
        )}
      </span>
    );
  };
  /** Hapus tanpa batasan status untuk Kendali Penuh; selainnya hanya draft/ditolak/revisi. */
  const isDeletable = (status: string): boolean => hasPermission('biaya_retribusi.full_control')
    ? true
    : ['draft', 'rejected', 'revisi'].includes(status);
  /** Edit terkirim (pending/checked/dll) hanya pengguna dengan Kendali Penuh; level lain hanya draft/ditolak/revisi. */
  const canEditRow = (status: string): boolean => hasPermission('biaya_retribusi.full_control') ? true : ['draft', 'rejected', 'revisi'].includes(status);
  const [openModal, setOpenModal] = useState(false);
  const [viewItem, setViewItem] = useState<BiayaRetribusiItem | null>(null);
  const [candidates, setCandidates] = useState<ReceivingCandidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [formData, setFormData] = useState<{ tanggal_pengajuan: string; details: DetailRow[]; documents: DocumentRow[] }>({ tanggal_pengajuan: '', details: [], documents: [] });
  const [manualDetails, setManualDetails] = useState<ManualDetailRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** Id baris yang sedang dihapus — cegah double-click hapus. */
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [candidateNominals, setCandidateNominals] = useState<Record<number, number>>({});
  // Anti race: respons basi (filter sudah berubah) dibuang.
  const reqIdRef = useRef(0);
  // Cermin totalPages agar clamp bisa baca nilai terbaru tanpa jadi dep fetch.
  const totalPagesRef = useRef(1);

  const fetchItems = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    // Clamp sebelum request — jangan setPage di dalam fetch (picu double fetch).
    const requestPage = Math.min(Math.max(1, page), Math.max(1, totalPagesRef.current));
    try {
      const res = await biayaRetribusi.list({ search: debouncedSearch, status: statusFilter, page: requestPage, per_page: perPage, sort: sortField, dir: sortDir });
      if (reqIdRef.current !== reqId) return;
      const rawItems = res.data.data || res.data;
      setItems(Array.isArray(rawItems) ? rawItems.map(normalizeBiayaRetribusiItem) : []);
      const nextLast = res.data.last_page || 1;
      setTotalPages(nextLast);
      totalPagesRef.current = nextLast;
      if (res.data.summary) setSummary(res.data.summary);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      console.error('[BiayaRetribusi]', e);
      notifyGlobal('Gagal memuat data', 'error');
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [debouncedSearch, statusFilter, page, perPage, sortField, sortDir]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Koreksi halaman keluar-jarak setelah totalPages diketahui (di luar fetch
  // agar tak memicu double fetch dari dalam callback fetch itu sendiri).
  useEffect(() => {
    if (page > totalPages) setPage(Math.max(1, totalPages));
  }, [page, totalPages]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage((p) => (p === 1 ? p : 1)); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCandidates = async () => {
    setBusy(true);
    try {
      const res = await biayaRetribusi.candidates({});
      setCandidates(res.data || []);
      setSelectedCandidates([]);
      setCandidateNominals({});
    } catch {
      notifyGlobal('Gagal memuat kandidat', 'error');
    } finally {
      setBusy(false);
    }
  };

  const isKoliMode = biayaConfig.retribusi_calc_mode === 'koli';
  /** Mode sesi wizard (bukan config depo): receiving pada depo mode koli = KOLI;
   *  sesi manual/borongan atau depo borongan = BORONGAN. */
  const isKoliSession = sourceType === 'receiving' && isKoliMode;
  /** Nominal per baris: manual (borongan) atau qty x tarif (koli). */
  const calcKoliNominal = (qtyZak: number, qtyCrt: number) =>
    (Number(qtyZak) || 0) * (Number(biayaConfig.retribusi_rate_zak) || 0)
    + (Number(qtyCrt) || 0) * (Number(biayaConfig.retribusi_rate_crt) || 0);
  const candidateNominal = (id: number): number => {
    if (!isKoliMode) return Number(candidateNominals[id]) || 0;
    const c = candidates.find((c2) => c2.id === id);
    if (!c) return 0;
    return calcKoliNominal(c.qty_zak, c.qty_crt);
  };
  /** Baris manual selalu nominal ketikan (borongan); koli hanya untuk baris receiving. */
  const manualNominal = (md: ManualDetailRow): number => Number(md.nominal_biaya) || 0;
  const existingNominal = (d: DetailRow): number =>
    d.receiving_id && isKoliMode ? calcKoliNominal(d.qty_zak || 0, d.qty_crt || 0) : Number(d.nominal_biaya) || 0;
  const [rateDraft, setRateDraft] = useState<{ mode: 'borongan' | 'koli'; rate_zak: number; rate_crt: number }>({ mode: 'borongan', rate_zak: 0, rate_crt: 0 });
  const [rateSaving, setRateSaving] = useState(false);
  /** Panel tarif collapsible agar tak mengganggu fokus pengisian. */
  const [tariffOpen, setTariffOpen] = useState(false);
  const MAX_DOC_BYTES = 20 * 1024 * 1024;
  const formatBytes = (bytes?: number | null): string => {
    const n = Number(bytes) || 0;
    if (n <= 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };
  /** Kompres foto lapangan (HP 8-12MP) ke JPEG <=1600px agar ringan saat diunggah. */
  const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024; // di atas 1,5 MB → coba kompres
  const compressDocImage = (file: File): Promise<File> => new Promise((resolve) => {
    // Non-image files (PDF, etc.): validate size but don't compress
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    // Gambar kecil (<=1,5 MB): lewati kompres (sudah cukup ringan)
    if (file.size <= COMPRESS_ABOVE_BYTES) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob && blob.size < file.size) {
          resolve(new File([blob], file.name.replace(/\.(png|webp)$/i, '.jpg'), { type: 'image/jpeg' }));
        } else {
          resolve(file);
        }
      }, 'image/jpeg', 0.82);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
  });

  const handleDocFile = async (index: number, file: File) => {
    let ready = await compressDocImage(file);
    // PDF di atas 4 MB dikompres otomatis (object streams) agar upload
    // lampiran banyak tidak timeout; gagal kompres = pakai file asli.
    const PDF_COMPRESS_ABOVE_BYTES = 4 * 1024 * 1024;
    if (ready.type === 'application/pdf' && ready.size > PDF_COMPRESS_ABOVE_BYTES) {
      try {
        const compressed = await compressPdf(ready, MAX_DOC_BYTES);
        if (compressed.size < ready.size) {
          notifyGlobal(`PDF dikompresi ${formatBytes(file.size)} → ${formatBytes(compressed.size)} agar upload lancar`, 'info');
          ready = compressed;
        }
      } catch (e) {
        notifyGlobal(e instanceof Error ? e.message : 'PDF terlalu besar dan gagal dikompresi — perkecil/ganti file lalu coba lagi', 'error');
        return;
      }
    }
    if (ready.size > MAX_DOC_BYTES) {
      notifyGlobal(`File ${file.name} (${formatBytes(ready.size)}) melebihi batas 20 MB — perkecil/ganti file lalu coba lagi`, 'error');
      return;
    }
    if (ready !== file && ready.type.startsWith('image/')) {
      notifyGlobal(`Foto dikompresi ${formatBytes(file.size)} → ${formatBytes(ready.size)} agar bisa diunggah`, 'info');
    }
    updateDocument(index, 'file', ready);
    updateDocument(index, 'file_name', ready.name);
  };

  const oversizedDoc = formData.documents.find((doc) => doc.file && doc.file.size > MAX_DOC_BYTES);
  const abortOversized = (): boolean => {
    if (oversizedDoc?.file) {
      notifyGlobal(`File ${oversizedDoc.file.name} (${formatBytes(oversizedDoc.file.size)}) melebihi batas 20 MB — ganti file lalu coba lagi`, 'error');
      return true;
    }
    return false;
  };

  /** Ubah error validasi teknis menjadi pesan yang dimengerti user. */
  const retribusiErrorMessage = (e: unknown, fallback: string): string => {
    const resp = (e as { response?: { data?: { errors?: Record<string, string | string[]> } } })?.response?.data?.errors;
    if (resp) {
      const keys = Object.keys(resp);
      if (keys.some((k) => k.includes('receiving_id'))) {
        return 'Receiving tidak valid — kemungkinan sudah diklaim atau belum COMPLETED. Klik “Muat ulang receiving” lalu pilih lagi.';
      }
      if (keys.some((k) => k.includes('nopol_kendaraan'))) return 'Plat kendaraan wajib diisi pada setiap baris.';
      if (keys.some((k) => k.includes('type_kendaraan'))) return 'Type kendaraan wajib dipilih pada setiap baris.';
      if (keys.some((k) => k.includes('nominal_biaya'))) return 'Nominal wajib diisi pada setiap baris.';
      if (keys.some((k) => k.includes('tanggal_pengajuan'))) return 'Tanggal pengajuan tidak valid.';
    }
    return getErrorMessage(e, fallback);
  };

  /** Simpan draft dan kembalikan id-nya (pola sama dengan Biaya THL). */
  const persistCreate = async (): Promise<number> => {
      const fd = new FormData();
      fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);

      selectedCandidates.forEach((cId, i) => {
        const c = candidates.find((c2) => c2.id === cId);
        if (!c) return;
        fd.append(`details[${i}][receiving_id]`, String(c.receiving_id));
        fd.append(`details[${i}][nopol_kendaraan]`, c.nopol_kendaraan);
        fd.append(`details[${i}][type_kendaraan]`, c.type_kendaraan);
        fd.append(`details[${i}][no_surat_jalan]`, c.no_surat_jalan || '');
        fd.append(`details[${i}][qty_zak]`, String(c.qty_zak || 0));
        fd.append(`details[${i}][qty_crt]`, String(c.qty_crt || 0));
        fd.append(`details[${i}][nominal_biaya]`, String(candidateNominal(cId)));
        fd.append(`details[${i}][order]`, String(i));
      });

      manualDetails.forEach((md, i) => {
        const idx = selectedCandidates.length + i;
        fd.append(`details[${idx}][nopol_kendaraan]`, md.nopol_kendaraan);
        fd.append(`details[${idx}][type_kendaraan]`, md.type_kendaraan);
        fd.append(`details[${idx}][no_surat_jalan]`, md.no_surat_jalan);
        fd.append(`details[${idx}][qty_zak]`, String(md.qty_zak || 0));
        fd.append(`details[${idx}][qty_crt]`, String(md.qty_crt || 0));
        fd.append(`details[${idx}][nominal_biaya]`, String(manualNominal(md)));
        fd.append(`details[${idx}][order]`, String(idx));
      });

      formData.documents.forEach((doc, i) => {
        if (doc.file) {
          fd.append(`files[${i}]`, doc.file);
          fd.append(`documents[${i}][document_type]`, doc.document_type || 'lainnya');
          fd.append(`documents[${i}][file_name]`, doc.file.name);
        }
      });

      const res = await biayaRetribusi.create(fd);
      const id = (res as { data?: { data?: { id?: number } } }).data?.data?.id;
      if (id == null) throw new Error('empty');
      return id;
  };

  const finishAfterSave = async () => {
      setOpenModal(false);
      setEditingStatus(null);
      setDocumentsRemove([]);
      setSelectedCandidates([]);
      setCandidates([]);
      setCandidateNominals({});
      setManualDetails([]);
      setFormData({ tanggal_pengajuan: '', details: [], documents: [] });
      setFormStep(minStep);
      await fetchItems();
  };

  const handleCreate = async () => {
    if (abortOversized()) return;
    setBusy(true);
    try {
      await persistCreate();
      notifyGlobal('Pengajuan tersimpan sebagai draft — buka detail lalu Kirim untuk masuk antrean.', 'success');
      await finishAfterSave();
    } catch (e: unknown) {
      notifyGlobal(retribusiErrorMessage(e, 'Gagal membuat Biaya Retribusi'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndSubmit = async () => {
    if (abortOversized()) return;
    if (submitBlockers.length > 0) {
      notifyGlobal(`Belum bisa dikirim: ${submitBlockers.slice(0, 2).join(' · ')}`, 'error');
      return;
    }
    setBusy(true);
    try {
      const id = await persistCreate();
      await biayaRetribusi.submit(id);
      notifyGlobal('Pengajuan dikirim ke antrean pemeriksaan.', 'success');
      await finishAfterSave();
    } catch (e: unknown) {
      notifyGlobal(retribusiErrorMessage(e, 'Gagal mengirim pengajuan'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Payload update dipakai bersama handleUpdate & handleUpdateAndSubmit. */
  const buildUpdatePayload = (): FormData => {
      const fd = new FormData();
      fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);
      fd.append('_method', 'PUT');

      formData.details.forEach((d, i) => {
        if (d.biaya_thl_id) fd.append(`details[${i}][biaya_thl_id]`, String(d.biaya_thl_id));
        if (d.biaya_thl_detail_id) fd.append(`details[${i}][biaya_thl_detail_id]`, String(d.biaya_thl_detail_id));
        if (d.receiving_id) fd.append(`details[${i}][receiving_id]`, String(d.receiving_id));
        fd.append(`details[${i}][nopol_kendaraan]`, d.nopol_kendaraan);
        fd.append(`details[${i}][type_kendaraan]`, d.type_kendaraan);
        fd.append(`details[${i}][no_surat_jalan]`, d.no_surat_jalan || '');
        fd.append(`details[${i}][qty_zak]`, String(d.qty_zak || 0));
        fd.append(`details[${i}][qty_crt]`, String(d.qty_crt || 0));
        fd.append(`details[${i}][nominal_biaya]`, String(d.receiving_id && isKoliMode ? calcKoliNominal(d.qty_zak || 0, d.qty_crt || 0) : d.nominal_biaya));
        fd.append(`details[${i}][order]`, String(i));
      });

      manualDetails.forEach((md, i) => {
        const idx = formData.details.length + i;
        fd.append(`details[${idx}][nopol_kendaraan]`, md.nopol_kendaraan);
        fd.append(`details[${idx}][type_kendaraan]`, md.type_kendaraan);
        fd.append(`details[${idx}][no_surat_jalan]`, md.no_surat_jalan);
        fd.append(`details[${idx}][qty_zak]`, String(md.qty_zak || 0));
        fd.append(`details[${idx}][qty_crt]`, String(md.qty_crt || 0));
        fd.append(`details[${idx}][nominal_biaya]`, String(manualNominal(md)));
        fd.append(`details[${idx}][order]`, String(idx));
      });

      formData.documents.forEach((doc, i) => {
        if (doc.file) {
          fd.append(`files[${i}]`, doc.file);
          fd.append(`documents[${i}][document_type]`, doc.document_type || 'lainnya');
          fd.append(`documents[${i}][file_name]`, doc.file.name);
        }
      });
      documentsRemove.forEach((docId) => fd.append('documents_remove[]', String(docId)));
      return fd;
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (abortOversized()) return;
    setBusy(true);
    try {
      const fd = buildUpdatePayload();

      await biayaRetribusi.update(editingId, fd);
      notifyGlobal('Biaya Retribusi berhasil diperbarui', 'success');
      setOpenModal(false);
      setEditingId(null);
      setEditingStatus(null);
      setDocumentsRemove([]);
      setManualDetails([]);
      fetchItems();
    } catch (e: unknown) {
      notifyGlobal(retribusiErrorMessage(e, 'Gagal memperbarui'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Simpan perbaikan lalu kirim ulang ke approver yang meminta revisi (pola Biaya THL). */
  const handleUpdateAndSubmit = async () => {
    if (!editingId) return;
    if (abortOversized()) return;
    if (submitBlockers.length > 0) {
      notifyGlobal(`Belum bisa dikirim: ${submitBlockers.slice(0, 2).join(' · ')}`, 'error');
      return;
    }
    setBusy(true);
    try {
      const fd = buildUpdatePayload();
      await biayaRetribusi.update(editingId, fd);
      await biayaRetribusi.submit(editingId);
      notifyGlobal('Perubahan disimpan dan dikirim ulang ke tahap approval yang meminta revisi.', 'success');
      setOpenModal(false);
      setEditingId(null);
      setEditingStatus(null);
      setDocumentsRemove([]);
      setManualDetails([]);
      setFormStep(minStep);
      await fetchItems();
    } catch (e: unknown) {
      notifyGlobal(retribusiErrorMessage(e, 'Gagal mengirim perbaikan'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Hapus hanya untuk draft/ditolak/revisi — yang sudah masuk antrean tak boleh hilang. */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    if (deletingId !== null) return;
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (deleteTargetId === null || deletingId !== null) return;
    setDeletingId(deleteTargetId);
    try {
      await biayaRetribusi.delete(deleteTargetId);
      notifyGlobal('Biaya Retribusi berhasil dihapus', 'success');
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      fetchItems();
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Gagal menghapus'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  /** Kirim satu baris dari tabel daftar (aksi cepat) tanpa membuka modal detail. */
  const handleQuickSubmit = async (item: BiayaRetribusiItem) => {
    const blockers = viewBlockers(item);
    if (blockers.length > 0) {
      notifyGlobal(`Belum bisa dikirim: ${blockers.slice(0, 2).join(' · ')}`, 'error');
      return;
    }
    try {
      await biayaRetribusi.submit(item.id);
      notifyGlobal('Pengajuan dikirim ke antrean pemeriksaan', 'success');
      await fetchItems();
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengirim'), 'error');
    }
  };

  const warnLampiran = (message: string) => notifyGlobal(message, 'info');

  const docUrl = (doc: { id?: number; file_path?: string }): string | null => {
    if (doc.id != null) return biayaRetribusi.documentUrl(doc.id);
    if (!doc.file_path) return null;
    return storageFileUrl(doc.file_path);
  };

  const loadLatestPdfItem = async (item: BiayaRetribusiItem): Promise<BiayaRetribusiItem> => {
    const response = await biayaRetribusi.get(item.id);
    return normalizeBiayaRetribusiItem(response.data.data);
  };

  const downloadPdf = async (item: BiayaRetribusiItem) => {
    try {
      generateRetribusiPdf(await loadLatestPdfItem(item), { onWarning: warnLampiran });
    } catch (e: unknown) {
      console.error('[Download PDF Retribusi]', e);
      notifyGlobal(e instanceof Error ? `Gagal generate PDF: ${e.message}` : 'Gagal generate PDF', 'error');
    }
  };

  /** Alasan record tersimpan belum boleh dikirim (cermin assertSubmittable backend). */
  const viewBlockers = (item: BiayaRetribusiItem): string[] => {
    const reasons: string[] = [];
    if (!item.tanggal_pengajuan) reasons.push('Isi tanggal pengajuan');
    if (!item.documents || item.documents.length === 0) reasons.push('Lampirkan minimal 1 dokumen');
    if (!item.details || item.details.length === 0) reasons.push('Minimal 1 baris biaya');
    (item.details || []).forEach((d, i) => {
      if (!d.nopol_kendaraan) reasons.push(`Baris ${i + 1}: plat kosong`);
      if (!d.type_kendaraan) reasons.push(`Baris ${i + 1}: type kosong`);
      if (Number(d.nominal_biaya) < 1) reasons.push(`Baris ${i + 1}: nominal kurang dari Rp 1`);
    });
    return reasons;
  };

  const approvalAction = async (action: 'submit' | 'check' | 'rfahApprove') => {
    if (!viewItem) return;
    if (action === 'submit') {
      const blockers = viewBlockers(viewItem);
      if (blockers.length > 0) {
        notifyGlobal(`Belum bisa dikirim: ${blockers.slice(0, 2).join(' · ')}`, 'error');
        return;
      }
    }
    try {
      const response = action === 'submit'
        ? await biayaRetribusi.submit(viewItem.id)
        : action === 'check'
          ? await biayaRetribusi.check(viewItem.id)
          : await biayaRetribusi.rfahApprove(viewItem.id);
      await fetchItems();
      try {
        const fresh = await biayaRetribusi.get((response as { data: { data: BiayaRetribusiItem } }).data.data.id);
        setViewItem(normalizeBiayaRetribusiItem(fresh.data.data));
      } catch {
        setViewItem(normalizeBiayaRetribusiItem((response as { data: { data: BiayaRetribusiItem } }).data.data));
      }
      notifyGlobal('Status pengajuan berhasil diperbarui', 'success');
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Aksi approval tidak dapat diproses'), 'error');
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
      await fetchItems();
      try {
        const fresh = await biayaRetribusi.get((response as { data: { data: BiayaRetribusiItem } }).data.data.id);
        setViewItem(normalizeBiayaRetribusiItem(fresh.data.data));
      } catch {
        setViewItem(normalizeBiayaRetribusiItem((response as { data: { data: BiayaRetribusiItem } }).data.data));
      }
      notifyGlobal(decision.action === 'approve' ? 'Pengajuan disetujui' : decision.action === 'revise' ? 'Pengajuan diminta revisi' : 'Pengajuan ditolak', 'success');
      setDecision(null);
      setDecisionReason('');
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Aksi approval tidak dapat diproses'), 'error');
    } finally {
      setDecisionBusy(false);
    }
  };

  const switchSourceType = (next: 'receiving' | 'manual' | null) => {
    if (next === sourceType) return;
    setSourceType(next);
    // Pilih tipe → langsung ke langkah Data; "Ganti tipe" → kembali ke langkah Tipe.
    // Tanpa ini body modal kosong karena kartu tipe butuh !sourceType + formStep 1,
    // sedangkan langkah Data butuh sourceType + formStep 2.
    setFormStep(next === null ? 1 : 2);
    setSelectedCandidates([]);
    setCandidateNominals({});
    setCandidates([]);
    setManualDetails([]);
    setFormData((prev) => ({ ...prev, tanggal_pengajuan: '' }));
  };

  const toggleCandidate = (id: number) => {
    setSelectedCandidates((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (editingId || selectedCandidates.length === 0) return;
    const latest = selectedCandidates
      .map((id) => candidates.find((c) => c.id === id)?.tanggal_selesai || '')
      .filter(Boolean)
      .sort()
      .pop();
    if (latest) {
      setFormData((prev) => ({ ...prev, tanggal_pengajuan: latest }));
    }
  }, [selectedCandidates, candidates, editingId]);
  const totalNominal = selectedCandidates.reduce((sum, id) => sum + candidateNominal(id), 0)
    + formData.details.reduce((sum, d) => sum + existingNominal(d), 0)
    + manualDetails.reduce((sum, md) => sum + manualNominal(md), 0);
  const isRfahRequired = totalNominal > biayaConfig.retribusi_rfah_threshold;
  const hasIncompleteManualRows = manualDetails.some((row) => !row.nopol_kendaraan || !row.type_kendaraan || Number(row.nominal_biaya || 0) <= 0);
  const hasIncompleteExistingRows = formData.details.some((d) => !d.nopol_kendaraan || !d.type_kendaraan || Number(existingNominal(d)) <= 0);
  const hasIncompleteCandidateRows = selectedCandidates.some((id) => {
    if (!isKoliMode) return Number(candidateNominals[id] || 0) <= 0;
    const c = candidates.find((c2) => c2.id === id);
    return ((Number(c?.qty_zak) || 0) + (Number(c?.qty_crt) || 0)) <= 0;
  });
  const selectedRowCount = (editingId ? formData.details.length : selectedCandidates.length) + manualDetails.length;
  /** Nopol kandidat yang nominalnya belum diisi (mode borongan). */
  const missingNominalNopols = editingId ? [] : selectedCandidates
    .map((id) => candidates.find((c) => c.id === id))
    .filter((c): c is ReceivingCandidate => !!c && !isKoliMode && candidateNominal(c.id) <= 0)
    .map((c) => c.nopol_kendaraan);
  /** Depo tujuan pengajuan: mewarisi receiving bila satu depo (cermin backend). */
  const selectedDepoLabels = [...new Set(selectedCandidates
    .map((id) => candidates.find((c) => c.id === id))
    .filter((c): c is ReceivingCandidate => !!c)
    .map((c) => `${c.kode_depo} — ${c.nama_depo}`))];
  /** Depo dari kandidat yang sudah dimuat (receiving) — basis mode koli/tarif,
   *  analog inheritReceivingDepot backend, agar "Otomatis dari Receiving"
   *  langsung memakai tarif depo receiving tanpa harus mencentang dulu. */
  const candidateDepoLabels = [...new Set(candidates
    .map((c) => `${c.kode_depo} — ${c.nama_depo}`))];
  const isCandidateDepoUniform = !editingId && candidateDepoLabels.length === 1;
  const isDepoInherited = !editingId && selectedDepoLabels.length === 1;
  const targetDepoLabel = isCandidateDepoUniform
    ? candidateDepoLabels[0]
    : isDepoInherited ? selectedDepoLabels[0] : `${user?.kode_depo} — ${user?.nama_depo}`;
  /** Depo efektif perhitungan: warisi receiving bila satu depo (kandidat termuat
   *  atau yang dicentang), jika tidak depo user/record. */
  const inheritedDepo = isDepoInherited ? selectedDepoLabels[0].split(' — ')[0] : '';
  const candidateFlowDepo = isCandidateDepoUniform ? candidateDepoLabels[0].split(' — ')[0] : '';
  const effectiveDepo = editingId ? editingDepo : candidateFlowDepo || inheritedDepo || user?.kode_depo || '';
  // Refetch tarif saat modal dibuka (openCreateModal/Edit mereset biayaConfig ke
  // FALLBACK), bukan hanya saat effectiveDepo berubah — agar tarif koli yang
  // sudah disimpan tetap muncul tanpa harus input ulang tiap pengajuan.
  useEffect(() => { getBiayaConfigFreshWithStatus(effectiveDepo, 'biaya_retribusi').then((r) => { setBiayaConfig(r.config); setConfigFallback(r.isFallback); }).catch((e: unknown) => { console.error('[BiayaConfig]', e); }); }, [effectiveDepo, openModal, configRetry]);
  useEffect(() => {
    setRateDraft({
      mode: biayaConfig.retribusi_calc_mode === 'koli' ? 'koli' : 'borongan',
      rate_zak: Number(biayaConfig.retribusi_rate_zak) || 0,
      rate_crt: Number(biayaConfig.retribusi_rate_crt) || 0,
    });
  }, [biayaConfig, effectiveDepo]);
  /** Kode + nama depo target untuk penyimpanan tarif inline. */
  const effectiveKode = effectiveDepo;
  const effectiveNama = !editingId && (isCandidateDepoUniform || isDepoInherited)
    ? (targetDepoLabel.split(' — ').slice(1).join(' — ') || targetDepoLabel)
    : user?.nama_depo || '';
  const saveRates = async () => {
    if (!effectiveKode) return;
    if (rateDraft.mode === 'koli' && (Number(rateDraft.rate_zak) || 0) <= 0 && (Number(rateDraft.rate_crt) || 0) <= 0) {
      notifyGlobal('Mode koli membutuhkan minimal satu tarif (zak/crt) lebih dari 0', 'error');
      return;
    }
    setRateSaving(true);
    try {
      await retribusiRates.save({
        kode_depo: effectiveKode,
        nama_depo: effectiveNama || effectiveKode,
        mode: rateDraft.mode,
        rate_zak: Number(rateDraft.rate_zak) || 0,
        rate_crt: Number(rateDraft.rate_crt) || 0,
        is_active: true,
      });
      clearBiayaConfigCache(effectiveKode, 'biaya_retribusi');
      const fresh = await getBiayaConfigFresh(effectiveKode, 'biaya_retribusi');
      setBiayaConfig(fresh);
      setConfigFallback(false);
      notifyGlobal(`Tarif ${effectiveNama || effectiveKode} disimpan`, 'success');
    } catch (e: unknown) {
      notifyGlobal(getErrorMessage(e, 'Gagal menyimpan tarif'), 'error');
    } finally {
      setRateSaving(false);
    }
  };
  /** Alasan tombol terkunci — ditampilkan agar user tidak menebak. */
  const blockerReasons: string[] = [];
  if (!editingId && !sourceType) blockerReasons.push('Pilih tipe pengajuan');
  if (!formData.tanggal_pengajuan) blockerReasons.push('Isi tanggal pengajuan');
  if (selectedRowCount === 0) blockerReasons.push('Pilih receiving atau tambah baris manual');
  if (missingNominalNopols.length > 0) blockerReasons.push(`Isi nominal: ${missingNominalNopols.join(', ')}`);
  if (hasIncompleteManualRows) blockerReasons.push('Lengkapi baris manual');
  if (hasIncompleteExistingRows) blockerReasons.push('Lengkapi baris tersimpan');
  const emptyDocIndex = formData.documents.findIndex((doc) => !doc.file && !doc.file_path);
  if (emptyDocIndex >= 0) blockerReasons.push(`Lampiran #${emptyDocIndex + 1} belum ada file — hapus atau pilih file`);
  const hasDocuments = formData.documents.some((doc) => doc.file || doc.file_path);
  /** Syarat kirim = syarat draft + minimal 1 dokumen lampiran. */
  const submitBlockers = hasDocuments
    ? blockerReasons
    : [...blockerReasons, 'Lampirkan minimal 1 dokumen (PDF/foto) sebelum dikirim'];
  const stepDone = [
    editingId ? true : !!sourceType,
    !!formData.tanggal_pengajuan && selectedRowCount > 0 && !hasIncompleteManualRows && !hasIncompleteExistingRows && (editingId || !hasIncompleteCandidateRows),
    formData.documents.length > 0,
    false,
  ];
  const WIZARD_LABELS = ['Tipe', 'Data', 'Lampiran', 'Review'];
  const minStep = editingId ? 2 : 1;
  const stepProgress = formStep >= 4 ? 100 : Math.round((stepDone.slice(0, 3).filter(Boolean).length / 3) * 100);
  const goNext = () => {
    if (formStep === 1 && !editingId && !sourceType) { notifyGlobal('Pilih tipe pengajuan dulu', 'info'); return; }
    if (formStep === 2 && blockerReasons.length > 0) { notifyGlobal(blockerReasons[0], 'error'); return; }
    setFormStep((s) => Math.min(4, s + 1));
  };
  const goBack = () => setFormStep((s) => Math.max(minStep, s - 1));

  const previewPdfError = (e: unknown) => {
    console.error('[Preview PDF Retribusi]', e);
    notifyGlobal(e instanceof Error ? `Gagal membuka preview PDF: ${e.message}` : 'Gagal membuka preview PDF', 'error');
  };

  const previewRetribusi = () => {
    if (!formData.tanggal_pengajuan) return;
    const candidateDetails = selectedCandidates.flatMap((id) => {
      const candidate = candidates.find((item) => item.id === id);
      if (!candidate) return [];
      return [{
        nopol_kendaraan: candidate.nopol_kendaraan,
        type_kendaraan: candidate.type_kendaraan,
        no_surat_jalan: candidate.no_surat_jalan || '',
        nominal_biaya: candidateNominal(id),
        biaya_thl_detail: {
          nama_thl: candidate.driver_name || '-',
          driver_name: candidate.driver_name || '',
          kubikasi: 0,
          droppoint: '0',
          posisi: 'THL GUDANG',
          jam_datang: '',
          jam_pulang: '',
          photos: [],
        },
      }];
    });
    const existingDetails = formData.details.map((d) => ({
      nopol_kendaraan: d.nopol_kendaraan,
      type_kendaraan: d.type_kendaraan,
      no_surat_jalan: d.no_surat_jalan || '',
      nominal_biaya: existingNominal(d),
      biaya_thl_detail: d.biaya_thl_detail ?? null,
    }));
    previewRetribusiPdf({
      tanggal_pengajuan: formData.tanggal_pengajuan,
      kode_depo: effectiveDepo || user?.kode_depo || '',
      nama_depo: editingId
        ? (editingNamaDepo || user?.nama_depo || '')
        : (targetDepoLabel.split(' — ').slice(1).join(' — ') || user?.nama_depo || ''),
      nominal_biaya: totalNominal,
      is_rfah_required: isRfahRequired,
      rfah_name: isRfahRequired ? biayaConfig.rfah_name : '',
      rfah_threshold: biayaConfig.retribusi_rfah_threshold,
      approval_pengajuan: user?.full_name || '',
      status: 'draft',
      details: [...candidateDetails, ...existingDetails, ...manualDetails.map((item) => ({ ...item, nominal_biaya: manualNominal(item), biaya_thl_detail: null }))],
      documents: formData.documents.map((document) => ({ id: document.id, document_type: document.document_type, file_name: document.file_name, file: document.file, file_path: document.file_path, file_size: document.file?.size ?? document.file_size ?? 0 })),
    }, { onWarning: warnLampiran }).catch(previewPdfError);
  };

  const addManualDetail = () => {
    setManualDetails([...manualDetails, { nopol_kendaraan: '', type_kendaraan: '', no_surat_jalan: '', qty_zak: 0, qty_crt: 0, nominal_biaya: 0 }]);
  };

  const updateManualDetail = (index: number, field: keyof ManualDetailRow, value: string | number) => {
    setManualDetails(prev => prev.map((md, i) => i === index ? { ...md, [field]: value } : md));
  };

  const removeManualDetail = (index: number) => {
    setManualDetails(prev => prev.filter((_, i) => i !== index));
  };

  /** Baris tersimpan (edit mode): boleh dikoreksi/dihapus seperti baris manual. */
  const updateExistingDetail = (index: number, field: 'nopol_kendaraan' | 'type_kendaraan' | 'no_surat_jalan' | 'qty_zak' | 'qty_crt' | 'nominal_biaya', value: string | number) => {
    setFormData((prev) => ({ ...prev, details: prev.details.map((d, i) => i === index ? { ...d, [field]: value } : d) }));
  };

  const removeExistingDetail = (index: number) => {
    setFormData((prev) => ({ ...prev, details: prev.details.filter((_, i) => i !== index) }));
  };

  /** Saat seksi Baris Manual masih kosong, form starter tampil langsung; input
   *  pertama otomatis membentuk baris #1 dan fokus berpindah mulus ke baris itu. */
  const manualStarterField = useRef<keyof ManualDetailRow | null>(null);

  const startManualRow = (field: keyof ManualDetailRow, value: string | number) => {
    manualStarterField.current = field;
    setManualDetails([{ nopol_kendaraan: '', type_kendaraan: '', no_surat_jalan: '', qty_zak: 0, qty_crt: 0, nominal_biaya: 0, [field]: value }]);
  };

  useEffect(() => {
    if (manualDetails.length === 1 && manualStarterField.current) {
      const field = manualStarterField.current;
      manualStarterField.current = null;
      requestAnimationFrame(() => {
        const el = document.getElementById(`manual-row-0-${field}`) as HTMLInputElement | HTMLSelectElement | null;
        el?.focus();
        if (el instanceof HTMLInputElement) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    }
  }, [manualDetails.length]);

  const addDocument = () => {
    setFormData(prev => ({
      ...prev,
      documents: [...prev.documents, { document_type: 'BA', file: null, file_name: '' }],
    }));
  };

  /** Form starter Lampiran: pilih tipe atau file langsung dari seksi (tanpa klik
   *  tombol tambah) — dokumen #1 terbentuk otomatis dengan kompresi/validasi sama. */
  const startDocument = (field: 'document_type' | 'file', value: string | File) => {
    if (field === 'document_type') {
      setFormData((prev) => ({ ...prev, documents: [{ document_type: value as string, file: null, file_name: '' }] }));
      return;
    }
    setFormData((prev) => ({ ...prev, documents: [{ document_type: 'BA', file: null, file_name: '' }] }));
    void handleDocFile(0, value as File);
  };

  const updateDocument = (index: number, field: keyof DocumentRow, value: string | File | null) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.map((doc, i) => i === index ? { ...doc, [field]: value } : doc),
    }));
  };

  const removeDocument = (index: number) => {
    const target = formData.documents[index];
    if (target?.id != null && !documentsRemove.includes(target.id)) {
      setDocumentsRemove([...documentsRemove, target.id]);
    }
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  const handleImport = async () => {
    if (!importFile) {
      notifyGlobal('Pilih file terlebih dahulu', 'info');
      return;
    }
    setImporting(true);
    try {
      await biayaRetribusi.import(importFile);
      setShowImportModal(false);
      setImportFile(null);
      notifyGlobal('Import berhasil', 'success');
      fetchItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Import gagal'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setEditingStatus(null);
    setEditingDepo('');
    setEditingNamaDepo('');
    setSourceType(null);
    setFormStep(1);
    setTariffOpen(false);
    setBiayaConfig(BIAYA_CONFIG_FALLBACK);
    setDocumentsRemove([]);
    setSelectedCandidates([]);
    setCandidates([]);
    setCandidateNominals({});
    setManualDetails([]);
    setFormData({ tanggal_pengajuan: '', details: [], documents: [] });
    setOpenModal(true);
  };

  const openEditModal = (item: BiayaRetribusiItem) => {
    setEditingId(item.id);
    setBiayaConfig(BIAYA_CONFIG_FALLBACK);
    setEditingStatus(item.status);
    setSourceType('manual');
    setFormStep(2);
    setEditingDepo(item.kode_depo || '');
    setEditingNamaDepo(item.nama_depo || '');
    setFormData({
      tanggal_pengajuan: toDateInputValue(item.tanggal_pengajuan),
      details: item.details.map((d) => ({ ...d })),
      documents: (item.documents || []).map((doc: unknown) => {
        const d = doc as { id?: number; document_type: string; file_path: string; file_name: string; file_size?: number };
        return { id: d.id, document_type: d.document_type, file: null, file_name: d.file_name, file_path: d.file_path, file_size: d.file_size };
      }),
    });
    setDocumentsRemove([]);
    setManualDetails([]);
    setOpenModal(true);
  };

  const openViewModal = (item: BiayaRetribusiItem) => {
    setViewItem(normalizeBiayaRetribusiItem(item));
  };

  const viewSubmitBlockers = viewItem ? viewBlockers(viewItem) : [];
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
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <svg className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Biaya Retribusi</h1>
                <p className="mt-0.5 text-ink-fg-muted">Queue pengajuan biaya retribusi berbasis penerimaan (receiving)</p>
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

        {configFallback && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-700" role="alert">
            <span>Tarif fallback dipakai — config tarif gagal dimuat. Muat ulang untuk tarif terbaru.</span>
            <button type="button" onClick={() => setConfigRetry((c) => c + 1)} className="font-semibold hover:underline whitespace-nowrap">Muat ulang</button>
          </div>
        )}

        <div className={`rounded-2xl border border-gray-100 bg-surface-card px-5 py-4 shadow-sm transition-opacity ${loading && summary ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="px-2 py-1">
              <p className="text-xs text-slate-500">Total Nominal</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{formatCurrency(summary?.total_nominal ?? 0)}</p>
            </div>
            <div onClick={() => { setStatusFilter(statusFilter === 'pending' ? '' : 'pending'); setPage(1); }} className="border-l border-slate-100 px-2 py-1 sm:pl-5 cursor-pointer hover:bg-amber-50/50 rounded-lg transition-colors">
              <p className="text-xs text-slate-500">Menunggu</p>
              <p className="mt-1 text-2xl font-bold text-amber-600 tabular-nums">{summary?.pending ?? 0}</p>
            </div>
            <div onClick={() => { setStatusFilter(statusFilter === 'approved' ? '' : 'approved'); setPage(1); }} className="border-l border-slate-100 px-2 py-1 sm:pl-5 cursor-pointer hover:bg-emerald-50/50 rounded-lg transition-colors">
              <p className="text-xs text-slate-500">Disetujui</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{summary?.approved ?? 0}</p>
            </div>
            <div onClick={() => { setStatusFilter(statusFilter === 'revisi' ? '' : 'revisi'); setPage(1); }} className="border-l border-slate-100 px-2 py-1 sm:pl-5 cursor-pointer hover:bg-orange-50/50 rounded-lg transition-colors">
              <p className="text-xs text-slate-500">Revisi</p>
              <p className="mt-1 text-2xl font-bold text-orange-600 tabular-nums">{summary?.revisi ?? 0}</p>
            </div>
            <div onClick={() => { setStatusFilter(statusFilter === 'rejected' ? '' : 'rejected'); setPage(1); }} className="border-l border-slate-100 px-2 py-1 sm:pl-5 cursor-pointer hover:bg-red-50/50 rounded-lg transition-colors">
              <p className="text-xs text-slate-500">Ditolak</p>
              <p className="mt-1 text-2xl font-bold text-red-600 tabular-nums">{summary?.rejected ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
          <div className="flex flex-col items-start gap-3 border-b border-gray-100 px-5 py-3 sm:flex-row sm:items-center">
            <div className="flex-1 w-full sm:w-auto">
              <SearchInput value={search} onChange={(v) => { setSearch(v); }} placeholder="Cari nopol, SJ, type, depo..." />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="select-field-sm w-full sm:w-auto">
              <option value="">Semua Status</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="checked">Checked</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="revisi">Revisi</option>
            </select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500">/page</span>
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="select-field-sm w-22.5">
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            {hasPermission('biaya_retribusi.create') && (
            <button onClick={openCreateModal} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-ink-800 active:scale-[0.98] sm:w-auto">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Buat Pengajuan
            </button>
            )}
            {hasPermission('biaya_retribusi.export') && (
              <button onClick={async () => { try { const res = await biayaRetribusi.export(); const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `biaya-retribusi-${todayLocal()}.xlsx`; a.click(); window.URL.revokeObjectURL(url); notifyGlobal('Export dimulai', 'success'); } catch (e) { notifyGlobal(getErrorMessage(e, 'Export gagal'), 'error'); } }} className="btn-secondary shrink-0">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 18v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>
                  Export
                </span>
              </button>
            )}
            {hasPermission('biaya_retribusi.import') && (
              <button onClick={() => setShowImportModal(true)} className="btn-secondary shrink-0">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Import
                </span>
              </button>
            )}
          </div>

        {/* Table - Desktop */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-300 bg-surface-raised">
                  <th scope="col" className="table-header cursor-pointer select-none" onClick={() => handleSort('tanggal_pengajuan')}>
                    Tanggal {sortIndicator('tanggal_pengajuan')}
                  </th>
                  <th scope="col" className="table-header">No SJ</th>
                  <th scope="col" className="table-header">Kendaraan</th>
                  <th scope="col" className="table-header">No Kendaraan</th>
                  <th scope="col" className="table-header">Depo</th>
                  <th scope="col" className="table-header text-center">Qty</th>
                  <th scope="col" className="table-header cursor-pointer select-none text-right" onClick={() => handleSort('nominal_biaya')}>
                    Total {sortIndicator('nominal_biaya')}
                  </th>
                  <th scope="col" className="table-header cursor-pointer select-none" onClick={() => handleSort('status')}>
                    Status {sortIndicator('status')}
                  </th>
                  <th scope="col" className="table-header text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <tr key={'skel-' + i} className="animate-pulse">
                        <td className="table-cell py-3"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-12 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3 text-center"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3 text-right"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3 text-center"><div className="h-5 w-16 bg-slate-100 rounded-full mx-auto" /></td>
                        <td className="table-cell py-3" />
                      </tr>
                    ))}
                  </>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="table-cell py-12">
                      <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        <span className="text-sm font-medium">Tidak ada data</span>
                        <button onClick={fetchItems} className="mt-1 text-xs font-bold text-accent-text hover:text-accent-text hover:underline inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                          Muat ulang
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const rowBlockers = viewBlockers(item);
                    return (
                    <tr key={item.id} className="hover:bg-overlay-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(item.tanggal_pengajuan)}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{renderChips(getSJShorts(item), getSJFull(item))}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{renderChips(getKendaraanTypes(item), getKendaraanTypes(item).join(', ') || '-')}</td>
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{renderChips(getNopols(item), getNopols(item).join(', ') || '-')}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{item.nama_depo}</td>
                      <td className="px-5 py-3 text-sm text-slate-600 text-center whitespace-nowrap">{getQtyLabel(item)}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-slate-800 tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <div className="flex items-center gap-1.5">
                            {badge(item.status)}
                            {item.is_rfah_required && (
                              <span className="inline-flex items-center rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700" title={item.rfah_name || 'RFAH'}>RFAH</span>
                            )}
                          </div>
                          <ApprovalPipeline steps={retribusiPipelineSteps(item)} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewModal(item)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Lihat" aria-label="Lihat">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </button>
                          {hasPermission('biaya_retribusi.edit') && canEditRow(item.status) && (
                          <button onClick={() => openEditModal(item)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Edit" aria-label="Edit">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                          </button>
                          )}
                          {hasPermission('biaya_retribusi.delete') && isDeletable(item.status) && (
                          <button onClick={() => handleDelete(item.id)} disabled={deletingId !== null} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Hapus" aria-label="Hapus">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"></path></svg>
                          </button>
                          )}
                          {hasPermission('approval.submit') && (hasPermission('biaya_retribusi.full_control') || item.status === 'draft') && (
                          <button onClick={() => handleQuickSubmit(item)} disabled={rowBlockers.length > 0} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-40" title={rowBlockers.length > 0 ? `Lengkapi dulu: ${rowBlockers.slice(0, 2).join(' · ')}` : 'Kirim untuk diperiksa'} aria-label="Kirim">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        {/* Cards - Mobile */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="bg-surface-card rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                <span className="text-sm font-medium">Memuat data...</span>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="bg-surface-card rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                <span className="text-sm font-medium">Tidak ada data</span>
                <button onClick={fetchItems} className="mt-1 text-xs font-bold text-accent-text hover:text-accent-text inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  Muat ulang
                </button>
              </div>
            </div>
          ) : (
            items.map((item) => {
              const rowBlockers = viewBlockers(item);
              return (
              <div key={item.id} className="bg-surface-card rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-chip-primary flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{getNopols(item).slice(0, 2).join(', ') || item.nama_depo}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(item.tanggal_pengajuan)}</p>
                    </div>
                  </div>
                  {badge(item.status)}
                </div>
                <div className="mb-3">
                  <ApprovalPipeline steps={retribusiPipelineSteps(item)} />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.is_rfah_required && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                        RFAH
                      </span>
                    )}
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">SJ: {getSJShorts(item).join(', ') || '-'}</span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{getKendaraanTypes(item).join(', ') || '-'}</span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{getQtyLabel(item)}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</span>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button onClick={() => openViewModal(item)} className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Lihat
                  </button>
                   {hasPermission('biaya_retribusi.edit') && canEditRow(item.status) && (
                   <button onClick={() => openEditModal(item)} className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-semibold text-amber-600 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                     Edit
                   </button>
                   )}
                   {hasPermission('biaya_retribusi.delete') && isDeletable(item.status) && (
                   <button onClick={() => handleDelete(item.id)} disabled={deletingId !== null} className="min-h-11 min-w-11 flex items-center justify-center text-red-400 bg-red-50 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"></path></svg>
                   </button>
                   )}
                   {hasPermission('approval.submit') && (hasPermission('biaya_retribusi.full_control') || item.status === 'draft') && (
                   <button onClick={() => handleQuickSubmit(item)} disabled={rowBlockers.length > 0} className="min-h-11 min-w-11 flex items-center justify-center text-emerald-500 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40" title={rowBlockers.length > 0 ? `Lengkapi dulu: ${rowBlockers.slice(0, 2).join(' · ')}` : 'Kirim'}>
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                   </button>
                   )}
                </div>
              </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <p className="text-xs text-slate-500 tabular-nums mr-2">Halaman {page} dari {totalPages}</p>
            {pageWindow(page, totalPages).map((p, idx) => p === '…' ? (
              <span key={`e${idx}`} className="text-xs text-slate-400 px-1" aria-hidden="true">…</span>
            ) : (
              <button key={p} onClick={() => setPage(p)} className={`min-h-11 min-w-11 rounded-xl text-sm font-medium transition-all ${page === p ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'bg-surface-card border border-gray-300 text-gray-600 hover:bg-surface-raised'}`}>{p}</button>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Modal open={openModal} onClose={() => { setOpenModal(false); setEditingId(null); setEditingStatus(null); }} title={editingId ? 'Edit Biaya Retribusi' : 'Buat Biaya Retribusi'} subtitle={`Langkah ${formStep} dari 4: ${WIZARD_LABELS[formStep - 1]}`} size="2xl" footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {formStep === 2 && blockerReasons.length > 0 && !busy && (
              <p className="text-xs font-semibold text-amber-600 sm:mr-auto">Lengkapi dulu: {blockerReasons.slice(0, 2).join(' · ')}{blockerReasons.length > 2 ? ` (+${blockerReasons.length - 2})` : ''}</p>
            )}
            {formStep === 4 && submitBlockers.length > 0 && !busy && (
              <p className="text-xs font-semibold text-amber-600 sm:mr-auto">Belum bisa dikirim: {submitBlockers.slice(0, 2).join(' · ')}{submitBlockers.length > 2 ? ` (+${submitBlockers.length - 2})` : ''}</p>
            )}
            <button type="button" onClick={() => { setOpenModal(false); setEditingId(null); setEditingStatus(null); }} className="btn-secondary w-full sm:w-auto">Batal</button>
            {formStep > minStep && (
              <button type="button" onClick={goBack} disabled={busy} className="btn-secondary w-full sm:w-auto">‹ Kembali</button>
            )}
            {formStep < 4 && (
              <button type="button" onClick={goNext} disabled={busy || (formStep === 1 && !editingId && !sourceType) || (formStep === 2 && blockerReasons.length > 0)} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                {formStep === 3 ? 'Review ›' : 'Lanjut ›'}
              </button>
            )}
            {formStep === 4 && (
              <>
                <button type="button" onClick={previewRetribusi} disabled={busy || blockerReasons.length > 0} className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  Preview PDF
                </button>
                {!editingId ? (
                  <>
                    <button type="button" onClick={handleCreate} disabled={busy || blockerReasons.length > 0} title="Hanya menyimpan — belum masuk antrean pemeriksaan" className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-600" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                      {busy ? 'Menyimpan...' : 'Simpan Draft'}
                    </button>
                    <button type="button" onClick={handleCreateAndSubmit} disabled={busy || submitBlockers.length > 0} title={submitBlockers.length > 0 ? `Belum bisa dikirim: ${submitBlockers.slice(0, 2).join(' · ')}` : 'Simpan dan langsung kirim ke antrean pemeriksaan'} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>}
                      {busy ? 'Mengirim...' : 'Simpan & Kirim'}
                    </button>
                  </>
                ) : editingStatus === 'revisi' ? (
                  <>
                    <button type="button" onClick={handleUpdate} disabled={busy || blockerReasons.length > 0} title="Hanya menyimpan perbaikan" className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-600" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                      {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                    <button type="button" onClick={handleUpdateAndSubmit} disabled={busy || submitBlockers.length > 0} title={submitBlockers.length > 0 ? `Belum bisa dikirim: ${submitBlockers.slice(0, 2).join(' · ')}` : 'Simpan perbaikan lalu kirim kembali ke approver yang meminta revisi'} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>}
                      {busy ? 'Mengirim...' : 'Simpan Perubahan & Kirim Ulang'}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={handleUpdate} disabled={busy || blockerReasons.length > 0} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                    {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                    {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                )}
              </>
            )}
          </div>
        }>
          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="hidden rounded-3xl bg-ink-950 p-5 text-white shadow-xl lg:block">
              <div className="mb-8">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary-200">Retribusi Claim</span>
                <h3 className="mt-4 text-xl font-black tracking-tight">Susun biaya dengan cepat.</h3>
                <p className="mt-2 text-xs leading-5 text-ink-fg-muted">Gunakan kandidat THL atau tambahkan baris manual, lalu lampirkan dokumen pendukung.</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Tipe', note: sourceType === 'receiving' ? 'Otomatis receiving' : sourceType === 'manual' ? 'Borongan manual' : 'Belum dipilih', done: stepDone[0] },
                  { label: 'Data', note: selectedRowCount > 0 ? `${selectedRowCount} baris${!stepDone[1] ? ' · belum lengkap' : ''}` : 'Belum ada baris', done: stepDone[1] },
                  { label: 'Lampiran', note: `${formData.documents.length} dokumen`, done: stepDone[2] },
                  { label: 'Review', note: formStep === 4 ? 'Periksa & kirim' : 'Terakhir', done: false },
                ].map((item, index) => {
                  const stepNo = index + 1;
                  const isCurrent = formStep === stepNo;
                  const canJump = stepNo < formStep && stepNo >= minStep;
                  return (
                  <button key={item.label} type="button" disabled={!canJump} onClick={() => setFormStep(stepNo)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${isCurrent ? 'bg-white/15' : ''} ${canJump ? 'hover:bg-white/10 cursor-pointer' : item.done ? '' : 'cursor-default'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${item.done ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-primary-500 text-white' : 'bg-white/10 text-ink-fg'}`}>{item.done ? '✓' : stepNo}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black">{item.label}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-ink-fg-muted">{item.note}</span>
                    </span>
                  </button>
                  );
                })}
              </div>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-200">Total pengajuan</p>
                <p className="mt-2 text-2xl font-black tabular-nums">{formatCurrency(totalNominal)}</p>
                <p className="mt-1 text-[10px] text-ink-fg-muted">{isRfahRequired ? 'RFAH diperlukan untuk pengajuan ini' : 'Belum melewati ambang RFAH'}</p>
                {selectedRowCount > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">
                    {formData.details.slice(0, 3).map((d, i) => (
                      <li key={`e-${i}`} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate font-mono text-ink-fg-muted">{upper(d.nopol_kendaraan) || `Baris #${i + 1}`}</span>
                        <span className="shrink-0 font-bold tabular-nums text-white">{formatCurrency(existingNominal(d))}</span>
                      </li>
                    ))}
                    {selectedCandidates.slice(0, Math.max(0, 3 - formData.details.length)).map((id) => {
                      const c = candidates.find((c2) => c2.id === id);
                      if (!c) return null;
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="truncate font-mono text-ink-fg-muted">{upper(c.nopol_kendaraan)}</span>
                          <span className="shrink-0 font-bold tabular-nums text-white">{formatCurrency(candidateNominal(id))}</span>
                        </li>
                      );
                    })}
                    {manualDetails.slice(0, Math.max(0, 3 - formData.details.length - Math.min(selectedCandidates.length, 3))).map((md, i) => (
                      <li key={`m-${i}`} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate font-mono text-ink-fg-muted">{upper(md.nopol_kendaraan) || `Manual #${i + 1}`}</span>
                        <span className="shrink-0 font-bold tabular-nums text-white">{formatCurrency(manualNominal(md))}</span>
                      </li>
                    ))}
                    {selectedRowCount > 3 && <li className="text-[10px] text-ink-fg-muted">+{selectedRowCount - 3} baris lainnya</li>}
                  </ul>
                )}
              </div>
            </aside>
            <div className="min-w-0">
          <div className="space-y-4 sm:space-y-5">
            <div className="sticky top-0 z-10 lg:hidden rounded-2xl border border-slate-300 bg-surface-card px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5">
                {WIZARD_LABELS.map((label, i) => {
                  const stepNo = i + 1;
                  const isCurrent = formStep === stepNo;
                  const isDone = stepDone[i];
                  return (
                  <div key={label} className="flex flex-1 items-center gap-1.5 last:flex-none">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ring-2 ${isDone ? 'bg-emerald-500 text-white ring-emerald-200' : isCurrent ? 'bg-primary-600 text-white ring-brand-wash-strong' : 'bg-slate-100 text-slate-400 ring-slate-100'}`}>{isDone ? '✓' : stepNo}</span>
                    <span className={`text-[10px] font-bold ${isDone ? 'text-emerald-700' : isCurrent ? 'text-accent-text' : 'text-slate-400'}`}>{label}</span>
                    {i < 3 && <span className={`h-0.5 flex-1 rounded-full ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                  </div>
                  );
                })}
              </div>
            </div>
            <div className="sticky top-0 z-10 hidden rounded-2xl border border-slate-300 bg-surface-card p-4 shadow-sm lg:block">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Alur pengajuan</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">Langkah {formStep} dari 4</p>
                </div>
                <span className="rounded-full border border-chip-primary-border bg-chip-primary px-2.5 py-1 text-[10px] font-black text-accent-text">
                  {selectedRowCount} baris
                </span>
              </div>
              <div className="flex items-center">
                {WIZARD_LABELS.map((label, i) => {
                  const stepNo = i + 1;
                  const isDone = stepDone[i];
                  const isCurrent = formStep === stepNo;
                  const isLast = i === WIZARD_LABELS.length - 1;
                  return (
                  <div key={label} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ring-2 transition-all ${isDone ? 'bg-emerald-500 text-white ring-emerald-200' : isCurrent ? 'bg-primary-600 text-white ring-brand-wash-strong shadow-md' : 'bg-slate-100 text-slate-400 ring-slate-100'}`}>{isDone ? '✓' : stepNo}</span>
                    {!isLast && <div className={`mx-2 h-0.5 flex-1 rounded-full ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                  </div>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {WIZARD_LABELS.map((label, i) => {
                  const isDone = stepDone[i];
                  const isCurrent = formStep === i + 1;
                  return (
                  <span key={label} className={`text-[10px] font-bold ${isDone ? 'text-emerald-700' : isCurrent ? 'text-accent-text' : 'text-slate-400'}`}>{isDone ? `✓ ${label}` : label}</span>
                  );
                })}
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-linear-to-r from-primary-500 to-primary-500 transition-all"
                  style={{ width: `${Math.max(stepProgress, 6)}%` }}
                />
              </div>
            </div>

            {formStep === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
            {/* Depo Badge */}
            <div className="flex flex-col gap-3 rounded-2xl border border-chip-primary-border bg-linear-to-r from-brand-wash via-brand-wash to-surface-card p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="w-10 h-10 rounded-xl bg-surface-card shadow-sm ring-1 ring-chip-primary-border flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-accent-text uppercase tracking-wider">Depo Pengajuan</p>
                <p className="text-sm font-bold text-gray-900 truncate">{targetDepoLabel}</p>
                {(isCandidateDepoUniform || isDepoInherited) && <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-text"><span className="h-1 w-1 rounded-full bg-primary-500" />Mengikuti depo receiving</p>}
              </div>
            </div>

            {/* Tanggal */}
            <div className="rounded-2xl border border-slate-300 bg-surface-card p-4 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                Tanggal Pengajuan <span className="text-red-500">*</span>
              </label>
              <input type="date" value={formData.tanggal_pengajuan} onChange={(e) => setFormData({ ...formData, tanggal_pengajuan: e.target.value })} className="input-field py-3 text-sm" />
            </div>
            </div>
            )}

            {!editingId && formStep === 1 && (
              <div className="rounded-2xl border border-slate-300 bg-surface-card p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-700">Pilih tipe pengajuan dulu <span className="text-red-400">*</span></p>
                <p className="mt-1 text-[11px] text-slate-400">Dua cara isi biaya — pilih yang sesuai, form berikutnya menyesuaikan otomatis.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button type="button" aria-pressed={sourceType === 'receiving'} onClick={() => switchSourceType('receiving')} className={`rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md active:scale-[0.99] ${sourceType === 'receiving' ? 'border-primary-600 bg-chip-primary shadow-md' : 'border-chip-primary-border bg-chip-primary/50 hover:border-primary-400'}`}>
                    <span className="mt-2 block text-sm font-black text-slate-900">Otomatis dari Receiving</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">Qty zak/crt & tanggal terisi sendiri dari receiving COMPLETED. Nominal mengikuti tarif koli depo.</span>
                  </button>
                  <button type="button" aria-pressed={sourceType === 'manual'} onClick={() => switchSourceType('manual')} className={`rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md active:scale-[0.99] ${sourceType === 'manual' ? 'border-slate-700 bg-surface-raised shadow-md' : 'border-slate-300 bg-surface-card hover:border-slate-400'}`}>
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">MANUAL</span>
                    <span className="mt-2 block text-sm font-black text-slate-900">Borongan / Manual</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">Ketik nopol, qty, dan nominal sendiri. Cocok untuk biaya satuan borongan.</span>
                  </button>
                </div>
              </div>
            )}

            {/* Ringkasan tipe & panel tarif hanya untuk koli/otomatis receiving.
                    Borongan/Manual tidak menampilkan kartu ini — nominal diisi manual. */}
            {!editingId && sourceType === 'receiving' && formStep === 2 && (
              <div className="rounded-2xl border border-slate-300 bg-surface-card p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-700">Otomatis dari Receiving</p>
                  <button type="button" onClick={() => switchSourceType(null)} className="shrink-0 text-[11px] font-bold text-accent-text hover:text-accent-text hover:underline">‹ Ganti tipe</button>
                </div>
                {isKoliMode && (
                <div className="mt-3 rounded-xl bg-surface-raised border border-slate-300 px-3 py-2.5">
                  <button type="button" onClick={() => setTariffOpen((v) => !v)} aria-expanded={tariffOpen} className="flex w-full flex-wrap items-center gap-2 text-left">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tarif berlaku</span>
                    <span className="text-xs font-bold text-slate-800">{targetDepoLabel}</span>
                    {isKoliMode ? (
                      <span className="text-xs font-semibold text-accent-text">1 zak Rp {Number(biayaConfig.retribusi_rate_zak).toLocaleString('id-ID')} · 1 crt Rp {Number(biayaConfig.retribusi_rate_crt).toLocaleString('id-ID')}</span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500">Borongan — nominal diisi manual</span>
                    )}
                    <svg className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${tariffOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  {tariffOpen && (
                    <div className="mt-2 border-t border-slate-300 pt-2">
                      <p className="text-[11px] text-slate-500">
                        {isKoliMode
                          ? 'Nominal tiap baris = qty zak × tarif zak + qty crt × tarif crt, dihitung otomatis.'
                          : 'Depo ini memakai borongan: qty hanya info, nominal diketik manual per baris.'}
                      </p>
                      {hasPermission('retribusi_rates.manage') && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select value={rateDraft.mode} onChange={(e) => setRateDraft((p) => ({ ...p, mode: e.target.value as 'borongan' | 'koli' }))} className="select-field-sm text-xs" aria-label="Mode hitung depo">
                            <option value="borongan">Borongan</option>
                            <option value="koli">Koli</option>
                          </select>
                          <label className="flex items-center gap-1 text-[11px] text-slate-500">Rp/zak
                            <input type="number" min={0} value={rateDraft.rate_zak || ''} disabled={rateDraft.mode !== 'koli'} onChange={(e) => setRateDraft((p) => ({ ...p, rate_zak: Number(e.target.value) }))} placeholder="0" className="input-field w-24 py-1.5 text-right text-xs disabled:bg-slate-100" aria-label="Tarif per zak" />
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-slate-500">Rp/crt
                            <input type="number" min={0} value={rateDraft.rate_crt || ''} disabled={rateDraft.mode !== 'koli'} onChange={(e) => setRateDraft((p) => ({ ...p, rate_crt: Number(e.target.value) }))} placeholder="0" className="input-field w-24 py-1.5 text-right text-xs disabled:bg-slate-100" aria-label="Tarif per crt" />
                          </label>
                          <button type="button" onClick={saveRates} disabled={rateSaving || !effectiveKode} className="min-h-9 rounded-lg bg-ink-900 px-3 text-[11px] font-bold text-white hover:bg-ink-800 disabled:opacity-50">
                            {rateSaving ? 'Menyimpan...' : 'Simpan tarif'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
            )}

            {/* Pilih Kandidat */}
            {!editingId && sourceType === 'receiving' && formStep === 2 && (
              <div>
                <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-chip-primary text-accent-text">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                    </span>
                    Pilih dari Penerimaan (Receiving)
                  </span>
                  {selectedCandidates.length > 0 && (
                    <span className="rounded-full bg-chip-primary px-2 py-0.5 text-[10px] font-bold text-accent-text">{selectedCandidates.length} dipilih</span>
                  )}
                  {isKoliMode ? (
                    <span className="rounded-full bg-chip-primary px-2 py-0.5 text-[10px] font-bold text-accent-text">Mode Koli: 1 zak Rp {Number(biayaConfig.retribusi_rate_zak).toLocaleString('id-ID')} · 1 crt Rp {Number(biayaConfig.retribusi_rate_crt).toLocaleString('id-ID')}</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Mode Borongan: nominal manual</span>
                  )}
                </div>
                <button onClick={() => fetchCandidates()} disabled={busy} className={`w-full mb-3 rounded-xl py-2.5 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 ${candidates.length > 0 ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                  {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>}
                  {busy ? 'Mencari...' : candidates.length > 0 ? 'Muat ulang receiving' : 'Muat Receiving Selesai'}
                </button>
                <p className="mb-3 text-[11px] text-slate-400">Hanya receiving COMPLETED yang sudah divalidasi checker dan belum diklaim. Qty zak/crt dan tanggal pengajuan terisi otomatis dari receiving — tanpa input ulang.</p>
                {candidates.length === 0 && !busy && (
                  <div className="rounded-xl border-2 border-dashed border-slate-300 bg-overlay-60 p-6 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-card shadow-sm ring-1 ring-gray-300">
                      <svg className="h-5 w-5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18" /></svg>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">Belum ada data receiving</p>
                    <p className="mt-1 text-[11px] text-slate-400">Klik “Muat receiving” untuk menampilkan yang siap diklaim</p>
                  </div>
                )}
                {candidates.length > 0 && (
                  <>
                  <div className="max-h-72 overflow-auto rounded-xl border border-gray-300 shadow-sm hidden sm:block">
                    <table className="min-w-170 w-full text-xs">
                      <thead className="sticky top-0 bg-surface-raised">
                        <tr>
                          <th className="table-header text-center w-10">
                            <input type="checkbox" checked={selectedCandidates.length === candidates.length} onChange={() => setSelectedCandidates(selectedCandidates.length === candidates.length ? [] : candidates.map(c => c.id))} className="rounded border-gray-300 text-accent-text w-4 h-4" />
                          </th>
                          <th className="table-header">Tgl Selesai</th>
                          <th className="table-header">Nopol</th>
                          <th className="table-header">Type</th>
                          <th className="table-header">PO</th>
                          <th className="table-header">Driver</th>
                          <th className="table-header">Checker</th>
                          <th className="table-header text-right">Qty Zak</th>
                          <th className="table-header text-right">Qty Crt</th>
                          <th className="table-header text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {candidates.map((c) => (
                          <tr key={c.id} className={`hover:bg-overlay-50 cursor-pointer transition-colors ${selectedCandidates.includes(c.id) ? 'bg-chip-primary/50' : ''}`} onClick={() => toggleCandidate(c.id)}>
                            <td className="table-cell text-center"><input type="checkbox" checked={selectedCandidates.includes(c.id)} onChange={() => toggleCandidate(c.id)} className="rounded border-gray-300 text-accent-text w-4 h-4" onClick={(e) => e.stopPropagation()} /></td>
                            <td className="table-cell whitespace-nowrap">{formatDate(c.tanggal_selesai)}</td>
                            <td className="table-cell font-mono font-medium">{upper(c.nopol_kendaraan)}</td>
                            <td className="table-cell">{upper(c.type_kendaraan)}</td>
                            <td className="table-cell font-mono text-gray-500">{c.po_transporter}</td>
                            <td className="table-cell">{c.driver_name}</td>
                            <td className="table-cell text-gray-500">{c.checker_name}</td>
                            <td className="table-cell text-right tabular-nums" title="Otomatis dari receiving">{Number(c.qty_zak || 0).toLocaleString('id-ID')} <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-400">AUTO</span></td>
                            <td className="table-cell text-right tabular-nums" title="Otomatis dari receiving">{Number(c.qty_crt || 0).toLocaleString('id-ID')} <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-400">AUTO</span></td>
                            <td className="table-cell text-right" onClick={(e) => e.stopPropagation()}>
                              {isKoliMode ? (
                                <span className="text-xs font-bold text-slate-800 tabular-nums" title={`${Number(c.qty_zak || 0).toLocaleString('id-ID')} zak × Rp ${Number(biayaConfig.retribusi_rate_zak).toLocaleString('id-ID')} + ${Number(c.qty_crt || 0).toLocaleString('id-ID')} crt × Rp ${Number(biayaConfig.retribusi_rate_crt).toLocaleString('id-ID')}`}>{formatCurrency(candidateNominal(c.id))}</span>
                              ) : (
                                <input type="number" min={0} value={candidateNominals[c.id] ?? ''} onChange={(e) => setCandidateNominals((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))} placeholder="Rp" className={`input-field w-28 py-1.5 text-right text-xs ${selectedCandidates.includes(c.id) && candidateNominal(c.id) <= 0 ? 'border-red-300 ring-1 ring-red-200' : ''}`} aria-label={`Nominal ${c.nopol_kendaraan}`} />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sm:hidden space-y-2">
                    {candidates.map((c) => {
                      const checked = selectedCandidates.includes(c.id);
                      return (
                        <div key={c.id} onClick={() => toggleCandidate(c.id)} className={`rounded-xl border p-3 transition-colors ${checked ? 'border-primary-300 bg-chip-primary/50' : 'border-gray-300 bg-surface-card'}`}>
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={checked} onChange={() => toggleCandidate(c.id)} onClick={(e) => e.stopPropagation()} className="rounded border-gray-300 text-accent-text w-4 h-4 shrink-0" aria-label={`Pilih ${c.nopol_kendaraan}`} />
                            <p className="font-mono font-bold text-sm text-slate-800">{upper(c.nopol_kendaraan)}</p>
                            <span className="ml-auto text-[11px] text-slate-500">{formatDate(c.tanggal_selesai)}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{upper(c.type_kendaraan)} · {c.po_transporter} · {c.driver_name}</p>
                          <p className="mt-1 text-[11px] text-slate-500 tabular-nums">Otomatis: {Number(c.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(c.qty_crt || 0).toLocaleString('id-ID')} crt</p>
                          <div onClick={(e) => e.stopPropagation()}>
                            {isKoliMode ? (
                              <p className="mt-2 text-sm font-black text-slate-900 tabular-nums">{formatCurrency(candidateNominal(c.id))}</p>
                            ) : (
                              <input type="number" min={0} value={candidateNominals[c.id] ?? ''} onChange={(e) => setCandidateNominals((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))} placeholder="Nominal Rp" className={`mt-2 input-field w-full py-2 text-sm text-right font-bold ${checked && candidateNominal(c.id) <= 0 ? 'border-red-300 ring-1 ring-red-200' : ''}`} aria-label={`Nominal ${c.nopol_kendaraan}`} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </>
                )}
              </div>
            )}

            {/* Baris Tersimpan (edit mode) */}
            {editingId && formData.details.length > 0 && formStep === 2 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  </span>
                  Baris Tersimpan
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{formData.details.length} baris</span>
                </label>
              </div>
              <div className="space-y-2">
                {formData.details.map((d, i) => (
                  <details key={i} open className="group relative rounded-lg border border-gray-100 bg-surface-card">
                    <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-raised rounded-lg transition-colors list-none">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center text-[10px] font-bold text-emerald-700 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-gray-800 block truncate">{d.nopol_kendaraan || `Tersimpan #${i + 1}`}</span>
                        <span className="text-[11px] text-gray-400">{d.type_kendaraan || 'Pilih type'} · {formatCurrency(Number(existingNominal(d)) || 0)}</span>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </summary>
                    <button type="button" onClick={() => removeExistingDetail(i)} className="absolute right-10 top-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus baris tersimpan ${i + 1}`}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            Plat Kendaraan <span className="text-red-400">*</span>
                          </label>
                          <input type="text" value={d.nopol_kendaraan} onChange={(e) => updateExistingDetail(i, 'nopol_kendaraan', e.target.value.toUpperCase())} placeholder="KB 1234 XX" id={`existing-row-${i}-nopol_kendaraan`} className="input-field py-2 text-sm font-mono uppercase" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            Type Kendaraan <span className="text-red-400">*</span>
                          </label>
                          <select value={d.type_kendaraan} onChange={(e) => updateExistingDetail(i, 'type_kendaraan', e.target.value)} id={`existing-row-${i}-type_kendaraan`} className="select-field py-2 text-sm">
                            <option value="">Pilih</option>
                            {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            No. SJ
                          </label>
                          <input type="text" value={d.no_surat_jalan} onChange={(e) => updateExistingDetail(i, 'no_surat_jalan', e.target.value)} placeholder="Nomor SJ" id={`existing-row-${i}-no_surat_jalan`} className="input-field py-2 text-sm font-mono" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            Qty Zak
                          </label>
                          <input type="number" min="0" value={d.qty_zak || ''} onChange={(e) => updateExistingDetail(i, 'qty_zak', Number(e.target.value))} placeholder="0" id={`existing-row-${i}-qty_zak`} className="input-field py-2 text-sm text-right" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            Qty Crt
                          </label>
                          <input type="number" min="0" value={d.qty_crt || ''} onChange={(e) => updateExistingDetail(i, 'qty_crt', Number(e.target.value))} placeholder="0" id={`existing-row-${i}-qty_crt`} className="input-field py-2 text-sm text-right" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            Nominal (Rp) <span className="text-red-400">*</span>
                          </label>
                          <input type="number" min="0" value={d.nominal_biaya || ''} onChange={(e) => updateExistingDetail(i, 'nominal_biaya', Number(e.target.value))} placeholder="0" id={`existing-row-${i}-nominal_biaya`} className="input-field py-2 text-sm font-bold" />
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
            )}

            {/* Baris Manual */}            {/* Baris Manual */}
            {(editingId || sourceType === 'manual') && formStep === 2 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  </span>
                  Baris Manual
                  {manualDetails.length > 0 && (
                    <span className="rounded-full bg-chip-primary px-2 py-0.5 text-[10px] font-bold text-accent-text">{manualDetails.length} baris</span>
                  )}
                </label>
                <button type="button" onClick={addManualDetail} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 transition-colors inline-flex items-center gap-1 shadow-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Tambah Baris
                </button>
              </div>

              {manualDetails.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-chip-primary-border bg-surface-card p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Plat Kendaraan <span className="text-red-400">*</span>
                      </label>
                      <input type="text" onChange={(e) => startManualRow('nopol_kendaraan', e.target.value.toUpperCase())} placeholder="KB 1234 XX" className="input-field py-2 text-sm font-mono uppercase" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Type Kendaraan <span className="text-red-400">*</span>
                      </label>
                      <select defaultValue="" onChange={(e) => startManualRow('type_kendaraan', e.target.value)} className="select-field py-2 text-sm">
                        <option value="">Pilih</option>
                        {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        No. SJ
                      </label>
                      <input type="text" onChange={(e) => startManualRow('no_surat_jalan', e.target.value)} placeholder="Nomor SJ" className="input-field py-2 text-sm font-mono" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Qty Zak
                      </label>
                      <input type="number" min="0" onChange={(e) => startManualRow('qty_zak', Number(e.target.value))} placeholder="0" className="input-field py-2 text-sm text-right" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Qty Crt
                      </label>
                      <input type="number" min="0" onChange={(e) => startManualRow('qty_crt', Number(e.target.value))} placeholder="0" className="input-field py-2 text-sm text-right" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Nominal (Rp) <span className="text-red-400">*</span>
                      </label>
                      <input type="number" min="0" onChange={(e) => startManualRow('nominal_biaya', Number(e.target.value))} placeholder="0" className="input-field py-2 text-sm font-bold" />
                    </div>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659 1.171-1.671a4.5 4.5 0 015.07-1.651 3 3 0 011.482 5.369L12 12" /></svg>
                    Isi langsung di sini — baris pertama otomatis terbentuk. Gunakan “Tambah Baris” untuk baris berikutnya.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {manualDetails.map((md, i) => (
                    <details key={i} open className="group relative rounded-lg border border-gray-100 bg-surface-card">
                      <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-raised rounded-lg transition-colors list-none">
                        <div className="w-6 h-6 rounded-md bg-chip-primary border border-chip-primary-border flex items-center justify-center text-[10px] font-bold text-accent-text shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-gray-800 block truncate">{upper(md.nopol_kendaraan) || `Manual #${i + 1}`}</span>
                          <span className="text-[11px] text-gray-400">{md.type_kendaraan || 'Pilih type'} · {formatCurrency(Number(md.nominal_biaya) || 0)}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </summary>
                      <button type="button" onClick={() => removeManualDetail(i)} className="absolute right-10 top-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus baris manual ${i + 1}`}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>

                      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Plat Kendaraan <span className="text-red-400">*</span>
                            </label>
                            <input type="text" value={md.nopol_kendaraan} onChange={(e) => updateManualDetail(i, 'nopol_kendaraan', e.target.value.toUpperCase())} placeholder="KB 1234 XX" id={`manual-row-${i}-nopol_kendaraan`} className="input-field py-2 text-sm font-mono uppercase" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Type Kendaraan <span className="text-red-400">*</span>
                            </label>
                            <select value={md.type_kendaraan} onChange={(e) => updateManualDetail(i, 'type_kendaraan', e.target.value)} id={`manual-row-${i}-type_kendaraan`} className="select-field py-2 text-sm">
                              <option value="">Pilih</option>
                              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              No. SJ
                            </label>
                            <input type="text" value={md.no_surat_jalan} onChange={(e) => updateManualDetail(i, 'no_surat_jalan', e.target.value)} placeholder="Nomor SJ" id={`manual-row-${i}-no_surat_jalan`} className="input-field py-2 text-sm font-mono" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Qty Zak
                            </label>
                            <input type="number" min="0" value={md.qty_zak || ''} onChange={(e) => updateManualDetail(i, 'qty_zak', Number(e.target.value))} placeholder="0" id={`manual-row-${i}-qty_zak`} className="input-field py-2 text-sm text-right" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Qty Crt
                            </label>
                            <input type="number" min="0" value={md.qty_crt || ''} onChange={(e) => updateManualDetail(i, 'qty_crt', Number(e.target.value))} placeholder="0" id={`manual-row-${i}-qty_crt`} className="input-field py-2 text-sm text-right" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Nominal (Rp) <span className="text-red-400">*</span>
                            </label>
                            <input type="number" min="0" value={md.nominal_biaya || ''} onChange={(e) => updateManualDetail(i, 'nominal_biaya', Number(e.target.value))} placeholder="0" id={`manual-row-${i}-nominal_biaya`} className="input-field py-2 text-sm font-bold" />
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Dokumen Lampiran */}
            {formStep === 3 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
                  Dokumen Lampiran
                  {formData.documents.length > 0 && (
                    <span className="rounded-full bg-chip-primary px-2 py-0.5 text-[10px] font-bold text-accent-text">{formData.documents.length} dokumen</span>
                  )}
                </label>
                <button type="button" onClick={addDocument} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 transition-colors inline-flex items-center gap-1 shadow-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Tambah Dokumen
                </button>
              </div>

              {formData.documents.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-chip-primary-border bg-surface-card p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Tipe Dokumen <span className="text-red-400">*</span>
                      </label>
                      <select defaultValue="" onChange={(e) => { const t = e.target.value; if (t) startDocument('document_type', t); }} className="select-field py-2 text-sm">
                        <option value="">Pilih</option>
                        {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        File <span className="text-red-400">*</span>
                      </label>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" id="doc-file-start" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) startDocument('file', file);
                        e.target.value = '';
                      }} />
                      <label htmlFor="doc-file-start" className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-surface-raised px-4 py-3 text-sm text-gray-600 hover:border-primary-400 hover:bg-chip-primary/50 cursor-pointer transition-colors">
                        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.939A4 4 0 1118.8 7.372l-10.94 10.938a2.5 2.5 0 01-3.536-3.536l10.94-10.938a1 1 0 011.414 1.414l-10.94 10.938a.5.5 0 01-.707-.707l7.693-7.693a1 1 0 011.414 1.414z" /></svg>
                        <span className="min-w-0 flex-1 truncate">Pilih file (PDF, JPG, PNG, WEBP — maks 20 MB)</span>
                      </label>
                    </div>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659 1.171-1.671a4.5 4.5 0 015.07-1.651 3 3 0 011.482 5.369L12 12" /></svg>
                    Pilih tipe atau file langsung di sini — dokumen pertama otomatis terbentuk. Gunakan “Tambah Dokumen” untuk menambahkan berikutnya.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {formData.documents.map((doc, i) => (
                    <details key={i} open className="group relative rounded-lg border border-gray-100 bg-surface-card">
                      <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-raised rounded-lg transition-colors list-none">
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
                              if (file) void handleDocFile(i, file);
                              e.target.value = '';
                            }} />
                            <label htmlFor={`doc-file-${i}`} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-surface-raised px-4 py-3 text-sm text-gray-600 hover:border-primary-400 hover:bg-chip-primary/50 cursor-pointer transition-colors">
                              <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.939A4 4 0 1118.8 7.372l-10.94 10.938a2.5 2.5 0 01-3.536-3.536l10.94-10.938a1 1 0 011.414 1.414l-10.94 10.938a.5.5 0 01-.707-.707l7.693-7.693a1 1 0 011.414 1.414z" /></svg>
                              <span className="min-w-0 flex-1 truncate">{doc.file_name || 'Pilih file (PDF, JPG, PNG, WEBP — maks 20 MB)'}</span>
                              {doc.file && <span className="shrink-0 text-[11px] font-bold text-slate-500 tabular-nums">{formatBytes(doc.file.size)}</span>}
                            </label>
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Review ringkasan */}
            {formStep === 4 && (
              <div className="rounded-2xl border border-slate-300 bg-surface-card p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-700">Periksa kembali sebelum dikirim</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Depo</dt>
                    <dd className="font-bold text-slate-800">{targetDepoLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Tanggal</dt>
                    <dd className="font-bold text-slate-800">{formatDate(formData.tanggal_pengajuan)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Mode hitung</dt>
                    <dd className="font-bold text-slate-800">{isKoliSession ? `Koli (zak Rp ${Number(biayaConfig.retribusi_rate_zak).toLocaleString('id-ID')} · crt Rp ${Number(biayaConfig.retribusi_rate_crt).toLocaleString('id-ID')})` : 'Borongan (manual)'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Dokumen</dt>
                    <dd className="font-bold text-slate-800">{formData.documents.length} lampiran</dd>
                  </div>
                </dl>
                <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {selectedCandidates.map((id) => {
                    const c = candidates.find((c2) => c2.id === id);
                    if (!c) return null;
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-slate-800">{upper(c.nopol_kendaraan)}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">{Number(c.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(c.qty_crt || 0).toLocaleString('id-ID')} crt · {c.po_transporter}</p>
                        </div>
                        <p className="shrink-0 font-bold tabular-nums text-slate-800">{formatCurrency(candidateNominal(id))}</p>
                      </div>
                    );
                  })}
                  {formData.details.map((d, i) => (
                    <div key={`e-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-slate-800">{upper(d.nopol_kendaraan)}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{Number(d.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(d.qty_crt || 0).toLocaleString('id-ID')} crt</p>
                      </div>
                      <p className="shrink-0 font-bold tabular-nums text-slate-800">{formatCurrency(existingNominal(d))}</p>
                    </div>
                  ))}
                  {manualDetails.map((md, i) => (
                    <div key={`m-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-slate-800">{upper(md.nopol_kendaraan) || `Manual #${i + 1}`}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{Number(md.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(md.qty_crt || 0).toLocaleString('id-ID')} crt</p>
                      </div>
                      <p className="shrink-0 font-bold tabular-nums text-slate-800">{formatCurrency(manualNominal(md))}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            {(formStep === 2 || formStep === 4) && (
            <div className={`rounded-2xl border-2 p-4 transition-all sm:p-5 ${isRfahRequired ? 'border-amber-300 bg-linear-to-r from-amber-50 via-orange-50 to-amber-50 shadow-amber-100/50 shadow-lg' : 'border-chip-primary-border bg-linear-to-br from-brand-wash/70 to-surface-card shadow-sm'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${isRfahRequired ? 'bg-amber-100 text-amber-600' : 'bg-chip-primary text-accent-text'}`}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659 1.171-1.671a4.5 4.5 0 015.07-1.651 3 3 0 011.482 5.369L12 12" /></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Pengajuan</p>
                    <p className="text-xl font-black text-gray-900 tabular-nums">{formatCurrency(totalNominal)}</p>
                    <p className="text-[11px] text-gray-400">{selectedRowCount} baris dipilih{blockerReasons.length > 0 && !busy ? ` · ${blockerReasons[0]}` : ''}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ${isKoliSession ? 'bg-chip-primary text-accent-text' : 'bg-slate-100 text-slate-600'}`}>
                    {isKoliSession ? 'MODE KOLI' : 'MODE BORONGAN'}
                  </span>
                  {isRfahRequired && (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                        RFAH Required
                      </span>
                      <p className="text-[11px] text-amber-600 font-medium">Total &gt; Rp {biayaConfig.retribusi_rfah_threshold.toLocaleString('id-ID')} · {biayaConfig.rfah_name}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
            </div>
          </div>
        </Modal>

        {/* View Modal */}
        <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Biaya Retribusi" subtitle="Informasi lengkap pengajuan" size="lg" footer={
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3">
            {/* Kirim hanya untuk draft (masuk antrean); revisi/rejected dikirim ulang lewat edit modal "Simpan Perubahan & Kirim Ulang". */}
            {viewItem?.status === 'draft' ? (viewItem?.created_by === user?.id && hasPermission('approval.submit') ? <button onClick={() => void approvalAction('submit')} disabled={viewSubmitBlockers.length > 0} title={viewSubmitBlockers.length > 0 ? `Lengkapi dulu: ${viewSubmitBlockers.slice(0, 2).join(' · ')}` : 'Kirim ke antrean pemeriksaan'} className="btn-secondary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">Kirim</button> : null) : null}
            {viewItem?.status === 'pending' ? <>{hasRole('bac', 'admin_master') && hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}{hasRole('bac', 'admin_master') && hasPermission('approval.check') ? <button onClick={() => void approvalAction('check')} className="btn-secondary w-full sm:w-auto">Periksa</button> : null}</> : null}
            {viewItem?.status === 'checked' && viewItem ? <>{hasPermission('approval.reject') && (hasRole('rlh', 'admin_master')) ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') && (hasRole('rlh', 'admin_master')) ? <button onClick={() => openDecision('revise', viewItem)} className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600">Perlu Revisi</button> : null}{hasPermission('approval.approve') && (hasRole('rlh', 'admin_master')) ? <button onClick={() => openDecision('approve', viewItem)} className="btn-primary w-full sm:w-auto">Setujui</button> : null}</> : null}
            {viewItem?.status === 'rlh_approved' ? <>{hasPermission('approval.rfah') && hasRole('rfah', 'admin_master') ? <button onClick={() => void approvalAction('rfahApprove')} className="btn-primary w-full sm:w-auto">Setujui</button> : null}{hasPermission('approval.reject') && (hasRole('rfah', 'admin_master')) ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') && (hasRole('rfah', 'admin_master')) ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}</> : null}
            {viewItem && <button onClick={() => { void (async () => { try { const fresh = await loadLatestPdfItem(viewItem); previewRetribusiPdf({ tanggal_pengajuan: fresh.tanggal_pengajuan, kode_depo: fresh.kode_depo, nama_depo: fresh.nama_depo, nominal_biaya: Number(fresh.nominal_biaya), is_rfah_required: fresh.is_rfah_required, rfah_name: fresh.rfah_name, rfah_threshold: biayaConfig.retribusi_rfah_threshold, status: fresh.status, submitted_at: fresh.submitted_at, checked_at: fresh.checked_at, rlh_approved_at: fresh.rlh_approved_at, approved_at: fresh.approved_at, rejected_at: fresh.rejected_at, rejection_reason: fresh.rejection_reason, revised_at: fresh.revised_at, revisi_reason: fresh.revisi_reason, submittedBy: fresh.submittedBy, checkedBy: fresh.checkedBy, rlhApprovedBy: fresh.rlhApprovedBy, approvedBy: fresh.approvedBy, rejectedBy: fresh.rejectedBy, revisedBy: fresh.revisedBy, approval_sections: fresh.approval_sections, details: (fresh.details || []).map((d) => ({ nopol_kendaraan: d.nopol_kendaraan, type_kendaraan: d.type_kendaraan, no_surat_jalan: d.no_surat_jalan, nominal_biaya: Number(d.nominal_biaya), biaya_thl_detail: d.biaya_thl_detail ?? null })), documents: (fresh.documents || []).map((doc) => ({ id: doc.id, document_type: doc.document_type, file_name: doc.file_name, file_path: doc.file_path, file_size: doc.file_size })) }, { onWarning: warnLampiran }); } catch (e: unknown) { console.error('[Preview PDF]', e); notifyGlobal(e instanceof Error ? `Gagal membuka preview PDF: ${e.message}` : 'Gagal membuka preview PDF', 'error'); } })(); }} className="btn-secondary inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Preview PDF
            </button>}
            {viewItem?.status === 'approved' && viewItem && (viewItem.created_by === user?.id || hasRole('blc', 'admin_master')) ? <button onClick={() => downloadPdf(viewItem)} className="btn-primary inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Cetak PDF
            </button> : null}
            <button onClick={() => setViewItem(null)} className="btn-secondary w-full sm:w-auto">Tutup</button>
          </div>
        }>
          {viewItem && (
            <div className="space-y-5">
              {/* Dark header card */}
              <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 p-5 sm:p-6 text-white shadow-xl">
                <div aria-hidden="true" className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-primary-500/25 blur-3xl" />
                <div aria-hidden="true" className="absolute -bottom-24 -left-14 h-52 w-52 rounded-full bg-primary-500/15 blur-3xl" />
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/20">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0h7.5m-7.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h7.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h7.5a3 3 0 013 3m-16.5 0a3 3 0 00-3 3v7.5a3 3 0 003 3h7.5a3 3 0 003-3v-7.5a3 3 0 00-3-3h-7.5a3 3 0 00-3 3z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-300/90">Biaya Retribusi</p>
                      <p className="mt-1 text-lg sm:text-xl font-black tracking-tight text-white truncate">{viewItem.nama_depo}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-ink-fg">
                          <svg className="w-3 h-3 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                          {viewItem.kode_depo}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-ink-fg">
                          <svg className="w-3 h-3 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                          {formatCurrency(viewItem.nominal_biaya)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-ink-fg">
                          <svg className="w-3 h-3 text-sky-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                          {viewItem.details?.length || 0} baris
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {badge(viewItem.status)}
                  </div>
                </div>
              </div>

              {/* Info ringkas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-card border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tanggal Pengajuan</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 mt-2.5">{formatDate(viewItem.tanggal_pengajuan)}</p>
                </div>
                <div className="rounded-xl bg-surface-card border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">No Surat Jalan</span>
                  </div>
                  <div className="mt-2.5 space-y-0.5 text-sm font-bold font-mono text-slate-800">
                    {getSJList(viewItem).length > 0 ? getSJList(viewItem).map((sj) => (
                      <p key={sj} className="break-all">{sj}</p>
                    )) : <p>-</p>}
                  </div>
                </div>
                <div className="rounded-xl sm:col-span-2 bg-linear-to-r from-emerald-50/80 to-surface-card border border-emerald-100 shadow-sm p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Biaya</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <p className="text-lg font-black text-emerald-700 tabular-nums">{formatCurrency(viewItem.nominal_biaya)}</p>
                      {viewItem.is_rfah_required && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                          RFAH required
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Alur persetujuan */}
              <ApprovalStepper item={viewItem} rfahThreshold={biayaConfig.retribusi_rfah_threshold} />
              <ApprovalHistoryList histories={viewItem.approvalHistories} />

              {/* Detail Retribusi */}
              {viewItem.details.length > 0 && (
                <div className="pt-1">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-800">Detail Retribusi</h3>
                      <p className="text-[11px] text-slate-400">Baris kendaraan beserta qty zak & crt</p>
                    </div>
                    <span className="ml-auto inline-flex items-center rounded-full bg-chip-primary border border-chip-primary-border px-2.5 py-0.5 text-[11px] font-bold text-accent-text">
                      {viewItem.details.length} baris
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-300 shadow-sm">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface-raised">
                          <th className="table-header text-center w-8">#</th>
                          <th className="table-header">Nopol</th>
                          <th className="table-header">Type</th>
                          <th className="table-header">No. SJ</th>
                          <th className="table-header text-right">Qty</th>
                          <th className="table-header text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewItem.details.map((d, i) => (
                          <tr key={i} className="hover:bg-overlay-60 transition-colors">
                            <td className="table-cell text-center">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500 mx-auto">{i + 1}</span>
                            </td>
                            <td className="table-cell">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium font-mono text-slate-700">{upper(d.nopol_kendaraan) || '-'}</span>
                            </td>
                            <td className="table-cell">
                              <span className="inline-flex items-center rounded-md bg-chip-primary border border-chip-primary-border px-1.5 py-0.5 text-[10px] font-bold text-accent-text">{upper(d.type_kendaraan) || '-'}</span>
                            </td>
                            <td className="table-cell font-mono text-slate-600">{d.no_surat_jalan || '-'}</td>
                            <td className="table-cell text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 tabular-nums">{Number(d.qty_zak || 0).toLocaleString('id-ID')} zak</span>
                                <span className="inline-flex items-center rounded-md bg-sky-50 border border-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 tabular-nums">{Number(d.qty_crt || 0).toLocaleString('id-ID')} crt</span>
                              </div>
                            </td>
                            <td className="table-cell text-right font-bold text-slate-800 tabular-nums">{formatCurrency(Number(d.nominal_biaya))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Lampiran Dokumen */}
              {viewItem.documents && (viewItem.documents as unknown[]).length > 0 && (
                <div className="pt-1">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-800">Lampiran Dokumen</h3>
                      <p className="text-[11px] text-slate-400">Bukti lampiran pengajuan retribusi</p>
                    </div>
                    <span className="ml-auto inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                      {(viewItem.documents as unknown[]).length} file
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(viewItem.documents as { id?: number; document_type: string; file_name: string; file_path?: string }[]).map((doc, i) => {
                      const url = docUrl(doc);
                      return (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-300 bg-surface-card shadow-sm p-3 hover:border-chip-primary-border hover:shadow transition-all">
                        <div className="w-9 h-9 rounded-lg bg-chip-primary ring-1 ring-chip-primary-border flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-800">{doc.document_type.toUpperCase()}</p>
                          <p className="text-[11px] text-gray-500 truncate" title={doc.file_name}>{doc.file_name}</p>
                        </div>
                        {url ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <a href={url} target="_blank" rel={AUTHENTICATED_FILE_REL} title="Lihat" aria-label={`Lihat ${doc.file_name}`} className="min-h-9 min-w-9 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all inline-flex items-center justify-center">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </a>
                            <a href={url} download={doc.file_name} rel={AUTHENTICATED_FILE_REL} title="Unduh" aria-label={`Unduh ${doc.file_name}`} className="min-h-9 min-w-9 p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all inline-flex items-center justify-center">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </a>
                          </div>
                        ) : (
                          <span className="shrink-0 text-[10px] font-semibold text-slate-400">Tanpa file</span>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status footer */}
              <div className="rounded-2xl border border-slate-300 bg-overlay-70 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs font-semibold text-slate-500">Status pengajuan</p>
                {badge(viewItem.status)}
              </div>
            </div>
          )}
        </Modal>

        {/* Modal Keputusan Approval */}
        <Modal
          open={!!decision}
          onClose={() => { if (!decisionBusy) setDecision(null); }}
          title={decision?.action === 'reject' ? 'Tolak Pengajuan' : decision?.action === 'revise' ? 'Perlu Revisi' : decision?.item.is_rfah_required ? 'Setujui RLH' : 'Setujui Pengajuan'}
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
              <div className="rounded-xl overflow-hidden border border-slate-300">
                <div className="bg-ink-900 px-4 py-3 text-white flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10 text-primary-300">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-300/80">Biaya Retribusi</p>
                    <p className="text-sm font-bold truncate">{decision.item.nama_depo}</p>
                  </div>
                  <span className="ml-auto shrink-0">{badge(decision.item.status)}</span>
                </div>
                <div className="divide-y divide-slate-100 bg-surface-card text-sm">
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

        {/* Import Modal */}
        <ConfirmDialog
          open={showDeleteConfirm}
          onClose={() => { if (deletingId !== null) return; setShowDeleteConfirm(false); setDeleteTargetId(null); }}
          onConfirm={confirmDelete}
          title="Hapus Pengajuan"
          message="Apakah Anda yakin ingin menghapus pengajuan ini? Tindakan ini tidak dapat dibatalkan."
          confirmLabel="Hapus"
          variant="danger"
          loading={deletingId !== null}
        />
        <Modal
          open={showImportModal}
          onClose={() => { setShowImportModal(false); setImportFile(null); }}
          title="Import Biaya Retribusi"
          subtitle="Upload file Excel/CSV untuk mengimpor data Biaya Retribusi"
          size="md"
          footer={
            <>
              <button onClick={() => { setShowImportModal(false); setImportFile(null); }} className="btn-secondary">Batal</button>
              <button onClick={handleImport} disabled={importing || !importFile} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {importing ? 'Mengimpor...' : 'Import'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Pilih File</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-chip-primary file:text-accent-text hover:file:bg-chip-primary"
              />
              <p className="text-xs text-slate-400 mt-1">Format: xlsx, xls, csv. Kolom wajib: nopol_kendaraan, nominal_biaya</p>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
