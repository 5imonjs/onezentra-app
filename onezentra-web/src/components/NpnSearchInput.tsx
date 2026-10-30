'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage, npn } from '@/lib/api';
import { notifyGlobal } from '@/store/globalToast';

/**
 * Produk master NPN sebagaimana dikembalikan endpoint `/npn/search-product`.
 * Kolom utama untuk pemakaian UI: `BOSnetszProductId` (kode barang),
 * `SAPszUomId` (satuan), `szNickName`/`szNickNameNew`/`szShortDescription`
 * (nama), dan `umur` (standar umur produk bila tersedia).
 */
export interface NpnProduct {
  id: number;
  BOSnetszProductId: string;
  SAPszProductId: string;
  SAPszUomId: string;
  SAPdecUom: number | null;
  decVolume: number | null;
  szNickName: string;
  szNickNameNew: string;
  szShortDescription: string;
  umur?: number | null;
}

/** Axios membatalkan dengan `code: 'ERR_CANCELED'`, AbortController native dengan `name: 'AbortError'`. */
function isCanceledError(e: unknown): boolean {
  const err = e as { code?: string; name?: string } | null;
  return err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';
}

const SEARCH_PAGE_SIZE = 500;

/**
 * Combobox pencarian barang NPN — pola bersama untuk memilih produk dari
 * master (Rencana Kirim, Validasi SJ barang luar rencana, dst.).
 *
 * Ketikan di-debounce 300ms ke `/npn/search-product`, hasilnya paginasi
 * "Menampilkan X dari Y" + tombol muat lanjut, dengan navigasi keyboard
 * (panah/Enter/Escape) dan empty-state yang terlihat. Begitu produk dipilih
 * input terkunci menampilkan nama barang; buka kunci lewat tombol silang.
 */
