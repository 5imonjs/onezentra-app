'use client';

import React from 'react';
import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const variantStyles = {
    danger: {
      icon: (
        <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      bg: 'bg-red-100',
      btn: 'btn-danger',
    },
    warning: {
      icon: (
        <svg className="w-6 h-6 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
      bg: 'bg-amber-100',
      btn: 'btn-primary',
    },
    info: {
      icon: (
        <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      ),
      bg: 'bg-blue-100',
      btn: 'btn-primary',
    },
  };

  const style = variantStyles[variant];

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="flex flex-col items-center text-center py-2">
        <div className={`w-14 h-14 ${style.bg} rounded-2xl flex items-center justify-center mb-4`}>
          {style.icon}
        </div>
        <h3 id="confirm-title" className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p id="confirm-message" className="text-sm text-gray-500 max-w-sm">{message}</p>
      </div>
      <div className="flex items-center justify-center gap-3 mt-6">
        <button onClick={onClose} disabled={loading} className="btn-secondary min-w-[100px]">
          {cancelLabel}
        </button>
        <button onClick={onConfirm} disabled={loading} className={`${style.btn} min-w-[100px]`}>
          {loading ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Memproses...
            </span>
          ) : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
