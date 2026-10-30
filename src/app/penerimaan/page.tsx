'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import { receivingItems, npn, getErrorMessage, batches, depo } from '@/lib/api';
import ReceivingItemEditModal from '@/components/ReceivingItemEditModal';
import SearchInput from '@/components/SearchInput';
import { useAuthStore } from '@/store/auth';
import { conditionMeta } from '@/lib/condition';
import { formatDateId } from '@/lib/dates';
import { downloadBatchLabel, printBatchLabel, type BatchLabelData } from '@/lib/batchLabel';

/**
 * Aksi cetak label untuk satu item Inbound.
 *
 * Batch label lahir di tahap validasi SJ, tapi dicetak ulang justru paling
 * sering dibutuhkan di Inbound — label harus ditempel saat barang masuk dan
 * ditata di rak. Jadi halaman ini memakai generator PDF/Code39 yang sama
 * dengan validasi-sj supaya tidak ada dua format label yang berbeda.
 *
 * Item tanpa batch tidak punya label untuk dicetak, jadi tombol disembunyikan
 * (bukan disabled) — tidak ada aksi berguna yang bisa dilakukan operator.
 */
function LabelActions({ item, po, depo }: { item: ReceivingItem; po: string; depo: string }) {
  const batch = item.batch ?? item.verifiedBatch;
  if (!batch || !batch.barcode_label) return null;

  // Label sudah tercetak fisik tapi tidak berlaku (sesi validasi dibatalkan).
  // Mencetak ulang akan menempel label mati di rak — lebih baik terlihat
  // jelas tidak bisa dicetak daripada gagal diam-diam saat dipindai.
  if (batch.status === 'CANCELLED') {
    return (
      <span className="badge badge-warning whitespace-nowrap" title="Label tidak berlaku: sesi validasi dibatalkan">
        Label dibatalkan
      </span>
    );
  }

  const labelData: BatchLabelData = {
    batch_number: batch.batch_number,
    barcode_label: batch.barcode_label,
    kode_barang: item.kode_barang,
    nama_barang: item.nama_barang,
    actual_qty: item.actual_qty,
    satuan: item.satuan,
    expired_date: item.expired_date,
    condition: item.condition,
    nama_depo: depo === '-' ? null : depo,
    po_transporter: po === '-' ? null : po,
  };

  const labelName = batch.batch_number || item.kode_barang;

  // Cetak dari Inbound juga dicatat server (lintas device): badge
  // "Label tercetak" di validasi-sj membaca `batches.printed_at`.
  const markPrinted = () => {
    if (!batch.id) return;
    void batches.markPrinted(batch.id).catch(() => {
      // Gagal lapor server tidak menghalangi pencetakan label.
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={async () => {
          // Tandai tercetak hanya kalau cetak benar-benar jalan; kalau tidak,
          // badge/tombol akan bilang "tercetak" padahal label belum dicetak.
          const printed = await printBatchLabel(labelData);
          if (printed) markPrinted();
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-chip-primary hover:text-accent-text"
        title={`Cetak label ${labelName}`}
        aria-label={`Cetak label ${labelName}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0010.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" />
        </svg>
      </button>
      <button
        onClick={() => {
          downloadBatchLabel(labelData);
          markPrinted();
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-chip-primary hover:text-accent-text"
        title="Unduh PDF label"
        aria-label={`Unduh PDF label ${labelName}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      </button>
    </div>
  );
}

interface NpnProduct {
  id: number;
  BOSnetszProductId: string;
  SAPszUomId?: string;
  SAPdecUom?: string;
  decUomConversion1?: number;
  BOSnetdecUom?: number;
   szNickName?: string;
  szShortDescription?: string;
}

interface ReceivingItem {
  id: number;
  receiving_id?: number | null;
  source: string;
  kode_barang: string;
  nama_barang: string | null;
  actual_qty: number;
  qty_pcs: number | null;
  conversion_factor?: number | null;
  satuan: string | null;
  expired_date: string | null;
  tanggal_penerimaan: string | null;
  sumber_material: string | null;
  kode_depo: string | null;
  nama_depo: string | null;
  condition: string | null;
  created_at: string;
  /**
   * Batch label untuk item ini (dari validasi SJ). `null` = belum ada batch,
   * atau sesi validasi dibatalkan sehingga label dicabut. Bedakan keduanya
   * lewat `status`.
   */
  batch?: {
    id?: number;
    batch_number: string | null;
    barcode_label: string | null;
    status?: string | null;
  } | null;
  verifiedBatch?: {
    id?: number;
    batch_number: string | null;
    barcode_label: string | null;
    status?: string | null;
  } | null;
  receiving?: {
    id?: number;
    rencana_kirim?: {
      po_transporter?: string | null;
      driver_name?: string | null;
      nopol?: string | null;
    } | null;
  } | null;
}

interface ComboItem {
  kode_barang: string;
  nama_barang: string | null;
  expired_date: string | null;
}

interface ServerGroup {
  key: string;
  receiving_id: number | null;
  po: string | null;
  driver: string | null;
  nopol: string | null;
  depo: string | null;
  sumber: string | null;
  tanggal: string | null;
  created_at: string | null;
  total_crt: number;
  total_pcs: number;
  items: ReceivingItem[];
}

interface ReceivingGroup {
  key: string;
  receivingId: number | null;
  po: string;
  driver: string;
  nopol: string;
  depo: string;
  sumber: string;
  tanggal: string | null;
  items: (ReceivingItem & { resolvedConversionFactor: number | null })[];
  totalCrt: number;
  totalPcs: number;
}

interface Pagination {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
  from: number | null;
  to: number | null;
}

const num = (v: unknown): number => Number(v ?? 0);

const GROUPS_PER_PAGE = 20;

const conditionBadge = (condition?: string | null): string => {
  const cond = conditionMeta(condition);
  return `border ${cond.badge}`;
};

const conditionLabel = (condition?: string | null): string => {
  return conditionMeta(condition).label;
};

export default function PenerimaanPage() {
  const { hasPermission } = useAuthStore();
  const router = useRouter();
  const [rawGroups, setRawGroups] = useState<ServerGroup[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Filter depo hanya untuk user global (depot.view_all): staff_logistic,
  // admin_master, admin_planner. User ter-scope depo tidak perlu filter —
  // backend sudah membatasi ke deponya sendiri.
  const canFilterDepo = hasPermission('depot.view_all');
  const [kodeDepo, setKodeDepo] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ReceivingItem | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Pagination per group dari server: satu group (receiving / tanggal
      // manual) selalu utuh — tidak pernah terpotong halaman.
      const res = await receivingItems.groups({
        search: search.trim() || undefined,
        per_page: GROUPS_PER_PAGE,
        page,
        ...(kodeDepo ? { kode_depo: kodeDepo } : {}),
      });
      const { data, meta } = res.data;
      setRawGroups(data);
      setPagination({
        total: meta.total,
        per_page: meta.per_page,
        current_page: meta.current_page,
        last_page: meta.last_page,
        from: meta.from,
        to: meta.to,
      });
    } catch (e) {
      // Jangan biarkan error menyamar sebagai "belum ada data".
      setError(getErrorMessage(e, 'Gagal memuat data penerimaan.'));
    } finally {
      setLoading(false);
    }
  }, [search, page, kodeDepo]);

  useEffect(() => { load(); }, [load]);

  // Daftar depo tersumber dari master user; user global dengan depot.view_all
  // melihat seluruh depo. Gagal memuat cukup mematikan dropdown, bukan halaman.
  const loadDepots = useCallback(async () => {
    if (!canFilterDepo) return;
    try {
      const res = await depo.list();
      setDepots(res.data?.data ?? []);
    } catch (e) {
      console.error('[Depo]', e);
    }
  }, [canFilterDepo]);

  useEffect(() => { loadDepots(); }, [loadDepots]);

  const allItems = useMemo<ReceivingItem[]>(() => rawGroups.flatMap((g) => g.items), [rawGroups]);

  const combos = useMemo((): ComboItem[] => {
    const grouped = new Map<string, ComboItem>();
    for (const it of allItems) {
      const key = `${it.kode_barang}|${it.expired_date || ''}|${it.kode_depo || ''}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          kode_barang: it.kode_barang,
          nama_barang: it.nama_barang,
          expired_date: it.expired_date,
        });
      }
    }
    return Array.from(grouped.values());
  }, [allItems]);

  const [npnProducts, setNpnProducts] = useState<NpnProduct[]>([]);
  // Kode yang pernah diminta tidak dicari ulang — mencegah N+1 request
  // berulang setiap kali daftar berubah.
  const requestedKodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const uniqueKodes = [...new Set(allItems.map(i => i.kode_barang))]
      .filter((kode) => !requestedKodesRef.current.has(kode));
    if (uniqueKodes.length === 0) return;
    for (const kode of uniqueKodes) requestedKodesRef.current.add(kode);
    const loadNpn = async () => {
      try {
        const results = await Promise.all(
          uniqueKodes.map(kode => npn.searchProduct(kode).catch(() => ({ data: { data: [] } })))
        );
        const allProducts: NpnProduct[] = [];
        for (const res of results) {
          const data = res.data?.data ?? [];
          for (const p of data) {
            if (!allProducts.find(x => x.BOSnetszProductId === p.BOSnetszProductId)) {
              allProducts.push(p as NpnProduct);
            }
          }
        }
        setNpnProducts(prev => {
          const existing = new Set(prev.map(p => p.BOSnetszProductId));
          const newOnes = allProducts.filter(p => !existing.has(p.BOSnetszProductId));
          return [...prev, ...newOnes];
        });
      } catch {
        // ignore
      }
    };
    loadNpn();
  }, [allItems]);

  const conversionMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of npnProducts) {
      const kode = p.BOSnetszProductId;
      if (!kode) continue;
      const candidates = [p.decUomConversion1, p.BOSnetdecUom, p.SAPdecUom];
      for (const c of candidates) {
        if (c && !isNaN(Number(c))) {
          map.set(kode, Number(c));
          break;
        }
      }
    }
    return map;
  }, [npnProducts]);

  // Group datang utuh dari server (pagination per group); frontend hanya
  // menambahkan faktor konversi hasil resolusi NPN agar total selalu
  // konsisten dengan baris yang tampil.
  const groups = useMemo((): ReceivingGroup[] => {
    return rawGroups.map((g) => {
      const mappedItems = g.items.map((item) => ({
        ...item,
        resolvedConversionFactor: item.conversion_factor ?? conversionMap.get(item.kode_barang) ?? null,
      }));
      return {
        key: g.key,
        receivingId: g.receiving_id ?? null,
        po: g.po || '-',
        driver: g.driver || '-',
        nopol: g.nopol || '-',
        depo: g.depo || '-',
        sumber: g.sumber || '-',
        tanggal: g.tanggal,
        totalCrt: mappedItems.reduce((sum, it) => sum + num(it.actual_qty), 0),
        totalPcs: mappedItems.reduce((sum, it) => {
          const cf = it.resolvedConversionFactor;
          return sum + num(it.qty_pcs ?? (cf != null ? num(it.actual_qty) * cf : 0));
        }, 0),
        items: mappedItems,
      };
    });
  }, [rawGroups, conversionMap]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = (collapse: boolean) => {
    setCollapsed(collapse ? new Set(groups.map((g) => g.key)) : new Set());
  };

  const fmtDate = formatDateId;

  const fnum = (v: number) => v.toLocaleString('id-ID');

  // 8 kolom statis (aksi selalu ada), bukan bergantung permission edit.
  const colSpan = 8;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        {/* Header — reflektif, konsisten dengan pola desain modern */}
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <svg aria-hidden="true" className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Inbound</h1>
                <p className="mt-0.5 text-ink-fg-muted">Hasil penerimaan SJ — tiap batch menjadi sumber Batch Expired</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Batch
                <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{pagination?.total ?? groups.length}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
                Item
                <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{allItems.length}</span>
              </span>
            </div>
          </div>
        </header>

        {/* Worklist table */}
        <div className="bg-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={(v) => { setSearch(v); setPage(1); }}
                placeholder="Cari kode / nama barang / sumber material / PO..."
                resultCount={combos.length}
                resultLabel="batch"
              />
              {canFilterDepo && depots.length > 1 && (
                <div className="relative shrink-0">
                  <label htmlFor="penerimaan-depo" className="sr-only">Filter depo</label>
                  <select
                    id="penerimaan-depo"
                    value={kodeDepo}
                    onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
                    className="appearance-none py-2 pl-3 pr-9 border border-slate-300 rounded-xl bg-card text-gray-900 text-sm leading-tight shadow-sm cursor-pointer focus:outline-none focus:ring-primary-500 focus:border-primary-500 min-w-[160px]"
                  >
                    <option value="">Semua Depo</option>
                    {depots.map((d) => (
                      <option key={d.kode_depo} value={d.kode_depo}>{d.nama_depo} ({d.kode_depo})</option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasPermission('opname.view') && (
                <button onClick={() => router.push('/opname-expired')} title="Input dan import batch manual dikelola di Batch Expired" className="btn-primary">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    Batch Manual
                  </span>
                </button>
              )}
              {hasPermission('emails.view') && (
                <button onClick={() => router.push('/email-recipients?document_type=receiving')} className="btn-secondary">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                    Penerima Email
                  </span>
                </button>
              )}
              {groups.length > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleAll(false)} className="btn-secondary">Kembangkan</button>
                  <button onClick={() => toggleAll(true)} className="btn-secondary">Ciutkan</button>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                <span>{error}</span>
                <button type="button" onClick={load} className="font-semibold hover:underline whitespace-nowrap">Coba lagi</button>
              </div>
            </div>
          ) : loading && rawGroups.length === 0 ? (
            <>
              <div className="hidden overflow-x-auto p-5 md:block">
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={'skel-' + i} className="animate-pulse rounded-xl border border-gray-100 bg-card p-4">
                      <div className="h-4 w-1/3 rounded bg-gray-100" />
                      <div className="mt-3 h-3 w-2/3 rounded bg-gray-100" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 p-5 md:hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={'skel-m-' + i} className="animate-pulse rounded-2xl border border-slate-100 bg-card p-4 shadow-sm">
                    <div className="h-4 w-32 rounded bg-slate-100" />
                    <div className="mt-3 h-3 w-48 rounded bg-slate-100" />
                    <div className="mt-2 h-3 w-40 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            </>
          ) : rawGroups.length === 0 ? (
            <div role="status" className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <svg className="h-7 w-7 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              </div>
              {search.trim() ? (
                <>
                  <p className="text-slate-600 font-medium">Tidak ada hasil untuk &quot;{search}&quot;</p>
                  <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="mt-2 text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                </>
              ) : (
                <p className="text-slate-500 font-medium">Belum ada data penerimaan dari SJ.</p>
              )}
              {!search.trim() && rawGroups.length === 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Halaman ini hanya menampilkan item validasi SJ. Batch manual dikelola di{' '}
                  {hasPermission('opname.view') ? (
                    <button
                      type="button"
                      onClick={() => router.push('/opname-expired')}
                      className="font-semibold text-accent-text hover:underline"
                    >
                      Batch Expired
                    </button>
                  ) : (
                    'Batch Expired'
                  )}
                  .
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto overflow-y-auto max-h-[560px] md:block">
                <table className="w-full min-w-230 border-collapse">
                  <caption className="sr-only">Daftar penerimaan barang</caption>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-300 bg-popover">
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Kode Barang</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Nama Barang</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Qty CRT</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500" title="Nilai otomatis: QTY CRT × faktor konversi (master)">PCS (auto)</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Satuan</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Expired</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Kondisi</th>
                      {/* Aksi selalu ada: kolom ini memuat cetak label (bukan
                          hanya Edit), jadi tidak boleh hilang saat user tanpa
                          permission edit — header dan baris harus sinkron. */}
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {groups.map((group) => {
                      const isOpen = !collapsed.has(group.key);
                      return (
                        <FragmentGroup key={group.key} group={group} isOpen={isOpen} onToggle={() => toggleGroup(group.key)} colSpan={colSpan} fnum={fnum} fmtDate={fmtDate} hasEdit={hasPermission('penerimaan.edit')} onEdit={setEditing} num={num} />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cards - Mobile */}
              <div className="space-y-3 p-4 max-h-[560px] overflow-y-auto md:hidden">
                {groups.map((group) => {
                  const isOpen = !collapsed.has(group.key);
                  return (
                    <FragmentGroupMobile key={group.key} group={group} isOpen={isOpen} onToggle={() => toggleGroup(group.key)} fnum={fnum} fmtDate={fmtDate} hasEdit={hasPermission('penerimaan.edit')} onEdit={setEditing} num={num} />
                  );
                })}
              </div>
            </>
          )}

          {pagination && pagination.total > GROUPS_PER_PAGE && (
            <div className="border-t border-gray-100 bg-overlay-60 px-4 py-3.5 sm:px-5">
              <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.current_page <= 1} className="btn-secondary w-full text-sm disabled:opacity-50 sm:w-auto" aria-label="Halaman sebelumnya">
                  Sebelumnya
                </button>
                <span className="text-xs text-slate-500 sm:text-sm">Halaman <strong className="text-slate-800">{pagination.current_page}</strong> dari <strong className="text-slate-800">{pagination.last_page}</strong></span>
                <button onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))} disabled={pagination.current_page >= pagination.last_page} className="btn-secondary w-full text-sm disabled:opacity-50 sm:w-auto" aria-label="Halaman berikutnya">
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ReceivingItemEditModal
        open={editing !== null}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </DashboardLayout>
  );
}

function PencilIcon() {
  return (
    <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
  );
}

function FragmentGroup({ group, isOpen, onToggle, colSpan, fnum, fmtDate, hasEdit, onEdit, num }: {
  group: ReceivingGroup;
  isOpen: boolean;
  onToggle: () => void;
  colSpan: number;
  fnum: (v: number) => string;
  fmtDate: (v?: string | null) => string;
  hasEdit: boolean;
  onEdit: (item: ReceivingItem & { resolvedConversionFactor: number | null }) => void;
  num: (v: unknown) => number;
}) {
  return (
    <>
      <tr
        className="bg-overlay-70 hover:bg-slate-100/60 transition-colors cursor-pointer"
        onClick={onToggle}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <td colSpan={colSpan} className="px-5 py-3.5 whitespace-nowrap">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <svg className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              <span className="font-mono text-sm font-bold text-gray-800">{group.po}</span>
              {group.receivingId && (
                <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">#{group.receivingId}</span>
              )}
              <span className="hidden sm:inline text-xs text-gray-500">{group.driver}{group.nopol !== '-' ? ` · ${group.nopol}` : ''}</span>
              <span className="hidden lg:inline text-xs text-gray-500">{group.depo}</span>
              <span className="text-xs text-gray-400">{fmtDate(group.tanggal)}</span>
              <span className="hidden md:inline text-xs text-gray-400">{group.sumber}</span>
              <span className="text-xs text-gray-400">{group.items.length} item</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-semibold text-gray-600 tabular-nums">{fnum(group.totalCrt)} CRT</span>
              <span className="text-xs font-semibold text-gray-500 tabular-nums">{fnum(group.totalPcs)} PCS</span>
            </div>
          </div>
        </td>
      </tr>
       {isOpen && group.items.map((item, itemIndex) => {
         const cf = (item as ReceivingItem & { resolvedConversionFactor: number | null }).resolvedConversionFactor;
         return (
           <tr key={item.id} className={`transition-colors hover:bg-chip-primary/30 ${itemIndex % 2 === 0 ? 'bg-card' : 'bg-overlay-30'}`}>
             <td className="px-5 py-3 whitespace-nowrap"><span className="font-mono text-sm font-medium text-gray-800">{item.kode_barang}</span></td>
             <td className="px-5 py-3 min-w-60 max-w-85">
               <span className="block line-clamp-2 wrap-break-word text-sm text-gray-700" title={item.nama_barang || undefined}>{item.nama_barang || '-'}</span>
             </td>
             <td className="px-5 py-3 text-right text-sm font-medium tabular-nums text-gray-800">{num(item.actual_qty)}</td>
             <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500" title={cf != null ? `QTY CRT × faktor konversi ${cf}` : undefined}>
                 {item.qty_pcs != null ? num(item.qty_pcs) : (cf != null ? num(item.actual_qty * cf) : '-')}
               </td>
             <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-600">{item.satuan || '-'}</td>
             <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{fmtDate(item.expired_date)}</td>
              <td className="px-5 py-3 whitespace-nowrap">
                <span className={`badge ${conditionBadge(item.condition)}`}>{conditionLabel(item.condition)}</span>
              </td>
              <td className="px-5 py-3 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1">
                  <LabelActions item={item} po={group.po} depo={group.depo} />
                  {hasEdit && (
                    <button onClick={() => onEdit(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-chip-primary hover:text-accent-text" title="Edit penerimaan" aria-label="Edit penerimaan">
                      <PencilIcon />
                    </button>
                  )}
                </div>
              </td>
          </tr>
        );
      })}
    </>
  );
}

function FragmentGroupMobile({ group, isOpen, onToggle, fnum, fmtDate, hasEdit, onEdit, num }: {
  group: ReceivingGroup;
  isOpen: boolean;
  onToggle: () => void;
  fnum: (v: number) => string;
  fmtDate: (v?: string | null) => string;
  hasEdit: boolean;
  onEdit: (item: ReceivingItem & { resolvedConversionFactor: number | null }) => void;
  num: (v: unknown) => number;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors ${isOpen ? 'border-chip-primary-border' : 'border-slate-100'}`}>
      <button
        onClick={onToggle}
        tabIndex={0}
        aria-expanded={isOpen}
        className="flex w-full flex-col gap-2 px-4 py-3.5 text-left"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            <span className="truncate font-mono text-sm font-bold text-gray-800">{group.po}</span>
            {group.receivingId && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">#{group.receivingId}</span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-gray-800 tabular-nums">{fnum(group.totalCrt)} <span className="text-xs font-medium text-gray-400">CRT</span></p>
            <p className="text-xs font-semibold text-gray-500 tabular-nums">{fnum(group.totalPcs)} PCS</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-gray-500">
          <span>{group.driver}{group.nopol !== '-' ? ` · ${group.nopol}` : ''}</span>
          <span>{group.depo}</span>
          <span>{fmtDate(group.tanggal)}</span>
          <span>{group.sumber}</span>
          <span>{group.items.length} item</span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {group.items.map((item) => {
            const cf = (item as ReceivingItem & { resolvedConversionFactor: number | null }).resolvedConversionFactor;
            return (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-medium text-gray-800">{item.kode_barang}</p>
                    <p className="mt-0.5 line-clamp-2 wrap-break-word text-xs text-gray-600" title={item.nama_barang || undefined}>{item.nama_barang || '-'}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{item.satuan || '-'} · Exp {fmtDate(item.expired_date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-gray-800">{num(item.actual_qty)} <span className="text-[11px] font-medium text-gray-400">CRT</span></p>
                    <p className="text-xs tabular-nums text-gray-500">{item.qty_pcs != null ? num(item.qty_pcs) : (cf != null ? num(item.actual_qty * cf) : '-')} PCS</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className={`badge ${conditionBadge(item.condition)}`}>{conditionLabel(item.condition)}</span>
                  <div className="flex items-center gap-1">
                    <LabelActions item={item} po={group.po} depo={group.depo} />
                    {hasEdit && (
                      <button onClick={() => onEdit(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-chip-primary hover:text-accent-text" title="Edit penerimaan" aria-label="Edit penerimaan">
                        <PencilIcon />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}