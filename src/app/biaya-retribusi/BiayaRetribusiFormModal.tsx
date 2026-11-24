'use client';

import type { Dispatch, SetStateAction } from 'react';
import Modal from '@/components/Modal';
import type { BiayaConfig } from '@/lib/biaya';
import { DOCUMENT_TYPES, VEHICLE_TYPES, formatCurrency, formatDate, formatBytes, upper } from './BiayaRetribusiFormHelpers';
import type { DetailRow, DocumentRow, ManualDetailRow, ReceivingCandidate } from './BiayaRetribusiFormHelpers';

/** Urutan wizard pengajuan: Tipe → Data → Lampiran → Review. */
const WIZARD_LABELS = ['Tipe', 'Data', 'Lampiran', 'Review'];

interface RateDraft {
  mode: 'borongan' | 'koli';
  rate_zak: number;
  rate_crt: number;
}

interface BiayaRetribusiFormModalProps {
  openModal: boolean;
  onClose: () => void;
  editingId: number | null;
  editingStatus: string | null;
  formStep: number;
  setFormStep: Dispatch<SetStateAction<number>>;
  minStep: number;
  stepDone: (number | boolean)[];
  stepProgress: number;
  busy: boolean;
  sourceType: 'receiving' | 'manual' | null;
  switchSourceType: (next: 'receiving' | 'manual' | null) => void;
  targetDepoLabel: string;
  isCandidateDepoUniform: boolean;
  isDepoInherited: boolean;
  isKoliMode: boolean;
  isKoliSession: boolean;
  isRfahRequired: boolean;
  biayaConfig: BiayaConfig;
  effectiveKode: string;
  rateDraft: RateDraft;
  setRateDraft: Dispatch<SetStateAction<RateDraft>>;
  rateSaving: boolean;
  tariffOpen: boolean;
  setTariffOpen: Dispatch<SetStateAction<boolean>>;
  saveRates: () => void;
  formData: { tanggal_pengajuan: string; details: DetailRow[]; documents: DocumentRow[] };
  setFormData: Dispatch<SetStateAction<{ tanggal_pengajuan: string; details: DetailRow[]; documents: DocumentRow[] }>>;
  setSelectedCandidates: Dispatch<SetStateAction<number[]>>;
  duplicateSelectedPos: string[];
  manualDetails: ManualDetailRow[];
  updateExistingDetail: (index: number, field: 'nopol_kendaraan' | 'type_kendaraan' | 'no_surat_jalan' | 'qty_zak' | 'qty_crt' | 'nominal_biaya', value: string | number) => void;
  removeExistingDetail: (index: number) => void;
  updateManualDetail: (index: number, field: keyof ManualDetailRow, value: string | number) => void;
  removeManualDetail: (index: number) => void;
  addManualDetail: () => void;
  startManualRow: (field: keyof ManualDetailRow, value: string | number) => void;
  existingNominal: (d: DetailRow) => number;
  manualNominal: (md: ManualDetailRow) => number;
  candidateNominal: (id: number) => number;
  candidates: ReceivingCandidate[];
  selectedCandidates: number[];
  toggleCandidate: (id: number) => void;
  candidateNominals: Record<number, number>;
  setCandidateNominals: Dispatch<SetStateAction<Record<number, number>>>;
  fetchCandidates: () => void;
  onRefresh: () => void;
  startDocument: (field: 'document_type' | 'file', value: string | File) => void;
  updateDocument: (index: number, field: keyof DocumentRow, value: string | File | null) => void;
  removeDocument: (index: number) => void;
  addDocument: () => void;
  handleDocFile: (index: number, file: File) => void;
  goBack: () => void;
  goNext: () => void;
  previewRetribusi: () => void;
  handleCreate: () => void;
  handleCreateAndSubmit: () => void;
  handleUpdate: () => void;
  handleUpdateAndSubmit: () => void;
  totalNominal: number;
  selectedRowCount: number;
  blockerReasons: string[];
  step2Blockers: string[];
  step3Blockers: string[];
  submitBlockers: string[];
  hasPermission: (slug: string) => boolean;
}

