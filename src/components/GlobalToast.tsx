'use client';

import Toast from '@/components/Toast';
import { useGlobalToastStore } from '@/store/globalToast';

export default function GlobalToast() {
  const toasts = useGlobalToastStore((s) => s.toasts);
  const dismiss = useGlobalToastStore((s) => s.dismiss);

  return (
    <>
      {toasts.map((t, i) => (
        <Toast key={t.id} message={t.message} type={t.type} stackIndex={i} onClose={() => dismiss(t.id)} />
      ))}
    </>
  );
}