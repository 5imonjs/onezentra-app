'use client';

import { useCallback, useState } from 'react';
import { getErrorMessage, standarisasiTumpukan } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';
import { StandarisasiFormValues, StandarisasiItem } from '../types';

export type PendingAction = 'create' | 'update' | 'delete' | 'bulk-delete' | 'approve' | null;

interface UseStandarisasiActionsParams {
  /** Dipanggil setelah aksi berhasil agar daftar & ringkasan dimuat ulang. */
  onChanged: () => void;
}

/**
 * Semua mutasi standarisasi.
 *
 * Payload dibentuk eksplisit dari StandarisasiFormValues sehingga id, status,
 * dan approved_by tidak pernah ikut terkirim ke API.
 */
export default function useStandarisasiActions({ onChanged }: UseStandarisasiActionsParams) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [notifyingId, setNotifyingId] = useState<number | null>(null);

  const runAction = useCallback(async (
    action: Exclude<PendingAction, null>,
    task: () => Promise<unknown>,
    errorFallback: string,
  ): Promise<boolean> => {
    setPending(action);
    try {
      await task();
      return true;
    } catch (e) {
      notifyGlobal(getErrorMessage(e, errorFallback));
      return false;
    } finally {
      setPending(null);
    }
  }, []);

  const toPayload = (values: StandarisasiFormValues) => ({
    npn_id: values.npn_id,
    tier: values.tier,
    tinggi_tumpukan: values.tinggi_tumpukan,
  });

  const create = useCallback(async (values: StandarisasiFormValues): Promise<boolean> => {
    const ok = await runAction(
      'create',
      () => standarisasiTumpukan.create(toPayload(values)),
      'Gagal menyimpan standarisasi tumpukan',
    );
    if (!ok) return false;
    notifyGlobal('Standarisasi tumpukan terkirim dan menunggu approval BLC.', 'success');
    onChanged();
    return true;
  }, [runAction, onChanged]);

  const update = useCallback(async (id: number, values: StandarisasiFormValues): Promise<boolean> => {
    let requiresReapproval = false;
    const ok = await runAction('update', async () => {
      const res = await standarisasiTumpukan.update(id, toPayload(values));
      requiresReapproval = Boolean(res.data.requires_reapproval);
    }, 'Gagal memperbarui standarisasi tumpukan');
    if (!ok) return false;

    notifyGlobal(
      requiresReapproval
        ? 'Perubahan disimpan. Karena data sudah disetujui, status kembali ke Pending untuk approval ulang.'
        : 'Data standarisasi berhasil diperbarui.',
      requiresReapproval ? 'info' : 'success',
    );
    onChanged();
    return true;
  }, [runAction, onChanged]);

  const remove = useCallback(async (id: number): Promise<boolean> => {
    const ok = await runAction('delete', () => standarisasiTumpukan.delete(id), 'Gagal menghapus standarisasi tumpukan');
    if (!ok) return false;
    notifyGlobal('Data standarisasi berhasil dihapus.', 'success');
    onChanged();
    return true;
  }, [runAction, onChanged]);

  const bulkRemove = useCallback(async (ids: number[]): Promise<boolean> => {
    let deleted = 0;
    let skipped = 0;
    const ok = await runAction('bulk-delete', async () => {
      const res = await standarisasiTumpukan.bulkDelete(ids);
      deleted = res.data.deleted ?? 0;
      skipped = res.data.skipped ?? 0;
    }, 'Gagal menghapus data standarisasi terpilih');
    if (!ok) return false;

    if (skipped > 0) {
      notifyGlobal(`${deleted} data terhapus, ${skipped} dilewati karena di luar depo Anda.`, 'info');
    } else {
      notifyGlobal(`${deleted} data standarisasi berhasil dihapus.`, 'success');
    }
    onChanged();
    return true;
  }, [runAction, onChanged]);

  const setStatus = useCallback(async (item: StandarisasiItem, status: 'approved' | 'rejected'): Promise<boolean> => {
    const isApproval = status === 'approved';
    const ok = await runAction(
      'approve',
      () => (isApproval ? standarisasiTumpukan.approve(item.id) : standarisasiTumpukan.reject(item.id)),
      isApproval ? 'Gagal menyetujui standarisasi tumpukan' : 'Gagal menolak standarisasi tumpukan',
    );
    if (!ok) return false;

    notifyGlobal(
      isApproval
        ? 'Standarisasi disetujui. Notifikasi email dikirim ke BLC & Admin Distribusi.'
        : 'Standarisasi ditolak. Notifikasi email dikirim ke BLC & Admin Distribusi.',
      isApproval ? 'success' : 'info',
    );
    onChanged();
    return true;
  }, [runAction, onChanged]);

  const notifyEmail = useCallback(async (item: StandarisasiItem): Promise<boolean> => {
    setNotifyingId(item.id);
    try {
      await standarisasiTumpukan.notify(item.id);
      notifyGlobal('Notifikasi email dikirim ulang ke BLC & Admin Distribusi.', 'success');
      return true;
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal mengirim notifikasi email'));
      return false;
    } finally {
      setNotifyingId(null);
    }
  }, []);

  return { pending, notifyingId, create, update, remove, bulkRemove, setStatus, notifyEmail };
}
