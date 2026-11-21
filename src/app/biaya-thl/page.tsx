'use client';

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import Image from 'next/image';
import DashboardLayout from '@/app/dashboard/layout';
import { biayaThl, getErrorMessage } from '@/lib/api';
import { AUTHENTICATED_FILE_REL, storageFileUrl } from '@/lib/storageFile';
import { pageWindow } from '@/lib/pagination';
import { useAuthStore } from '@/store/auth';
import { notifyGlobal } from '@/store/globalToast';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { getBiayaConfigWithStatus, BIAYA_CONFIG_FALLBACK, type BiayaConfig } from '@/lib/biaya';
import { generateTHLPdf, previewTHLPdf } from '@/lib/biayaPdf';
import ApprovalPipeline, { type ApprovalPipelineStep } from '@/components/ApprovalPipeline';
import dynamic from 'next/dynamic';
import {
  DetailRow,
  FormDetailRow,
  PhotoItem,
  isStoredPhoto,
  POSITIONS,
  generateId,
  isDetailReady,
  getMissingFields,
  formatCurrency,
  toDateInputValue,
} from './BiayaThlFormHelpers';

const DynBiayaThlFormModal = dynamic(() => import('./BiayaThlFormModal'));


interface ThlReceivingCandidate {
  id: number;
  receiving_id: number;
  tanggal_selesai: string;
  nopol_kendaraan: string;
  type_kendaraan: string;
  no_surat_jalan: string;
  po_transporter: string;
  driver_name: string;
  checker_name: string;
  kode_depo: string;
  nama_depo: string;
  qty_zak: number;
  qty_crt: number;
  has_retribusi: boolean;
  retribusi_status: string | null;
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
  rlh_approved_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  revised_at: string | null;
  revisi_reason: string | null;
  resubmitted_at: string | null;
  resubmittedBy?: { id: number; full_name: string } | null;
  submittedBy?: { id: number; full_name: string } | null;
  checkedBy?: { id: number; full_name: string } | null;
  approvedBy?: { id: number; full_name: string } | null;
  rlhApprovedBy?: { id: number; full_name: string } | null;
  rejectedBy?: { id: number; full_name: string } | null;
  revisedBy?: { id: number; full_name: string; level?: string } | null;
  details: DetailRow[];
  photos: unknown[];
  approvalHistories?: ApprovalHistoryItem[] | null;
}

