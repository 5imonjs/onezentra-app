'use client';

import ConfirmDialog from '@/components/ConfirmDialog';
import { useGlobalConfirmStore } from '@/store/globalConfirm';

export default function GlobalConfirm() {
  const { open, payload, answer } = useGlobalConfirmStore();

  if (!payload) return null;

  return (
    <ConfirmDialog
      open={open}
      onClose={() => answer(false)}
      onConfirm={() => answer(true)}
      title={payload.title}
      message={payload.message}
      confirmLabel={payload.confirmLabel ?? 'Konfirmasi'}
      cancelLabel={payload.cancelLabel ?? 'Batal'}
      variant={payload.variant ?? 'danger'}
    />
  );
}
