'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ToastType } from '@/store/globalToast';

interface ToastProps {
  message: string;
  type?: ToastType;
  title?: string;
  description?: string;
  duration?: number;
  onClose: () => void;
}

/**
 * Durasi mengikuti urgensi: konfirmasi cepat hilang, error diberi waktu
 * lebih lama untuk dibaca (panduan Carbon/HPE: 3–6 detik).
 */
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3200,
  info: 4500,
  error: 6000,
};

const VARIANTS: Record<ToastType, {
  label: string;
  icon: ReactNode;
  iconColor: string;
  accent: string;
}> = {
  success: {
    label: 'Berhasil',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    iconColor: 'text-emerald-400',
    accent: 'bg-emerald-500',
  },
  error: {
    label: 'Gagal',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    ),
    iconColor: 'text-red-400',
    accent: 'bg-red-500',
  },
  info: {
    label: 'Informasi',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    ),
    iconColor: 'text-blue-400',
    accent: 'bg-blue-500',
  },
};

export default function Toast({
  message,
  type = 'success',
  title,
  description,
  duration,
  onClose,
}: ToastProps) {
  const variant = VARIANTS[type];
  const total = duration ?? DEFAULT_DURATIONS[type];

  const [phase, setPhase] = useState<'enter' | 'shown' | 'leave'>('enter');
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(1);

  const remainingRef = useRef(total);
  const leavingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPhase('shown'));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const finish = useCallback(() => {
    onCloseRef.current();
  }, []);

  const closeAnimated = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setPhase('leave');
    closeTimerRef.current = setTimeout(finish, 220);
  }, [finish]);

  // Hitung mundur pakai interval kecil supaya progress bar dan timer bisa
  // dijeda bersama saat hover/focus (panduan aksesibilitas WCAG 2.2.1).
  useEffect(() => {
    if (paused || leavingRef.current) return;

    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      remainingRef.current -= now - last;
      last = now;

      setProgress(Math.max(0, remainingRef.current / total));

      if (remainingRef.current <= 0) {
        clearInterval(timer);
        closeAnimated();
      }
    }, 50);

    return () => clearInterval(timer);
  }, [paused, total, closeAnimated]);

  const phaseClass = phase === 'shown'
    ? 'translate-x-0 scale-100 opacity-100'
    : 'translate-x-6 scale-95 opacity-0';

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={`pointer-events-auto relative w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 text-white shadow-[0_18px_45px_-18px_rgba(0,0,0,0.75)] ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.21,1.02,0.73,1)] ${phaseClass}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${variant.accent}`} />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <span aria-hidden="true" className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 ${variant.iconColor}`}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {variant.icon}
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{title ?? variant.label}</p>
          {/* `whitespace-pre-line` dipertahankan: getErrorMessage() merakit
              daftar baris import dengan "\n" yang harus tetap terbaca. */}
          <span className="mt-0.5 block text-sm leading-snug text-white whitespace-pre-line">{message}</span>
          {description && (
            <p className="mt-1 text-xs leading-snug text-white/60">{description}</p>
          )}
        </div>

        <button
          type="button"
          onClick={closeAnimated}
          aria-label="Tutup notifikasi"
          className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div aria-hidden="true" data-toast-progress className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
        <div
          className={`h-full origin-left transition-transform duration-75 ease-linear ${variant.accent}`}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}