export default function NpnSearchInput({
  namaValue,
  onSelect,
  onClear,
  onTypingChange,
  inputId,
  takenCodes = [],
}: {
  namaValue: string;
  onSelect: (product: NpnProduct) => void;
  onClear: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  inputId?: string;
  /** Kode barang yang sudah dipakai baris lain; dipakai untuk menandai opsi. */
  takenCodes?: string[];
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<NpnProduct[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  /** Total dari server — sumber indikator "Menampilkan X dari Y". */
  const [total, setTotal] = useState(0);
  /** Kata kunci terakhir yang SELESAI dicari; null = belum pernah mencari. */
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const isLocked = !!namaValue;
  // One of these is rendered per item row, so the listbox ids have to be
  // scoped to the row or every row would share one combobox target.
  const listboxId = `npn-search-${inputId ?? 'standalone'}`;
  const takenSet = useMemo(
    () => new Set(takenCodes.filter((c) => c.trim().length > 0)),
    [takenCodes],
  );
  /** Baris ini sendiri tidak boleh menandai pilihannya sebagai bentrok. */
  const isTakenElsewhere = useCallback(
    (code?: string | null) => !!code && takenSet.has(code),
    [takenSet],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  /** Pencarian in-flight — dibatalkan begitu ketikan baru datang (anti-balapan respons). */
  const abortRef = useRef<AbortController | null>(null);
  const onTypingChangeRef = useRef(onTypingChange);

  useEffect(() => {
    onTypingChangeRef.current = onTypingChange;
  });

  useEffect(() => () => onTypingChangeRef.current?.(false), []);

  // The debounce timer survives unmount otherwise: typing and then closing the
  // modal within 300ms would still fire the request and setState on a dead
  // component. Request yang masih terbang ikut dibatalkan agar tidak
  // membuang-buang jaringan (dan menjaga guard `abortRef` konsisten).
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doSearch = useCallback((raw: string) => {
    const query = raw.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Batalkan pencarian yang masih in-flight: respons lama tidak boleh
    // menimpa hasil kata kunci terbaru (balapan respons jaringan).
    abortRef.current?.abort();

    if (query.length < 1) {
      setResults([]);
      setTotal(0);
      setSearchedQuery(null);
      setActiveIndex(-1);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await npn.searchProduct(query, {
          limit: SEARCH_PAGE_SIZE,
          offset: 0,
          signal: controller.signal,
        });
        // Guard balapan: request ini sudah basi bila ada ketikan baru
        // setelahnya. Abort di atas sudah membatalkannya; penjaga ini menutup
        // jendela kecil ketika respons sempat tiba duluan lalu baru dibatalkan.
        if (abortRef.current !== controller) return;
        const payload = res.data ?? {};
        const found: NpnProduct[] = payload.data ?? [];
        setResults(found);
        setTotal(typeof payload.total === 'number' ? payload.total : found.length);
        setSearchedQuery(query);
        // Dropdown tetap dibuka walau 0 hasil supaya empty-state tampil —
        // sebelumnya hasil kosong = layar diam tanpa penjelasan sama sekali.
        setShowDropdown(true);
        // Hasil pencarian bisa jadi seluruhnya sudah terpakai; jangan sampai
        // kursor mendarat di opsi yang tidak bisa dipilih.
        setActiveIndex(found.findIndex((p: NpnProduct) => !isTakenElsewhere(p.BOSnetszProductId)));
      } catch (e) {
        if (isCanceledError(e)) return;
        notifyGlobal(getErrorMessage(e, 'Gagal memuat produk NPN.'), 'error');
        // Hasil lama jangan terus tampil seolah inilah hasil ketikan yang
        // baru saja gagal dimuat.
        if (abortRef.current === controller) {
          setResults([]);
          setTotal(0);
          setSearchedQuery(null);
          setActiveIndex(-1);
          setShowDropdown(false);
        }
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, 300);
  }, [isTakenElsewhere]);

  /**
   * Tarik halaman BERIKUTNYA untuk kata kunci yang sama. `SEARCH_PAGE_SIZE`
   * hanya ukuran halaman — indikator "Menampilkan X dari Y" memakai `total`
   * dari server sehingga sisa data tetap terlihat dan terjangkau.
   */
  const handleLoadMore = async () => {
    const query = searchedQuery;
    if (!query || loading || loadingMore) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingMore(true);
    try {
      const res = await npn.searchProduct(query, {
        limit: SEARCH_PAGE_SIZE,
        offset: results.length,
        signal: controller.signal,
      });
      if (abortRef.current !== controller) return;
      const payload = res.data ?? {};
      const next: NpnProduct[] = payload.data ?? [];
      setResults((prev) => [...prev, ...next]);
      setTotal(typeof payload.total === 'number' ? payload.total : results.length + next.length);
    } catch (e) {
      if (isCanceledError(e)) return;
      notifyGlobal(getErrorMessage(e, 'Gagal memuat produk NPN.'), 'error');
    } finally {
      if (abortRef.current === controller) setLoadingMore(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setActiveIndex(-1);
    doSearch(value);
    onTypingChange?.(value.trim().length > 0);
  };

  /** Melompat ke indeks terpilih berikutnya yang masih boleh dipakai. */
  const stepActiveIndex = useCallback(
    (from: number, delta: 1 | -1): number => {
      if (results.length === 0) return -1;
      let next = from;
      // Berjalan melewati opsi yang sudah terpakai, dibatasi agar tidak loop
      // tak terbatas saat seluruh hasil sudah terpakai.
      for (let step = 0; step < results.length; step++) {
        next += delta;
        if (next < 0 || next >= results.length) return -1;
        if (isTakenElsewhere(results[next].BOSnetszProductId)) continue;
        return next;
      }
      return -1;
    },
    [results, isTakenElsewhere],
  );

  const handleSelectIndex = (index: number) => {
    const product = results[index];
    if (!product) return;
    // Penjaga terakhir: UI sudah menonaktifkan opsinya, tapi ini menutup jalur
    // programatik (mis. restored state dari draft) yang tidak lewat klik.
    if (isTakenElsewhere(product.BOSnetszProductId)) return;
    setSearch('');
    // Hasil pencarian dibersihkan sekalian: kalau tidak, empty-state/indikator
    // kata kunci lama bisa muncul lagi saat input dibuka ulang.
    abortRef.current?.abort();
    setResults([]);
    setTotal(0);
    setSearchedQuery(null);
    setShowDropdown(false);
    setActiveIndex(-1);
    onTypingChange?.(false);
    onSelect(product);
  };

  const handleUnlock = () => {
    setSearch('');
    abortRef.current?.abort();
    setResults([]);
    setTotal(0);
    setSearchedQuery(null);
    setShowDropdown(false);
    setActiveIndex(-1);
    onClear();
    onTypingChange?.(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Dropdown terbuka kalau ada hasil, ATAU ketika pencarian sudah selesai tanpa
  // hasil (empty-state) — syarat yang sama dipakai focus & ArrowDown.
  const showEmptyState = searchedQuery !== null && !loading && results.length === 0;
  const dropdownOpen = showDropdown && (results.length > 0 || showEmptyState);

  if (isLocked) {
    return (
      <div className="flex items-center gap-2">
        <div
          title={namaValue}
          className="w-full min-w-0 px-3 py-2.5 text-sm font-semibold leading-snug border border-slate-300 rounded-xl bg-popover text-gray-900 cursor-default wrap-break-word"
        >
          {namaValue}
        </div>
        <button
          onClick={handleUnlock}
          aria-label="Ganti barang"
          className="shrink-0 h-10 w-10 inline-flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl transition-colors"
          title="Ganti barang"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={dropdownOpen}
          aria-controls={`${listboxId}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          value={search}
          onChange={handleSearchChange}
          onFocus={() => { if (results.length > 0 || showEmptyState) setShowDropdown(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length > 0 || showEmptyState) { setShowDropdown(true); setActiveIndex(i => stepActiveIndex(i, 1)); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => stepActiveIndex(i, -1)); }
            else if (e.key === 'Enter') { if (showDropdown && activeIndex >= 0 && results.length > 0) { e.preventDefault(); handleSelectIndex(activeIndex); } }
            else if (e.key === 'Escape' && showDropdown) { e.stopPropagation(); setShowDropdown(false); setActiveIndex(-1); }
          }}
          placeholder="Ketik nama barang..."
          className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-card text-gray-900 transition-all focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm pr-9"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <svg className="animate-spin w-3.5 h-3.5 text-accent-text" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
      </div>

      {dropdownOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-gray-300 rounded-xl shadow-lg overflow-hidden">
          {results.length > 0 && (
            <ul id={`${listboxId}-listbox`} role="listbox" aria-label="Hasil pencarian barang NPN" className="max-h-60 overflow-auto">
              {results.map((product, i) => {
                const taken = isTakenElsewhere(product.BOSnetszProductId);
                // Nama utama memakai nickname lama (identitas yang dipakai
                // gudang), lalu short description / nickname baru sebagai
                // cadangan. Nickname baru tetap ditampilkan terpisah supaya
                // produk yang sudah migrasi nama tidak "hilang" dari picker.
                const primaryName =
                  product.szNickName || product.szShortDescription || product.szNickNameNew || '-';
                const secondaryNames = [product.szNickNameNew, product.szShortDescription]
                  .filter((name, index, all): name is string =>
                    !!name && name !== primaryName && all.indexOf(name) === index
                  );
                return (
                  <li key={product.id} role="option" id={`${listboxId}-option-${i}`} aria-selected={i === activeIndex} aria-disabled={taken || undefined}>
                    <button
                      type="button"
                      onClick={() => handleSelectIndex(i)}
                      disabled={taken}
                      className={`w-full px-3 py-2.5 text-left transition-colors border-b border-gray-300 last:border-0 ${
                        taken ? 'opacity-45 cursor-not-allowed' : i === activeIndex
                          ? 'bg-row-active text-row-active-text'
                          : 'hover:bg-muted text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-row-active-icon flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-row-active-text">{product.BOSnetszProductId?.charAt(0) || '?'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm truncate"
                            title={[primaryName, ...secondaryNames].join(' • ')}
                          >
                            {primaryName}
                          </p>
                          <div className="flex min-w-0 items-center gap-2 text-xs opacity-70">
                            <span className="shrink-0 font-mono">{product.BOSnetszProductId}</span>
                            {secondaryNames.map((name, nameIndex) => (
                              <span key={`${name}-${nameIndex}`} className="truncate">• {name}</span>
                            ))}
                          </div>
                        </div>
                        {taken && (
                          <span className="shrink-0 rounded-full bg-popover border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                            Sudah dipakai
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {showEmptyState && (
            <p className="px-4 py-3 text-center text-sm text-gray-500">
              Tidak ada barang yang cocok dengan “{searchedQuery}”
            </p>
          )}

          {results.length > 0 && total > results.length && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-3 py-2">
              <span className="text-xs text-gray-500">
                Menampilkan {results.length} dari {total} barang
              </span>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
