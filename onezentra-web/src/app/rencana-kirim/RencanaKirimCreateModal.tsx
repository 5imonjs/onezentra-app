'use client';

import type { ComponentType, Dispatch, SetStateAction } from 'react';
import Modal from '@/components/Modal';
import { notifyGlobal } from '@/store/globalToast';
import type { NpnProduct } from '@/components/NpnSearchInput';

export interface DepoOption {
  kode_depo: string;
  nama_depo: string;
}

export interface RencanaKirimItem {
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

export interface RencanaKirim {
  id: number;
  rkh_date: string;
  eta_date: string;
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
  items_tanpa_npn?: number;
  status: string;
  notes: string;
  scheduled_at: string;
  checked_in_at: string;
  verified_at: string;
  completed_at: string;
  items: RencanaKirimItem[];
  created_at: string;
}

interface RencanaKirimCreateModalProps {
  showCreate: boolean;
  requestCloseCreate: () => void;
  editingId: number | null;
  editingStatus: string;
  createForm: Partial<RencanaKirim>;
  setCreateForm: Dispatch<SetStateAction<Partial<RencanaKirim>>>;
  createItems: RencanaKirimItem[];
  setCurrentStep: Dispatch<SetStateAction<number>>;
  currentStep: number;
  depoList: DepoOption[];
  setShowBarangModal: Dispatch<SetStateAction<boolean>>;
  setShowImport: Dispatch<SetStateAction<boolean>>;
  setShowSavePreview: Dispatch<SetStateAction<boolean>>;
  clearNamaDepo: () => void;
  handleNamaDepoChange: (nama: string) => void;
  poDuplicate: boolean;
  duplicateCount: number;
  saving: boolean;
  typingItems: Set<number>;
  sectionComplete: { dokumen: boolean; kendaraan: boolean; pengirim: boolean; barang: boolean; catatan: boolean };
  completedCount: number;
  isMainFormValid: boolean;
  canSave: boolean;
  editLocked: boolean;
  itemCount: number;
  totalQty: number;
  totalKubikasiDisplay: number;
  itemKubikasi: (item: RencanaKirimItem) => number;
  jenisKendaraanOptions: string[];
  todayDateStr: () => string;
  hasPermission: (slug: string) => boolean;
  NamaDepoInput: ComponentType<{ value: string; depoList: DepoOption[]; onChange: (nama: string) => void; onClear: () => void; disabled?: boolean }>;
}

export default function RencanaKirimCreateModal({
  showCreate, requestCloseCreate, editingId, editingStatus, createForm, setCreateForm,
  createItems, setCurrentStep, currentStep, depoList, setShowBarangModal, setShowImport, setShowSavePreview,
  clearNamaDepo, handleNamaDepoChange, poDuplicate, duplicateCount, saving, typingItems, sectionComplete,
  completedCount, isMainFormValid, canSave, editLocked, itemCount, totalQty, totalKubikasiDisplay,
  itemKubikasi, jenisKendaraanOptions, todayDateStr, hasPermission, NamaDepoInput,
}: RencanaKirimCreateModalProps) {
  return (
      <Modal open={showCreate} onClose={requestCloseCreate} onCloseRequest={requestCloseCreate} title={editingId ? 'Edit Replenishment' : 'Buat Replenishment'} subtitle={editingId ? 'Perbarui jadwal, kendaraan, dan daftar barang.' : 'Lengkapi data pengiriman — isi dari atas ke bawah.'} size="2xl"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              {typingItems.size > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning text-background px-3 py-1 font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" /> Lengkapi NPN dulu
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className={`w-2 h-2 rounded-full ${canSave ? 'bg-success' : 'bg-muted-foreground'}`} /> {canSave ? 'Siap simpan' : !isMainFormValid ? 'Lengkapi Dokumen, Kendaraan & Alamat' : 'Isi minimal 1 barang'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={requestCloseCreate} className="btn-secondary px-5">Batal</button>
              <button
                type="button"
                onClick={() => setShowSavePreview(true)}
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
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${editingStatus === 'CANCELLED' ? 'bg-destructive/10 border-destructive/30 text-destructive' : editingStatus === 'COMPLETED' ? 'bg-muted border-border text-foreground' : 'bg-warning/10 border-warning/30 text-foreground'}`}>
              {editingStatus === 'CANCELLED'
                ? 'Rencana kirim ini sudah dibatalkan. Perubahan tidak dapat disimpan.'
                : editingStatus === 'COMPLETED'
                  ? 'Rencana kirim ini sudah selesai. Perubahan tidak dapat disimpan.'
                  : 'Rencana kirim ini sudah diproses (Check In / Verifikasi / Dikerjakan). Perubahan tidak dapat disimpan.'}
            </div>
          )}
          {/* Modern Stepper */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm transition-all ${isActive ? 'bg-primary-600 text-white shadow-primary-600/25 scale-105' : isDone || isPast ? 'bg-success text-background' : 'bg-muted text-muted-foreground border border-border'}`}>
                        {isDone && !isActive ? '✓' : step.n}
                      </span>
                      <span className={`text-[11px] font-semibold ${isActive ? 'text-accent-text' : isDone ? 'text-success' : 'text-muted-foreground'}`}>{step.label}</span>
                    </button>
                    {idx < 4 && <div className={`h-0.5 flex-1 rounded-full transition-colors ${currentStep > step.n || isDone ? 'bg-success' : 'bg-border'}`} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Langkah {currentStep} dari 5</span>
              <span className={`font-semibold ${canSave ? 'text-success' : 'text-accent-text'}`}>{completedCount}/5 lengkap • {canSave ? 'Siap simpan' : 'Lengkapi dulu'}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-linear-to-r from-primary-500 to-success transition-all duration-500" style={{ width: `${(completedCount / 5) * 100}%` }} />
            </div>
          </div>

          {currentStep === 1 && (
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-chip-primary flex items-center justify-center text-accent-text text-xs font-bold">1</span> Informasi Dokumen</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-po-transporter" className="block text-xs font-medium text-muted-foreground mb-1">PO Transporter <span className="text-destructive">*</span></label>
                <input id="f-po-transporter" aria-invalid={poDuplicate || undefined} type="text" value={createForm.po_transporter ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, po_transporter: e.target.value }))} placeholder="cth: PO-2026-0001" className="input-field text-sm py-2 uppercase" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Nomor PO transporter (SJ/BA)</p>
                {poDuplicate && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-warning">PO Transporter ini sudah dipakai rencana kirim lain di depo yang sama.</p>
                )}
              </div>
              <div>
                <label htmlFor="f-rkh-date" className="block text-xs font-medium text-muted-foreground mb-1">Tanggal Rencana Kirim (RKH) <span className="text-destructive">*</span></label>
                <input id="f-rkh-date" type="date" min={editingId ? undefined : todayDateStr()} value={createForm.rkh_date ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, rkh_date: e.target.value }))} className="input-field text-sm py-2" />
                <p className="mt-1 text-[11px] text-muted-foreground">RKH = kapan barang direncanakan berangkat. Berbeda dengan &quot;Dibuat&quot; (waktu input dokumen).</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Tanggal pengiriman rencana</p>
              </div>
              <div>
                <label htmlFor="f-eta-date" className="block text-xs font-medium text-muted-foreground mb-1">Rencana Tiba di Depo <span className="text-destructive">*</span></label>
                <input id="f-eta-date" type="date" value={createForm.eta_date ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, eta_date: e.target.value }))} className="input-field text-sm py-2" />
                <p className="mt-1 text-[11px] text-info">Ditentukan planner saat membuat rencana. Rencana tiba = kapan barang diharapkan sampai di depo tujuan (berbeda dengan RKH = rencana berangkat).</p>
              </div>
            </div>
          </div>
          )}

          {currentStep === 2 && (
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-info/10 flex items-center justify-center text-info text-xs font-bold">2</span> Kendaraan & Driver</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-driver" className="block text-xs font-medium text-muted-foreground mb-1">Nama Driver <span className="text-destructive">*</span></label>
                <input id="f-driver" type="text" value={createForm.driver_name ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, driver_name: e.target.value }))} placeholder="cth: Budi Santoso" className="input-field text-sm py-2" />
              </div>
              <div>
                <label htmlFor="f-expedisi" className="block text-xs font-medium text-muted-foreground mb-1">Expedisi / Nama Kendaraan <span className="text-destructive">*</span></label>
                <input id="f-expedisi" type="text" value={createForm.expedisi ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, expedisi: e.target.value }))} placeholder="cth: CTP / Nama ekspedisi" className="input-field text-sm py-2" />
              </div>
              <div>
                <label htmlFor="f-nopol" className="block text-xs font-medium text-muted-foreground mb-1">Nopol <span className="text-destructive">*</span></label>
                <input id="f-nopol" type="text" value={createForm.nopol ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, nopol: e.target.value }))} placeholder="cth: DA 8323 BU" className="input-field text-sm py-2 uppercase" />
              </div>
              <div>
                <label htmlFor="f-jenis" className="block text-xs font-medium text-muted-foreground mb-1">Jenis Kendaraan <span className="text-destructive">*</span></label>
                <select id="f-jenis" value={createForm.jenis_kendaraan ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, jenis_kendaraan: e.target.value }))} className="select-field text-sm py-2">
                  <option value="">Pilih jenis kendaraan</option>
                  {jenisKendaraanOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
              </div>
            </div>
          </div>
          )}

          {currentStep === 3 && (
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center text-success text-xs font-bold">3</span> Alamat Pengiriman & Tujuan</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-3 rounded-xl bg-overlay-70 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Asal Pengirim</h4>
                <div>
                  <label htmlFor="f-shipper-name" className="block text-xs font-medium text-muted-foreground mb-1">Asal Pengirim <span className="text-destructive">*</span></label>
                  <input id="f-shipper-name" type="text" value={createForm.shipper_name ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, shipper_name: e.target.value }))} placeholder="cth: PT Sinar Abadi" className="input-field text-sm py-2" />
                </div>
                <div>
                  <label htmlFor="f-shipper-addr" className="block text-xs font-medium text-muted-foreground mb-1">Alamat Pengirim</label>
                  <textarea id="f-shipper-addr" value={createForm.shipper_address ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, shipper_address: e.target.value }))} placeholder="cth: Jl. Raya Singkawang No.1, Singkawang" rows={2} className="input-field resize-none text-sm py-2" />
                </div>
                <div>
                  <label htmlFor="f-shipper-phone" className="block text-xs font-medium text-muted-foreground mb-1">No. HP Pengirim</label>
                  <input id="f-shipper-phone" type="text" value={createForm.shipper_phone ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, shipper_phone: e.target.value }))} placeholder="cth: 08xx-xxxx-xxxx" className="input-field text-sm py-2" />
                </div>
              </div>
              <div className="space-y-3 rounded-xl bg-overlay-70 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Ditujukan</h4>
                <div>
                  <label htmlFor="f-nama-depo" className="block text-xs font-medium text-muted-foreground mb-1">Nama Depo <span className="text-destructive">*</span>{!!editingId && !hasPermission('depot.move') && (<span className="ml-1 font-normal normal-case text-muted-foreground">(terkunci — butuh izin Pindah Depo)</span>)}</label>
                  <NamaDepoInput value={createForm.nama_depo ?? ''} depoList={depoList} onChange={handleNamaDepoChange} onClear={clearNamaDepo} disabled={!!editingId && !hasPermission('depot.move')} />
                </div>
                <div>
                  <label htmlFor="f-kode-depo" className="block text-xs font-medium text-muted-foreground mb-1">Kode Depo</label>
                  <input id="f-kode-depo" type="text" value={createForm.kode_depo ?? ''} disabled className="input-field text-sm py-2 uppercase" placeholder="Otomatis terisi" />
                </div>
                <div>
                  <label htmlFor="f-dest-name" className="block text-xs font-medium text-muted-foreground mb-1">Ditujukan <span className="text-destructive">*</span></label>
                  <input id="f-dest-name" type="text" value={createForm.destination_name ?? createForm.nama_depo ?? ''} disabled placeholder="Otomatis dari Nama Depo" className="input-field cursor-not-allowed bg-muted text-sm py-2 text-foreground" />
                </div>
                <div>
                  <label htmlFor="f-dest-addr" className="block text-xs font-medium text-muted-foreground mb-1">Alamat Tujuan</label>
                  <textarea id="f-dest-addr" value={createForm.destination_address ?? ''} onChange={(e) => setCreateForm(prev => ({ ...prev, destination_address: e.target.value }))} placeholder="cth: Jl. Karang Intan No.1, Singkawang" rows={2} className="input-field resize-none text-sm py-2" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Terisi otomatis dari depo tujuan — boleh diubah manual</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Alamat lengkap tujuan (akan tampil di Detail & PDF di bawah Singkawang)</p>
                </div>
              </div>
            </div>
          </div>
          )}

          {currentStep === 4 && (
          <div className="animate-fade-in space-y-4">
            {/* Header card - lebih premium */}
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-warning flex items-center justify-center shadow shrink-0">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-foreground tracking-tight">Daftar Barang</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Kelola produk NPN • auto hitung umur & kubikasi</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border ${sectionComplete.barang ? 'bg-success text-background border-success shadow-sm' : 'bg-card text-foreground border-warning/30'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sectionComplete.barang ? 'bg-card' : 'bg-warning'}`} />{sectionComplete.barang ? `${itemCount} barang siap` : 'Belum ada barang'}
                      </span>
                      {sectionComplete.barang && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-foreground text-background px-2.5 py-1 text-xs font-bold">{totalQty} Qty</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-info text-background px-2.5 py-1 text-xs font-bold">{totalKubikasiDisplay.toFixed(2)} m³</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border shadow-sm ${sectionComplete.barang ? 'bg-success/10 text-success border-success/30' : 'bg-card text-muted-foreground border-border'}`}>
                  {sectionComplete.barang ? '✓ Lengkap' : '• Belum'}
                </span>
              </div>
            </div>

            {!isMainFormValid ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-warning flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-3 3h6M12 3v3m0 12.75h.008v.008H12v-.008z" /></svg></div>
                <div className="text-xs leading-relaxed text-foreground"><b>Lengkapi dulu</b> Informasi Dokumen, Kendaraan & Alamat — baru kelola barang. Progress {completedCount}/5.</div>
              </div>
            ) : itemCount === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border bg-overlay-50 p-8 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                </div>
                <h4 className="text-sm font-bold text-foreground">Belum ada barang</h4>
                <p className="text-xs text-muted-foreground mt-1">Tambah manual atau import Excel — minimal 1 barang dengan jumlah &gt;0</p>
                <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
                  <button onClick={() => setShowBarangModal(true)} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 shadow-lg">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Barang
                  </button>
                  {hasPermission('rencana_kirim.import') && (
                  <button onClick={() => { setShowBarangModal(true); setTimeout(()=>{ setShowImport(true); }, 150); }} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-foreground hover:bg-popover">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Import Excel
                  </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-popover border-b border-border">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Ringkasan barang</span>
                  <button onClick={() => setShowBarangModal(true)} className="text-xs font-semibold text-accent-text hover:text-accent-text flex items-center gap-1">
                    Kelola <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>
                <div className="divide-y divide-border max-h-52 overflow-auto">
                  {createItems.filter(i=>i.kode_barang).map((it, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5 hover:bg-popover">
                      <span className="w-6 h-6 rounded-lg bg-foreground text-background text-xs font-bold flex items-center justify-center shrink-0">{idx+1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{it.nama_barang}</p>
                        <p className="text-xs font-mono text-muted-foreground">{it.kode_barang} • {it.umur != null ? `${it.umur} bln` : '-'}</p>
                      </div>
                      <span className="text-sm font-bold text-foreground whitespace-nowrap">{it.jumlah} <span className="text-xs font-normal text-muted-foreground">{it.satuan}</span></span>
                      <span className="text-xs font-mono font-semibold text-info whitespace-nowrap">{itemKubikasi(it).toFixed(2)} m³</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-foreground text-background">
                  <span className="text-xs font-medium text-background/70">Total {itemCount} barang</span>
                  <span className="text-sm font-bold">{totalQty} Qty • {totalKubikasiDisplay.toFixed(2)} m³</span>
                </div>
              </div>
            )}

          </div>
          )}

          {currentStep === 5 && (
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm animate-fade-in">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-foreground text-xs font-bold">5</span> Catatan</h3>
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
                  if (currentStep === 1 && !sectionComplete.dokumen) { notifyGlobal('Lengkapi PO Transporter, Tanggal Rencana Kirim & Rencana Tiba di Depo dulu', 'error'); return; }
                  if (currentStep === 2 && !sectionComplete.kendaraan) { notifyGlobal('Lengkapi Nama Driver, Nopol, Expedisi & Jenis Kendaraan dulu', 'error'); return; }
                  if (currentStep === 3 && !sectionComplete.pengirim) { notifyGlobal('Lengkapi Asal Pengirim & Nama Depo dulu', 'error'); return; }
                  setCurrentStep(s => Math.min(5, s + 1));
                }}
                className="btn-primary text-sm"
              >
                Selanjutnya →
              </button>
            ) : currentStep === 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (!sectionComplete.barang) { notifyGlobal('Tambahkan minimal 1 barang dengan jumlah > 0 dulu', 'error'); return; }
                  setCurrentStep(5);
                }}
                className="btn-primary text-sm"
              >
                Selanjutnya →
              </button>
            ) : (
              <span className="text-xs text-success font-semibold">Simpan lewat tombol di bawah ✓</span>
            )}
          </div>
        </div>
      </Modal>
  );
}
