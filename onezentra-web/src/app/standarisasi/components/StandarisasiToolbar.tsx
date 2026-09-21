'use client';

import SearchInput from '@/components/SearchInput';
import { DepoOption } from '../types';

const STATUS_FILTERS = [
  { key: 'pending', label: 'Pending', value: 'pending' },
  { key: 'approved', label: 'Approved', value: 'approved' },
  { key: 'rejected', label: 'Rejected', value: 'rejected' },
];

interface StandarisasiToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  kodeDepo: string;
  onKodeDepoChange: (value: string) => void;
  depoOptions: DepoOption[];
  showDepoFilter: boolean;
  total: number;
  selectedCount: number;
  canDelete: boolean;
  canCreate: boolean;
  onBulkDelete: () => void;
  onCreate: () => void;
}

export default function StandarisasiToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  kodeDepo,
  onKodeDepoChange,
  depoOptions,
  showDepoFilter,
  total,
  selectedCount,
  canDelete,
  canCreate,
  onBulkDelete,
  onCreate,
}: StandarisasiToolbarProps) {
  return (
    <div className="p-4 border-b border-gray-100">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Cari produk / BOS ID / barcode..."
            filters={STATUS_FILTERS}
            activeFilter={statusFilter}
            onFilterChange={onStatusFilterChange}
            resultCount={total}
            resultLabel="item"
          />
        </div>

        {showDepoFilter && (
          <div className="shrink-0">
            <label htmlFor="standarisasi-depo-filter" className="sr-only">Filter depo</label>
            <select
              id="standarisasi-depo-filter"
              value={kodeDepo}
              onChange={(e) => onKodeDepoChange(e.target.value)}
              className="select-field-sm border border-gray-200 bg-white text-gray-700"
            >
              <option value="">Semua depo</option>
              {depoOptions.map((option) => (
                <option key={option.kode_depo} value={option.kode_depo}>
                  {option.nama_depo || option.kode_depo}
                </option>
              ))}
            </select>
          </div>
        )}

        {canDelete && selectedCount > 0 && (
          <button type="button" onClick={onBulkDelete} className="btn-danger shrink-0">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Hapus ({selectedCount})
            </span>
          </button>
        )}

        {canCreate && (
          <button type="button" onClick={onCreate} className="btn-primary shrink-0">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
