'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { opnameExpired, getErrorMessage } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { formatDateId, todayLocal } from '@/lib/dates';
import Modal from '@/components/Modal';
import { useAuthStore } from '@/store/auth';

interface BaselineManifest {
  id: number;
  kode_depo: string | null;
  nama_depo: string | null;
  baseline_date: string | null;
  imported_at: string | null;
  file_name: string | null;
  row_count: number;
  items_count: number;
  total_qty_crt: number;
  total_qty_pcs: number;
  notes: string | null;
  imported_by: string | null;
  has_open_session: boolean;
  has_finalized_current_week: boolean;
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export default function BaselineImportManager({ open, onClose, onChanged }: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { hasPermission, user } = useAuthStore();
  const canView = hasPermission('penerimaan.view');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [ack, setAck] = useState(false);
  const [depo, setDepo] = useState('');
  const [namaDepo, setNamaDepo] = useState('');
  const [baselineDate, setBaselineDate] = useState(todayLocal());
  const inputRef = useRef<HTMLInputElement>(null);
  const [baselines, setBaselines] = useState<BaselineManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const currentBaseline = baselines.find((b) => b.kode_depo === depo.trim()) ?? null;
  const currentBaselineDate = currentBaseline?.baseline_date ?? '';
  const correctionBlocked = Boolean(
    currentBaseline?.has_open_session || currentBaseline?.has_finalized_current_week,
  );

  const loadBaselines = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await opnameExpired.baselineManifests();
      setBaselines((res.data?.data ?? []) as BaselineManifest[]);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat data awal terpasang.'));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    if (!open) return;
    setSuccessMsg(null);
    loadBaselines();
    if (user) {
      setDepo((prev) => prev || user.kode_depo || '');
      setNamaDepo((prev) => prev || user.nama_depo || '');
    }
  }, [open, loadBaselines, user]);

  useEffect(() => {
    setEditDate(currentBaselineDate);
  }, [currentBaselineDate]);

  const closeModal = () => {
    onClose();
    setSuccessMsg(null);
  };

  const downloadTemplate = async () => {
    try {
      const res = await opnameExpired.baselineTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'template_saldo_awal.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal unduh template saldo awal'));
    }
  };

  const handleImportError = (err: unknown) => {
    const response = (err as { response?: { data?: { message?: string; errors?: { row?: number; errors?: string[] }[] } } }).response?.data;
    if (response?.errors?.length) {
      const first = response.errors[0];
      notifyGlobal(`${response.message ?? 'Import gagal'}\nBaris ${first.row}: ${(first.errors ?? []).join(', ')}`);
    } else {
      notifyGlobal(getErrorMessage(err, 'Import saldo awal gagal'));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleImport = async () => {
    if (!file) {
      notifyGlobal('Pilih file Excel saldo awal terlebih dahulu.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      notifyGlobal(`Ukuran file ${mb} MB melebihi batas 10 MB`);
      return;
    }
    if (!ack) {
      notifyGlobal('Centang konfirmasi bahwa saldo awal hanya boleh diimpor sekali.');
      return;
    }
    if (!depo.trim()) {
      notifyGlobal('Kode depo wajib diisi untuk saldo awal.');
      return;
    }
    if (!baselineDate) {
      notifyGlobal('Tanggal saldo awal wajib diisi.');
      return;
    }

    setImporting(true);
    try {
      const res = await opnameExpired.baselineImport(file, {
        kode_depo: depo.trim(),
        nama_depo: namaDepo.trim() || undefined,
        baseline_date: baselineDate,
      });
      const { imported, skipped } = res.data;
      const duplicates = Number(res.data.duplicates ?? 0);
      const synced = Boolean(res.data.opname_synced);
      const dateLabel = res.data.baseline_date ? formatDateId(res.data.baseline_date) : baselineDate;
      setSuccessMsg(
        `Saldo awal selesai (saldo pembuka s.d. ${dateLabel}): ${imported} baris masuk, ${skipped} dilewati${duplicates > 0 ? `, ${duplicates} duplikat dilewati` : ''}.${synced ? ' Baris monitoring sudah disinkronkan.' : ' Buat baris monitoring gagal; jalankan manual.'}`
      );
      setFile(null);
      setAck(false);
      setBaselineDate(todayLocal());
      if (inputRef.current) inputRef.current.value = '';
      await loadBaselines();
      onChanged?.();
    } catch (err) {
      handleImportError(err);
    } finally {
      setImporting(false);
    }
  };

  const handleDateUpdate = async () => {
    if (!currentBaseline) {
      notifyGlobal('Saldo awal untuk depo ini belum terpasang.');
      return;
    }
    if (!editDate) {
      notifyGlobal('Tanggal koreksi saldo awal wajib diisi.');
      return;
    }
    if (editDate === currentBaseline.baseline_date) {
      notifyGlobal('Tanggal saldo awal tidak berubah.');
      return;
    }

    setSaving(true);
    try {
      const res = await opnameExpired.baselineUpdate(currentBaseline.id, {
        baseline_date: editDate,
      });
      const synced = Boolean(res.data.opname_synced);
      setSuccessMsg(
        `${res.data.message ?? 'Tanggal saldo awal diperbarui.'}${synced ? ' Baris monitoring sudah disinkronkan.' : ' Buat baris monitoring gagal; jalankan manual.'}`
      );
      await loadBaselines();
      onChanged?.();
    } catch (err) {
      notifyGlobal(getErrorMessage(err, 'Gagal mengoreksi tanggal saldo awal.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="Import Saldo Awal"
      subtitle="Sekali per depo — saldo pembuka sebelum sistem ini"
      size="xl"
      footer={<button type="button" onClick={closeModal} className="btn-secondary">Tutup</button>}
    >
      <div className="space-y-5">
        {successMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-semibold">{successMsg}</p>
          </div>
        )}

        {!user?.kode_depo && currentBaseline && (
          <div className="rounded-xl border border-border p-3">
            <label htmlFor="baseline-switch-depo" className="mb-1 block text-xs font-medium text-foreground">
              Lihat / pasang saldo awal depo lain
            </label>
            <input
              id="baseline-switch-depo"
              value={depo}
              onChange={(e) => setDepo(e.target.value)}
              className="input-field"
              placeholder="Kode depo"
            />
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Ganti kode depo untuk melihat saldo awal terpasang atau memasang saldo awal depo lain.
            </p>
          </div>
        )}

        {!loading && !currentBaseline && (
          <>
            <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
              <p className="text-sm font-semibold text-violet-900">Saldo awal = saldo pembuka sebelum sistem ini.</p>
              <p className="mt-1 text-xs leading-relaxed text-violet-800">
                Isi tanggal terakhir yang sudah tercakup di file lama. Penerimaan setelah tanggal itu tetap
                dihitung sebagai stok baru. Baris yang sudah diinput sebelum saldo awal dipasang tidak akan
                dihitung dua kali. Gunakan template acuan di bawah; kolomnya sama dengan Import Stok Manual.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="baseline-depo" className="mb-1 block text-xs font-medium text-foreground">Kode Depo *</label>
                <input
                  id="baseline-depo"
                  value={depo}
                  onChange={(e) => setDepo(e.target.value)}
                  disabled={Boolean(user?.kode_depo)}
                  className="input-field disabled:cursor-not-allowed disabled:bg-popover"
                  placeholder="Contoh: 001"
                />
              </div>
              <div>
                <label htmlFor="baseline-nama-depo" className="mb-1 block text-xs font-medium text-foreground">Nama Depo</label>
                <input
                  id="baseline-nama-depo"
                  value={namaDepo}
                  onChange={(e) => setNamaDepo(e.target.value)}
                  className="input-field"
                  placeholder="Nama depo (opsional)"
                />
              </div>
              <div>
                <label htmlFor="baseline-date" className="mb-1 block text-xs font-medium text-foreground">Tanggal Saldo *</label>
                <input
                  id="baseline-date"
                  type="date"
                  value={baselineDate}
                  max={todayLocal()}
                  onChange={(e) => setBaselineDate(e.target.value)}
                  disabled={importing}
                  className="input-field disabled:cursor-not-allowed disabled:bg-popover"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-violet-700">
                  Batas terakhir tanggal penerimaan yang sudah masuk saldo awal.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={downloadTemplate} className="btn-secondary text-sm px-3 py-1.5">
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Template
                </span>
              </button>
              <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary text-sm px-3 py-1.5" disabled={importing}>
                Pilih File Saldo Awal
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) setFile(selected);
                }}
              />
              <span className="text-xs text-violet-900">
                {file ? `${file.name} (${formatFileSize(file.size)})` : 'Belum ada file dipilih'}
              </span>
              {file && !importing && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  className="p-1 text-violet-500 transition-colors hover:text-red-500"
                  aria-label="Hapus file saldo awal"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            <label className="flex items-start gap-2 text-xs text-violet-900">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-violet-600" />
              <span>Saya paham saldo awal hanya boleh diimpor sekali dan tidak dapat diulang untuk depo ini.</span>
            </label>

            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !file || !ack}
              className="btn-primary text-sm disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                {importing ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : null}
                {importing ? 'Mengimpor saldo awal...' : 'Import Saldo Awal'}
              </span>
            </button>
          </>
        )}

        <div className="border-t border-violet-200 pt-4">
          {loading ? (
            <p className="text-[11px] text-violet-700">Memuat saldo awal terpasang...</p>
          ) : currentBaseline ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-violet-200 bg-popover px-3 py-2">
                <p className="text-xs font-semibold text-violet-900">Saldo awal terpasang</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-violet-800">
                  Saldo pembuka s.d. <span className="font-semibold">{formatDateId(currentBaseline.baseline_date)}</span>
                  {' '}&middot; {currentBaseline.row_count} baris
                  {currentBaseline.imported_by ? ` \u00b7 diimpor oleh ${currentBaseline.imported_by}` : ''}
                  {currentBaseline.imported_at ? ` pada ${formatDateId(currentBaseline.imported_at)}` : ''}
                </p>
                {currentBaseline.has_open_session && (
                  <p className="mt-1 text-[11px] font-medium text-amber-700">
                    Stock Opname depo ini masih terbuka. Selesaikan atau batalkan sesi sebelum mengoreksi saldo awal.
                  </p>
                )}
                {!currentBaseline.has_open_session && currentBaseline.has_finalized_current_week && (
                  <p className="mt-1 text-[11px] font-medium text-amber-700">
                    Stock Opname minggu ini sudah final. Koreksi saldo awal tidak bisa mengubah saldo yang sudah disetujui.
                  </p>
                )}
              </div>

              {hasPermission('penerimaan.edit') ? (
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold text-foreground">Koreksi tanggal saldo</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    Gunakan jika tanggal saldo awal ternyata kurang tepat. Koreksi tidak mengubah
                    atau menghapus baris catatan stok.
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div>
                      <label htmlFor="baseline-edit-date" className="mb-1 block text-[11px] font-medium text-foreground">
                        Tanggal saldo baru
                      </label>
                      <input
                        id="baseline-edit-date"
                        type="date"
                        value={editDate}
                        max={todayLocal()}
                        onChange={(e) => setEditDate(e.target.value)}
                        disabled={saving || correctionBlocked}
                        className="input-field disabled:cursor-not-allowed disabled:bg-popover sm:max-w-48"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleDateUpdate}
                      disabled={saving || correctionBlocked || !editDate || editDate === currentBaseline.baseline_date}
                      className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5">
                        {saving ? (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : null}
                        {saving ? 'Menyimpan...' : 'Simpan koreksi'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-violet-700">
                  Butuh izin edit penerimaan untuk mengoreksi tanggal saldo awal.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-violet-700">
              Belum ada saldo awal terpasang untuk depo {depo.trim() || '-'}.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
