'use client';

import { useMemo, useRef, useEffect, useCallback } from 'react';
import StandarisasiTableRow from './StandarisasiTableRow';
import { StandarisasiItem, StandarisasiRowHandlers } from '../types';

const SKELETON_ROWS = 5;

interface StandarisasiTableProps {
  items: StandarisasiItem[];
  loading: boolean;
  page: number;
  lastPage: number;
  startIndex: number;
  selectedIds: number[];
  showDepot: boolean;
  canSelect: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  notifyingId: number | null;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onPageChange: (page: number) => void;
  handlers: StandarisasiRowHandlers;
}

export default function StandarisasiTable({
  items,
  loading,
  page,
  lastPage,
  startIndex,
  selectedIds,
  showDepot,
  canSelect,
  canEdit,
  canDelete,
  canApprove,
  notifyingId,
  onToggleSelect,
  onToggleSelectAll,
  onPageChange,
  handlers,
}: StandarisasiTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const columnCount = useMemo(
    () => 10 + (canSelect ? 1 : 0) + (showDepot ? 1 : 0),
    [canSelect, showDepot],
  );

  const isSelected = useCallback((id: number) => selectedIds.includes(id), [selectedIds]);

  return (
    <>
      <div className="overflow-x-auto" aria-busy={loading}>
        <table className="w-full border-collapse">
          <caption className="sr-only">Daftar standarisasi tumpukan</caption>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              {canSelect && (
                <th scope="col" className="table-header w-10">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    aria-label="Pilih semua baris di halaman ini"
                  />
                </th>
              )}
              <th scope="col" className="table-header w-12">No</th>
              <th scope="col" className="table-header">BOS ID</th>
              <th scope="col" className="table-header">Produk</th>
              <th scope="col" className="table-header">Barcode</th>
              <th scope="col" className="table-header text-center">Tier</th>
              <th scope="col" className="table-header text-center">Tinggi</th>
              <th scope="col" className="table-header text-center">Total</th>
              <th scope="col" className="table-header">Status</th>
              {showDepot && <th scope="col" className="table-header">Depo</th>}
              <th scope="col" className="table-header">Request By</th>
              <th scope="col" className="table-header text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading &&
              Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                <tr key={`skeleton-${index}`}>
                  {canSelect && <td className="table-cell"><div className="h-4 w-4 bg-slate-100 rounded animate-pulse" /></td>}
                  <td className="table-cell"><div className="h-4 w-8 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                  <td className="table-cell"><div className="h-4 w-28 bg-slate-100 rounded animate-pulse" /></td>
                  <td className="table-cell"><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></td>
                  <td className="table-cell"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                  <td className="table-cell"><div className="h-4 w-8 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                  <td className="table-cell"><div className="h-4 w-8 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                  <td className="table-cell"><div className="h-5 w-10 bg-slate-100 rounded animate-pulse mx-auto" /></td>
                  <td className="table-cell"><div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" /></td>
                  {showDepot && <td className="table-cell"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>}
                  <td className="table-cell"><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></td>
                  <td className="table-cell"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                </tr>
              ))}

            {!loading &&
              items.map((item, index) => (
                <StandarisasiTableRow
                  key={item.id}
                  item={item}
                  rowNumber={startIndex + index + 1}
                  selected={isSelected(item.id)}
                  showDepot={showDepot}
                  canSelect={canSelect}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canApprove={canApprove}
                  notifying={notifyingId === item.id}
                  onToggleSelect={onToggleSelect}
                  handlers={handlers}
                />
              ))}

            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="table-cell text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L2.25 12l4.179 2.25m0 0l5.571 3 5.571-3m-11.142 0L2.25 17.25 12 22.5l9.75-5.25-4.179-2.25" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-500 font-medium" role="status">Tidak ada data standarisasi</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 tabular-nums">Halaman {page} dari {lastPage}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Halaman sebelumnya"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Sebelumnya
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage || loading}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Halaman berikutnya"
          >
            <span className="flex items-center gap-2">
              Selanjutnya
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
