'use client';

import type { Dispatch, SetStateAction } from 'react';
import Modal from '@/components/Modal';
import type { RencanaKirim, RencanaKirimItem } from './RencanaKirimCreateModal';

interface RencanaKirimSavePreviewModalProps {
  showSavePreview: boolean;
  setShowSavePreview: Dispatch<SetStateAction<boolean>>;
  createForm: Partial<RencanaKirim>;
  createItems: RencanaKirimItem[];
  handleCreate: () => void;
  saving: boolean;
}

export default function RencanaKirimSavePreviewModal({
  showSavePreview, setShowSavePreview, createForm, createItems, handleCreate, saving,
}: RencanaKirimSavePreviewModalProps) {
  return (
      <Modal open={showSavePreview} onClose={() => setShowSavePreview(false)} title="Periksa ulang sebelum simpan" subtitle="Satu salah ketik = selisih di penerimaan & opname. Pastikan barang di bawah BENAR sebelum dikirim." size="lg"
        footer={
          <>
            <button type="button" onClick={() => setShowSavePreview(false)} className="btn-secondary">Kembali & Cek Dulu</button>
            <button type="button" onClick={() => { setShowSavePreview(false); handleCreate(); }} className="btn-primary shadow-lg shadow-primary-600/20" disabled={saving}>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Ya, Barang Sudah Benar
              </span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
            <svg className="w-6 h-6 shrink-0 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.947 3.374h-14.71c-1.73 0-2.813-1.874-1.948-3.374L13.95 3.378c.866-1.5 3.032-1.5 3.899 0l8.454 12.373M12 15.75h.007v.008H12v-.008z" /></svg>
            <div className="text-xs text-foreground">
              <strong>Berhenti sebentar.</strong> Rencana kirim yang sudah di-check-in di bongkar/penerimaan langsung jadi acuan scan. Kesalahan kode, jumlah, atau satuan akan menjadi selisih di seluruh alur — perbaiki sebelum simpan, bukan setelah.
            </div>
          </div>

          {/* Ringkasan dokumen */}
          <div className="rounded-xl border border-border bg-popover/40 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dokumen & Kendaraan</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">PO Transporter</span><span className="font-mono font-bold text-foreground">{createForm.po_transporter || '-'}</span></div>
              <div className="flex items-baseline gap-2"><span className="w-40 shrink-0 text-muted-foreground">Tanggal Rencana Kirim</span><span className="font-semibold text-foreground">{createForm.rkh_date ? new Date(createForm.rkh_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</span></div>
              <div className="flex items-baseline gap-2"><span className="w-40 shrink-0 text-muted-foreground">Rencana Tiba di Depo</span><span className="font-semibold text-info">{createForm.eta_date ? new Date(createForm.eta_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</span></div>
              <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Kendaraan</span><span className="font-semibold text-foreground">{createForm.driver_name || '-'}{createForm.nopol ? ` • ${createForm.nopol}` : ''}</span></div>
              <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Ekspedisi</span><span className="font-semibold text-foreground">{createForm.expedisi || '-'}{createForm.jenis_kendaraan ? ` • ${createForm.jenis_kendaraan}` : ''}</span></div>
              <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Pengirim</span><span className="font-semibold text-foreground">{createForm.shipper_name || '-'}</span></div>
              <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Depo</span><span className="font-semibold text-foreground">{createForm.nama_depo || createForm.kode_depo || '-'}</span></div>
            </div>
          </div>

          {/* Daftar barang */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Barang yang akan dikirim</p>
              <p className="text-xs font-mono text-muted-foreground tabular-nums">{createItems.filter(i => i.kode_barang && Number(i.jumlah) > 0).length} baris · {createItems.reduce((acc, i) => acc + (i.kode_barang ? Number(i.jumlah) || 0 : 0), 0)} total CRT</p>
            </div>
            <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {createItems.filter(i => i.kode_barang && Number(i.jumlah) > 0).map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 hover:bg-overlay-50">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-snug text-foreground">{item.nama_barang || 'Tanpa nama'}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{item.kode_barang}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums text-foreground">{item.jumlah}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground">{item.satuan || 'CRT'}</p>
                  </div>
                </div>
              ))}
            </div>
            {createForm.notes?.trim() && (
              <p className="mt-2 text-[11px] text-muted-foreground"><strong>Catatan:</strong> {createForm.notes}</p>
            )}
          </div>
        </div>
      </Modal>
  );
}
