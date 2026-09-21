'use client';

import type { KeyboardEvent } from 'react';
import Modal from '@/components/Modal';
import NpnProductPicker from './NpnProductPicker';
import { NpnProduct, StandarisasiFormValues, MAX_DIMENSION, clampDimension } from '../types';

interface StandarisasiFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  values: StandarisasiFormValues;
  selectedProduct: NpnProduct | null;
  saving: boolean;
  /** Status baris sebelum diedit — dipakai untuk memperingatkan approval ulang. */
  originalStatus?: string;
  onChange: (values: StandarisasiFormValues) => void;
  onProductSelect: (product: NpnProduct) => void;
  onProductClear: () => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function StandarisasiFormModal({
  open,
  mode,
  values,
  selectedProduct,
  saving,
  originalStatus,
  onChange,
  onProductSelect,
  onProductClear,
  onClose,
  onSubmit,
}: StandarisasiFormModalProps) {
  const isEdit = mode === 'edit';
  const total = (values.tier || 0) * (values.tinggi_tumpukan || 0);
  const needsReapproval = isEdit && originalStatus === 'approved';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && values.npn_id && !saving) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Standarisasi' : 'Tambah Standarisasi'}
      subtitle={isEdit ? 'Perbarui data standarisasi tumpukan' : 'Buat standarisasi tumpukan baru'}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !values.npn_id}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-2">
              {saving ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Menyimpan...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Simpan
                </>
              )}
            </span>
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4" onKeyDown={handleKeyDown}>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Produk <span className="text-slate-400 font-normal">(ketik nama, BOS ID, atau barcode)</span>
            <span className="text-primary-500"> *</span>
          </label>
          <NpnProductPicker selected={selectedProduct} onSelect={onProductSelect} onClear={onProductClear} />
        </div>
        <div>
          <label htmlFor="standarisasi-tier" className="block text-xs font-medium text-slate-500 mb-1.5">
            Tier <span className="text-primary-500">*</span>
          </label>
          <input
            id="standarisasi-tier"
            type="number"
            min={1}
            max={MAX_DIMENSION}
            inputMode="numeric"
            value={values.tier}
            onChange={(e) => onChange({ ...values, tier: clampDimension(e.target.value) })}
            className="input-field text-sm"
          />
        </div>
        <div>
          <label htmlFor="standarisasi-tinggi" className="block text-xs font-medium text-slate-500 mb-1.5">
            Tinggi Tumpukan <span className="text-primary-500">*</span>
          </label>
          <input
            id="standarisasi-tinggi"
            type="number"
            min={1}
            max={MAX_DIMENSION}
            inputMode="numeric"
            value={values.tinggi_tumpukan}
            onChange={(e) => onChange({ ...values, tinggi_tumpukan: clampDimension(e.target.value) })}
            className="input-field text-sm"
          />
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 mt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Preview Perhitungan</span>
        <p className="text-sm text-slate-800 mt-1">
          {values.tier} tier x {values.tinggi_tumpukan} tinggi = <span className="font-bold text-primary-600 tabular-nums">{total}</span> total
        </p>
        {isEdit && (
          <p className="text-xs text-slate-400 mt-2">
            Status hanya dapat diubah melalui tombol Setujui/Tolak oleh BLC.
            {needsReapproval && ' Karena data ini sudah disetujui, menyimpan perubahan akan mengembalikannya ke status Pending untuk disetujui ulang.'}
          </p>
        )}
      </div>
    </Modal>
  );
}
