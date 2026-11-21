'use client';

import type { Dispatch, SetStateAction } from 'react';
import Modal from '@/components/Modal';
import NpnSearchInput, { type NpnProduct } from '@/components/NpnSearchInput';
import { firstIndexOfCode } from '@/lib/itemDuplicates';
import type { RencanaKirimItem } from './RencanaKirimCreateModal';

interface RencanaKirimBarangModalProps {
  showBarangModal: boolean;
  setShowBarangModal: Dispatch<SetStateAction<boolean>>;
  createItems: RencanaKirimItem[];
  duplicateIndexes: Set<number>;
  duplicateCount: number;
  sectionComplete: { dokumen: boolean; kendaraan: boolean; pengirim: boolean; barang: boolean; catatan: boolean };
  totalQty: number;
  totalKubikasiDisplay: number;
  itemKubikasi: (item: RencanaKirimItem) => number;
  itemCount: number;
  takenCodesByIndex: Map<number, string[]>;
  typingItems: Set<number>;
  markTyping: (index: number, isTyping: boolean) => void;
  EMPTY_CODES: string[];
  addItem: () => void;
  updateItem: (index: number, field: keyof RencanaKirimItem, value: string | number) => void;
  removeItem: (index: number) => void;
  handleClearItem: (index: number) => void;
  handleNamaBarangSelect: (index: number, product: NpnProduct) => void;
}

