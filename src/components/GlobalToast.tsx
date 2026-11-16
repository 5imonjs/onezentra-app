'use client';

import Toast from '@/components/Toast';
import { useGlobalToastStore } from '@/store/globalToast';

export default function GlobalToast() {
  const toasts = useGlobalToastStore((s) => s.toasts);
  const dismiss = useGlobalToastStore((s) => s.dismiss);

  // Toast terbaru di atas, sesuai pola Sonner/Carbon. Container sudah
  // memakai flex gap, jadi Toast tidak perlu posisi fixed sendiri.
  const ordered = [...toasts].reverse();

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Notifikasi"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {ordered.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          title={t.title}
          description={t.description}
          duration={t.duration}
          onClose={() => dismiss(t.id)}
        />
      ))}
    </div>
  );
}
