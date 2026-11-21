'use client';

import { Fragment } from 'react';
import type { ComponentType, Dispatch, SetStateAction } from 'react';
import Modal from '@/components/Modal';
import type { BiayaConfig } from '@/lib/biaya';
import type { FormDetailRow, PhotoItem } from './BiayaThlFormHelpers';
import {
  formatCurrency,
  formatRibuan,
  parseRibuan,
  toDateInputValue,
  compressImage,
  generateId,
  requiresDriverName,
  requiresWorkHours,
  isDetailReady,
  getMissingFields,
  VEHICLE_TYPES,
  POSITIONS,
  GROUP_ACCENTS,
} from './BiayaThlFormHelpers';
import { notifyGlobal } from '@/store/globalToast';
import { todayLocal } from '@/lib/dates';

interface BiayaThlFormModalProps {
  openModal: boolean;
  requestClose: () => void;
  editingId: number | null;
  editingStatus: string | null;
  formStep: number;
  busy: boolean;
  biayaConfig: BiayaConfig;
  user: { kode_depo: string; nama_depo: string } | null;
  hasPermission: (slug: string) => boolean;
  formData: { tanggal_pengajuan: string; details: FormDetailRow[] };
  setFormData: Dispatch<SetStateAction<{ tanggal_pengajuan: string; details: FormDetailRow[] }>>;
  sjGroups: Record<string, { groupId: string; sj: string; indices: number[] }>;
  sjVehicle: Record<string, Array<{ id: string; sj: string; nopol: string; type: string }>>;
  setSjVehicle: Dispatch<SetStateAction<Record<string, Array<{ id: string; sj: string; nopol: string; type: string }>>>>;
  vehicleError: string | null;
  sjGroupError: string | null;
  hasBlockingError: boolean;
  isStepBlocked: (step: number) => string | null;
  goToStep: (step: number) => void;
  activeVehicles: (groupId: string) => Array<{ id: string; sj: string; nopol: string; type: string }>;
  isGudangGroup: (groupId: string) => boolean;
  errorSJGroupIndex: number | null;
  errorWorkerIndex: number | null;
  totalNominal: number;
  totalKubikasi: number;
  platList: string[];
  compositionLabel: string;
  MAX_PHOTOS_PER_DETAIL: number;
  reviewGroupsOpen: Set<string>;
  toggleReviewGroup: (pos: string) => void;
  toggleCard: (idx: number) => void;
  collapsedCards: Set<number>;
  setCollapsedCards: Dispatch<SetStateAction<Set<number>>>;
  showIncompleteOnly: boolean;
  setShowIncompleteOnly: Dispatch<SetStateAction<boolean>>;
  hasIncompleteThlRows: boolean;
  isRfahRequired: boolean;
  fetchThlCandidates: () => void;
  loadingCandidates: boolean;
  focusSjInput: (groupId: string) => void;
  addDetailRow: (groupId: string) => void;
  addSjGroup: () => void;
  removeSjGroup: (groupId: string) => void;
  updateSjNumber: (groupId: string, value: string) => void;
  commitSjNumber: (groupId: string, value: string) => void;
  duplicateSjGroup: (groupId: string, groupIndex: number) => void;
  insertSjGroupBefore: (nextGroupId: string | null) => string;
  insertDetailBefore: (groupId: string, atIndex: number) => void;
  updateDetail: (index: number, field: string, value: unknown) => void;
  removeDetail: (index: number) => void;
  addDetailPhoto: (detailIndex: number, files: File[]) => void;
  removeDetailPhoto: (detailIndex: number, photoIndex: number) => void;
  canSaveDraft: boolean;
  handleCreate: () => void;
  handleCreateAndSubmit: () => void;
  handleUpdate: () => void;
  handleSaveDraft: () => void;
  previewThl: () => void;
  DetailPhotoThumb: ComponentType<{ photo: PhotoItem }>;
}