export default function RencanaKirimBarangModal({
  showBarangModal, setShowBarangModal, createItems, duplicateIndexes, duplicateCount,
  sectionComplete, totalQty, totalKubikasiDisplay, itemKubikasi, itemCount, takenCodesByIndex,
  typingItems, markTyping, EMPTY_CODES, addItem, updateItem, removeItem, handleClearItem, handleNamaBarangSelect,
}: RencanaKirimBarangModalProps) {
  return (
      <Modal
        open={showBarangModal}
        onClose={() => setShowBarangModal(false)}
        title="Kelola Daftar Barang"
        subtitle={`${itemCount} barang • ${totalQty} qty • ${totalKubikasiDisplay.toFixed(2)} m³`}
        size="2xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {duplicateCount > 0
                ? `${duplicateCount} baris duplikat — gabungkan atau hapus dulu`
                : sectionComplete.barang
                  ? 'Barang siap disimpan'
                  : 'Isi minimal 1 barang dengan jumlah >0'}
            </span>
            <button onClick={() => setShowBarangModal(false)} className="btn-primary">Selesai</button>
          </div>
        }
      >
        <div className="space-y-4">
          {duplicateCount > 0 && (
            <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-destructive flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="text-xs leading-relaxed text-destructive">
                <b>{duplicateCount} nama barang terduplikasi.</b> Satu produk hanya boleh muncul sekali per rencana —
                gabungkan jumlahnya ke baris pertama, atau hapus baris yang tidak dipakai. Rencana tidak bisa disimpan selama duplikat ada.
              </div>
            </div>
          )}

          <div className="space-y-3">
            {createItems.map((item, index) => {
              const isDuplicate = duplicateIndexes.has(index);
              const duplicateOf = isDuplicate
                ? firstIndexOfCode(createItems, item.kode_barang)
                : -1;
              const needsAttention = typingItems.has(index) || (item.nama_barang.trim().length > 0 && !item.kode_barang) || isDuplicate;
              const rowKubikasi = itemKubikasi(item);
              return (
              <div key={index} className={`group relative rounded-2xl border bg-card p-5 shadow-sm transition-all ${needsAttention ? 'border-warning/30 bg-warning/10' : 'border-border hover:border-border hover:shadow-md'}`}>
                <div className="flex items-start gap-3">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${needsAttention ? 'bg-warning text-background' : 'bg-card border border-border text-foreground shadow-sm'}`}>{item.item_number}</span>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <label htmlFor={`item-nama-${index}`} className="block text-xs font-semibold text-foreground mb-1.5">Nama Barang <span className="text-destructive">*</span></label>
                      <NpnSearchInput
                        inputId={`item-nama-${index}`}
                        namaValue={item.nama_barang}
                        onSelect={(p) => handleNamaBarangSelect(index, p)}
                        onClear={() => handleClearItem(index)}
                        onTypingChange={(v) => markTyping(index, v)}
                        takenCodes={takenCodesByIndex.get(index) ?? EMPTY_CODES}
                      />
                      {item.kode_barang ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-foreground text-background px-2.5 py-1 text-xs font-mono font-bold">{item.kode_barang}</span>
                          <span title="Umur diambil dari master Standar Umur Produk" className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${item.umur != null ? 'bg-success/10 text-success border-success/30' : 'bg-warning/10 text-foreground border-warning/30'}`}>{item.umur != null ? `${item.umur} bulan` : 'Umur belum diset'}</span>
                          <span className="inline-flex items-center rounded-full bg-info/10 text-info border border-info/30 px-2.5 py-1 text-xs font-bold">{rowKubikasi > 0 ? `${rowKubikasi.toFixed(2)} m³` : '0 m³'}</span>
                          {isDuplicate && (
                            <span role="alert" className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-2.5 py-1 text-xs font-bold">
                              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                              </svg>
                              Duplikat dari baris #{duplicateOf + 1} — gabungkan ke sana
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">Ketik nama barang lalu pilih dari NPN</p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 sm:col-span-1">
                        <label htmlFor={`item-jumlah-${index}`} className="block text-xs font-semibold text-foreground mb-1">Jumlah <span className="text-destructive">*</span></label>
                        <input id={`item-jumlah-${index}`} type="number" value={item.jumlah || ''} onChange={(e) => updateItem(index, 'jumlah', parseFloat(e.target.value) || 0)} placeholder="0" min="0" className="w-full px-3 py-2.5 text-center text-base font-black text-foreground bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm" />
                      </div>
                      <div>
                        <label htmlFor={`item-satuan-${index}`} className="block text-xs font-semibold text-foreground mb-1">Satuan</label>
                        <select id={`item-satuan-${index}`} value={item.satuan} onChange={(e) => updateItem(index, 'satuan', e.target.value)} className="w-full px-3 py-2.5 text-sm font-bold bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary-500 text-center">
                          <option value="CRT">CRT</option><option value="PCS">PCS</option><option value="DUS">DUS</option><option value="BOX">BOX</option><option value="KG">KG</option><option value="LUSIN">LUSIN</option><option value="ZAK">ZAK</option>
                        </select>
                      </div>
                      <div className="hidden sm:block">
                        <label htmlFor={`item-ket-${index}`} className="block text-xs font-semibold text-foreground mb-1">Keterangan</label>
                        <input id={`item-ket-${index}`} type="text" value={item.keterangan} onChange={(e) => updateItem(index, 'keterangan', e.target.value)} placeholder="Opsional" className="w-full px-3 py-2.5 text-sm bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary-500" />
                      </div>
                    </div>
                    <div className="sm:hidden">
                      <input type="text" aria-label="Keterangan barang (opsional)" value={item.keterangan} onChange={(e) => updateItem(index, 'keterangan', e.target.value)} placeholder="Keterangan (opsional)" className="w-full px-3 py-2 text-sm bg-popover border border-border rounded-xl focus:bg-card focus:ring-2 focus:ring-primary-500" />
                    </div>
                  </div>
                  <button onClick={() => removeItem(index)} disabled={createItems.length <= 1} aria-label={`Hapus barang ${item.item_number}`} className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10 disabled:opacity-30 shrink-0 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              );
            })}
            <button onClick={addItem} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-border bg-card text-sm font-bold text-foreground hover:border-primary-300 hover:bg-chip-primary hover:text-accent-text transition-colors">
              <span className="w-7 h-7 rounded-xl bg-primary-600 text-white flex items-center justify-center"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></span>
              Tambah barang lagi
            </button>
            <div className="flex items-center justify-between rounded-2xl bg-foreground text-background px-4 py-3">
              <span className="text-xs font-bold tracking-widest text-background/70 uppercase">Total • {itemCount} barang</span>
              <span className="text-sm font-black">{totalQty} Qty • {totalKubikasiDisplay.toFixed(2)} m³</span>
            </div>
            {createItems.some(i => i.kode_barang && i.umur == null) && (
              <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Umur produk diambil dari master Standar Umur Produk dan dipakai untuk pemeriksaan sisa umur di Validasi SJ. Produk tanpa umur tidak dapat diperiksa sisa umurnya — hubungi administrator untuk melengkapi master.</p>
            )}
          </div>
        </div>
      </Modal>
  );
}
