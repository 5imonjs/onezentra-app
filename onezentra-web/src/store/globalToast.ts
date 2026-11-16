'use client';

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Judul pendek. Dipakai bila pesan butuh konteks tambahan. */
  title?: string;
  /** Baris kedua yang lebih ringan di bawah pesan utama. */
  description?: string;
  /** Durasi kustom (ms). Tanpa ini tiap tipe punya durasi sendiri. */
  duration?: number;
}

export interface ToastPayload extends ToastOptions {
  id: number;
  message: string;
  type: ToastType;
}

interface GlobalToastState {
  toasts: ToastPayload[];
  notify: (message: string, type?: ToastType, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

/** Maksimal toast yang terlihat sekaligus — sisanya dibuang dari antrean. */
const MAX_VISIBLE_TOASTS = 5;

export const useGlobalToastStore = create<GlobalToastState>((set) => ({
  toasts: [],
  notify: (message, type = 'error', options = {}) =>
    set((state) => {
      // Dedupe: beberapa request paralel bisa gagal dengan pesan identik
      // (mis. 403 pada dua endpoint sekaligus) — satu toast sudah cukup.
      // Selama toast identik masih tampil, pesan berikutnya diabaikan.
      if (state.toasts.some((t) => t.message === message && t.type === type && t.title === options.title)) {
        return state;
      }

      const next: ToastPayload = { id: ++nextId, message, type, ...options };

      // Jangan biarkan wall of notification: yang paling lama dibuang saat
      // antrean melebihi batas. Toast baru selalu menang.
      return { toasts: [...state.toasts, next].slice(-MAX_VISIBLE_TOASTS) };
    }),
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function notifyGlobal(
  message: string,
  type: ToastType = 'error',
  options?: ToastOptions,
) {
  useGlobalToastStore.getState().notify(message, type, options);
}

export function notifyPermissionDenied(message?: string) {
  notifyGlobal(message || 'Anda tidak memiliki izin untuk melakukan aksi ini.');
}
