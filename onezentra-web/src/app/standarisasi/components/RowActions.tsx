'use client';

import type { ReactNode } from 'react';
import { StandarisasiItem } from '../types';

const ICON_BUTTON = 'min-h-[44px] min-w-[44px] p-1.5 text-gray-400 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed';

interface IconActionProps {
  label: string;
  hover: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function IconAction({ label, hover, disabled = false, onClick, children }: IconActionProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${ICON_BUTTON} ${hover}`} title={label} aria-label={label}>
      {children}
    </button>
  );
}

interface RowActionsProps {
  item: StandarisasiItem;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  notifying: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onNotify: () => void;
}

export default function RowActions({
  item,
  canEdit,
  canDelete,
  canApprove,
  notifying,
  onView,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onNotify,
}: RowActionsProps) {
  const isPending = item.status === 'pending';

  return (
    <div className="flex items-center justify-end gap-1">
      {isPending && canApprove && (
        <>
          <IconAction label="Setujui" hover="hover:text-emerald-600 hover:bg-emerald-50" onClick={onApprove}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </IconAction>
          <IconAction label="Tolak" hover="hover:text-red-600 hover:bg-red-50" onClick={onReject}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconAction>
        </>
      )}
      <IconAction
        label="Kirim ulang notifikasi email ke BLC & Admin Distribusi"
        hover="hover:text-sky-600 hover:bg-sky-50"
        disabled={notifying}
        onClick={onNotify}
      >
        {notifying ? (
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-3.622 2.707-5.225V6.741c0-1.602-1.336-2.994-2.907-3.227A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 3 5.14 3 6.741v6.018z" />
          </svg>
        )}
      </IconAction>
      <IconAction label="Lihat detail" hover="hover:text-blue-600 hover:bg-blue-50" onClick={onView}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </IconAction>
      {canEdit && (
        <IconAction label="Ubah" hover="hover:text-amber-600 hover:bg-amber-50" onClick={onEdit}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </IconAction>
      )}
      {canDelete && (
        <IconAction label="Hapus" hover="hover:text-red-600 hover:bg-red-50" onClick={onDelete}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </IconAction>
      )}
    </div>
  );
}
