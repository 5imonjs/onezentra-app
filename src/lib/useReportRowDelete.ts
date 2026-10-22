'use client';

import { useCallback, useState } from 'react';
import { getErrorMessage, reports } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';

export type ReportDeleteType =
  | 'rencana_kirim'
  | 'receiving_item'
  | 'opname_wave'
  | 'biaya_thl_detail'
  | 'biaya_retribusi_detail';

/**
 * State + aksi hapus baris laporan. Backend tetap memverifikasi level
 * admin_master; hook ini hanya menyiapkan checkbox dan konfirmasi UI.
 */
export function useReportRowDelete(type: ReportDeleteType, onDeleted: () => void) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleAll = useCallback((ids: number[]) => {
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
  }, []);

  const clear = useCallback(() => setSelectedIds([]), []);

  const removeSelected = useCallback(async () => {
    if (deleting || selectedIds.length === 0) return;
    if (!window.confirm(`Hapus permanen ${selectedIds.length} baris laporan ini? Tindakan tidak bisa dibatalkan.`)) return;

    setDeleting(true);
    try {
      const res = await reports.deleteRows(type, selectedIds);
      notifyGlobal(res.data?.message || 'Baris laporan dihapus.', 'success');
      setSelectedIds([]);
      onDeleted();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal menghapus baris laporan.'), 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleting, onDeleted, selectedIds, type]);

  return { selectedIds, toggle, toggleAll, clear, deleting, removeSelected };
}
