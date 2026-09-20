'use client';

import { useState } from 'react';

export interface StatusOption {
  value: string;
  label: string;
  color: string;
  bg: string;
}

const DEFAULT_STATUSES: StatusOption[] = [
  { value: 'DRAFT', label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  { value: 'SCHEDULED', label: 'Dijadwalkan', color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'CHECKED_IN', label: 'Checked In', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  { value: 'VERIFIED', label: 'Verified', color: 'text-purple-600', bg: 'bg-purple-100' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'text-orange-600', bg: 'bg-orange-100' },
  { value: 'COMPLETED', label: 'Completed', color: 'text-green-600', bg: 'bg-green-100' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-100' },
];

const defaultTransitions: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['VERIFIED', 'CANCELLED'],
  VERIFIED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

interface StatusDropdownProps {
  currentStatus: string;
  onStatusChange: (newStatus: string) => void;
  statuses?: StatusOption[];
  transitions?: Record<string, string[]>;
  renderAsBadge?: boolean;
}

export default function StatusDropdown({
  currentStatus,
  onStatusChange,
  statuses = DEFAULT_STATUSES,
  transitions = defaultTransitions,
  renderAsBadge = false,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const nextStatuses = transitions[currentStatus] || [];
  const current = statuses.find(s => s.value === currentStatus);

  const handleSelect = (status: string) => {
    if (nextStatuses.includes(status)) {
      onStatusChange(status);
      setIsOpen(false);
    }
  };

  return (
    <>
      {renderAsBadge ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label={`Status: ${current?.label || currentStatus}. Klik untuk ubah.`}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer hover:opacity-80 min-h-[32px] ${current?.bg || 'bg-gray-100'} ${current?.color || 'text-gray-600'}`}
        >
          {current?.label || currentStatus}
          <svg className="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label="Ubah status"
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-1 min-h-[32px]"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7l2-2m-2 2l2 2m-2-2h10" /></svg>
          Status
        </button>
      )}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setIsOpen(false)} role="dialog" aria-modal="true" aria-label="Ubah status">
          <div className="bg-white rounded-2xl shadow-xl w-56 p-2" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-3 py-2 mb-1">Ubah Status</h4>
            {statuses.map(s => {
              const isActive = currentStatus === s.value;
              const canChange = nextStatuses.includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => handleSelect(s.value)}
                  disabled={isActive || !canChange}
                  aria-current={isActive ? 'true' : undefined}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg transition-colors min-h-[40px] ${
                    isActive ? 'bg-primary-50 text-primary-700 font-semibold' : canChange ? 'text-gray-700 hover:bg-primary-50 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${s.bg}`} aria-hidden="true"></span>
                  {s.label}
                  {isActive && <span className="ml-auto text-xs font-bold" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}