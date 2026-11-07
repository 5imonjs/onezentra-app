'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { opnameExpired, getErrorMessage } from '@/lib/api';
import { toDateInput } from '@/lib/dates';
import { notifyGlobal } from '@/store/globalToast';
import { CONDITIONS, CONDITION_LABELS, canonicalCondition, conditionRequiresPhoto } from '@/lib/condition';
import { AUTHENTICATED_FILE_REL, storageFileUrl } from '@/lib/storageFile';

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
  /** False = kolom tanggal kosong; nilai `tanggal_penerimaan` hanya fallback. */
  has_tanggal_penerimaan?: boolean;
  condition?: string | null;
  sumber_material: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  notes?: string | null;
  photo?: string | null;
  /** `manual` = ditandai admin; `date` = otomatis dari tanggal penerimaan. */
  baseline_coverage?: 'manual' | 'date' | null;
  baseline_cover_note?: string | null;
  baseline_covered_at?: string | null;
  baseline_import_id?: number | null;
  is_baseline_row?: boolean;
}

interface Props {
  open: boolean;
  item: EditItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const fmtDateInput = toDateInput;

export default function ReceivingItemEditModal({ open, item, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  // Koreksi cakupan baseline untuk baris yang fisiknya sudah ada saat
  // baseline diambil, tetapi baru diinput setelah baseline.
  const [manualCovered, setManualCovered] = useState(false);
  const [coverNote, setCoverNote] = useState('');

  // Baris baseline = stok awal itu sendiri (LEGACY_IMPORT), termasuk yang
  // sudah direklasifikasi ke VALIDASI_SJ tetapi masih membawa manifes baseline.
  const isBaselineRow = !!item && (
    item.source === 'LEGACY_IMPORT'
    || (item.baseline_import_id != null && !item.baseline_covered_at)
  );
  const automaticCoverage = item?.baseline_coverage === 'date';

  const clearPhotoSelection = () => {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setPhotoFile(null);
  };

  useEffect(() => {
    clearPhotoSelection();
    if (item) {
      setForm({
        qty_crt: String(item.actual_qty ?? ''),
        qty_pcs: item.qty_pcs != null ? String(item.qty_pcs) : '',
        satuan: item.satuan || 'CRT',
        expired_date: fmtDateInput(item.expired_date),
        tanggal_penerimaan: item.has_tanggal_penerimaan === false ? '' : fmtDateInput(item.tanggal_penerimaan),
        condition: canonicalCondition(item.condition),
        sumber_material: item.sumber_material || '',
        kode_depo: item.kode_depo || '',
        nama_depo: item.nama_depo || '',
        notes: item.notes || '',
      });
      setManualCovered(item.baseline_coverage === 'manual');
      setCoverNote(item.baseline_cover_note || '');
    }
  }, [item]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    const qtyCrt = parseFloat(form.qty_crt || '');
    if (!Number.isFinite(qtyCrt) || qtyCrt < 0) {
      notifyGlobal('Qty CRT harus angka ≥ 0.', 'error');
      return;
    }
    setBusy(true);

    const isDerived = item.conversion_factor != null;
    const qtyPcs = isDerived
      ? qtyCrt * (item.conversion_factor as number)
      : form.qty_pcs
        ? parseFloat(form.qty_pcs)
        : null;

    if (qtyPcs !== null && !Number.isFinite(qtyPcs)) {
      notifyGlobal('Qty PCS harus angka ≥ 0.', 'error');
      setBusy(false);
      return;
    }

    // Jangan biarkan pengguna mengira tanggal lama terhapus: backend tidak
    // menimpa tanggal dengan null. Baris yang memang belum punya tanggal
    // boleh tetap kosong dan memakai tanggal sistem.
    if (item.has_tanggal_penerimaan !== false && !form.tanggal_penerimaan) {
      notifyGlobal('Tanggal penerimaan tidak boleh dikosongkan. Isi tanggal asli barang diterima.', 'error');
      setBusy(false);
      return;
    }

    const coverageRequested = !isBaselineRow && !automaticCoverage;
    const originalTanggal = item.has_tanggal_penerimaan === false ? '' : (fmtDateInput(item.tanggal_penerimaan) || '');
    const dateChanged = (form.tanggal_penerimaan || '') !== originalTanggal;

    try {
      const res = await opnameExpired.manualUpdate(item.id, {
        qty_crt: qtyCrt,
        qty_pcs: qtyPcs,
        satuan: form.satuan || 'CRT',
        expired_date: form.expired_date,
        tanggal_penerimaan: form.tanggal_penerimaan || undefined,
        condition: canonicalCondition(form.condition),
        sumber_material: form.sumber_material || null,
        kode_depo: form.kode_depo || null,
        nama_depo: form.nama_depo || null,
        notes: form.notes || null,
        ...(coverageRequested ? {
          baseline_covered: manualCovered,
          // String kosong (bukan null) agar upload foto pun tetap mengirim
          // field ini; backend dapat mengosongkan catatan lama.
          baseline_cover_note: manualCovered ? coverNote.trim() : null,
        } : {}),
      }, photoFile);
      if ((coverageRequested || dateChanged) && res.data?.message) {
        const toastType = res.data.opname_synced === false
          ? 'error'
          : (!manualCovered && res.data.baseline_coverage === 'date' ? 'info' : 'success');
        notifyGlobal(res.data.message, toastType);
      }
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

  const pickPhoto = (file: File | null) => {
    if (!file) return;
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const photoRequired = conditionRequiresPhoto(form.condition);
  const photoSatisfied = !photoRequired || photoFile !== null || !!item?.photo;
  const saveDisabled = busy || !photoSatisfied;

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Edit Penerimaan" subtitle={item ? `Kode: ${item.kode_barang ?? '-'}` : undefined} size="lg"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-secondary">Batal</button>
          <button type="submit" form="edit-receiving-item" disabled={saveDisabled} title={!photoSatisfied ? 'Foto wajib diunggah untuk kondisi ini' : undefined} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
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
            <label htmlFor="riem-qty-crt" className="block text-sm font-medium text-foreground mb-1.5">Qty CRT *</label>
            <input id="riem-qty-crt" type="number" step="1" min="0" value={form.qty_crt || ''} onChange={set('qty_crt')} className="input-field" required />
          </div>
          <div>
            <label htmlFor="riem-qty-pcs" className="block text-sm font-medium text-foreground mb-1.5">
              Qty PCS {item?.conversion_factor != null ? '(otomatis)' : '(opsional)'}
            </label>
            {item?.conversion_factor != null ? (
              <div className="rounded-xl border border-border bg-popover px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground tabular-nums">
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
            <label htmlFor="riem-satuan" className="block text-sm font-medium text-foreground mb-1.5">Satuan</label>
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
            <label htmlFor="riem-expired-date" className="block text-sm font-medium text-foreground mb-1.5">Expired Date *</label>
            <input id="riem-expired-date" type="date" value={form.expired_date || ''} onChange={set('expired_date')} className="input-field" required />
          </div>
          <div>
            <label htmlFor="riem-tanggal-penerimaan" className="block text-sm font-medium text-foreground mb-1.5">Tanggal Penerimaan</label>
            <input id="riem-tanggal-penerimaan" type="date" value={form.tanggal_penerimaan || ''} onChange={set('tanggal_penerimaan')} className="input-field" />
            <p className="text-[11px] text-gray-400 mt-1">
              Tanggal barang benar-benar diterima. Kosong = memakai tanggal sistem/scan.
            </p>
          </div>
          <div>
            <label htmlFor="riem-condition" className="block text-sm font-medium text-foreground mb-1.5">Kondisi</label>
            <select id="riem-condition" value={form.condition || 'FISIK_BAGUS'} onChange={set('condition')} className="select-field">
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <span className="block text-sm font-medium text-foreground mb-1.5">Bukti Foto {photoRequired && <span className="text-red-500">* wajib untuk kondisi ini</span>}</span>
            {photoRequired && !photoSatisfied && (
              <div className="mb-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                <p className="text-xs font-bold text-amber-900">Bukti fotografi kondisi wajib</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Ambil foto langsung atau pilih dari galeri sebagai bukti kondisi produk.</p>
              </div>
            )}
            {item?.photo && !photoFile && (
              <a
                href={storageFileUrl(item.photo) ?? '#'}
                target="_blank"
                rel={AUTHENTICATED_FILE_REL}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-text hover:text-accent-text-strong"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                Lihat foto tersimpan
              </a>
            )}
            {photoPreview ? (
              <div className="relative">
                <Image src={photoPreview} alt="Pratinjau foto kondisi baru" className="w-full h-48 object-cover rounded-xl" width={400} height={200} unoptimized />
                <button type="button" onClick={clearPhotoSelection} className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors min-w-11 min-h-11 flex items-center justify-center" aria-label="Hapus foto baru">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <label className="btn-secondary text-sm cursor-pointer">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.317z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm0 0c0 1.657 1.007 3 2.25 3S21 14.407 21 12.75s-1.007-3-2.25-3S16.5 11.093 16.5 12.75z" /></svg>
                    {item?.photo ? 'Ganti via kamera' : 'Ambil via kamera'}
                  </span>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} className="sr-only" aria-label="Ambil foto dari kamera" />
                </label>
                <label className="btn-secondary text-sm cursor-pointer">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    {item?.photo ? 'Ganti via galeri' : 'Pilih via galeri'}
                  </span>
                  <input type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} className="sr-only" aria-label="Pilih foto dari galeri" />
                </label>
              </div>
            )}
          </div>
          <div className="col-span-2">
            <label htmlFor="riem-sumber-material" className="block text-sm font-medium text-foreground mb-1.5">Sumber Material</label>
            <input id="riem-sumber-material" value={form.sumber_material || ''} onChange={set('sumber_material')} className="input-field" />
          </div>
          <div>
            <label htmlFor="riem-kode-depo" className="block text-sm font-medium text-foreground mb-1.5">Kode Depo</label>
            <input id="riem-kode-depo" value={form.kode_depo || ''} onChange={set('kode_depo')} className="input-field" />
          </div>
          <div className="col-span-2">
            <label htmlFor="riem-nama-depo" className="block text-sm font-medium text-foreground mb-1.5">Nama Depo</label>
            <input id="riem-nama-depo" value={form.nama_depo || ''} onChange={set('nama_depo')} className="input-field" />
          </div>
          <div className="col-span-2">
            <label htmlFor="riem-notes" className="block text-sm font-medium text-foreground mb-1.5">Catatan</label>
            <textarea id="riem-notes" value={form.notes || ''} onChange={set('notes')} className="input-field" rows={2} />
          </div>
          {item && (
            <div className="col-span-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-violet-950">Cakupan Baseline</p>
                  <p className="text-[11px] leading-relaxed text-violet-700 mt-0.5">
                    Baris tetap tersimpan di ledger. Penanda ini hanya menentukan apakah baris dihitung ulang sebagai stok baru.
                  </p>
                </div>
                {item.baseline_coverage && (
                  <span className="badge border border-violet-300 bg-violet-100 text-violet-700 whitespace-nowrap">
                    {item.baseline_coverage === 'manual' ? 'Ditandai manual' : 'Otomatis dari tanggal'}
                  </span>
                )}
              </div>

              {isBaselineRow ? (
                <p className="mt-2 text-xs text-violet-800">
                  Baris ini adalah stok awal baseline (LEGACY_IMPORT atau hasil reklasifikasi); tidak perlu ditandai dan tidak dihitung sebagai stok baru.
                </p>
              ) : item.baseline_coverage === 'date' ? (
                <p className="mt-2 text-xs leading-relaxed text-violet-800">
                  Tanggal penerimaan baris ini sudah tercakup tanggal posisi baseline, jadi otomatis tidak dihitung sebagai stok baru.
                  Jika barang ini sebenarnya baru, ubah <span className="font-semibold">Tanggal Penerimaan</span> ke tanggal setelah baseline.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <label className="flex items-start gap-2.5 text-xs text-violet-900">
                    <input
                      type="checkbox"
                      checked={manualCovered}
                      onChange={(e) => setManualCovered(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span>
                      Barang ini sudah ada saat baseline diambil — <span className="font-semibold">jangan hitung sebagai stok baru</span>.
                    </span>
                  </label>
                  {manualCovered && (
                    <div>
                      <label htmlFor="riem-baseline-note" className="block text-[11px] font-medium text-violet-800 mb-1">Alasan / catatan koreksi (opsional)</label>
                      <input
                        id="riem-baseline-note"
                        value={coverNote}
                        onChange={(e) => setCoverNote(e.target.value)}
                        className="input-field"
                        maxLength={1000}
                        placeholder="Contoh: barang datang 3 Nov, baru diinput hari ini"
                      />
                    </div>
                  )}
                  {item.baseline_coverage === 'manual' && (
                    <p className="text-[11px] leading-relaxed text-violet-700">
                      Jika tanggal penerimaan masih s.d. tanggal baseline, baris tetap otomatis tidak dihitung setelah penanda dilepas.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}