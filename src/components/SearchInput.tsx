'use client';

import { useState, useRef, useEffect } from 'react';

export interface SearchFilter {
  key: string;
  label: string;
  value: string;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  filters?: SearchFilter[];
  activeFilter?: string;
  onFilterChange?: (filterKey: string) => void;
  resultCount?: number;
  resultLabel?: string;
  totalCount?: number;
  currentFrom?: number;
  currentTo?: number;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Cari...',
  filters = [],
  activeFilter = '',
  onFilterChange,
  resultCount,
  resultLabel = 'item',
  totalCount,
  currentFrom,
  currentTo,
}: SearchInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeFilterObj = filters.find((f) => f.key === activeFilter);

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1 max-w-md" ref={dropdownRef}>
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        {activeFilter && (
          <span className="absolute left-10 top-1/2 -translate-y-1/2 text-xs font-medium text-accent-text bg-chip-primary px-2 py-0.5 rounded-md border border-chip-primary-border">
            {activeFilterObj?.label || activeFilter}
          </span>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => filters.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          aria-label={placeholder || 'Cari'}
          aria-expanded={showDropdown && filters.length > 0}
          role={filters.length > 0 ? 'combobox' : undefined}
          aria-haspopup={filters.length > 0 ? 'listbox' : undefined}
          className={`input-field pl-10 ${activeFilter && value ? 'pl-28' : activeFilter ? 'pl-24' : ''}`}
        />
        {showDropdown && filters.length > 0 && (
          <div role="listbox" aria-label="Filter pencarian" className="absolute top-full left-0 mt-1 w-56 bg-card rounded-xl shadow-lg border border-border py-1 z-50">
            <button
              role="option"
              aria-selected={!activeFilter}
              onClick={() => {
                onFilterChange?.('');
                setShowDropdown(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-popover transition-colors flex items-center gap-2 min-h-10 ${
                !activeFilter ? 'text-accent-text bg-chip-primary' : 'text-foreground'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              Semua
            </button>
            {filters.map((filter) => (
              <button
                key={filter.key}
                role="option"
                aria-selected={activeFilter === filter.key}
                onClick={() => {
                  onFilterChange?.(filter.key);
                  setShowDropdown(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-popover transition-colors flex items-center gap-2 min-h-10 ${
                  activeFilter === filter.key ? 'text-accent-text bg-chip-primary' : 'text-foreground'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  filter.key === 'A' ? 'bg-emerald-500' :
                  filter.key === 'DEL' ? 'bg-yellow-500' :
                  filter.key === 'EXISTING' ? 'bg-blue-500' :
                  filter.key === 'active' ? 'bg-emerald-500' :
                  filter.key === 'inactive' ? 'bg-yellow-500' :
                  filter.key === 'approved' ? 'bg-emerald-500' :
                  filter.key === 'rejected' ? 'bg-red-500' :
                  filter.key === 'pending' ? 'bg-yellow-500' :
                  filter.key === 'completed' ? 'bg-emerald-500' :
                  filter.key === 'cancelled' ? 'bg-red-500' :
                  'bg-gray-400'
                }`} />
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {resultCount !== undefined && (
        <div className="text-sm text-muted-foreground">
          {totalCount !== undefined && currentFrom !== undefined && currentTo !== undefined
            ? `Menampilkan ${currentFrom}–${currentTo} dari ${totalCount} ${resultLabel}`
            : `${resultCount} ${resultLabel}`
          }
        </div>
      )}
    </div>
  );
}