export default function BiayaThlFormModal({
  openModal, requestClose, editingId, editingStatus, formStep, busy, biayaConfig, user, hasPermission,
  formData, setFormData, sjGroups, sjVehicle, setSjVehicle, vehicleError, sjGroupError, hasBlockingError,
  isStepBlocked, goToStep, activeVehicles, isGudangGroup, errorSJGroupIndex, errorWorkerIndex,
  totalNominal, totalKubikasi, platList, compositionLabel, MAX_PHOTOS_PER_DETAIL,
  reviewGroupsOpen, toggleReviewGroup, toggleCard, collapsedCards, setCollapsedCards,
  showIncompleteOnly, setShowIncompleteOnly, hasIncompleteThlRows, isRfahRequired,
  fetchThlCandidates, loadingCandidates, focusSjInput, addDetailRow, addSjGroup, removeSjGroup,
  updateSjNumber, commitSjNumber, duplicateSjGroup, insertSjGroupBefore, insertDetailBefore,
  updateDetail, removeDetail, addDetailPhoto, removeDetailPhoto,
  canSaveDraft, handleCreate, handleCreateAndSubmit, handleUpdate, handleSaveDraft, previewThl,
  DetailPhotoThumb,
}: BiayaThlFormModalProps) {
  return (
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
                <button type="button" onClick={editingId ? handleUpdate : handleCreate} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError} title="Menyimpan lengkap sebagai draft (belum masuk antrean pemeriksaan)" className="btn-secondary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-600" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                  {busy ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Lengkap'}
                </button>
                <button type="button" onClick={handleCreateAndSubmit} disabled={busy || !formData.tanggal_pengajuan || formData.details.length === 0 || hasIncompleteThlRows || hasBlockingError} title={editingStatus === 'revisi' ? 'Simpan perbaikan lalu kirim kembali ke approver yang meminta revisi' : 'Simpan dan langsung kirim ke antrean pemeriksaan'} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                  {editingStatus === 'revisi' ? 'Simpan Perubahan & Kirim Ulang' : 'Simpan & Kirim'}
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
              <button type="button" onClick={() => goToStep(3)} disabled={busy} title={formData.details.length === 0 ? 'Tambahkan minimal 1 pekerja' : hasIncompleteThlRows || hasBlockingError ? 'Klik untuk melihat data pekerja yang belum lengkap' : 'Lanjut ke ringkasan akhir'} className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
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
            <aside className="hidden rounded-3xl bg-ink-950 p-5 text-white shadow-xl lg:block">
              <div className="mb-8">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary-200">THL Claim</span>
                <h3 className="mt-4 text-xl font-black tracking-tight">Siapkan pengajuan dengan rapi.</h3>
                <p className="mt-2 text-xs leading-5 text-ink-fg-muted">Isi informasi, data pekerja, lalu periksa total sebelum dikirim.</p>
              </div>
              <div className="space-y-2">
                {[
                  { step: 1, label: 'Informasi', note: 'Tanggal & depo' },
                  { step: 2, label: 'Data pekerja', note: `${formData.details.length} pekerja` },
                  { step: 3, label: 'Review', note: formatCurrency(totalNominal) },
                ].map((item) => {
                  const blockedReason = isStepBlocked(item.step);
                  return (
                  <button key={item.step} type="button" onClick={() => goToStep(item.step)} disabled={!!blockedReason} title={blockedReason ?? undefined} aria-current={formStep === item.step ? 'step' : undefined} aria-disabled={!!blockedReason} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${formStep === item.step ? 'bg-card text-foreground shadow-lg' : blockedReason ? 'text-ink-fg-muted cursor-not-allowed' : 'text-ink-fg hover:bg-white/10'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${formStep === item.step ? 'bg-primary-600 text-white' : blockedReason ? 'bg-white/10 text-ink-fg-muted' : 'bg-white/10 text-white'}`}>{item.step}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black">{item.label}</span>
                      <span className={`mt-0.5 block truncate text-[10px] ${formStep === item.step ? 'text-muted-foreground' : 'text-ink-fg-muted'}`}>{blockedReason ?? item.note}</span>
                    </span>
                  </button>
                  );
                })}
              </div>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-200">Ringkasan live</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-ink-fg-muted">Total nominal</span><span className="text-sm font-black tabular-nums">{formatCurrency(totalNominal)}</span></div>
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-ink-fg-muted">Kubikasi</span><span className="text-sm font-black tabular-nums">{totalKubikasi} m³</span></div>
                  <div className="flex items-end justify-between gap-3"><span className="text-xs text-ink-fg-muted">Komposisi</span><span className="text-xs font-bold tabular-nums text-right">{compositionLabel}</span></div>
                  <div className="flex items-start justify-between gap-3"><span className="text-xs text-ink-fg-muted pt-0.5">Plat</span>{platList.length > 0 ? (
                    <span className="flex flex-wrap justify-end gap-1 max-w-32.5">
                      {platList.slice(0, 4).map((p) => (
                        <span key={p} title={p} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-fg truncate max-w-full">{p}</span>
                      ))}
                      {platList.length > 4 && <span className="text-[10px] font-bold text-ink-fg-muted">+{platList.length - 4}</span>}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}</div>
                  <div className="h-px bg-white/10" />
                  <p className="text-[10px] leading-4 text-ink-fg-muted">Validasi otomatis aktif. Data yang belum lengkap tidak dapat dikirim.</p>
                </div>
              </div>
            </aside>
            <div className="min-w-0">
          {/* Step Indicator */}
          <div className="sticky top-0 z-20 mb-6 rounded-2xl border border-border bg-card/90 backdrop-blur-md p-2 sm:p-3">
            <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              <span>Progress pengajuan</span>
              <span className="text-accent-text">Langkah {formStep} dari 3</span>
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
                <button type="button" onClick={() => goToStep(s.step)} disabled={!!blockedReason} title={blockedReason ?? undefined} aria-current={formStep === s.step ? 'step' : undefined} aria-disabled={!!blockedReason} className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${formStep === s.step ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : formStep > s.step ? 'bg-chip-primary text-accent-text' : blockedReason ? 'bg-popover text-muted-foreground cursor-not-allowed' : 'bg-popover text-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${formStep === s.step ? 'bg-card text-accent-text' : formStep > s.step ? 'bg-brand-wash-strong text-accent-text' : blockedReason ? 'bg-card text-muted-foreground' : 'bg-card text-foreground'}`}>
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
              <div className="rounded-2xl bg-linear-to-br from-brand-wash via-blue-50 to-brand-wash p-5 border border-chip-primary-border">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-lg shadow-primary-200">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-black text-accent-text-strong">{user?.kode_depo} — {user?.nama_depo}</p>
                    <p className="text-[11px] text-accent-text font-medium">Depo aktif untuk pengajuan ini</p>
                  </div>
                </div>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-widest text-accent-text mb-2 block">Tanggal Pengajuan</span>
                  <input type="date" value={toDateInputValue(formData.tanggal_pengajuan)} max={todayLocal()} onChange={(e) => setFormData({ ...formData, tanggal_pengajuan: e.target.value })} className="input-field w-full border-2 border-chip-primary-border px-4 py-3 text-sm font-bold focus:border-primary-500 focus:ring-4 focus:ring-chip-primary-border transition-all" />
                </label>
              </div>

              <p className="rounded-xl bg-popover border border-border px-4 py-3 text-xs text-muted-foreground">Gunakan tombol <span className="font-bold text-foreground">Lanjut ke Data Pekerja</span> di bawah dialog untuk melanjutkan.</p>
            </div>
          )}

          {/* Step 2: Data Pekerja */}
          {formStep === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => goToStep(1)} className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-popover hover:text-accent-text transition-colors shrink-0" aria-label="Kembali ke Informasi">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-foreground">Data Pekerja</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">1 baris = 1 pekerja × 1 bongkaran — pekerja yang sama boleh muncul di SJ berbeda</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {formData.details.length > 0 && (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-chip-primary border border-chip-primary-border text-accent-text px-3 py-1 text-xs font-bold whitespace-nowrap shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                      {formData.details.length} pekerja
                    </span>
                  )}
                  <button type="button" onClick={() => void fetchThlCandidates()} disabled={loadingCandidates} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-black text-muted-foreground transition-colors hover:border-primary-300 hover:text-accent-text disabled:opacity-50 shrink-0">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    {loadingCandidates ? 'Memuat...' : 'Dari Receiving'}
                  </button>
                  <button type="button" onClick={addSjGroup} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition-colors shrink-0 ${formData.details.length === 0 ? 'border border-border bg-card text-muted-foreground hover:border-primary-300 hover:text-accent-text' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-200'}`}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Surat Jalan
                  </button>
                </div>
              </div>

              {formData.details.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-popover border border-border px-3 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold text-foreground">
                    <input
                      type="checkbox"
                      checked={showIncompleteOnly}
                      onChange={(e) => setShowIncompleteOnly(e.target.checked)}
                      className="rounded border-border text-accent-text focus:ring-primary-500 w-4 h-4"
                    />
                    Hanya yang belum lengkap
                  </label>
                  <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden="true" />
                  <button type="button" onClick={() => setCollapsedCards(new Set(formData.details.map((_, i) => i)))} className="text-[11px] font-black text-muted-foreground hover:text-accent-text transition-colors">
                    Lipatkan semua
                  </button>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <button type="button" onClick={() => setCollapsedCards(new Set())} className="text-[11px] font-black text-muted-foreground hover:text-accent-text transition-colors">
                    Bentangkan semua
                  </button>
                </div>
              )}

              {formData.details.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-border bg-card p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-chip-primary border border-chip-primary-border flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-base font-black text-foreground">Belum ada data pekerja</p>
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
                            <div className="h-px flex-1 border-t-2 border-dashed border-border" />
                            <button type="button" onClick={() => { const gid = insertSjGroupBefore(group.groupId); focusSjInput(gid); }} title={`Sisipkan Surat Jalan sebelum nomor ${gIdx + 1}`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-border bg-card px-3 py-1 text-[11px] font-black text-muted-foreground hover:border-primary-400 hover:text-accent-text transition-colors shrink-0">

                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                              Tambah Surat Jalan di sini
                            </button>
                            <div className="h-px flex-1 border-t-2 border-dashed border-border" />
                          </div>
                        )}
                    <div key={group.groupId} id={`sj-group-${gIdx}`} className={`rounded-2xl border bg-card overflow-hidden shadow-sm scroll-mt-2 ${errorSJGroupIndex === gIdx ? 'border-red-300 ring-2 ring-red-200' : 'border-border'}`}>
                      <div className={`h-1 bg-linear-to-r ${accent.bar}`} aria-hidden="true" />
                      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-5 py-4 bg-card border-b border-border">
                        <div className={`w-8 h-8 rounded-lg ${accent.solid} text-white flex items-center justify-center text-xs font-black shadow-sm shrink-0`} aria-hidden="true">
                          {gIdx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1" htmlFor={`nomor-surat-jalan-${gIdx}`}>Nomor Surat Jalan <span className="text-red-400">*</span></label>
                          <input id={`nomor-surat-jalan-${gIdx}`} type="text" data-sj-group-id={group.groupId} value={group.sj} onChange={(e) => updateSjNumber(group.groupId, e.target.value)} onBlur={(e) => commitSjNumber(group.groupId, e.target.value)} placeholder="Contoh: SJ-2025-0001" className={`w-full rounded-xl border px-3 py-2 font-mono text-sm font-bold text-foreground placeholder:text-gray-300 transition-colors focus:outline-none focus:ring-4 bg-card ${errorSJGroupIndex === gIdx ? 'border-red-400 focus:border-red-400 focus:ring-red-50' : 'border-border focus:border-primary-400 focus:ring-brand-wash'}`} />

                        </div>
                        <span className={`inline-flex items-center rounded-full ${accent.soft} ${accent.text} px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0`}>{group.indices.length} pekerja</span>
                        <button type="button" onClick={() => duplicateSjGroup(group.groupId, gIdx)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-accent-text hover:bg-chip-primary transition-colors shrink-0" title="Duplikat grup — salin pekerja, tinggal isi SJ baru" aria-label={`Duplikat Surat Jalan ${gIdx + 1}`}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-7.5A2.25 2.25 0 018.25 18v-2.25m8.25-7.5H18m-8.25 7.5h7.5" /></svg>
                        </button>
                        <button type="button" onClick={() => removeSjGroup(group.groupId)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="Hapus Surat Jalan" aria-label={`Hapus Surat Jalan ${gIdx + 1}`}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 border-b border-border bg-card px-4 sm:px-5 py-1.5" aria-hidden="true">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-1 rounded-full bg-linear-to-r ${accent.bar} transition-all`} style={{ width: `${group.indices.length === 0 ? 0 : Math.round((readyCount / group.indices.length) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-black tabular-nums text-slate-400">{readyCount}/{group.indices.length} siap</span>
                      </div>
<div className="p-3 sm:p-4 space-y-2">
                        {isGudangGroup(group.groupId) && (
                          <div id={`sj-vehicle-${group.groupId}`} className={`rounded-2xl border bg-card overflow-hidden shadow-sm scroll-mt-2 ${(sjVehicle[group.groupId] ?? []).length > 0 ? 'border-amber-300 ring-1 ring-amber-200' : 'border-border'}`}>
                            <div className="flex items-center justify-between px-4 py-3.5 sm:px-5">
                              <div className="flex items-center gap-3">
                                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${(sjVehicle[group.groupId] ?? []).length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm font-black text-foreground">Kendaraan tambahan <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">opsional</span></span>
                                  <span className="block text-[11px] text-muted-foreground">Hanya jika 1 kru membongkar 2+ kendaraan — boleh dikosongkan</span>
                                </span>
                              </div>
                              <button type="button" onClick={() => setSjVehicle((prev) => ({ ...prev, [group.groupId]: [...(prev[group.groupId] ?? []), { id: generateId(), sj: '', nopol: '', type: '' }] }))} className="btn-secondary shrink-0">
                                <span className="flex items-center gap-1.5"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>Tambah Kendaraan</span>
                              </button>
                            </div>
                            {(sjVehicle[group.groupId] ?? []).map((v, vIdx) => (
                              <div key={v.id} className="border-t border-amber-100 bg-amber-50/50 px-4 py-3 sm:px-5">
                                <div className="flex items-center gap-3">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-black shrink-0">{vIdx + 1}</span>
                                  <button type="button" onClick={() => setSjVehicle((prev) => ({ ...prev, [group.groupId]: prev[group.groupId]!.filter((_, i) => i !== vIdx) }))} className="shrink-0 text-red-500 hover:bg-red-50 rounded-full p-1" aria-label="Hapus kendaraan">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                                  <div>
                                    <label htmlFor={`sjv-sj-${group.groupId}-${vIdx}`} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">No. SJ Kendaraan ke-{vIdx + 2} <span className="text-red-400">*</span></label>
                                    <input id={`sjv-sj-${group.groupId}-${vIdx}`} type="text" value={sjVehicle[group.groupId]?.[vIdx]?.sj ?? ''} onChange={(e) => setSjVehicle((prev) => { const arr = [...(prev[group.groupId] ?? [])]; if (arr[vIdx]) arr[vIdx] = { ...arr[vIdx], sj: e.target.value }; return { ...prev, [group.groupId]: arr }; })} placeholder="SJ kendaraan ke-2" className="input-field py-2 text-sm font-mono uppercase" />
                                  </div>
                                  <div>
                                    <label htmlFor={`sjv-nopol-${group.groupId}-${vIdx}`} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Plat Kendaraan ke-{vIdx + 2} <span className="text-red-400">*</span></label>
                                    <input id={`sjv-nopol-${group.groupId}-${vIdx}`} type="text" value={sjVehicle[group.groupId]?.[vIdx]?.nopol ?? ''} onChange={(e) => setSjVehicle((prev) => { const arr = [...(prev[group.groupId] ?? [])]; if (arr[vIdx]) arr[vIdx] = { ...arr[vIdx], nopol: e.target.value.toUpperCase() }; return { ...prev, [group.groupId]: arr }; })} placeholder="KB 1234 XX" className="input-field py-2 text-sm font-mono uppercase" />
                                  </div>
                                  <div>
                                    <label htmlFor={`sjv-type-${group.groupId}-${vIdx}`} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Type Kendaraan ke-{vIdx + 2} <span className="text-red-400">*</span></label>
                                    <select id={`sjv-type-${group.groupId}-${vIdx}`} value={sjVehicle[group.groupId]?.[vIdx]?.type ?? ''} onChange={(e) => setSjVehicle((prev) => { const arr = [...(prev[group.groupId] ?? [])]; if (arr[vIdx]) arr[vIdx] = { ...arr[vIdx], type: e.target.value }; return { ...prev, [group.groupId]: arr }; })} className="select-field py-2 text-sm"> <option value="">Pilih</option> {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)} </select>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {group.indices.map((idx) => {
                          const detail = formData.details[idx];
                          const rowNum = group.indices.indexOf(idx) + 1;
                          return (
                            <Fragment key={idx}>
                              {rowNum > 1 && (
                                <div className="flex items-center gap-3 py-1">
                                  <div className="h-px flex-1 border-t-2 border-dashed border-border" />
                                  <button type="button" onClick={() => insertDetailBefore(group.groupId, idx)} title={`Sisipkan pekerja sebelum nomor ${rowNum}`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-border bg-card px-3 py-1 text-[11px] font-black text-muted-foreground hover:border-primary-400 hover:text-accent-text transition-colors shrink-0">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                    Sisipkan di sini
                                  </button>
                                  <div className="h-px flex-1 border-t-2 border-dashed border-border" />
                                </div>
                              )}
                            <div id={`worker-card-${idx}`} className={`rounded-2xl border bg-card overflow-hidden shadow-sm scroll-mt-2 ${showIncompleteOnly && isDetailReady(detail) ? 'hidden' : ''} ${errorWorkerIndex === idx ? 'border-red-300 ring-2 ring-red-200' : 'border-border'}`}>
                              <div className="flex items-center gap-3 border-b border-border bg-overlay-70 px-4 py-4 sm:px-5">
                                <div className={`w-9 h-9 rounded-xl ${accent.solid} flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0`}>
                                  {rowNum}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-black text-foreground truncate">
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
                                    <span className="text-[11px] text-muted-foreground truncate block">
                                      {detail.posisi || 'Tanpa posisi'} · {formatCurrency(Number(detail.nominal_biaya) || 0)} · {Number(detail.kubikasi) || 0} m³
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground truncate block">Lengkapi semua kolom bertanda <span className="font-bold text-red-500">*</span></span>
                                  )}
                                </div>
                                <span className={`hidden rounded-full border px-2.5 py-1 text-[10px] font-black sm:inline-flex ${isDetailReady(detail) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                  {isDetailReady(detail) ? 'Siap' : 'Belum lengkap'}
                                </span>
                                <button type="button" onClick={() => toggleCard(idx)} aria-expanded={!collapsedCards.has(idx)} title={collapsedCards.has(idx) ? 'Bentangkan' : 'Lipatkan'} aria-label={collapsedCards.has(idx) ? `Bentangkan pekerja ${rowNum}` : `Lipatkan pekerja ${rowNum}`} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-text hover:bg-chip-primary transition-colors shrink-0">
                                  <svg className={`w-4 h-4 transition-transform ${collapsedCards.has(idx) ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                </button>
                                <button type="button" onClick={() => removeDetail(idx)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="Hapus pekerja" aria-label={`Hapus pekerja ${rowNum}`}>
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              {!collapsedCards.has(idx) && (
                              <>
                              <nav aria-label="Lompat ke bagian" className="flex flex-wrap gap-1.5 border-b border-border bg-card px-4 py-2 sm:px-5">
                                {[
                                  ['Data', `wp-${idx}-data`],
                                  ['Kendaraan', `wp-${idx}-kendaraan`],
                                  ['Biaya', `wp-${idx}-biaya`],
                                  ['Jam', `wp-${idx}-jam`],
                                  ['Foto', `wp-${idx}-foto`],
                                ].map(([label, href]) => (
                                  <a key={href} href={`#${href}`} className="rounded-full border border-border bg-popover px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:border-primary-300 hover:text-accent-text transition-colors">
                                    {label}
                                  </a>
                                ))}
                              </nav>

                              <div className="space-y-6 px-4 py-5 sm:px-5">
                                {/* Data Pekerja */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-chip-primary border border-chip-primary-border flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                    </div>
                                    <h4 id={`wp-${idx}-data`} className="text-[11px] font-black text-foreground uppercase tracking-wider scroll-mt-2">Data Pekerja</h4>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-nama_thl`}>
                                        Nama THL <span className="text-red-400">*</span>
                                      </label>
                                      <input id={`detail-${idx}-nama_thl`} type="text" value={detail.nama_thl} onChange={(e) => updateDetail(idx, 'nama_thl', e.target.value)} placeholder="Nama pekerja" className="input-field py-2 text-sm" />
                                    </div>
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-posisi`}>
                                        Posisi <span className="text-red-400">*</span>
                                      </label>
                                      <select id={`detail-${idx}-posisi`} value={detail.posisi} onChange={(e) => {
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
                        <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-driver_name`}>
                          Nama Driver <span className="text-red-400">*</span>
                        </label>
                        <input id={`detail-${idx}-driver_name`} type="text" value={detail.driver_name} onChange={(e) => updateDetail(idx, 'driver_name', e.target.value)} placeholder="Nama driver" className="input-field py-2 text-sm" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Kendaraan — plat + type per baris untuk SEMUA posisi (dokumentasi). */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-chip-primary border border-chip-primary-border flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                    </div>
                    <h4 id={`wp-${idx}-kendaraan`} className="text-[11px] font-black text-foreground uppercase tracking-wider scroll-mt-2">Kendaraan</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
<div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-nopol_kendaraan`}>
                                        Plat Kendaraan <span className="text-red-400">*</span>
                                      </label>
                                      <input id={`detail-${idx}-nopol_kendaraan`} type="text" value={detail.nopol_kendaraan} onChange={(e) => updateDetail(idx, 'nopol_kendaraan', e.target.value.toUpperCase())} placeholder="KB 1234 XX" title="Nomor polisi kendaraan, contoh: KB 1234 XX" className="input-field py-2 text-sm font-mono uppercase" />
                                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-type_kendaraan`}>
                        Type Kendaraan <span className="text-red-400">*</span>
                      </label>
                      <select id={`detail-${idx}-type_kendaraan`} value={detail.type_kendaraan} onChange={(e) => updateDetail(idx, 'type_kendaraan', e.target.value)} className="select-field py-2 text-sm">
                        <option value="">Pilih</option>
                        {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  {String(detail.posisi ?? '').trim().toUpperCase() === 'THL GUDANG' && activeVehicles(detail.groupId).length > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Kru ini juga membongkar:{' '}
                      {activeVehicles(detail.groupId).map((v, vi) => (
                        <span key={v.id} className="mr-1 inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-px text-[10px] font-bold text-amber-700">ke-{vi + 2}: {v.nopol || '?'} · {v.sj || 'SJ?'}</span>
                      ))}
                    </p>
                  )}
                </div>

                                {/* Biaya & Muatan */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-chip-primary border border-chip-primary-border flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                                    </div>
                                    <h4 id={`wp-${idx}-biaya`} className="text-[11px] font-black text-foreground uppercase tracking-wider scroll-mt-2">Biaya & Muatan</h4>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-nominal_biaya`}>
                                        Nominal Biaya (Rp) <span className="text-red-400">*</span>
                                      </label>
                                      <input id={`detail-${idx}-nominal_biaya`} type="text" inputMode="decimal" value={detail.nominal_biaya ? formatRibuan(detail.nominal_biaya) : ''} onChange={(e) => updateDetail(idx, 'nominal_biaya', parseRibuan(e.target.value))} placeholder="0" title="Besaran biaya/honor THL dalam rupiah (minimal Rp 1)" className="input-field py-2 text-sm font-bold tabular-nums" />
                                      <p className="mt-1 text-[10px] text-gray-400">Contoh: 150000 = Rp 150.000</p>
                                    </div>
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-kubikasi`}>
                                        Kubikasi (m³) {requiresDriverName(detail.posisi) && <span className="text-red-400">*</span>}
                                      </label>
                                      <input id={`detail-${idx}-kubikasi`} type="number" min="0" step="0.01" value={detail.posisi === 'THL GUDANG' ? 0 : detail.kubikasi || ''} onChange={(e) => updateDetail(idx, 'kubikasi', Number(e.target.value))} placeholder="0" disabled={detail.posisi === 'THL GUDANG'} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                    </div>
                                    <div>
                                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-droppoint`}>
                                        Droppoint {requiresDriverName(detail.posisi) && <span className="text-red-400">*</span>}
                                      </label>
                                      <input id={`detail-${idx}-droppoint`} type="text" value={detail.posisi === 'THL GUDANG' ? '' : detail.droppoint} onChange={(e) => updateDetail(idx, 'droppoint', e.target.value)} placeholder={detail.posisi === 'THL GUDANG' ? 'Tidak diperlukan' : 'Lokasi tujuan'} disabled={detail.posisi === 'THL GUDANG'} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                    </div>
                                  </div>
                                </div>

                                {/* Jam Kerja — wajib untuk SEMUA posisi, jadi selalu tampil.
                                    Hanya disabled sebelum posisi dipilih (sejajar pola kubikasi/droppoint),
                                    bukan show/hide yang menggeser layout. */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-7 h-7 rounded-lg bg-chip-primary border border-chip-primary-border flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      </div>
                                      <h4 id={`wp-${idx}-jam`} className="text-[11px] font-black text-foreground uppercase tracking-wider scroll-mt-2">Jam Kerja</h4>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-jam_datang`}>
                                          Jam Datang <span className="text-red-400">*</span>
                                        </label>
                                        <input id={`detail-${idx}-jam_datang`} type="datetime-local" value={detail.jam_datang} onChange={(e) => updateDetail(idx, 'jam_datang', e.target.value)} disabled={!detail.posisi} title={!detail.posisi ? 'Pilih posisi terlebih dahulu' : undefined} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                      </div>
                                      <div>
                                        <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`detail-${idx}-jam_pulang`}>
                                          Jam Pulang <span className="text-red-400">*</span>
                                        </label>
                                        <input id={`detail-${idx}-jam_pulang`} type="datetime-local" value={detail.jam_pulang} onChange={(e) => updateDetail(idx, 'jam_pulang', e.target.value)} disabled={!detail.posisi} title={!detail.posisi ? 'Pilih posisi terlebih dahulu' : undefined} className="input-field py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400" />
                                      </div>
                                    </div>
                                  </div>

                                {/* Foto */}
                                <div className="pt-1 border-t border-border">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-lg bg-chip-primary border border-chip-primary-border flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                                    </div>
                                    <h4 id={`wp-${idx}-foto`} className="text-[11px] font-black text-foreground uppercase tracking-wider scroll-mt-2">Foto Bukti <span className="text-red-400">*</span></h4>
                                    <span className={`ml-auto text-[10px] font-black rounded-full px-2 py-0.5 ${detail.photos.length === 0 ? 'text-red-600 bg-red-100' : 'text-gray-400 bg-gray-100'}`}>{detail.photos.length}/{MAX_PHOTOS_PER_DETAIL}</span>
                                  </div>
                                  <div className="flex items-start gap-3">
                                    {detail.photos.length > 0 && (
                                      <div className="relative w-24 h-24 shrink-0">
                                        <div className="w-full h-full rounded-xl border-2 border-border bg-gray-100 overflow-hidden">
                                          <DetailPhotoThumb photo={detail.photos[0]} />
                                        </div>
                                        <button type="button" onClick={() => removeDetailPhoto(idx, 0)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors" title="Hapus foto" aria-label="Hapus foto">
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </div>
                                    )}
                                    <label className="block cursor-pointer grow">
                                      <div className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 text-center transition-colors ${detail.photos.length > 0 ? 'border-primary-300 bg-chip-primary/40 hover:bg-chip-primary' : 'border-border bg-popover hover:border-primary-300 hover:bg-chip-primary/50'}`}>
                                        <svg className={`w-5 h-5 ${detail.photos.length > 0 ? 'text-primary-400' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                        <span className="text-xs font-bold text-muted-foreground">{detail.photos.length > 0 ? 'Ganti foto' : 'Upload foto bukti *'}</span>
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

                        <button type="button" onClick={() => addDetailRow(group.groupId)} className="w-full rounded-xl border border-dashed border-primary-300 bg-chip-primary/40 py-3 text-xs font-bold text-accent-text hover:bg-chip-primary hover:border-primary-400 transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm">
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
                <p className="rounded-xl bg-popover border border-border px-4 py-3 text-xs text-muted-foreground">Gunakan tombol <span className="font-bold text-foreground">Lanjut ke Review</span> di bawah dialog untuk melanjutkan.</p>
              )}
            </div>
          )}

          {/* Step 3: Total & Submit */}
          {formStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-black text-foreground">Ringkasan Pengajuan</h3>
                <span className="text-[11px] font-bold text-gray-400">Langkah 3 • periksa total sebelum dikirim</span>
              </div>

              <div className={`rounded-2xl p-5 transition-all ${isRfahRequired ? 'bg-linear-to-br from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 shadow-lg shadow-amber-100/50' : 'bg-popover border border-border'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isRfahRequired ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-muted-foreground'}`}>
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659 1.171-1.671a4.5 4.5 0 015.07-1.651 3 3 0 011.482 5.369L12 12" /></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Pengajuan</p>
                    <p className="text-3xl font-black text-foreground tabular-nums mt-1">{formatCurrency(totalNominal)}</p>
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

              <div className="rounded-xl bg-card border border-border p-4 space-y-2">
                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-3">Detail Pekerja</h4>
                {(['THL GUDANG', 'THL HELPER', 'THL DRIVER'] as const).map((pos) => {
                  const rows = formData.details
                    .map((d, i) => ({ d, i }))
                    .filter(({ d }) => String(d.posisi ?? '').trim().toUpperCase() === pos);
                  if (rows.length === 0) return null;
                  const open = reviewGroupsOpen.has(pos);
                  const subtotal = rows.reduce((s, { d }) => s + (Number(d.nominal_biaya) || 0), 0);
                  const kubikasi = rows.reduce((s, { d }) => s + (Number(d.kubikasi) || 0), 0);
                  const badge = pos === 'THL GUDANG'
                    ? 'bg-chip-primary text-accent-text border-chip-primary-border'
                    : pos === 'THL HELPER'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200';
                  return (
                    <div key={pos} className="rounded-xl border border-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleReviewGroup(pos)}
                        aria-expanded={open}
                        aria-label={`${open ? 'Tutup' : 'Buka'} rincian ${pos}`}
                        className="flex w-full items-center gap-3 bg-overlay-70 px-3 py-2.5 text-left transition-colors hover:bg-popover"
                      >
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-1.5 text-[11px] font-black ${badge}`}>{rows.length}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-black text-foreground">{pos}</span>
                          <span className="block truncate text-[10px] text-slate-400">
                            {rows.length} pekerja{ kubikasi > 0 ? ` · ${kubikasi} m³` : ''}
                          </span>
                        </span>
                        <span className="text-xs font-black tabular-nums text-foreground">{formatCurrency(subtotal)}</span>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                      {open && (
                        <div className="divide-y divide-gray-50 px-3">
                          {rows.map(({ d, i }) => {
                            // Kendaraan tambahan milik grup (1 kru, N kendaraan): di state
                            // segar baca dari checklist grup; di data tersimpan baca dari
                            // kendaraan[] yang sudah dinormalisasi. Tidak pernah keduanya
                            // (isi sjVehicle hasil restore/edit sama dengan kendaraan[]).
                            const groupExtras = String(d.posisi ?? '').trim().toUpperCase() === 'THL GUDANG'
                              ? activeVehicles(d.groupId).map((v) => ({ sj: v.sj, nopol: v.nopol, type: v.type }))
                              : [];
                            const storedExtras = (d.kendaraan ?? []).filter((v) => (v.sj || '').trim() || (v.nopol || '').trim());
                            const extras = groupExtras.length > 0 ? groupExtras : storedExtras;
                            return (
                            <div key={i} className="flex items-center gap-3 py-2">
                              <span className="w-6 h-6 rounded-md bg-chip-primary text-accent-text flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-bold text-foreground block truncate">{d.nama_thl || `Pekerja ${i + 1}`}</span>
                                <span className="text-[11px] text-gray-400 block truncate">{d.nopol_kendaraan} · {d.no_surat_jalan || '—'}</span>
                                {extras.map((v, vi) => (
                                  <span key={vi} className="mt-0.5 mr-1 inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-px text-[10px] font-bold text-amber-700">+ Kendaraan ke-{vi + 2} ({v.nopol || '?'} · {v.sj || 'SJ?'})</span>
                                ))}
                                {extras.length === 0 && d.kendaraan_tambahan ? (
                                  <span className="mt-0.5 inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-px text-[10px] font-bold text-amber-700">+ Kendaraan ke-2 ({d.kendaraan_sj || 'SJ?'})</span>
                                ) : null}
                              </div>
                              <span className="text-xs font-bold text-foreground tabular-nums">{formatCurrency(Number(d.nominal_biaya))}</span>
                            </div>
                            );
                          })}
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
  );
}
