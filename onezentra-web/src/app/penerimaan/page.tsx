'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import { receivingItems, npn, getErrorMessage } from '@/lib/api';
import ReceivingItemEditModal from '@/components/ReceivingItemEditModal';
import ManualBatchManager from '@/components/ManualBatchManager';
import SearchInput from '@/components/SearchInput';
import { useAuthStore } from '@/store/auth';
import { conditionMeta } from '@/lib/condition';

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
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

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

  const fmtDate = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const fnum = (v: number) => v.toLocaleString('id-ID');

  const colSpan = hasPermission('penerimaan.edit') ? 8 : 7;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-slide-up">
        {/* Header — tenang, konsisten dengan pola desain receiving */}
        <header className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <svg aria-hidden="true" className="w-5 h-5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Penerimaan</h1>
              <p className="text-slate-400 text-sm mt-0.5">Hasil penerimaan SJ — tiap batch menjadi sumber Opname Expired</p>
            </div>
          </div>
        </header>

        {/* Worklist table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Cari kode / nama barang / sumber material / PO..."
              resultCount={combos.length}
              resultLabel="batch"
            />
            <div className="flex items-center gap-2">
              {hasPermission('penerimaan.create') && (
                <ManualBatchManager onChanged={load} buttonClassName="btn-primary" buttonLabel="+ Batch Manual" />
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
            <div className="p-6 text-center text-gray-500">Memuat data...</div>
          ) : rawGroups.length === 0 ? (
            <div role="status" className="py-16 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              </div>
              {search.trim() ? (
                <>
                  <p className="text-slate-600 font-medium">Tidak ada hasil untuk &quot;{search}&quot;</p>
                  <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="mt-2 text-xs font-semibold text-primary-600 hover:underline">Hapus pencarian</button>
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
                      className="font-semibold text-primary-600 hover:underline"
                    >
                      Opname Expired
                    </button>
                  ) : (
                    'Opname Expired'
                  )}
                  .
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <caption className="sr-only">Daftar penerimaan barang</caption>
                <thead>
                  <tr className="bg-linear-to-r from-gray-50 to-gray-100">
                    <th scope="col" className="excel-header">Kode Barang</th>
                    <th scope="col" className="excel-header">Nama Barang</th>
                    <th scope="col" className="excel-header text-right">Qty CRT</th>
                    <th scope="col" className="excel-header text-right" title="Nilai otomatis: QTY CRT × faktor konversi (master)">PCS (auto)</th>
                    <th scope="col" className="excel-header">Satuan</th>
                    <th scope="col" className="excel-header">Expired</th>
                    <th scope="col" className="excel-header">Kondisi</th>
                    {hasPermission('penerimaan.edit') && (
                      <th scope="col" className="excel-header text-right">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const isOpen = !collapsed.has(group.key);
                    return (
                      <FragmentGroup key={group.key} group={group} isOpen={isOpen} onToggle={() => toggleGroup(group.key)} colSpan={colSpan} fnum={fnum} fmtDate={fmtDate} hasEdit={hasPermission('penerimaan.edit')} onEdit={setEditing} num={num} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.total > GROUPS_PER_PAGE && (
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.current_page <= 1} className="btn-secondary disabled:opacity-50" aria-label="Halaman sebelumnya">
                  Sebelumnya
                </button>
                <span className="text-sm text-gray-600">Halaman {pagination.current_page} dari {pagination.last_page}</span>
                <button onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))} disabled={pagination.current_page >= pagination.last_page} className="btn-secondary disabled:opacity-50" aria-label="Halaman berikutnya">
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
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
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
        className="bg-gray-50/70 hover:bg-gray-100/70 transition-colors cursor-pointer"
        onClick={onToggle}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <td colSpan={colSpan} className="table-cell">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              <span className="text-sm font-bold text-gray-800">{group.po}</span>
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
           <tr key={item.id} className={`excel-row ${itemIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-primary-50/30 transition-colors`}>
             <td className="excel-cell"><span className="text-sm font-mono font-medium text-gray-800">{item.kode_barang}</span></td>
             <td className="excel-cell min-w-[240px] max-w-[340px]">
               <span className="block line-clamp-2 break-words" title={item.nama_barang || undefined}>{item.nama_barang || '-'}</span>
             </td>
             <td className="excel-cell text-right font-medium tabular-nums">{num(item.actual_qty)}</td>
             <td className="excel-cell text-right tabular-nums text-gray-500" title={cf != null ? `QTY CRT × faktor konversi ${cf}` : undefined}>
                 {item.qty_pcs != null ? num(item.qty_pcs) : (cf != null ? num(item.actual_qty * cf) : '-')}
               </td>
             <td className="excel-cell">{item.satuan || '-'}</td>
             <td className="excel-cell text-gray-700">{fmtDate(item.expired_date)}</td>
              <td className="excel-cell">
                <span className={`badge ${conditionBadge(item.condition)}`}>{conditionLabel(item.condition)}</span>
              </td>
             {hasEdit && (
               <td className="excel-cell text-right">
                 <button onClick={() => onEdit(item)} className="btn-secondary" title="Edit penerimaan" aria-label="Edit penerimaan">
                   <PencilIcon />
                 </button>
               </td>
            )}
          </tr>
        );
      })}
    </>
  );
}