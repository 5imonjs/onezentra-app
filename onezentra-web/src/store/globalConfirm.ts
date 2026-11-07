'use client';

import { create } from 'zustand';

export interface GlobalConfirmPayload {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface GlobalConfirmState {
  open: boolean;
  payload: GlobalConfirmPayload | null;
  resolve: ((confirmed: boolean) => void) | null;
  ask: (payload: GlobalConfirmPayload) => Promise<boolean>;
  answer: (confirmed: boolean) => void;
}

export const useGlobalConfirmStore = create<GlobalConfirmState>((set, get) => ({
  open: false,
  payload: null,
  resolve: null,
  ask: (payload) =>
    new Promise<boolean>((resolve) => {
      // Satu konfirmasi global dalam satu waktu; yang baru menggantikan yang lama.
      get().resolve?.(false);
      set({ open: true, payload, resolve });
    }),
  answer: (confirmed) => {
    const resolve = get().resolve;
    set({ open: false, payload: null, resolve: null });
    resolve?.(confirmed);
  },
}));

export function confirmGlobal(payload: GlobalConfirmPayload): Promise<boolean> {
  return useGlobalConfirmStore.getState().ask(payload);
}
