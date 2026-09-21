'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage, standarisasiTumpukan } from '@/lib/api';
import { NpnProduct, productLabel } from '../types';

const SEARCH_DEBOUNCE_MS = 300;

interface NpnProductPickerProps {
  selected: NpnProduct | null;
  onSelect: (product: NpnProduct) => void;
  onClear: () => void;
}

export default function NpnProductPicker({ selected, onSelect, onClear }: NpnProductPickerProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<NpnProduct[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const runSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length === 0) {
      requestIdRef.current += 1;
      setResults([]);
      setShowDropdown(false);
      setError('');
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setLoading(true);
      setError('');
      try {
        const res = await standarisasiTumpukan.searchProduct(query.trim());
        if (requestId !== requestIdRef.current) return;
        setResults((res.data.data ?? []) as NpnProduct[]);
        setShowDropdown(true);
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setShowDropdown(true);
        setError(getErrorMessage(e, 'Gagal mencari produk'));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const reset = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setSearch('');
    setResults([]);
    setShowDropdown(false);
    setError('');
    setLoading(false);
  };

  const pick = (product: NpnProduct) => {
    reset();
    onSelect(product);
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-sm font-medium text-gray-900 truncate">{productLabel(selected)}</p>
          <p className="text-xs font-mono text-gray-400">{selected.BOSnetszProductId || '-'}</p>
        </div>
        <button
          type="button"
          onClick={() => { reset(); onClear(); }}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
          aria-label="Ganti produk"
          title="Ganti produk"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); runSearch(e.target.value); }}
        onFocus={() => { if (search.trim()) setShowDropdown(true); }}
        placeholder="Ketik nama produk / BOS ID / barcode..."
        className="input-field text-sm"
        aria-label="Cari produk"
        aria-expanded={showDropdown}
        aria-controls="standarisasi-product-options"
        role="combobox"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2" role="status" aria-label="Mencari produk">
          <svg className="animate-spin w-4 h-4 text-primary-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}
      {showDropdown && (
        <div id="standarisasi-product-options" role="listbox" aria-label="Hasil pencarian produk" className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {error && <p className="px-3 py-2.5 text-sm text-red-600" role="alert">{error}</p>}
          {!error && results.length === 0 && !loading && (
            <p className="px-3 py-2.5 text-sm text-gray-500">Produk tidak ditemukan.</p>
          )}
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(product)}
              className="w-full px-3 py-2.5 text-left hover:bg-primary-50 transition-colors border-b border-gray-100 last:border-0 min-h-[44px]"
            >
              <p className="text-sm text-gray-900 truncate">{productLabel(product)}</p>
              <span className="text-xs font-mono text-gray-400">
                {product.BOSnetszProductId || '-'} · {product.SAPszProductId || '-'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