export default function BiayaRetribusiFormModal({
  openModal, onClose, editingId, editingStatus, formStep, setFormStep, minStep, stepDone, stepProgress, busy,
  sourceType, switchSourceType, targetDepoLabel, isCandidateDepoUniform, isDepoInherited, isKoliMode, isKoliSession,
  isRfahRequired, biayaConfig, effectiveKode, rateDraft, setRateDraft, rateSaving, tariffOpen, setTariffOpen, saveRates,
  formData, setFormData, setSelectedCandidates, duplicateSelectedPos, manualDetails, updateExistingDetail, removeExistingDetail, updateManualDetail, removeManualDetail,
  addManualDetail, startManualRow, existingNominal, manualNominal, candidateNominal, candidates, selectedCandidates,
  toggleCandidate, candidateNominals, setCandidateNominals, fetchCandidates, onRefresh, startDocument, updateDocument,
  removeDocument, addDocument, handleDocFile, goBack, goNext, previewRetribusi, handleCreate, handleCreateAndSubmit,
  handleUpdate, handleUpdateAndSubmit, totalNominal, selectedRowCount, blockerReasons, step2Blockers, step3Blockers,
  submitBlockers, hasPermission,
}: BiayaRetribusiFormModalProps) {
  return (
    <Modal open={openModal} onClose={onClose} title={editingId ? 'Edit Biaya Retribusi' : 'Buat Biaya Retribusi'} subtitle={`Langkah ${formStep} dari 4: ${WIZARD_LABELS[formStep - 1]}`} size="2xl" footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {formStep === 2 && step2Blockers.length > 0 && !busy && (
              <p className="text-xs font-semibold text-amber-600 sm:mr-auto">Lengkapi dulu: {step2Blockers.slice(0, 2).join(' · ')}{step2Blockers.length > 2 ? ` (+${step2Blockers.length - 2})` : ''}</p>
            )}
            {formStep === 3 && step3Blockers.length > 0 && !busy && (
              <p className="text-xs font-semibold text-amber-600 sm:mr-auto">Periksa lampiran: {step3Blockers.slice(0, 2).join(' · ')}</p>
            )}
            {formStep === 4 && submitBlockers.length > 0 && !busy && (
              <p className="text-xs font-semibold text-amber-600 sm:mr-auto">Belum bisa dikirim: {submitBlockers.slice(0, 2).join(' · ')}{submitBlockers.length > 2 ? ` (+${submitBlockers.length - 2})` : ''}</p>
            )}
            <button type="button" onClick={onClose} className="btn-secondary w-full sm:w-auto">Batal</button>
            {editingId && sourceType === 'receiving' && isKoliMode && hasPermission('biaya_retribusi.edit') && (
              <button type="button" onClick={onRefresh} disabled={busy} title="Ambil ulang qty zak/crt & nominal dari penerimaan terkait" aria-label="Refresh dari penerimaan" className="btn-secondary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed">
                Refresh dari penerimaan
              </button>
            )}
            {formStep > minStep && (
              <button type="button" onClick={goBack} disabled={busy} className="btn-secondary w-full sm:w-auto">‹ Kembali</button>
            )}
            {formStep < 4 && (
              <button type="button" onClick={goNext} disabled={busy} className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
                {formStep === 3 ? 'Review ›' : 'Lanjut ›'}
              </button>
            )}
            {formStep === 4 && (
              <>
                <button type="button" onClick={previewRetribusi} disabled={busy} className="btn-secondary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  Preview PDF
                </button>
                {!editingId ? (
                  <>
                    <button type="button" onClick={handleCreate} disabled={busy} title="Hanya menyimpan — belum masuk antrean pemeriksaan" className="btn-secondary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-600" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                      {busy ? 'Menyimpan...' : 'Simpan Draft'}
                    </button>
                    <button type="button" onClick={handleCreateAndSubmit} disabled={busy} title="Simpan dan langsung kirim ke antrean pemeriksaan" className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>}
                      {busy ? 'Mengirim...' : 'Simpan & Kirim'}
                    </button>
                  </>
                ) : editingStatus === 'revisi' ? (
                  <>
                    <button type="button" onClick={handleUpdate} disabled={busy} title="Hanya menyimpan perbaikan" className="btn-secondary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-600" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
                      {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                    <button type="button" onClick={handleUpdateAndSubmit} disabled={busy} title="Simpan perbaikan lalu kirim kembali ke approver yang meminta revisi" className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>}
                      {busy ? 'Mengirim...' : 'Simpan Perubahan & Kirim Ulang'}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={handleUpdate} disabled={busy} className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
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
            <div className="sticky top-0 z-10 lg:hidden rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
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
            <div className="sticky top-0 z-10 hidden rounded-2xl border border-border bg-card p-4 shadow-sm lg:block">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Alur pengajuan</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground">Langkah {formStep} dari 4</p>
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
              <div className="w-10 h-10 rounded-xl bg-card shadow-sm ring-1 ring-chip-primary-border flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-accent-text uppercase tracking-wider">Depo Pengajuan</p>
                <p className="text-sm font-bold text-foreground truncate">{targetDepoLabel}</p>
                {(isCandidateDepoUniform || isDepoInherited) && <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-text"><span className="h-1 w-1 rounded-full bg-primary-500" />Mengikuti depo receiving</p>}
              </div>
            </div>

            {/* Tanggal */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-bold text-foreground mb-2" htmlFor="tanggal-pengajuan">
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                Tanggal Pengajuan <span className="text-red-500">*</span>
              </label>
              <input id="tanggal-pengajuan" type="date" value={formData.tanggal_pengajuan} onChange={(e) => setFormData({ ...formData, tanggal_pengajuan: e.target.value })} className="input-field py-3 text-sm" />
            </div>
            </div>
            )}

            {!editingId && formStep === 1 && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-sm font-bold text-foreground">Pilih tipe pengajuan dulu <span className="text-red-400">*</span></p>
                <p className="mt-1 text-[11px] text-slate-400">Dua cara isi biaya — pilih yang sesuai, form berikutnya menyesuaikan otomatis.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button type="button" aria-pressed={sourceType === 'receiving'} onClick={() => switchSourceType('receiving')} className={`rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md active:scale-[0.99] ${sourceType === 'receiving' ? 'border-primary-600 bg-chip-primary shadow-md' : 'border-chip-primary-border bg-chip-primary/50 hover:border-primary-400'}`}>
                    <span className="mt-2 block text-sm font-black text-foreground">Otomatis dari Receiving</span>
                    <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Qty zak/crt & tanggal terisi sendiri dari receiving COMPLETED. Nominal mengikuti tarif koli depo.</span>
                  </button>
                  <button type="button" aria-pressed={sourceType === 'manual'} onClick={() => switchSourceType('manual')} className={`rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md active:scale-[0.99] ${sourceType === 'manual' ? 'border-slate-700 bg-popover shadow-md' : 'border-border bg-card hover:border-slate-400'}`}>
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-foreground">MANUAL</span>
                    <span className="mt-2 block text-sm font-black text-foreground">Borongan / Manual</span>
                    <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Ketik nopol, qty, dan nominal sendiri. Cocok untuk biaya satuan borongan.</span>
                  </button>
                </div>
              </div>
            )}

            {/* Ringkasan tipe & panel tarif hanya untuk koli/otomatis receiving.
                    Borongan/Manual tidak menampilkan kartu ini — nominal diisi manual. */}
            {!editingId && sourceType === 'receiving' && formStep === 2 && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">Otomatis dari Receiving</p>
                  <button type="button" onClick={() => switchSourceType(null)} className="shrink-0 text-[11px] font-bold text-accent-text hover:text-accent-text hover:underline">‹ Ganti tipe</button>
                </div>
                {isKoliMode && (
                <div className="mt-3 rounded-xl bg-popover border border-border px-3 py-2.5">
                  <button type="button" onClick={() => setTariffOpen((v) => !v)} aria-expanded={tariffOpen} className="flex w-full flex-wrap items-center gap-2 text-left">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tarif berlaku</span>
                    <span className="text-xs font-bold text-foreground">{targetDepoLabel}</span>
                    {isKoliMode ? (
                      <span className="text-xs font-semibold text-accent-text">1 zak Rp {Number(biayaConfig.retribusi_rate_zak).toLocaleString('id-ID')} · 1 crt Rp {Number(biayaConfig.retribusi_rate_crt).toLocaleString('id-ID')}</span>
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">Borongan — nominal diisi manual</span>
                    )}
                    <svg className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${tariffOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  {tariffOpen && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="text-[11px] text-muted-foreground">
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
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Rp/zak
                            <input type="number" min={0} value={rateDraft.rate_zak || ''} disabled={rateDraft.mode !== 'koli'} onChange={(e) => setRateDraft((p) => ({ ...p, rate_zak: Number(e.target.value) }))} placeholder="0" className="input-field w-24 py-1.5 text-right text-xs disabled:bg-slate-100" aria-label="Tarif per zak" />
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Rp/crt
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
                  <span className="flex items-center gap-2 text-sm font-bold text-foreground">
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
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-foreground">Mode Borongan: nominal manual</span>
                  )}
                </div>
                <button onClick={() => fetchCandidates()} disabled={busy} className={`w-full mb-3 rounded-xl py-2.5 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 ${candidates.length > 0 ? 'bg-slate-100 text-foreground hover:bg-slate-200' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                  {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>}
                  {busy ? 'Mencari...' : candidates.length > 0 ? 'Muat ulang receiving' : 'Muat Receiving Selesai'}
                </button>
                <p className="mb-3 text-[11px] text-slate-400">Hanya receiving COMPLETED yang sudah divalidasi checker dan belum diklaim. Qty zak/crt dan tanggal pengajuan terisi otomatis dari receiving — tanpa input ulang.</p>
                {duplicateSelectedPos.length > 0 && (
                  <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                    PO berikut dipilih lebih dari satu baris: {duplicateSelectedPos.join(', ')}. Tiap bongkaran tetap dihitung sebagai baris terpisah — pastikan qty tiap baris sesuai faktur truck masing-masing.
                  </p>
                )}
                {candidates.length === 0 && !busy && (
                  <div className="rounded-xl border-2 border-dashed border-border bg-overlay-60 p-6 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-gray-300">
                      <svg className="h-5 w-5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18" /></svg>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">Belum ada data receiving</p>
                    <p className="mt-1 text-[11px] text-slate-400">Klik “Muat receiving” untuk menampilkan yang siap diklaim</p>
                  </div>
                )}
                {candidates.length > 0 && (
                  <>
                  <div className="max-h-72 overflow-auto rounded-xl border border-border shadow-sm hidden sm:block">
                    <table className="min-w-170 w-full text-xs">
                      <thead className="sticky top-0 bg-popover">
                        <tr>
                          <th className="table-header text-center w-10">
                            <input type="checkbox" checked={selectedCandidates.length === candidates.length} onChange={() => setSelectedCandidates(selectedCandidates.length === candidates.length ? [] : candidates.map(c => c.id))} className="rounded border-border text-accent-text w-4 h-4" />
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
                            <td className="table-cell text-center"><input type="checkbox" checked={selectedCandidates.includes(c.id)} onChange={() => toggleCandidate(c.id)} className="rounded border-border text-accent-text w-4 h-4" onClick={(e) => e.stopPropagation()} /></td>
                            <td className="table-cell whitespace-nowrap">{formatDate(c.tanggal_selesai)}</td>
                            <td className="table-cell font-mono font-medium">{upper(c.nopol_kendaraan)}</td>
                            <td className="table-cell">{upper(c.type_kendaraan)}</td>
                            <td className="table-cell font-mono text-muted-foreground">{c.po_transporter}</td>
                            <td className="table-cell">{c.driver_name}</td>
                            <td className="table-cell text-muted-foreground">{c.checker_name}</td>
                            <td className="table-cell text-right tabular-nums" title="Otomatis dari receiving">{Number(c.qty_zak || 0).toLocaleString('id-ID')} <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-400">AUTO</span></td>
                            <td className="table-cell text-right tabular-nums" title="Otomatis dari receiving">{Number(c.qty_crt || 0).toLocaleString('id-ID')} <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-400">AUTO</span></td>
                            <td className="table-cell text-right" onClick={(e) => e.stopPropagation()}>
                              {isKoliMode ? (
                                <span className="text-xs font-bold text-foreground tabular-nums" title={`${Number(c.qty_zak || 0).toLocaleString('id-ID')} zak × Rp ${Number(biayaConfig.retribusi_rate_zak).toLocaleString('id-ID')} + ${Number(c.qty_crt || 0).toLocaleString('id-ID')} crt × Rp ${Number(biayaConfig.retribusi_rate_crt).toLocaleString('id-ID')}`}>{formatCurrency(candidateNominal(c.id))}</span>
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
                        <div key={c.id} onClick={() => toggleCandidate(c.id)} className={`rounded-xl border p-3 transition-colors ${checked ? 'border-primary-300 bg-chip-primary/50' : 'border-border bg-card'}`}>
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={checked} onChange={() => toggleCandidate(c.id)} onClick={(e) => e.stopPropagation()} className="rounded border-border text-accent-text w-4 h-4 shrink-0" aria-label={`Pilih ${c.nopol_kendaraan}`} />
                            <p className="font-mono font-bold text-sm text-foreground">{upper(c.nopol_kendaraan)}</p>
                            <span className="ml-auto text-[11px] text-muted-foreground">{formatDate(c.tanggal_selesai)}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{upper(c.type_kendaraan)} · {c.po_transporter} · {c.driver_name}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">Otomatis: {Number(c.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(c.qty_crt || 0).toLocaleString('id-ID')} crt</p>
                          <div onClick={(e) => e.stopPropagation()}>
                            {isKoliMode ? (
                              <p className="mt-2 text-sm font-black text-foreground tabular-nums">{formatCurrency(candidateNominal(c.id))}</p>
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
                <label className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  </span>
                  Baris Tersimpan
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{formData.details.length} baris</span>
                </label>
              </div>
              <div className="space-y-2">
                {formData.details.map((d, i) => (
                  <details key={i} open className="group relative rounded-lg border border-border bg-card">
                    <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-popover rounded-lg transition-colors list-none">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center text-[10px] font-bold text-emerald-700 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-foreground block truncate">{d.nopol_kendaraan || `Tersimpan #${i + 1}`}</span>
                        <span className="text-[11px] text-gray-400">{d.type_kendaraan || 'Pilih type'} · {formatCurrency(Number(existingNominal(d)) || 0)}</span>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </summary>
                    <button type="button" onClick={() => removeExistingDetail(i)} className="absolute right-10 top-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus baris tersimpan ${i + 1}`}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="px-3 pb-3 pt-1 border-t border-border">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`existing-row-${i}-nopol_kendaraan`}>
                            Plat Kendaraan <span className="text-red-400">*</span>
                          </label>
                          <input type="text" value={d.nopol_kendaraan} onChange={(e) => updateExistingDetail(i, 'nopol_kendaraan', e.target.value.toUpperCase())} placeholder="KB 1234 XX" id={`existing-row-${i}-nopol_kendaraan`} className="input-field py-2 text-sm font-mono uppercase" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`existing-row-${i}-type_kendaraan`}>
                            Type Kendaraan <span className="text-red-400">*</span>
                          </label>
                          <select value={d.type_kendaraan} onChange={(e) => updateExistingDetail(i, 'type_kendaraan', e.target.value)} id={`existing-row-${i}-type_kendaraan`} className="select-field py-2 text-sm">
                            <option value="">Pilih</option>
                            {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`existing-row-${i}-no_surat_jalan`}>
                            No. SJ
                          </label>
                          <input type="text" value={d.no_surat_jalan} onChange={(e) => updateExistingDetail(i, 'no_surat_jalan', e.target.value)} placeholder="Nomor SJ" id={`existing-row-${i}-no_surat_jalan`} className="input-field py-2 text-sm font-mono" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`existing-row-${i}-qty_zak`}>
                            Qty Zak
                          </label>
                          <input type="number" min="0" value={d.qty_zak || ''} onChange={(e) => updateExistingDetail(i, 'qty_zak', Number(e.target.value))} placeholder="0" id={`existing-row-${i}-qty_zak`} className="input-field py-2 text-sm text-right" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`existing-row-${i}-qty_crt`}>
                            Qty Crt
                          </label>
                          <input type="number" min="0" value={d.qty_crt || ''} onChange={(e) => updateExistingDetail(i, 'qty_crt', Number(e.target.value))} placeholder="0" id={`existing-row-${i}-qty_crt`} className="input-field py-2 text-sm text-right" />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`existing-row-${i}-nominal_biaya`}>
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
                <label className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-foreground">
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
                <div className="rounded-xl border-2 border-dashed border-chip-primary-border bg-card p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="plat-kendaraan">
                        Plat Kendaraan <span className="text-red-400">*</span>
                      </label>
                      <input id="plat-kendaraan" type="text" onChange={(e) => startManualRow('nopol_kendaraan', e.target.value.toUpperCase())} placeholder="KB 1234 XX" className="input-field py-2 text-sm font-mono uppercase" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="type-kendaraan">
                        Type Kendaraan <span className="text-red-400">*</span>
                      </label>
                      <select id="type-kendaraan" defaultValue="" onChange={(e) => startManualRow('type_kendaraan', e.target.value)} className="select-field py-2 text-sm">
                        <option value="">Pilih</option>
                        {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="no-sj">
                        No. SJ
                      </label>
                      <input id="no-sj" type="text" onChange={(e) => startManualRow('no_surat_jalan', e.target.value)} placeholder="Nomor SJ" className="input-field py-2 text-sm font-mono" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="qty-zak">
                        Qty Zak
                      </label>
                      <input id="qty-zak" type="number" min="0" onChange={(e) => startManualRow('qty_zak', Number(e.target.value))} placeholder="0" className="input-field py-2 text-sm text-right" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="qty-crt">
                        Qty Crt
                      </label>
                      <input id="qty-crt" type="number" min="0" onChange={(e) => startManualRow('qty_crt', Number(e.target.value))} placeholder="0" className="input-field py-2 text-sm text-right" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="nominal-rp">
                        Nominal (Rp) <span className="text-red-400">*</span>
                      </label>
                      <input id="nominal-rp" type="number" min="0" onChange={(e) => startManualRow('nominal_biaya', Number(e.target.value))} placeholder="0" className="input-field py-2 text-sm font-bold" />
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
                    <details key={i} open className="group relative rounded-lg border border-border bg-card">
                      <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-popover rounded-lg transition-colors list-none">
                        <div className="w-6 h-6 rounded-md bg-chip-primary border border-chip-primary-border flex items-center justify-center text-[10px] font-bold text-accent-text shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-foreground block truncate">{upper(md.nopol_kendaraan) || `Manual #${i + 1}`}</span>
                          <span className="text-[11px] text-gray-400">{md.type_kendaraan || 'Pilih type'} · {formatCurrency(Number(md.nominal_biaya) || 0)}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </summary>
                      <button type="button" onClick={() => removeManualDetail(i)} className="absolute right-10 top-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus baris manual ${i + 1}`}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>

                      <div className="px-3 pb-3 pt-1 border-t border-border">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`manual-row-${i}-nopol_kendaraan`}>
                              Plat Kendaraan <span className="text-red-400">*</span>
                            </label>
                            <input type="text" value={md.nopol_kendaraan} onChange={(e) => updateManualDetail(i, 'nopol_kendaraan', e.target.value.toUpperCase())} placeholder="KB 1234 XX" id={`manual-row-${i}-nopol_kendaraan`} className="input-field py-2 text-sm font-mono uppercase" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`manual-row-${i}-type_kendaraan`}>
                              Type Kendaraan <span className="text-red-400">*</span>
                            </label>
                            <select value={md.type_kendaraan} onChange={(e) => updateManualDetail(i, 'type_kendaraan', e.target.value)} id={`manual-row-${i}-type_kendaraan`} className="select-field py-2 text-sm">
                              <option value="">Pilih</option>
                              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`manual-row-${i}-no_surat_jalan`}>
                              No. SJ
                            </label>
                            <input type="text" value={md.no_surat_jalan} onChange={(e) => updateManualDetail(i, 'no_surat_jalan', e.target.value)} placeholder="Nomor SJ" id={`manual-row-${i}-no_surat_jalan`} className="input-field py-2 text-sm font-mono" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`manual-row-${i}-qty_zak`}>
                              Qty Zak
                            </label>
                            <input type="number" min="0" value={md.qty_zak || ''} onChange={(e) => updateManualDetail(i, 'qty_zak', Number(e.target.value))} placeholder="0" id={`manual-row-${i}-qty_zak`} className="input-field py-2 text-sm text-right" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`manual-row-${i}-qty_crt`}>
                              Qty Crt
                            </label>
                            <input type="number" min="0" value={md.qty_crt || ''} onChange={(e) => updateManualDetail(i, 'qty_crt', Number(e.target.value))} placeholder="0" id={`manual-row-${i}-qty_crt`} className="input-field py-2 text-sm text-right" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`manual-row-${i}-nominal_biaya`}>
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
                <label className="flex items-center gap-2 text-sm font-bold text-foreground">
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
                <div className="rounded-xl border-2 border-dashed border-chip-primary-border bg-card p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="tipe-dokumen">
                        Tipe Dokumen <span className="text-red-400">*</span>
                      </label>
                      <select id="tipe-dokumen" defaultValue="" onChange={(e) => { const t = e.target.value; if (t) startDocument('document_type', t); }} className="select-field py-2 text-sm">
                        <option value="">Pilih</option>
                        {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="doc-file-start">
                        File <span className="text-red-400">*</span>
                      </label>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" id="doc-file-start" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) startDocument('file', file);
                        e.target.value = '';
                      }} />
                      <label htmlFor="doc-file-start" className="flex items-center gap-2 rounded-xl border-2 border-dashed border-border bg-popover px-4 py-3 text-sm text-foreground hover:border-primary-400 hover:bg-chip-primary/50 cursor-pointer transition-colors">
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
                    <details key={i} open className={`group relative rounded-lg border bg-card ${!doc.file && !doc.file_path ? 'border-amber-300 ring-1 ring-amber-200' : 'border-border'}`}>
                      <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-popover rounded-lg transition-colors list-none">
                        <div className={`w-6 h-6 rounded-md border flex items-center justify-center text-[10px] font-bold shrink-0 ${!doc.file && !doc.file_path ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-600'}`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-bold block truncate ${!doc.file && !doc.file_path ? 'text-amber-800' : 'text-foreground'}`}>
                            {doc.file_name || `Dokumen #${i + 1} (Belum ada file dipilih)`}
                          </span>
                          <span className="text-[11px] text-gray-400">{DOCUMENT_TYPES.find(dt => dt.value === doc.document_type)?.label || 'Pilih tipe'}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </summary>
                      <button type="button" onClick={() => removeDocument(i)} className="absolute right-10 top-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus dokumen ${i + 1}`}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>

                      <div className="px-3 pb-3 pt-1 border-t border-border">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`tipe-dokumen-${i}`}>
                              Tipe Dokumen <span className="text-red-400">*</span>
                            </label>
                            <select id={`tipe-dokumen-${i}`} value={doc.document_type} onChange={(e) => updateDocument(i, 'document_type', e.target.value)} className="select-field py-2 text-sm">
                              {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor={`doc-file-${i}`}>
                              File <span className="text-red-400">*</span>
                            </label>
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" id={`doc-file-${i}`} onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleDocFile(i, file);
                              e.target.value = '';
                            }} />
                            <label htmlFor={`doc-file-${i}`} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-border bg-popover px-4 py-3 text-sm text-foreground hover:border-primary-400 hover:bg-chip-primary/50 cursor-pointer transition-colors">
                              <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.939A4 4 0 1118.8 7.372l-10.94 10.938a2.5 2.5 0 01-3.536-3.536l10.94-10.938a1 1 0 011.414 1.414l-10.94 10.938a.5.5 0 01-.707-.707l7.693-7.693a1 1 0 011.414 1.414z" /></svg>
                              <span className="min-w-0 flex-1 truncate">{doc.file_name || 'Pilih file (PDF, JPG, PNG, WEBP — maks 20 MB)'}</span>
                              {doc.file && <span className="shrink-0 text-[11px] font-bold text-muted-foreground tabular-nums">{formatBytes(doc.file.size)}</span>}
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
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-sm font-bold text-foreground">Periksa kembali sebelum dikirim</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Depo</dt>
                    <dd className="font-bold text-foreground">{targetDepoLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Tanggal</dt>
                    <dd className="font-bold text-foreground">{formatDate(formData.tanggal_pengajuan)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Mode hitung</dt>
                    <dd className="font-bold text-foreground">{isKoliSession ? `Koli (zak Rp ${Number(biayaConfig.retribusi_rate_zak).toLocaleString('id-ID')} · crt Rp ${Number(biayaConfig.retribusi_rate_crt).toLocaleString('id-ID')})` : 'Borongan (manual)'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Dokumen</dt>
                    <dd className="font-bold text-foreground">{formData.documents.length} lampiran</dd>
                  </div>
                </dl>
                <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-border">
                  {selectedCandidates.map((id) => {
                    const c = candidates.find((c2) => c2.id === id);
                    if (!c) return null;
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-foreground">{upper(c.nopol_kendaraan)}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">{Number(c.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(c.qty_crt || 0).toLocaleString('id-ID')} crt · {c.po_transporter}</p>
                        </div>
                        <p className="shrink-0 font-bold tabular-nums text-foreground">{formatCurrency(candidateNominal(id))}</p>
                      </div>
                    );
                  })}
                  {formData.details.map((d, i) => (
                    <div key={`e-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-foreground">{upper(d.nopol_kendaraan)}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{Number(d.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(d.qty_crt || 0).toLocaleString('id-ID')} crt</p>
                      </div>
                      <p className="shrink-0 font-bold tabular-nums text-foreground">{formatCurrency(existingNominal(d))}</p>
                    </div>
                  ))}
                  {manualDetails.map((md, i) => (
                    <div key={`m-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-foreground">{upper(md.nopol_kendaraan) || `Manual #${i + 1}`}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{Number(md.qty_zak || 0).toLocaleString('id-ID')} zak · {Number(md.qty_crt || 0).toLocaleString('id-ID')} crt</p>
                      </div>
                      <p className="shrink-0 font-bold tabular-nums text-foreground">{formatCurrency(manualNominal(md))}</p>
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
                    <p className="text-xl font-black text-foreground tabular-nums">{formatCurrency(totalNominal)}</p>
                    <p className="text-[11px] text-gray-400">{selectedRowCount} baris dipilih{blockerReasons.length > 0 && !busy ? ` · ${blockerReasons[0]}` : ''}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ${isKoliSession ? 'bg-chip-primary text-accent-text' : 'bg-slate-100 text-foreground'}`}>
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
  );
}