const normalizeBiayaThlItem = (item: BiayaThlItem): BiayaThlItem => ({
  ...item,
  created_by: (() => {
    const raw = (item as unknown as Record<string, { id?: number } | number | null | undefined>)['created_by'];
    if (raw && typeof raw === 'object' && typeof raw.id === 'number') return raw.id;
    return Number(raw) || 0;
  })(),
  submittedBy: item.submittedBy ?? (item as BiayaThlItem & { submitted_by?: BiayaThlItem['submittedBy'] }).submitted_by,
  checkedBy: item.checkedBy ?? (item as BiayaThlItem & { checked_by?: BiayaThlItem['checkedBy'] }).checked_by,
  rlhApprovedBy: item.rlhApprovedBy ?? (item as BiayaThlItem & { rlh_approved_by?: BiayaThlItem['rlhApprovedBy'] }).rlh_approved_by,
  approvedBy: item.approvedBy ?? (item as BiayaThlItem & { approved_by?: BiayaThlItem['approvedBy'] }).approved_by,
  rejectedBy: item.rejectedBy ?? (item as BiayaThlItem & { rejected_by?: BiayaThlItem['rejectedBy'] }).rejected_by,
  revisedBy: item.revisedBy ?? (item as BiayaThlItem & { revised_by?: BiayaThlItem['revisedBy'] }).revised_by,
  resubmittedBy: item.resubmittedBy ?? (item as BiayaThlItem & { resubmitted_by?: BiayaThlItem['resubmittedBy'] }).resubmitted_by,
  details: Array.isArray(item.details) ? item.details.map((d) => {
    // Backend mengirim kendaraan tambahan sebagai relasi `vehicles` dengan
    // kunci SJ `no_sj`; form memakai `kendaraan[]` dengan kunci `sj`.
    // Tanpa pemetaan ini, edit kehilangan kendaraan ke-2+ dan PDF dari data
    // tersimpan melewatkan SJ tambahannya.
    if (Array.isArray(d.kendaraan) && d.kendaraan.length > 0) return d;
    const fromVehicles = Array.isArray(d.vehicles) ? d.vehicles : [];
    return {
      ...d,
      kendaraan: fromVehicles.map((v) => ({ sj: v.sj ?? v.no_sj ?? '', nopol: v.nopol ?? '', type: v.type ?? '' })),
    };
  }) : [],
  photos: Array.isArray(item.photos) ? item.photos : [],
});

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  draft: { label: 'Draft', badge: 'bg-popover text-foreground border-border', dot: 'bg-gray-400' },
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  checked: { label: 'Checked', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  rlh_approved: { label: 'Disetujui RLH', badge: 'bg-chip-primary text-accent-text border-chip-primary-border', dot: 'bg-primary-500' },
  approved: { label: 'Approved Lengkap', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  revisi: { label: 'Revisi', badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
};

const statusLabel = (item: BiayaThlItem): string => (
  item.status === 'rlh_approved' && item.is_rfah_required
    ? 'Menunggu RFAH'
    : STATUS_META[item.status]?.label ?? item.status
);

/** State tiap tahap pengajuan untuk pipeline ringkas di daftar — konsisten
 *  dengan ApprovalStepper (modal detail): done = timestamp ada, current =
 *  tahap menunggu, reject/revisi = titik terminal. RFAH hanya bila wajib. */
const thlPipelineSteps = (item: BiayaThlItem): ApprovalPipelineStep[] => {
  const rejected = item.status === 'rejected';
  const revised = item.status === 'revisi';
  const awaitingRecheck = Boolean(item.resubmitted_at) && ['pending', 'checked', 'rlh_approved'].includes(item.status);
  const revisedLevel = item.revisedBy?.level?.toUpperCase();
  const revisionIndex = item.rlh_approved_at
    ? 3
    : item.checked_at
      ? 2
      : revisedLevel === 'RFAH'
        ? 3
        : revisedLevel === 'RLH'
          ? 2
          : 1;
  const stages: { role: string; at: string | null | undefined }[] = [
    { role: item.approval_pengajuan_level || 'BLC', at: awaitingRecheck ? item.resubmitted_at : item.submitted_at },
    { role: 'BAC', at: item.checked_at },
    { role: 'RLH', at: rejected ? item.rejected_at : revisionIndex === 2 ? item.revised_at : item.rlh_approved_at ?? item.approved_at },
  ];
  if (item.is_rfah_required) stages.push({ role: 'RFAH', at: item.approved_at });

  if (item.status === 'draft') {
    return stages.map((stage) => ({ role: stage.role, state: 'todo' }));
  }

  const firstOpen = stages.findIndex((s) => !s.at);
  return stages.map((stage, i) => {
    if (rejected && i === 2) return { role: stage.role, state: 'reject' };
    if (rejected) return { role: stage.role, state: stage.at ? 'done' : 'todo' };
    if (revised && i === revisionIndex) return { role: stage.role, state: 'revisi' };
    if (revised) return { role: stage.role, state: stage.at ? 'done' : 'todo' };
    if (stage.at) return { role: stage.role, state: 'done' };
    return { role: stage.role, state: i === firstOpen ? 'current' : 'todo' };
  });
};

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

const createGroupId = () => generateId('grp');

const normalizeThlDetail = <T extends DetailRow>(detail: T): T => {
  const normalized = { ...detail };
  const position = normalized.posisi?.trim().toUpperCase();

  if (position === 'THL GUDANG') {
    normalized.kubikasi = 0;
    normalized.droppoint = '';
  }

  return normalized;
};

type GroupedWorkerDetail = {
  no_surat_jalan: string;
  workers: {
    nama_thl: string;
    posisi: string;
    nopol_kendaraan: string;
    type_kendaraan: string;
    nominal_biaya: number;
    photos: PhotoItem[];
  }[];
  nominal_biaya: number;
  // Kendaraan tambahan grup (1 kru, N kendaraan — khusus GUDANG): diambil
  // dari baris pertama grup yang membawa kendaraan[] agar modal detail ikut
  // menampilkan semuanya, bukan hanya kendaraan utama.
  extras: { sj: string; nopol: string; type: string }[];
};

const groupWorkersBySuratJalan = (details: DetailRow[]): GroupedWorkerDetail[] => {
  const groups = new Map<string, GroupedWorkerDetail>();

  details.forEach((detail) => {
    const suratJalan = detail.no_surat_jalan?.trim() || '-';
    const group = groups.get(suratJalan) ?? {
      no_surat_jalan: suratJalan,
      workers: [],
      nominal_biaya: 0,
      extras: [],
    };

    const nominalBiaya = Number(detail.nominal_biaya) || 0;
    group.workers.push({
      nama_thl: detail.nama_thl || detail.driver_name || '-',
      posisi: detail.posisi || '-',
      nopol_kendaraan: detail.nopol_kendaraan || '-',
      type_kendaraan: detail.type_kendaraan || '-',
      nominal_biaya: nominalBiaya,
      photos: detail.photos || [],
    });
    if (group.extras.length === 0 && Array.isArray(detail.kendaraan)) {
      group.extras = detail.kendaraan
        .filter((v) => (v.sj || '').trim() || (v.nopol || '').trim())
        .map((v) => ({ sj: v.sj || '', nopol: v.nopol || '', type: v.type || '' }));
    }
    group.nominal_biaya += nominalBiaya;
    groups.set(suratJalan, group);
  });

  return [...groups.values()];
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

const stepStateAt = (status: string, index: number, revisionIndex = 2): StepState => {
  if (status === 'rejected') return 'done';
  if (status === 'revisi') {
    if (index < revisionIndex) return 'done';
    if (index === revisionIndex) return 'current';
    return 'todo';
  }
  const order = ['draft', 'pending', 'checked', 'rlh_approved', 'approved'];
  const currentIndex = order.indexOf(status);
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'todo';
};

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
          <h3 className="text-sm font-black text-foreground">Riwayat Persetujuan</h3>
          <p className="text-[11px] text-slate-400">Jejak aksi tiap tahap approval</p>
        </div>
        <span className="ml-auto inline-flex items-center rounded-full bg-chip-primary border border-chip-primary-border px-2.5 py-0.5 text-[11px] font-bold text-accent-text">{histories.length} aktivitas</span>
      </div>
      <ol className="space-y-0">
        {histories.map((h, i) => {
          const meta = APPROVAL_ACTION_META[h.action] ?? { label: h.action, badge: 'bg-popover text-foreground border-border' };
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
                  <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                  {h.from_status ? <span className="text-[10px] font-mono text-slate-400">{h.from_status} → {h.to_status}</span> : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {h.actor?.full_name ? <span className="font-medium text-foreground">{h.actor.full_name}</span> : null}{h.actor?.full_name && ' · '}{formatDateTime(h.created_at)}
                </p>
                {h.reason ? <p className="mt-1 text-xs text-foreground whitespace-pre-line rounded-lg bg-popover border border-border px-2.5 py-1.5">{h.reason}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ApprovalStepper({ item }: { item: BiayaThlItem }) {
  const rejected = item.status === 'rejected';
  const revised = item.status === 'revisi';
  const awaitingRecheck = Boolean(item.resubmitted_at) && ['pending', 'checked', 'rlh_approved'].includes(item.status);
  const revisedLevel = item.revisedBy?.level?.toUpperCase();
  const revisionLabel = revisedLevel === 'BAC'
    ? 'Perlu Revisi BAC'
    : revisedLevel === 'RLH'
      ? 'Perlu Revisi RLH'
      : revisedLevel === 'RFAH'
        ? 'Perlu Revisi RFAH'
        : 'Perlu Revisi';
  const recheckIndex = item.status === 'pending' ? 1 : item.status === 'checked' ? 2 : item.status === 'rlh_approved' ? 3 : null;
  const recheckLabel = recheckIndex === 1
    ? 'Menunggu Pemeriksaan Ulang BAC'
    : recheckIndex === 2
      ? 'Menunggu Persetujuan Ulang RLH'
      : recheckIndex === 3
        ? 'Menunggu Persetujuan Ulang RFAH'
        : null;
  const revisionIndex = item.rlh_approved_at
    ? 3
    : item.checked_at
      ? 2
      : revisedLevel === 'RFAH'
        ? 3
        : revisedLevel === 'RLH'
          ? 2
          : 1;
  const steps = [
    { label: awaitingRecheck ? 'Diperbaiki & Dikirim Ulang' : 'Diajukan', role: item.approval_pengajuan_level || 'BLC', at: awaitingRecheck ? item.resubmitted_at : item.submitted_at, by: awaitingRecheck ? item.resubmittedBy?.full_name : item.submittedBy?.full_name },
    { label: revised && revisionIndex === 1 ? 'Perlu Revisi' : awaitingRecheck && recheckIndex === 1 ? 'Menunggu Pemeriksaan Ulang' : 'Diperiksa', role: 'BAC', at: awaitingRecheck && recheckIndex === 1 ? null : item.checked_at, by: awaitingRecheck && recheckIndex === 1 ? undefined : item.checkedBy?.full_name },
    {
      label: revised && revisionIndex === 2 ? 'Perlu Revisi' : awaitingRecheck && recheckIndex === 2 ? 'Menunggu Persetujuan Ulang' : rejected ? 'Ditolak' : 'Disetujui RLH',
      role: 'RLH',
      at: revised ? item.revised_at : rejected ? item.rejected_at : item.rlh_approved_at ?? item.approved_at,
      by: revised ? item.revisedBy?.full_name : rejected ? item.rejectedBy?.full_name : item.rlhApprovedBy?.full_name ?? item.approvedBy?.full_name,
    },
  ];

  if (item.is_rfah_required) {
    steps.push({
      label: revised && revisionIndex === 3 ? 'Perlu Revisi' : awaitingRecheck && recheckIndex === 3 ? 'Menunggu Persetujuan Ulang' : 'Disetujui RFAH',
      role: 'RFAH',
      at: item.status === 'approved' ? item.approved_at : null,
      by: item.status === 'approved' ? item.approvedBy?.full_name : undefined,
    });
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-linear-to-r from-slate-50 to-surface-card border-b border-border">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M7 17L21 3m0 0h-5.5M21 3v5.5" /></svg>
        </span>
        <div>
          <h3 className="text-sm font-black text-foreground">Alur Persetujuan</h3>
          <p className="text-[11px] text-slate-400">Tahapan approval pengajuan ini</p>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${revised ? 'bg-orange-50 text-orange-700 border-orange-200' : rejected ? 'bg-red-50 text-red-700 border-red-200' : item.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.status === 'rlh_approved' ? 'bg-chip-primary text-accent-text border-chip-primary-border' : item.status === 'checked' ? 'bg-blue-50 text-blue-700 border-blue-200' : item.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-popover text-foreground border-border'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${revised ? 'bg-orange-500' : rejected ? 'bg-red-500' : item.status === 'approved' ? 'bg-emerald-500' : item.status === 'rlh_approved' ? 'bg-primary-500' : item.status === 'checked' ? 'bg-blue-500' : item.status === 'pending' ? 'bg-amber-500' : 'bg-gray-400'}`} />
          {revised ? revisionLabel : awaitingRecheck && recheckLabel ? recheckLabel : rejected ? 'Ditolak' : STATUS_META[item.status]?.label ?? item.status}
        </span>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <ol>
          {steps.map((step, i) => {
            const state = stepStateAt(item.status, i, revisionIndex);
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
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-card border-2 border-primary-500 text-primary-500 shadow-sm">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary-500/20 animate-ping" aria-hidden="true" />
                      <span className="relative block h-2.5 w-2.5 rounded-full bg-primary-500" />
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 border border-border text-slate-400">
                      <span className="block h-2 w-2 rounded-full bg-slate-300" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${state === 'done' ? 'text-foreground' : state === 'current' ? 'text-accent-text' : 'text-muted-foreground'}`}>{step.label}</p>
                    <span className="inline-flex rounded-md bg-slate-100 border border-border px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground">{step.role}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {step.at ? (
                      <>
                        {step.by ? <span className="font-medium text-foreground">{step.by}</span> : null}{step.by && ' · '}{formatDateTime(step.at)}
                        {revised && i === revisionIndex && item.revisi_reason ? (
                          <span className="block font-medium text-orange-700 whitespace-pre-line">Catatan revisi: {item.revisi_reason}</span>
                        ) : null}
                      </>
                    ) : awaitingRecheck && recheckIndex === i
                      ? (
                        <span className="flex flex-col gap-0.5">
                          <span className="font-medium text-amber-700">Perbaikan BLC sudah dikirim. Menunggu {i === 1 ? 'BAC memeriksa ulang' : i === 2 ? 'RLH menyetujui ulang' : 'RFAH menyetujui ulang'}.</span>
                          {item.revisi_reason ? <span className="text-orange-700">Catatan revisi: {item.revisi_reason}</span> : null}
                        </span>
                      )
                    : revised && i === revisionIndex && item.revisi_reason
                      ? <span className="font-medium text-orange-700 whitespace-pre-line">{item.revisi_reason}</span>
                      : state === 'current'
                      ? 'Menunggu aksi saat ini'
                      : 'Belum diproses'}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function DetailPhotoThumb({ photo }: { photo: PhotoItem }) {
  const storedUrl = isStoredPhoto(photo)
    ? storageFileUrl(photo.file_path) ?? ''
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

/** URL absolut foto yang tersimpan di storage (untuk pratinjau di modal detail). */
const photoStoredUrl = (photo: PhotoItem): string => {
  if (!isStoredPhoto(photo)) return '';
  return storageFileUrl(photo.file_path) ?? '';
};

export default function BiayaThlPage() {
  const { user, hasPermission, hasRole } = useAuthStore();
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<BiayaThlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
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
  /**
   * Ambil 4 karakter belakang no surat jalan agar kolom tidak terpotong.
   * Contoh: "SJ-2026-00012" -> "0012".
   */
  const shortSJ = (sj: string): string => {
    const t = (sj || '').trim();
    if (!t) return '';
    return t.length > 4 ? t.slice(-4) : t;
  };
  const uniq = (list: string[]): string[] => [...new Set(list.map((v) => (v || '').trim()).filter(Boolean))];
  /** Daftar SJ pendek (4 digit belakang) dari details, fallback ke header. */
  const getSJShorts = (item: BiayaThlItem): string[] => {
    const fromDetails = uniq((item.details || []).map((d) => d.no_surat_jalan || ''));
    if (fromDetails.length > 0) return fromDetails.map(shortSJ);
    if ((item.no_surat_jalan || '').trim()) return [shortSJ(item.no_surat_jalan)];
    return [];
  };
  /** Daftar SJ lengkap untuk tooltip (title). */
  const getSJFull = (item: BiayaThlItem): string => {
    const fromDetails = uniq((item.details || []).map((d) => d.no_surat_jalan || ''));
    if (fromDetails.length > 0) return fromDetails.join(', ');
    return (item.no_surat_jalan || '').trim() || '-';
  };
  /** Daftar tipe kendaraan unik dari details, fallback ke header. */
  const getKendaraanTypes = (item: BiayaThlItem): string[] => {
    const fromDetails = uniq((item.details || []).map((d) => d.type_kendaraan || ''));
    if (fromDetails.length > 0) return fromDetails;
    if ((item.type_kendaraan || '').trim()) return [(item.type_kendaraan || '').trim()];
    return [];
  };
  /** Daftar nopol unik dari details, fallback ke header. */
  const getNopols = (item: BiayaThlItem): string[] => {
    const fromDetails = uniq((item.details || []).map((d) => d.nopol_kendaraan || ''));
    if (fromDetails.length > 0) return fromDetails;
    if ((item.no_kendaraan || '').trim()) return [(item.no_kendaraan || '').trim()];
    return [];
  };
  /** Jumlah tenaga kerja unik berdasarkan nama_thl. */
  const getWorkerCount = (item: BiayaThlItem): number =>
    new Set((item.details || []).map((d) => (d.nama_thl || '').trim()).filter(Boolean)).size;
  /**
   * Render daftar multi-nilai sebagai chip ringkas: tampilkan maksimal 2,
   * sisanya diringkas "+n" dengan tooltip daftar lengkap.
   */
  const renderChips = (values: string[], fullTitle: string) => {
    if (values.length === 0) return <span className="text-slate-400">-</span>;
    const shown = values.slice(0, 2);
    const rest = values.length - shown.length;
    return (
      <span className="flex flex-wrap gap-1" title={fullTitle}>
        {shown.map((v) => (
          <span key={v} className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-foreground">{v}</span>
        ))}
        {rest > 0 && (
          <span className="inline-flex items-center rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-foreground">+{rest}</span>
        )}
      </span>
    );
  };
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
  /** true bila tarif yang dipakai adalah fallback (config gagal dimuat) — tampilkan banner. */
  const [configFallback, setConfigFallback] = useState(false);
  const [configRetry, setConfigRetry] = useState(0);

  useEffect(() => { getBiayaConfigWithStatus(user?.kode_depo, 'biaya_thl').then((r) => { setBiayaConfig(r.config); setConfigFallback(r.isFallback); }).catch((e: unknown) => { console.error('[BiayaConfig]', e); }); }, [user?.kode_depo, configRetry]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<{ total: number; total_nominal: number; pending: number; checked: number; approved: number; rejected: number; revisi: number; my_drafts: number } | null>(null);
  const [perPage, setPerPage] = useState(50);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const reqIdRef = useRef(0);
  // Cermin totalPages agar clamp bisa baca nilai terbaru tanpa jadi dep fetch.
  const totalPagesRef = useRef(1);

  const fetchItems = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    // Clamp sebelum request — jangan setPage di dalam fetch (picu double fetch).
    const requestPage = Math.min(Math.max(1, page), Math.max(1, totalPagesRef.current));
    try {
      const res = await biayaThl.list({ search: debouncedSearch, status: statusFilter, page: requestPage, per_page: perPage, sort: sortField, dir: sortDir, _t: Date.now() });
      if (reqIdRef.current !== reqId) return;
      setItems(res.data.data || res.data);
      const nextLast = res.data.last_page || 1;
      setTotalPages(nextLast);
      totalPagesRef.current = nextLast;
      if (res.data.summary) setSummary(res.data.summary);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      notifyGlobal(getErrorMessage(e, 'Gagal memuat data'), 'error');
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


  const toggleCard = (idx: number) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage((p) => (p === 1 ? p : 1)); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const buildFinalPayload = () => {
    const normalizedDetails = applyGroupVehicle(formData.details.map(normalizeThlDetail));
    const fd = new FormData();
    fd.append('tanggal_pengajuan', formData.tanggal_pengajuan);
    normalizedDetails.forEach((d, i) => {
      const fdRow = d as FormDetailRow;
      if (fdRow.detailId) fd.append(`details[${i}][id]`, String(fdRow.detailId));
      if (fdRow.receiving_id) fd.append(`details[${i}][receiving_id]`, String(fdRow.receiving_id));
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
      fd.append(`details[${i}][kendaraan_tambahan]`, d.kendaraan_tambahan ? '1' : '0');

      if (d.kendaraan_sj) fd.append(`details[${i}][kendaraan_sj]`, d.kendaraan_sj);
      if (d.kendaraan_nopol) fd.append(`details[${i}][kendaraan_nopol]`, d.kendaraan_nopol);
      if (d.kendaraan_type) fd.append(`details[${i}][kendaraan_type]`, d.kendaraan_type);
      (d.kendaraan ?? []).forEach((v, j) => {
        fd.append(`details[${i}][kendaraan][${j}][sj]`, v.sj);
        fd.append(`details[${i}][kendaraan][${j}][nopol]`, v.nopol);
        fd.append(`details[${i}][kendaraan][${j}][type]`, v.type);
      });
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
      if (id === null || id === undefined) throw new Error('empty');
      await biayaThl.submit(id);
      notifyGlobal(editingStatus === 'revisi' ? 'Perubahan disimpan dan dikirim ulang ke tahap approval yang meminta revisi.' : 'Pengajuan dikirim ke antrean pemeriksaan.', 'success');
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
      // Kirim eksplisit 0/1 agar server dapat reset flag saat baris diubah dari
      // kendaraan_tambahan=true menjadi false (update, bukan create baru).
      fd.append(`details[${i}][kendaraan_tambahan]`, d.kendaraan_tambahan ? '1' : '0');

      put('kendaraan_sj', d.kendaraan_sj);
      put('kendaraan_nopol', d.kendaraan_nopol);
      put('kendaraan_type', d.kendaraan_type);
      (d.kendaraan ?? []).forEach((v, j) => {
        if (v.sj) fd.append(`details[${i}][kendaraan][${j}][sj]`, v.sj);
        if (v.nopol) fd.append(`details[${i}][kendaraan][${j}][nopol]`, v.nopol);
        if (v.type) fd.append(`details[${i}][kendaraan][${j}][type]`, v.type);
      });
      const fdRow = d as FormDetailRow;
      if (fdRow.detailId) fd.append(`details[${i}][id]`, String(fdRow.detailId));
      if (fdRow.receiving_id) fd.append(`details[${i}][receiving_id]`, String(fdRow.receiving_id));
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
    if (deleteTargetId === null || deleting) return;
    setDeleting(true);
    try {
      await biayaThl.delete(deleteTargetId);
      notifyGlobal('Biaya THL berhasil dihapus', 'success');
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      // Tutup detail bila baris yang dibuka yang dihapus.
      setViewItem((prev) => (prev?.id === deleteTargetId ? null : prev));
      fetchItems();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menghapus'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const loadLatestPdfItem = async (item: BiayaThlItem): Promise<BiayaThlItem> => {
    const response = await biayaThl.get(item.id);
    return normalizeBiayaThlItem(response.data.data);
  };

  const downloadPdf = async (item: BiayaThlItem) => {
    try {
      await generateTHLPdf(await loadLatestPdfItem(item));
    } catch (e: unknown) {
      console.error('[Download PDF THL]', e);
      notifyGlobal(e instanceof Error ? `Gagal generate PDF: ${e.message}` : 'Gagal generate PDF', 'error');
    }
  };

  const exportBiayaThl = async () => {
    try {
      const response = await biayaThl.export();
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `biaya-thl-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      notifyGlobal('Export dimulai', 'success');
    } catch (error: unknown) {
      notifyGlobal(getErrorMessage(error, 'Export gagal'), 'error');
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
      setViewItem(normalizeBiayaThlItem(response.data.data));
      await fetchItems();
      notifyGlobal(action === 'submit' && viewItem.status === 'revisi' ? 'Perbaikan berhasil dikirim kembali ke BAC untuk diperiksa ulang.' : 'Status pengajuan berhasil diperbarui', 'success');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Aksi approval tidak dapat diproses'), 'error');
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
      await (decision.action === 'approve'
        ? biayaThl.approve(decision.item.id)
        : decision.action === 'revise'
          ? await biayaThl.revise(decision.item.id, decisionReason)
          : await biayaThl.reject(decision.item.id, decisionReason));
      const detailResponse = await biayaThl.get(decision.item.id);
      setViewItem(normalizeBiayaThlItem(detailResponse.data.data));
      await fetchItems();
      notifyGlobal(decision.action === 'approve' ? 'Pengajuan disetujui' : decision.action === 'revise' ? 'Pengajuan diminta revisi' : 'Pengajuan ditolak', 'success');
      setDecision(null);
      setDecisionReason('');
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Aksi approval tidak dapat diproses'), 'error');
    } finally {
      setDecisionBusy(false);
    }
  };

  const resetForm = () => {
    setFormData({ tanggal_pengajuan: '', details: [] });
    setSjVehicle({});
  };

  const insertSjGroupBefore = (nextGroupId: string | null): string => {
    const newGroupId = createGroupId();
    setFormData(prev => {
      const insertAt = nextGroupId ? prev.details.findIndex(d => d.groupId === nextGroupId) : prev.details.length;
      if (nextGroupId && insertAt < 0) return prev;
      const newRow = createEmptyDetail(prev.details.length, '', newGroupId);
      const details = [...prev.details];
      details.splice(insertAt, 0, newRow);
      return { ...prev, details: details.map((d, i) => ({ ...d, order: i })) };
    });
    return newGroupId;
  };

  /** Arahkan fokus ke input No. Surat Jalan sebuah grup agar user mulai dari SJ dulu. */
  const focusSjInput = (groupId: string) => {
    requestAnimationFrame(() => {
      const groups = document.querySelectorAll<HTMLInputElement>('[data-sj-group-id]');
      for (const el of groups) {
        if (el.dataset.sjGroupId === groupId) {
          el.focus();
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
    });
  };

  const addSjGroup = () => {
    const gid = insertSjGroupBefore(null);
    focusSjInput(gid);
  };

  const fetchThlCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const res = await biayaThl.candidates();
      setThlCandidates(Array.isArray(res.data) ? res.data : []);
      setCandidateOpen(true);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat receiving selesai.'), 'error');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const addCandidateWorker = (candidate: ThlReceivingCandidate) => {
    const groupId = createGroupId();
    setFormData((prev) => {
      const row: FormDetailRow = {
        ...createEmptyDetail(prev.details.length, candidate.no_surat_jalan, groupId),
        receiving_id: candidate.receiving_id,
        nopol_kendaraan: candidate.nopol_kendaraan,
        type_kendaraan: candidate.type_kendaraan,
        kubikasi: Number(candidate.qty_zak || 0) + Number(candidate.qty_crt || 0),
        droppoint: candidate.po_transporter || '',
      };
      return { ...prev, details: [...prev.details, row] };
    });
    setCandidateOpen(false);
    focusSjInput(groupId);
  };

  const addDetailRow = (groupId: string) => {
    const newIndex = formData.details.length;
    setFormData(prev => {
      const groupRows = prev.details.filter(d => d.groupId === groupId);
      const source = groupRows.length > 0 ? groupRows[groupRows.length - 1] : null;
      const newRow: FormDetailRow = source
        ? { ...source, nama_thl: '', photos: [], groupId, order: prev.details.length, kendaraan_tambahan: false, kendaraan_sj: '', kendaraan_nopol: '', kendaraan_type: '', kendaraan: [] }
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
        // Kendaraan tambahan milik grup asal (SJ berbeda) — reset agar tidak
        // terbawa basi ke grup baru; user tambah ulang bila memang ada.
        kendaraan_tambahan: false,
        kendaraan_sj: '',
        kendaraan_nopol: '',
        kendaraan_type: '',
        kendaraan: [],
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

  const updateSjNumber = (groupId: string, value: string) => {
    setErrorSJGroupIndex((prev) => (prev === Object.values(sjGroups).findIndex((g) => g.groupId === groupId) ? null : prev));
    setFormData(prev => ({
      ...prev,
      details: prev.details.map((d) =>
        d.groupId === groupId ? { ...d, no_surat_jalan: value } : d
      ),
    }));
  };

  /** Trim spasi tepi No. SJ saat blur agar validasi duplikat tidak bisa dibypass
   *  dengan trailing-space (mis. "SJ-001" vs "SJ-001 "). */
  const commitSjNumber = (groupId: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed !== value) {
      setFormData(prev => ({
        ...prev,
        details: prev.details.map((d) =>
          d.groupId === groupId ? { ...d, no_surat_jalan: trimmed } : d
        ),
      }));
    }
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
    // Ambil source HANYA dari grup yang sama agar no_surat_jalan tidak tercemar
    // dari grup SJ lain saat ada beberapa SJ dalam satu form.
    const groupRows = formData.details.filter(d => d.groupId === groupId);
    const sourceInGroup = groupRows.length > 0 ? groupRows[groupRows.length - 1] : null;
    const row: FormDetailRow = sourceInGroup
      ? { ...sourceInGroup, nama_thl: '', photos: [], groupId, order: atIndex, kendaraan_tambahan: false, kendaraan_sj: '', kendaraan_nopol: '', kendaraan_type: '', kendaraan: [] }
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
  const [sjVehicle, setSjVehicle] = useState<Record<string, Array<{ id: string; sj: string; nopol: string; type: string }>>>({});
  // Plat tampil di ringkasan: plat baris + plat kendaraan tambahan grup.
  const platList = [...new Set([
    ...formData.details.map((d) => (d.nopol_kendaraan || '').trim().toUpperCase()),
    ...Object.values(sjVehicle).flatMap((arr) => arr.map((v) => (v.nopol || '').trim().toUpperCase())).filter(Boolean),
  ].filter(Boolean))];
  const isRfahRequired = totalNominal > biayaConfig.thl_rfah_threshold;
  const hasIncompleteThlRows = formData.details.some((detail) => !isDetailReady(detail));
  const [errorWorkerIndex, setErrorWorkerIndex] = useState<number | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Set<number>>(new Set());
  // Filter "hanya yang belum lengkap" untuk grup besar: sembunyikan kartu
  // yang sudah Siap agar scroll pendek. Index stabil (pakai hidden, bukan
  // filter array) sehingga anchor worker-card-* dan order tidak bergeser.
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [thlCandidates, setThlCandidates] = useState<ThlReceivingCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
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


  const previewPdfError = (e: unknown) => {
    console.error('[Preview PDF THL]', e);
    notifyGlobal(e instanceof Error ? `Gagal membuka preview PDF: ${e.message}` : 'Gagal membuka preview PDF', 'error');
  };

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
      rfah_threshold: biayaConfig.thl_rfah_threshold,
      approval_pengajuan: user?.full_name || '',
      status: 'draft',
      details: applyGroupVehicle(formData.details.map(normalizeThlDetail)),
    }).catch(previewPdfError);
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
  /**
   * Kendaraan tambahan bersifat OPSIONAL: hanya divalidasi/dikirim jika user
   * benar-benar mengisinya. Baris yang sepenuhnya kosong (mis. tidak sengaja
   * klik "Tambah Kendaraan") diabaikan agar tidak memblokir Lanjut ke Review.
   */
  const activeVehicles = (groupId: string): Array<{ id: string; sj: string; nopol: string; type: string }> =>
    (sjVehicle[groupId] ?? []).filter((v) => v.sj.trim() || v.nopol.trim() || v.type.trim());

  const applyGroupVehicle = (rows: FormDetailRow[]): FormDetailRow[] =>
    rows.map((d) => {
      if (String(d.posisi ?? '').trim().toUpperCase() !== 'THL GUDANG') return d;
      const vehicles = activeVehicles(d.groupId);
      if (vehicles.length > 0) {
        return { ...d, kendaraan: vehicles.map((v) => ({ sj: v.sj, nopol: v.nopol, type: v.type })) };
      }
      return { ...d, kendaraan: [] };
    });

  const getGroupVehicleError = (groupId: string): string | null => {
    if (!isGudangGroup(groupId)) return null;
    const vehicles = activeVehicles(groupId);
    if (vehicles.length === 0) return null;
    const problems: string[] = [];
    vehicles.forEach((v, vIdx) => {
      if (!v.sj.trim()) problems.push(`Kendaraan ke-${vIdx + 2}: No. SJ`);
      if (!v.nopol.trim()) problems.push(`Kendaraan ke-${vIdx + 2}: plat`);
      if (!v.type.trim()) problems.push(`Kendaraan ke-${vIdx + 2}: type`);
    });
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
    // Pola "input langsung" (sama seperti retribusi): pembuatan baru yang masuk
    // ke step Data Pekerja tanpa baris langsung disiapkan 1 grup SJ + 1 baris
    // pekerja kosong — user langsung mengetik tanpa klik "Tambah Surat Jalan".
    // Fokus diarahkan ke input No. Surat Jalan (bukan Nama THL) agar flow
    // pengisian dimulai dari SJ dulu, baru data pekerja.
    if (step === 2 && editingId === null && formData.details.length === 0) {
      const gid = insertSjGroupBefore(null);
      focusSjInput(gid);
    }

    if (step === 3) {
      if (formData.details.length === 0) {
        notifyGlobal('Tambahkan minimal 1 data pekerja sebelum lanjut ke review', 'error');
        return;
      }
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

  // Step 2 butuh tanggal pengajuan terisi.
  const isStepBlocked = (step: number): string | null => {
    if (step <= formStep) return null;
    if (step > 1 && !formData.tanggal_pengajuan) return 'Isi tanggal pengajuan terlebih dahulu';
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

  const handleImport = async () => {
    if (!importFile) {
      notifyGlobal('Pilih file terlebih dahulu', 'info');
      return;
    }
    setImporting(true);
    try {
      await biayaThl.import(importFile);
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
    resetForm();
    setFormStep(1);
    setOpenModal(true);
  };

  const openEditModal = (item: BiayaThlItem) => {
    setEditingId(item.id);
    setEditingStatus(item.status);
    const sjGroupIds = new Map<string, string>();
    // Normalisasi dulu: relasi backend `vehicles` → `kendaraan[]` agar
    // restore checklist kendaraan tambahan membaca bentuk yang sama.
    const details = (normalizeBiayaThlItem(item).details as unknown as DetailRow[]).map((d): FormDetailRow => {
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
    const restored: Record<string, Array<{ id: string; sj: string; nopol: string; type: string }>> = {};
    for (const d of details) {
      if (restored[d.groupId]) continue;
      if (String(d.posisi ?? '').trim().toUpperCase() !== 'THL GUDANG') continue;
      if (d.kendaraan_tambahan === true) {
        const vehicles = (d as unknown as { kendaraan?: Array<{ sj?: string; nopol?: string; type?: string }> }).kendaraan ?? [];
        restored[d.groupId] = (vehicles as Array<{ sj?: string; nopol?: string; type?: string }>).map((v) => ({
          id: generateId(),
          sj: v.sj ?? '',
          nopol: v.nopol ?? '',
          type: v.type ?? '',
        }));
      } else if ((d.kendaraan_sj || '').trim() || (d.kendaraan_nopol || '').trim()) {
        // Data lama format tunggal (pra-kendaraan[]): kendaraan_tambahan=false
        // tetapi kolom legacy terisi — pulihkan sebagai 1 entri agar tidak
        // hilang saat edit; saat disimpan ikut naik ke format array.
        restored[d.groupId] = [{
          id: generateId(),
          sj: d.kendaraan_sj ?? '',
          nopol: d.kendaraan_nopol ?? '',
          type: d.kendaraan_type ?? '',
        }];
      }
    }
    setSjVehicle(restored);
    setFormStep(1);
    setOpenModal(true);
  };

  const openViewModal = async (item: BiayaThlItem) => {
    try {
      const response = await biayaThl.get(item.id);
      setViewItem(normalizeBiayaThlItem(response.data.data));
    } catch {
      setViewItem(normalizeBiayaThlItem(item));
      notifyGlobal('Detail terbaru tidak dapat dimuat, menampilkan data daftar.', 'error');
    }
  };

  /** Hapus tanpa batasan status untuk Kendali Penuh; selainnya hanya draft/ditolak/revisi. */
  const isDeletable = (status: string): boolean => hasPermission('biaya_thl.full_control')
    ? true
    : ['draft', 'rejected', 'revisi'].includes(status);
  /** Edit terkirim (pending/checked/dll) hanya pengguna dengan Kendali Penuh; level lain hanya draft/ditolak/revisi. */
  const canEditRow = (status: string): boolean => hasPermission('biaya_thl.full_control') ? true : ['draft', 'rejected', 'revisi'].includes(status);

  const badge = (status: string, item?: BiayaThlItem) => {
    const meta = STATUS_META[status] || STATUS_META.draft;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {item ? statusLabel(item) : meta.label}
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
                <svg className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Biaya THL</h1>
                <p className="mt-0.5 text-ink-fg-muted">Queue pengajuan biaya tenaga kerja lepas</p>
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

        <div className={`rounded-2xl border border-border bg-card px-5 py-4 shadow-sm transition-opacity ${loading && summary ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="px-2 py-1">
            <p className="text-xs text-muted-foreground">Total Nominal</p>
            <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{formatCurrency(summary?.total_nominal ?? 0)}</p>
          </div>
          <div onClick={() => { setStatusFilter(statusFilter === 'pending' ? '' : 'pending'); setPage(1); }} className="border-l border-border px-2 py-1 sm:pl-5 cursor-pointer hover:bg-amber-50/50 rounded-lg transition-colors">
            <p className="text-xs text-muted-foreground">Menunggu</p>
            <p className="mt-1 text-2xl font-bold text-amber-600 tabular-nums">{summary?.pending ?? 0}</p>
          </div>
          <div onClick={() => { setStatusFilter(statusFilter === 'approved' ? '' : 'approved'); setPage(1); }} className="border-l border-border px-2 py-1 sm:pl-5 cursor-pointer hover:bg-emerald-50/50 rounded-lg transition-colors">
            <p className="text-xs text-muted-foreground">Disetujui</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{summary?.approved ?? 0}</p>
          </div>
          <div onClick={() => { setStatusFilter(statusFilter === 'revisi' ? '' : 'revisi'); setPage(1); }} className="border-l border-border px-2 py-1 sm:pl-5 cursor-pointer hover:bg-orange-50/50 rounded-lg transition-colors">
            <p className="text-xs text-muted-foreground">Revisi</p>
            <p className="mt-1 text-2xl font-bold text-orange-600 tabular-nums">{summary?.revisi ?? 0}</p>
          </div>
          <div onClick={() => { setStatusFilter(statusFilter === 'rejected' ? '' : 'rejected'); setPage(1); }} className="border-l border-border px-2 py-1 sm:pl-5 cursor-pointer hover:bg-red-50/50 rounded-lg transition-colors">
            <p className="text-xs text-muted-foreground">Ditolak</p>
            <p className="mt-1 text-2xl font-bold text-red-600 tabular-nums">{summary?.rejected ?? 0}</p>
          </div>
        </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col items-start gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-center">
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
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">/page</span>
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="select-field-sm w-22.5">
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            {hasPermission('biaya_thl.create') && (
            <button onClick={openCreateModal} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-ink-800 active:scale-[0.98] sm:w-auto">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Buat Pengajuan
            </button>
            )}
            {hasPermission('biaya_thl.import') && (
              <button onClick={() => setShowImportModal(true)} className="btn-secondary shrink-0">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Import
                </span>
              </button>
            )}
            {hasPermission('biaya_thl.export') && (
              <button onClick={exportBiayaThl} className="btn-secondary shrink-0">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 18v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>
                  Export
                </span>
              </button>
            )}
          </div>

        {/* Table - Desktop */}
        <div className="hidden md:block">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-popover">
                  <th scope="col" className="table-header cursor-pointer select-none" onClick={() => handleSort('tanggal_pengajuan')}>
                    Tanggal {sortIndicator('tanggal_pengajuan')}
                  </th>
                  <th scope="col" className="table-header">No SJ</th>
                  <th scope="col" className="table-header cursor-pointer select-none" onClick={() => handleSort('type_kendaraan')}>
                    Kendaraan {sortIndicator('type_kendaraan')}
                  </th>
                  <th scope="col" className="table-header">No Kendaraan</th>
                  <th scope="col" className="table-header">Depo</th>
                  <th scope="col" className="table-header text-center">Tenaga Kerja</th>
                  <th scope="col" className="table-header cursor-pointer select-none" onClick={() => handleSort('nominal_biaya')}>
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
                        <td className="table-cell py-3"><div className="h-4 w-14 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-12 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3 text-center"><div className="h-4 w-12 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3 text-right"><div className="h-4 w-16 bg-slate-100 rounded mx-auto" /></td>
                        <td className="table-cell py-3 text-center"><div className="h-5 w-14 bg-slate-100 rounded-full mx-auto" /></td>
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
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-overlay-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-foreground whitespace-nowrap">{formatDate(item.tanggal_pengajuan)}</td>
                      <td className="px-5 py-3 text-sm text-foreground">{renderChips(getSJShorts(item), getSJFull(item))}</td>
                      <td className="px-5 py-3 text-sm text-foreground">{renderChips(getKendaraanTypes(item), getKendaraanTypes(item).join(', ') || '-')}</td>
                      <td className="px-5 py-3 text-sm font-medium text-foreground">{renderChips(getNopols(item), getNopols(item).join(', ') || '-')}</td>
                      <td className="px-5 py-3 text-sm text-foreground">{item.nama_depo}</td>
                      <td className="px-5 py-3 text-sm text-foreground text-center whitespace-nowrap">{getWorkerCount(item)} orang</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-foreground tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          {badge(item.status, item)}
                          <ApprovalPipeline steps={thlPipelineSteps(item)} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewModal(item)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Lihat" aria-label="Lihat">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </button>
                          {hasPermission('biaya_thl.edit') && canEditRow(item.status) && (
                          <button onClick={() => openEditModal(item)} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Edit" aria-label="Edit">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                          </button>
                          )}
                          {hasPermission('biaya_thl.delete') && isDeletable(item.status) && (
                          <button onClick={() => handleDelete(item.id)} disabled={deleting} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Hapus" aria-label="Hapus">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"></path></svg>
                          </button>
                          )}
                          {hasPermission('approval.submit') && (hasPermission('biaya_thl.full_control') || (item.status === 'draft' && item.created_by === user?.id)) && (
                          <button onClick={() => { biayaThl.submit(item.id).then(() => { notifyGlobal('Pengajuan dikirim ke antrean pemeriksaan', 'success'); fetchItems(); }).catch((e: unknown) => notifyGlobal(getErrorMessage(e, 'Gagal mengirim'), 'error')); }} className="min-h-11 min-w-11 p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Kirim untuk diperiksa" aria-label="Kirim">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
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
            <div className="bg-card rounded-2xl border border-border shadow-sm p-10 text-center">
              <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                <span className="text-sm font-medium">Memuat data...</span>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border shadow-sm p-10 text-center">
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
            items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-chip-primary flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{item.no_kendaraan || '-'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(item.tanggal_pengajuan)}</p>
                    </div>
                  </div>
                  {badge(item.status, item)}
                </div>
                <div className="mb-3">
                  <ApprovalPipeline steps={thlPipelineSteps(item)} />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {item.is_rfah_required && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        RFAH
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12M15 3a3 3 0 003 3m-3-3h3m-3 15h3a2.25 2.25 0 002.25-2.25V12" /></svg>
                    {item.nama_depo}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(Number(item.nominal_biaya))}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full" title={getSJFull(item)}>SJ: {getSJShorts(item).join(', ') || '-'}</span>
                  <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">{getKendaraanTypes(item).join(', ') || '-'}</span>
                  <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">{getWorkerCount(item)} tenaga kerja</span>
                  <button onClick={() => openViewModal(item)} className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Lihat
                  </button>
                   {hasPermission('biaya_thl.edit') && canEditRow(item.status) && (
                   <button onClick={() => openEditModal(item)} className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-semibold text-amber-600 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                     Edit
                   </button>
                   )}
                   {hasPermission('biaya_thl.delete') && isDeletable(item.status) && (
                   <button onClick={() => handleDelete(item.id)} disabled={deleting} className="min-h-11 min-w-11 flex items-center justify-center text-red-400 bg-red-50 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"></path></svg>
                   </button>
                   )}
                   {hasPermission('approval.submit') && (hasPermission('biaya_thl.full_control') || item.status === 'draft') && (
                   <button onClick={() => { biayaThl.submit(item.id).then(() => { notifyGlobal('Pengajuan dikirim ke antrean pemeriksaan', 'success'); fetchItems(); }).catch((e: unknown) => notifyGlobal(getErrorMessage(e, 'Gagal mengirim'), 'error')); }} className="min-h-11 min-w-11 flex items-center justify-center text-emerald-500 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors" title="Kirim">
                     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                   </button>
                   )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <p className="text-xs text-muted-foreground tabular-nums mr-2">Halaman {page} dari {totalPages}</p>
            {pageWindow(page, totalPages).map((p, idx) => p === '…' ? (
              <span key={`e${idx}`} className="text-xs text-slate-400 px-1" aria-hidden="true">…</span>
            ) : (
              <button key={p} onClick={() => setPage(p)} className={`min-h-11 min-w-11 rounded-xl text-sm font-medium transition-all ${page === p ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'bg-card border border-border text-foreground hover:bg-popover'}`}>{p}</button>
            ))}
          </div>
        )}

        {/* Create/Edit Modal - Step Wizard — di-lazy-load agar tidak ikut bundle halaman utama. */}
        <DynBiayaThlFormModal
          openModal={openModal}
          requestClose={requestClose}
          editingId={editingId}
          editingStatus={editingStatus}
          formStep={formStep}
          busy={busy}
          biayaConfig={biayaConfig}
          user={user}
          hasPermission={hasPermission}
          formData={formData}
          setFormData={setFormData}
          sjGroups={sjGroups}
          sjVehicle={sjVehicle}
          setSjVehicle={setSjVehicle}
          vehicleError={vehicleError}
          sjGroupError={sjGroupError}
          hasBlockingError={hasBlockingError}
          isStepBlocked={isStepBlocked}
          goToStep={goToStep}
          activeVehicles={activeVehicles}
          isGudangGroup={isGudangGroup}
          errorSJGroupIndex={errorSJGroupIndex}
          errorWorkerIndex={errorWorkerIndex}
          totalNominal={totalNominal}
          totalKubikasi={totalKubikasi}
          platList={platList}
          compositionLabel={compositionLabel}
          MAX_PHOTOS_PER_DETAIL={MAX_PHOTOS_PER_DETAIL}
          reviewGroupsOpen={reviewGroupsOpen}
          toggleReviewGroup={toggleReviewGroup}
          toggleCard={toggleCard}
          collapsedCards={collapsedCards}
          setCollapsedCards={setCollapsedCards}
          showIncompleteOnly={showIncompleteOnly}
          setShowIncompleteOnly={setShowIncompleteOnly}
          hasIncompleteThlRows={hasIncompleteThlRows}
          isRfahRequired={isRfahRequired}
          fetchThlCandidates={fetchThlCandidates}
          loadingCandidates={loadingCandidates}
          focusSjInput={focusSjInput}
          addDetailRow={addDetailRow}
          addSjGroup={addSjGroup}
          removeSjGroup={removeSjGroup}
          updateSjNumber={updateSjNumber}
          commitSjNumber={commitSjNumber}
          duplicateSjGroup={duplicateSjGroup}
          insertSjGroupBefore={insertSjGroupBefore}
          insertDetailBefore={insertDetailBefore}
          updateDetail={updateDetail}
          removeDetail={removeDetail}
          addDetailPhoto={addDetailPhoto}
          removeDetailPhoto={removeDetailPhoto}
          canSaveDraft={canSaveDraft}
          handleCreate={handleCreate}
          handleCreateAndSubmit={handleCreateAndSubmit}
          handleUpdate={handleUpdate}
          handleSaveDraft={handleSaveDraft}
          previewThl={previewThl}
          DetailPhotoThumb={DetailPhotoThumb}
        />

        {/* View Modal */}
        <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Detail Biaya THL" subtitle="Informasi lengkap pengajuan" size="lg" footer={
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3">
            {/* Kirim hanya untuk draft (masuk antrean); revisi/rejected dikirim ulang lewat edit modal "Simpan Perubahan & Kirim Ulang". */}
            {viewItem?.status === 'draft' ? (viewItem?.created_by === user?.id && hasPermission('approval.submit') ? <button onClick={() => void approvalAction('submit')} className="btn-secondary w-full sm:w-auto">Kirim</button> : null) : null}
            {viewItem?.status === 'pending' ? <>{hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}{hasPermission('approval.check') ? <button onClick={() => void approvalAction('check')} className="btn-secondary w-full sm:w-auto">Periksa</button> : null}</> : null}
            {viewItem?.status === 'checked' && viewItem ? <>{hasPermission('approval.reject') ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600">Perlu Revisi</button> : null}{hasPermission('approval.approve') ? <button onClick={() => openDecision('approve', viewItem)} className="btn-primary w-full sm:w-auto">Setujui</button> : null}</> : null}
            {viewItem?.status === 'rlh_approved' ? <>{hasPermission('approval.rfah') ? <button onClick={() => void approvalAction('rfahApprove')} className="btn-primary w-full sm:w-auto">Setujui</button> : null}{hasPermission('approval.reject') ? <button onClick={() => openDecision('reject', viewItem)} className="btn-secondary w-full sm:w-auto">Tolak</button> : null}{hasPermission('approval.revise') ? <button onClick={() => openDecision('revise', viewItem)} className="btn-secondary w-full sm:w-auto">Perlu Revisi</button> : null}</> : null}
            {viewItem && <button onClick={() => { void (async () => { try { await previewTHLPdf(await loadLatestPdfItem(viewItem)); } catch (e: unknown) { previewPdfError(e); } })(); }} className="btn-secondary inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Preview PDF
            </button>}
            {viewItem?.status === 'approved' && viewItem && (viewItem.created_by === user?.id || hasRole('blc', 'admin_master')) ? <button onClick={() => viewItem && downloadPdf(viewItem)} className="btn-primary inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Cetak PDF BLC
            </button> : null}
            <button onClick={() => setViewItem(null)} className="btn-secondary w-full sm:w-auto">Tutup</button>
          </div>
        }>
          {viewItem && (
            <div className="space-y-5">
              {/* Dark header card */}
              <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 p-5 sm:p-6 text-white shadow-xl">
                <div aria-hidden="true" className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-primary-500/25 blur-3xl" />
                <div aria-hidden="true" className="absolute -bottom-24 -left-14 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" />
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/20">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-300/90">Biaya THL</p>
                      <p className="mt-1 text-lg sm:text-xl font-black tracking-tight text-white truncate">{viewItem.no_kendaraan || viewItem.details?.[0]?.nopol_kendaraan || '-'}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-ink-fg">
                          <svg className="w-3 h-3 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                          {viewItem.nama_depo}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-ink-fg">
                          <svg className="w-3 h-3 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                          {formatCurrency(viewItem.nominal_biaya)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-ink-fg">
                          <svg className="w-3 h-3 text-sky-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                          {viewItem.details?.length || 0} pekerja
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {badge(viewItem.status, viewItem)}
                  </div>
                </div>
              </div>

              {/* Info ringkas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-card border border-border shadow-sm p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tanggal Pengajuan</span>
                  </div>
                  <p className="text-sm font-bold text-foreground mt-2.5">{formatDate(viewItem.tanggal_pengajuan)}</p>
                </div>
                <div className="rounded-xl bg-card border border-border shadow-sm p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">No Surat Jalan</span>
                  </div>
                  <div className="mt-2.5 space-y-0.5 text-sm font-bold font-mono text-foreground">
                    {[...new Set((viewItem.details || []).flatMap((d: DetailRow) => [
                      ...(d.no_surat_jalan || '').split(/[,;\n]+/),
                      ...(d.kendaraan_sj || '').split(/[,;\n]+/),
                      ...((d.kendaraan ?? []).flatMap((v) => (v.sj || '').split(/[,;\n]+/))),
                    ].map((value) => value.trim()).filter(Boolean)))].map((suratJalan) => (
                      <p key={suratJalan} className="break-all">{suratJalan}</p>
                    ))}
                    {!(viewItem.details || []).some((d: DetailRow) => d.no_surat_jalan) && <p>-</p>}
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
                    <p className="text-lg font-black text-emerald-700 tabular-nums">{formatCurrency(viewItem.nominal_biaya)}</p>
                  </div>
                </div>
              </div>

              {/* Alur persetujuan */}
              <ApprovalStepper item={viewItem} />
              <ApprovalHistoryList histories={viewItem.approvalHistories} />

              {/* Daftar Pekerja */}
              {viewItem.details.length > 0 && (
                <div className="pt-1">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-chip-primary text-accent-text ring-1 ring-chip-primary-border">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-foreground">Daftar Pekerja</h3>
                      <p className="text-[11px] text-slate-400">Per baris surat jalan dengan bukti foto</p>
                    </div>
                    <span className="ml-auto inline-flex items-center rounded-full bg-chip-primary border border-chip-primary-border px-2.5 py-0.5 text-[11px] font-bold text-accent-text">
                      {groupWorkersBySuratJalan(viewItem.details).length} SJ · {viewItem.details.length} pekerja
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-popover">
                          <th className="table-header text-center w-8">#</th>
                          <th className="table-header">No. SJ</th>
                          <th className="table-header">Pekerja</th>
                          <th className="table-header">Posisi</th>
                          <th className="table-header">Plat Kendaraan</th>
                          <th className="table-header text-center">Foto</th>
                          <th className="table-header text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {groupWorkersBySuratJalan(viewItem.details).map((group, i) => (
                          <tr key={group.no_surat_jalan} className="hover:bg-overlay-60 transition-colors align-top">
                            <td className="table-cell text-center">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-muted-foreground mx-auto">{i + 1}</span>
                            </td>
                            <td className="table-cell font-mono">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">{group.no_surat_jalan}</span>
                              {group.extras.map((v, vi) => v.sj.trim() ? (
                                <span key={`s-${v.sj}-${vi}`} className="mt-0.5 block w-fit rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">+{v.sj}</span>
                              ) : null)}
                            </td>
                            <td className="table-cell">
                              <div className="space-y-1">
                                {group.workers.map((worker, workerIndex) => (
                                  <div key={`${worker.nama_thl}-${workerIndex}`} className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chip-primary text-[10px] font-black text-accent-text">{worker.nama_thl.slice(0, 1).toUpperCase()}</span>
                                    <span className="font-semibold text-foreground">{worker.nama_thl}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="table-cell">
                              <div className="space-y-1">
                                {group.workers.map((worker, workerIndex) => (
                                  <span key={`${worker.posisi}-${workerIndex}`} className={`block w-fit rounded-full border px-2 py-0.5 text-[10px] font-bold ${worker.posisi === 'THL GUDANG' ? 'border-sky-200 bg-sky-50 text-sky-700' : worker.posisi === 'THL DRIVER' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-chip-primary-border bg-chip-primary text-accent-text'}`}>{worker.posisi}</span>
                                ))}
                              </div>
                            </td>
                            <td className="table-cell">
                              <div className="space-y-1">
                                {group.workers.map((worker, workerIndex) => (
                                  <div key={`${worker.nopol_kendaraan}-${workerIndex}`} className="space-y-0.5">
                                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium font-mono text-foreground">{worker.nopol_kendaraan}</span>
                                    <span className="block text-[10px] text-slate-400">{worker.type_kendaraan}</span>
                                  </div>
                                ))}
                                {group.extras.map((v, vi) => (
                                  <div key={`x-${v.nopol}-${vi}`} className="space-y-0.5">
                                    <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-bold font-mono text-amber-700">+{v.nopol || '?'}</span>
                                    <span className="block text-[10px] text-slate-400">{v.type || ''}{v.type && v.sj ? ' · ' : ''}{v.sj || ''}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="table-cell text-center">
                              <div className="space-y-1">
                                {group.workers.map((worker, workerIndex) => {
                                  const first = worker.photos[0];
                                  const src = first ? photoStoredUrl(first) : '';
                                  return (
                                    <div key={`foto-${workerIndex}`} className="flex justify-center">
                                      {src ? (
                                        <a href={src} target="_blank" rel={AUTHENTICATED_FILE_REL} title="Lihat foto bukti" className="group relative block h-10 w-10 overflow-hidden rounded-lg border border-border bg-slate-100 shadow-sm hover:ring-2 hover:ring-primary-400 transition-all">
                                          <Image src={src} alt={`Foto ${worker.nama_thl}`} className="h-full w-full object-cover" width={40} height={40} unoptimized />
                                          {worker.photos.length > 1 && (
                                            <span className="absolute -right-0.5 -bottom-0.5 rounded-md bg-ink-900/90 px-1 text-[9px] font-bold text-white">+{worker.photos.length - 1}</span>
                                          )}
                                        </a>
                                      ) : (
                                        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border text-slate-300">
                                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" /></svg>
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="table-cell text-right">
                              <div className="space-y-1">
                                {group.workers.map((worker, workerIndex) => (
                                  <div key={`${worker.nominal_biaya}-${workerIndex}`} className="font-bold text-foreground tabular-nums">{formatCurrency(worker.nominal_biaya)}</div>
                                ))}
                                <div className="border-t border-border pt-1 text-[11px] font-black text-foreground">Total {formatCurrency(group.nominal_biaya)}</div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status footer */}
              <div className="rounded-2xl border border-border bg-overlay-70 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs font-semibold text-muted-foreground">Status pengajuan</p>
                  {badge(viewItem.status, viewItem)}
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
              <div className="rounded-xl overflow-hidden border border-border">
                <div className="bg-ink-900 px-4 py-3 text-white flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10 text-primary-300">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671a4.5 4.5 0 0 1 5.07-1.651 3 3 0 0 1 1.482 5.369L12 12" /></svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-300/80">Biaya THL</p>
                    <p className="text-sm font-bold truncate">{decision.item.no_kendaraan || decision.item.details?.[0]?.nopol_kendaraan || '-'}</p>
                  </div>
                  <span className="ml-auto shrink-0">{badge(decision.item.status, decision.item)}</span>
                </div>
                <div className="divide-y divide-slate-100 bg-card text-sm">
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-muted-foreground">Depo</span>
                    <span className="font-semibold text-foreground font-mono">{decision.item.nama_depo}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-muted-foreground">Total Biaya</span>
                    <span className="font-black text-foreground tabular-nums">{formatCurrency(decision.item.nominal_biaya)}</span>
                  </div>
                  {decision.item.is_rfah_required && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-muted-foreground">RFAH*</span>
                      <span className="font-semibold text-amber-700">{decision.item.rfah_name || 'Diperlukan'}</span>
                    </div>
                  )}
                </div>
              </div>

              {decision.action === 'reject' ? (
                <div>
                  <label htmlFor="reject-reason" className="block text-xs font-semibold text-foreground mb-1.5">
                    Alasan penolakan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="reject-reason"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={4}
                    disabled={decisionBusy}
                    placeholder="Jelaskan alasan pengajuan ditolak (wajib)"
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-400 resize-none"
                  />
                </div>
              ) : decision.action === 'revise' ? (
                <div>
                  <label htmlFor="revise-reason" className="block text-xs font-semibold text-foreground mb-1.5">
                    Catatan revisi <span className="text-orange-500">*</span>
                  </label>
                  <textarea
                    id="revise-reason"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={4}
                    disabled={decisionBusy}
                    placeholder="Jelaskan apa yang harus diperbaiki pengaju (wajib)"
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-400 resize-none"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Pengajuan akan dikembalikan ke pengaju dengan status <strong className="text-orange-600">Revisi</strong>. Pengaju dapat memperbaiki lalu mengirim ulang.</p>
                </div>
              ) : (
                <p className="text-sm text-foreground rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                  {decision.item.is_rfah_required ? (
                    <>Pengajuan ini akan <strong className="text-emerald-700">disetujui RLH</strong> lalu diteruskan ke tahap <strong className="text-amber-700">RFAH</strong>.</>
                  ) : (
                    <>Pengajuan ini akan berstatus <strong className="text-emerald-700">Approved</strong> setelah disetujui.</>
                  )}
                </p>
              )}
            </div>
          )}
        </Modal>
        <ConfirmDialog
          open={showDeleteConfirm}
          onClose={() => { if (deleting) return; setShowDeleteConfirm(false); setDeleteTargetId(null); }}
          onConfirm={confirmDelete}
          title="Hapus Pengajuan"
          message="Apakah Anda yakin ingin menghapus pengajuan ini? Tindakan ini tidak dapat dibatalkan."
          confirmLabel="Hapus"
          variant="danger"
          loading={deleting}
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

      {/* Receiving candidates */}
      <Modal
        open={candidateOpen}
        onClose={() => setCandidateOpen(false)}
        title="Pilih Receiving Selesai"
        subtitle="Nopol, Surat Jalan, dan kubikasi diisi otomatis dari penerimaan"
        size="lg"
        footer={<button type="button" onClick={() => setCandidateOpen(false)} className="btn-secondary">Tutup</button>}
      >
        {loadingCandidates ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Memuat receiving...</p>
        ) : thlCandidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada receiving COMPLETED yang sudah diperiksa checker.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {thlCandidates.map((candidate) => (
              <div key={candidate.receiving_id} className="flex flex-col gap-2 rounded-xl border border-border bg-popover/60 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {candidate.nopol_kendaraan} · {candidate.type_kendaraan}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatDate(candidate.tanggal_selesai)} · {candidate.no_surat_jalan || candidate.po_transporter} · {candidate.nama_depo}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Qty {Number(candidate.qty_zak || 0).toLocaleString('id-ID')} zak / {Number(candidate.qty_crt || 0).toLocaleString('id-ID')} crt
                    {candidate.has_retribusi ? ` · Retribusi: ${candidate.retribusi_status || 'ada'}` : ' · Retribusi belum ada'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addCandidateWorker(candidate)}
                  className="btn-primary shrink-0 text-xs"
                >
                  Tambah Pekerja
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={() => { setShowImportModal(false); setImportFile(null); }}
        title="Import Biaya THL"
        subtitle="Upload file Excel/CSV untuk mengimpor data Biaya THL"
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
            <label className="block text-sm font-medium text-muted-foreground mb-1" htmlFor="pilih-file">Pilih File</label>
            <input id="pilih-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-chip-primary file:text-accent-text hover:file:bg-chip-primary"
            />
            <p className="text-xs text-slate-400 mt-1">Format: xlsx, xls, csv. Kolom wajib: no_surat_jalan, nama_thl</p>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
