'use client';

import React, { useEffect, useId } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  footer?: React.ReactNode;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

let openModalCount = 0;

export default function Modal({ open, onClose, title, subtitle, children, size = 'md', footer }: ModalProps) {
  const reactId = useId();
  const titleId = title ? `modal-title-${reactId}` : undefined;

  useEffect(() => {
    if (open) {
      openModalCount++;
      document.body.style.overflow = 'hidden';
    } else {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = '';
      }
    }
    return () => {
      if (open) {
        openModalCount = Math.max(0, openModalCount - 1);
        if (openModalCount === 0) {
          document.body.style.overflow = '';
        }
      }
    };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm animate-fade-in sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-slide-up sm:max-h-[90vh] sm:rounded-3xl ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-6">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="text-lg font-bold text-gray-900">{title}</h2>}
              {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Tutup dialog" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 bg-slate-50/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
