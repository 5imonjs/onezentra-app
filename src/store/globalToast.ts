'use client';

import { create } from 'zustand';

interface ToastPayload {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface GlobalToastState {
  toasts: ToastPayload[];
  notify: (message: string, type?: ToastPayload['type']) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useGlobalToastStore = create<GlobalToastState>((set) => ({
  toasts: [],
  notify: (message, type = 'error') =>
    set((state) => ({
      toasts: [...state.toasts, { id: ++nextId, message, type }],
    })),
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function notifyGlobal(message: string, type: 'success' | 'error' | 'info' = 'error') {
  useGlobalToastStore.getState().notify(message, type);
}

export function notifyPermissionDenied(message?: string) {
  notifyGlobal(message || 'Anda tidak memiliki izin untuk melakukan aksi ini.');
}