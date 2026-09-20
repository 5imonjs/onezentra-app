'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { opnameExpired, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { CONDITIONS, CONDITION_LABELS, canonicalCondition } from '@/lib/condition';

interface EditItem {
  id: number;
  kode_barang?: string | null;
  actual_qty: number;
  qty_pcs: number | null;
  conversion_factor?: number | null;
  source?: string | null;
  satuan: string | null;
  expired_date: string | null;
  tanggal_penerimaan: string | null;
  condition?: string | null;
  sumber_material: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  notes?: string | null;
}

interface Props {
  open: boolean;
  item: EditItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const fmtDateInput = toDateInput;

export default function ReceivingItemEditModal({ open, item, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setForm({
        qty_crt: String(item.actual_qty ?? ''),
        qty_pcs: item.qty_pcs != null ? String(item.qty_pcs) : '',
        satuan: item.satuan || 'CRT',
        expired_date: fmtDateInput(item.expired_date),
        tanggal_penerimaan: fmtDateInput(item.tanggal_penerimaan),
        condition: canonicalCondition(item.condition),
        sumber_material: item.sumber_material || '',
        kode_depo: item.kode_depo || '',
        nama_depo: item.nama_depo || '',
        notes: item.notes || '',
      });
    }
  }, [item]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setBusy(true);

    const isDerived = item.conversion_factor != null;
    const qtyPcs = isDerived
      ? parseFloat(form.qty_crt || '0') * (item.conversion_factor as number)
      : form.qty_pcs
        ? parseFloat(form.qty_pcs)
        : null;

    try {
      await opnameExpired.manualUpdate(item.id, {
        qty_crt: parseFloat(form.qty_crt || '0'),
        qty_pcs: qtyPcs,
        satuan: form.satuan || 'CRT',
        expired_date: form.expired_date,
        tanggal_penerimaan: form.tanggal_penerimaan || undefined,
        condition: canonicalCondition(form.condition),
        sumber_material: form.sumber_material || null,
        kode_depo: form.kode_depo || null,
        nama_depo: form.nama_depo || null,
        notes: form.notes || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      notifyGlobal(getErrorMessage(err, 'Gagal menyimpan perubahan'));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Edit Penerimaan" subtitle={item ? `Kode: ${item.kode_barang ?? '-'}` : undefined} size="lg"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-secondary">Batal</button>
          <button type="submit" form="edit-receiving-item" disabled={busy} className="btn-primary disabled:opacity-50">
            <span className="flex items-center gap-2">
              {busy ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Menyimpan...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  Simpan
                </>
              )}
            </span>
          </button>
        </>
      }
    >
      <form id="edit-receiving-item" onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="riem-qty-crt" className="block text-sm font-medium text-gray-700 mb-1.5">Qty CRT *</label>
            <input id="riem-qty-crt" type="number" step="1" min="0" value={form.qty_crt || ''} onChange={set('qty_crt')} className="input-field" required />
          </div>
          <div>
            <label htmlFor="riem-qty-pcs" className="block text-sm font-medium text-gray-700 mb-1.5">
              Qty PCS {item?.conversion_factor != null ? '(otomatis)' : '(opsional)'}
            </label>
            {item?.conversion_factor != null ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-sm font-semibold text-gray-800 tabular-nums">
                  {parseFloat(form.qty_crt || '0') * item.conversion_factor}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Qty CRT × faktor konversi {item.conversion_factor} — dari master, tidak diinput manual
                </p>
              </div>
            ) : (
              <input id="riem-qty-pcs" type="number" step="1" min="0" value={form.qty_pcs || ''} onChange={set('qty_pcs')} className="input-field" />
            )}
          </div>
          <div>
            <label htmlFor="riem-satuan" className="block text-sm font-medium text-gray-700 mb-1.5">Satuan</label>
            <select id="riem-satuan" value={form.satuan || 'CRT'} onChange={set('satuan')} className="select-field">
              <option value="CRT">CRT</option>
              <option value="ZAK">ZAK</option>
              <option value="PCS">PCS</option>
              <option value="KAR">KAR</option>
              <option value="BTL">BTL</option>
              <option value="BOX">BOX</option>
            </select>
          </div>
          <div>
            <label htmlFor="riem-expired-date" className="block text-sm font-medium text-gray-700 mb-1.5">Expired Date *</label>
            <input id="riem-expired-date" type="date" value={form.expired_date || ''} onChange={set('expired_date')} className="input-field" required />
          </div>
          <div>
            <label htmlFor="riem-tanggal-penerimaan" className="block text-sm font-medium text-gray-700 mb-1.5">Tanggal Penerimaan</label>
            <input id="riem-tanggal-penerimaan" type="date" value={form.tanggal_penerimaan || ''} onChange={set('tanggal_penerimaan')} className="input-field" />
          </div>
          <div>
            <label htmlFor="riem-condition" className="block text-sm font-medium text-gray-700 mb-1.5">Kondisi</label>
            <select id="riem-condition" value={form.condition || 'FISIK_BAGUS'} onChange={set('condition')} className="select-field">
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="riem-sumber-material" className="block text-sm font-medium text-gray-700 mb-1.5">Sumber Material</label>
            <input id="riem-sumber-material" value={form.sumber_material || ''} onChange={set('sumber_material')} className="input-field" />
          </div>
          <div>
            <label htmlFor="riem-kode-depo" className="block text-sm font-medium text-gray-700 mb-1.5">Kode Depo</label>
            <input id="riem-kode-depo" value={form.kode_depo || ''} onChange={set('kode_depo')} className="input-field" />
          </div>
          <div className="col-span-2">
            <label htmlFor="riem-nama-depo" className="block text-sm font-medium text-gray-700 mb-1.5">Nama Depo</label>
            <input id="riem-nama-depo" value={form.nama_depo || ''} onChange={set('nama_depo')} className="input-field" />
          </div>
          <div className="col-span-2">
            <label htmlFor="riem-notes" className="block text-sm font-medium text-gray-700 mb-1.5">Catatan</label>
            <textarea id="riem-notes" value={form.notes || ''} onChange={set('notes')} className="input-field" rows={2} />
          </div>
        </div>
      </form>
    </Modal>
  );
}