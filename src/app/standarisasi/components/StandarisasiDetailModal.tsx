'use client';

import type { ReactNode } from 'react';
import Modal from '@/components/Modal';
import StatusBadge from './StatusBadge';
import { StandarisasiItem, productLabel } from '../types';

interface StandarisasiDetailModalProps {
  item: StandarisasiItem | null;
  onClose: () => void;
}

function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="text-sm text-slate-800 mt-1 font-medium break-words">{children}</div>
    </div>
  );
}

function MetricBox({ label, value, tone }: { label: string; value: ReactNode; tone: 'primary' | 'amber' | 'emerald' }) {
  const tones = {
    primary: { box: 'bg-primary-50 border-primary-100', label: 'text-primary-500', value: 'text-primary-700' },
    amber: { box: 'bg-amber-50 border-amber-100', label: 'text-amber-500', value: 'text-amber-700' },
    emerald: { box: 'bg-emerald-50 border-emerald-100', label: 'text-emerald-500', value: 'text-emerald-700' },
  }[tone];

  return (
    <div className={`rounded-xl p-4 border text-center ${tones.box}`}>
      <span className={`text-[11px] font-semibold uppercase tracking-wider ${tones.label}`}>{label}</span>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${tones.value}`}>{value}</p>
    </div>
  );
}

export default function StandarisasiDetailModal({ item, onClose }: StandarisasiDetailModalProps) {
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="Detail Standarisasi"
      subtitle="Informasi lengkap standarisasi tumpukan"
      size="lg"
      footer={<button type="button" onClick={onClose} className="btn-secondary">Tutup</button>}
    >
      {item && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoField label="BOS ID">{item.npn?.BOSnetszProductId || '-'}</InfoField>
            <InfoField label="SAP ID">{item.npn?.SAPszProductId || '-'}</InfoField>
            <InfoField label="Produk">{productLabel(item.npn)}</InfoField>
            <InfoField label="Barcode">
              <span className="font-mono">{item.npn?.szBarcode || '-'}</span>
            </InfoField>
            <InfoField label="Kode Depo">{item.kode_depo || '-'}</InfoField>
            <InfoField label="Nama Depo">{item.nama_depo || '-'}</InfoField>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Perhitungan Tumpukan</h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricBox label="Tier" value={item.tier ?? '-'} tone="primary" />
              <MetricBox label="Tinggi" value={item.tinggi_tumpukan ?? '-'} tone="amber" />
              <MetricBox label="Total" value={item.total_tier_tinggi ?? '-'} tone="emerald" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Status & Approval</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoField label="Status"><StatusBadge status={item.status} /></InfoField>
              <InfoField label="Requested By">{item.requested_by_email || '-'}</InfoField>
              <InfoField label="Approved By">{item.approved_by_email || '-'}</InfoField>
              <InfoField label="Tanggal Dibuat">
                {item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
              </InfoField>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
