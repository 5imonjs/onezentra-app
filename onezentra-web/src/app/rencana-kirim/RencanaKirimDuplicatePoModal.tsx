'use client';

import Modal from '@/components/Modal';
import type { RencanaKirim } from './RencanaKirimCreateModal';

interface RencanaKirimDuplicatePoModalProps {
  show: boolean;
  onClose: () => void;
  existing: RencanaKirim | null;
  onViewExisting: () => void;
}

const statusLabel: Record<string, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Dijadwalkan',
  CHECKED_IN: 'Check In',
  VERIFIED: 'Terverifikasi',
  IN_PROGRESS: 'Diproses',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

/** Popup konfirmasi saat PO yang diketik sudah dipakai rencana kirim lain. */
export default function RencanaKirimDuplicatePoModal({
  show, onClose, existing, onViewExisting,
}: RencanaKirimDuplicatePoModalProps) {
  if (!existing) {
    return null;
  }

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const creator = existing.creator?.full_name?.trim()
    || existing.creator?.email
    || 'Tidak tercatat';

  return (
    <Modal
      open={show}
      onClose={onClose}
      title="PO Transporter sudah terdaftar"
      subtitle="Nomor ini sudah dipakai rencana kirim lain di depo yang sama."
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Kembali ke Form</button>
          <button type="button" onClick={onViewExisting} className="btn-primary">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Lihat Dokumen Lama
            </span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <svg className="w-6 h-6 shrink-0 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.947 3.374h-14.71c-1.73 0-2.813-1.874-1.948-3.374L13.95 3.378c.866-1.5 3.032-1.5 3.899 0l8.454 12.373M12 15.75h.007v.008H12v-.008z" /></svg>
          <div className="text-xs text-foreground">
            <strong>Rencana tidak disimpan.</strong> Satu PO transporter hanya boleh ada satu rencana kirim per depo. Periksa dokumen yang sudah ada, lalu gunakan PO lain atau edit dokumen tersebut.
          </div>
        </div>

        <div className="rounded-xl border border-border bg-popover/40 p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dokumen yang sudah ada</p>
          <p className="mb-3 font-mono text-lg font-black text-foreground">{existing.po_transporter || '-'}</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Driver</span><span className="font-semibold text-foreground">{existing.driver_name || '-'}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Nopol</span><span className="font-mono font-semibold text-foreground">{existing.nopol || '-'}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">RKH</span><span className="font-semibold text-foreground">{formatDate(existing.rkh_date)}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Rencana tiba</span><span className="font-semibold text-info">{formatDate(existing.eta_date)}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Status</span><span className="font-semibold text-foreground">{statusLabel[existing.status] || existing.status || '-'}</span></div>
            <div className="flex items-baseline gap-2"><span className="w-24 shrink-0 text-muted-foreground">Depo</span><span className="font-semibold text-foreground">{existing.nama_depo || existing.kode_depo || '-'}</span></div>
            <div className="flex items-baseline gap-2 sm:col-span-2"><span className="w-24 shrink-0 text-muted-foreground">Dibuat oleh</span><span className="font-semibold text-foreground">{creator}</span></div>
            <div className="flex items-baseline gap-2 sm:col-span-2"><span className="w-24 shrink-0 text-muted-foreground">Waktu dibuat</span><span className="font-mono text-foreground">{existing.created_at ? new Date(existing.created_at).toLocaleString('id-ID') : '-'}</span></div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
