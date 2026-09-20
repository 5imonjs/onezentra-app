'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DashboardLayout from '@/app/dashboard/layout';
import { getErrorMessage, sjValidations, API_ROOT } from '@/lib/api';
import Modal from '@/components/Modal';
import SearchInput from '@/components/SearchInput';
import Toast from '@/components/Toast';
import { useAuthStore } from '@/store/auth';

type ValidationItem = {
  id: number;
  kode_barang: string;
  nama_barang: string;
  expected_qty: number;
  actual_qty: number | null;
  satuan: string;
  uom?: string;
  expired_date: string | null;
  condition: string;
  status: string;
  umur?: number | null;
  barcode?: string | null;
  notes?: string | null;
  photo?: string | null;
  standarisasi?: { tier?: number; tinggi_tumpukan?: number; status?: string } | null;
};

type Validation = {
  id: number;
  status: string;
  scan_code: string;
  completed_at: string | null;
  rencana_kirim: {
    po_transporter: string;
    driver_name: string;
    nopol: string | null;
    destination_name: string | null;
    items?: { id: number }[];
  };
  items?: ValidationItem[];
};

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  IN_PROGRESS: { label: 'Proses', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  COMPLETED: { label: 'Selesai', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Dibatalkan', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const itemStatusStyle: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  VALIDATED: 'bg-emerald-50 text-emerald-700',
  MISMATCH: 'bg-red-50 text-red-700',
};

const emptyForm = { actual_qty: '' as string | number, expired_date: '', condition: 'FISIK_BAGUS', notes: '', barcode: '', tier: 1, tinggi_tumpukan: 1 };
const photoConditions = ['FISIK_RUSAK', 'QTY_KURANG', 'ISI_KEMASAN_KURANG', 'EXPIRED_TIDAK_STANDAR', 'LAINNYA'];

export default function ValidasiSjPage() {
  const { hasPermission } = useAuthStore();
  const router = useRouter();
  const [wasRedirected, setWasRedirected] = useState(false);
  const [items, setItems] = useState<Validation[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Validation['rencana_kirim'] | null>(null);
  const [active, setActive] = useState<Validation | null>(null);
  const [selected, setSelected] = useState<ValidationItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showUmurPopup, setShowUmurPopup] = useState(false);
  const [standarUmur, setStandarUmur] = useState(0);
  const [sisaUmur, setSisaUmur] = useState({ totalMonths: 0, totalDays: 0 });
  const [photo, setPhoto] = useState<File | null>(null);

  const calcUmurInMonths = (expiredDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expired = new Date(`${expiredDate}T00:00:00`);
    const totalDays = Math.ceil((expired.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const monthDifference = (expired.getFullYear() - today.getFullYear()) * 12
      + expired.getMonth() - today.getMonth();
    if (totalDays <= 0) {
      return { totalMonths: 0, totalDays };
    }

    const totalMonths = monthDifference - (expired.getDate() < today.getDate() ? 1 : 0);

    return { totalMonths: Math.max(0, totalMonths), totalDays };
  };

  const formatUmurSelisih = (expiredDate: string, standardMonths: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = new Date(`${expiredDate}T00:00:00`);
    const standardDate = new Date(today);
    standardDate.setDate(1);
    standardDate.setMonth(standardDate.getMonth() + standardMonths);
    standardDate.setDate(Math.min(today.getDate(), new Date(standardDate.getFullYear(), standardDate.getMonth() + 1, 0).getDate()));

    const isBeforeStandard = expired < standardDate;
    const start = isBeforeStandard ? expired : standardDate;
    const end = isBeforeStandard ? standardDate : expired;
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const parts = [
      years > 0 ? `${years} tahun` : '',
      months > 0 ? `${months} bulan` : '',
      days > 0 ? `${days} hari` : '',
    ].filter(Boolean);

    return `${isBeforeStandard ? '-' : '+'}${parts.length ? parts.join(' ') : '0 hari'}`;
  };
  const [photoPreview, setPhotoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const response = await sjValidations.list({ search, page, per_page: 20 });
      setItems(response.data.data);
    } catch (error) {
      setToast({ message: getErrorMessage(error, 'Gagal memuat validasi dokumen.'), type: 'error' });
    }
  }, [page, search]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'standarisasi') setWasRedirected(true);
  }, []);

  const openDetail = async (validation: Validation) => {
    try {
      const response = await sjValidations.get(validation.id);
      setActive(response.data.data);
    } catch (error) {
      setToast({ message: getErrorMessage(error, 'Gagal memuat detail validasi.'), type: 'error' });
    }
  };

  const findDocument = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const response = await sjValidations.lookup(code.trim());
      setLookup(response.data.data);
    } catch (error) {
      setLookup(null);
      setToast({ message: getErrorMessage(error, 'Dokumen tidak ditemukan.'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const startValidation = async () => {
    if (!lookup) return;
    setBusy(true);
    try {
      const response = await sjValidations.startByCode(lookup.po_transporter);
      setActive(response.data.data);
      setLookup(null);
      setCode('');
      loadItems();
    } catch (error) {
      setToast({ message: getErrorMessage(error, 'Gagal memulai validasi.'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const openItem = (item: ValidationItem) => {
    if (!item.standarisasi || item.standarisasi.status !== 'approved') {
      const npnId = item.kode_barang;
      router.push(`/standarisasi?productId=${npnId}&from=standarisasi`);
      return;
    }
    setSelected(item);
    setForm({
      actual_qty: '',
      expired_date: item.expired_date ?? '',
      condition: item.condition || 'FISIK_BAGUS',
      notes: '',
      barcode: item.barcode ?? '',
      tier: 1,
      tinggi_tumpukan: 1,
    });
    setPhoto(null);
    setPhotoPreview('');
  };

  const saveItem = async () => {
    if (!active || !selected || !form.actual_qty) return;
    setBusy(true);
    try {
      const payload = new FormData();
      payload.append('sj_validation_item_id', String(selected.id));
      payload.append('actual_qty', String(form.actual_qty));
      payload.append('condition', form.condition);
      if (form.expired_date) payload.append('expired_date', form.expired_date);
      if (form.barcode) payload.append('barcode', form.barcode);
      if (form.notes) payload.append('notes', form.notes);
      if (form.tier && form.tinggi_tumpukan && !selected.standarisasi) {
        payload.append('tier', String(form.tier));
        payload.append('tinggi_tumpukan', String(form.tinggi_tumpukan));
      }
      if (photo) payload.append('photo', photo);
      await sjValidations.scan(active.id, payload);
      const response = await sjValidations.get(active.id);
      setActive(response.data.data);
      setSelected(null);
      setPhoto(null);
      setPhotoPreview('');
      setToast({ message: 'Item berhasil divalidasi.', type: 'success' });
    } catch (error) {
      setToast({ message: getErrorMessage(error, 'Gagal menyimpan validasi item.'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const completeValidation = async () => {
    if (!active || active.items?.some((item) => item.status === 'PENDING')) return;
    setBusy(true);
    try {
      await sjValidations.complete(active.id);
      setToast({ message: 'Validasi dokumen selesai.', type: 'success' });
      setActive(null);
      loadItems();
    } catch (error) {
      setToast({ message: getErrorMessage(error, 'Gagal menyelesaikan validasi.'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = active?.items?.filter((item) => item.status === 'PENDING').length ?? 0;
  const progress = active?.items?.length ? Math.round(((active.items.length - pendingCount) / active.items.length) * 100) : 0;
  const photoRequired = photoConditions.includes(form.condition);
  const umurSelisih = sisaUmur.totalMonths - standarUmur;
  const umurRatio = standarUmur > 0 ? Math.max(0, Math.min((sisaUmur.totalMonths / standarUmur) * 100, 100)) : 0;
  const itemStandarUmur = selected?.umur ?? 0;
  const itemSisaUmur = form.expired_date ? calcUmurInMonths(form.expired_date) : null;
  const itemUmurSelisih = itemSisaUmur ? itemSisaUmur.totalMonths - itemStandarUmur : null;
  const itemUmurSelisihDetail = form.expired_date ? formatUmurSelisih(form.expired_date, itemStandarUmur) : null;
  const popupUmurSelisihDetail = form.expired_date ? formatUmurSelisih(form.expired_date, standarUmur) : null;
  const waitingCount = items.filter((item) => item.status === 'PENDING').length;
  const inProgressCount = items.filter((item) => item.status === 'IN_PROGRESS').length;
  const completedCount = items.filter((item) => item.status === 'COMPLETED').length;
  const cancelledCount = items.filter((item) => item.status === 'CANCELLED').length;
  const totalCount = items.length;

  if (!hasPermission('sj_validation.view')) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Anda tidak memiliki izin untuk melihat Validasi Dokumen.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {wasRedirected && (
        <div className="rounded-xl border border-amber-200 bg-linear-to-r from-amber-50 to-orange-50 p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">Standarisasi Tumpukan Belum Disetujui</p>
              <p className="text-xs text-amber-700 mt-1">Buat dan approv standarisasi tumpukan terlebih dahulu di halaman Standarisasi. Setelah disetujui BLC, baru lanjutkan validasi dokumen.</p>
            </div>
            <button onClick={() => router.push('/standarisasi')} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-colors">
              Buat Standarisasi
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
            </button>
          </div>
        </div>
      )}
      <div className="space-y-6">
        {/* Header */}
        <header className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white text-slate-900 flex items-center justify-center shadow-lg ring-1 ring-white/20 shrink-0">
                <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-black tracking-tight">Validasi Dokumen</h1>
                </div>
                <p className="text-slate-300 text-sm mt-0.5">Kontrol fisik produk, quantity, kondisi, dan expired.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {[
                { label: 'Hari ini', value: 0, valueClass: 'bg-slate-900 text-white', className: 'bg-white text-slate-900 shadow' },
                { label: 'Terjadwal', value: waitingCount, valueClass: 'bg-blue-500 text-white', className: 'bg-white/10 border-white/20' },
                { label: 'Selesai', value: completedCount, valueClass: 'bg-emerald-500 text-white', className: 'bg-white/10 border-white/20' },
                { label: 'Total', value: totalCount, valueClass: 'text-white', className: 'bg-white/10 border-white/10' },
              ].map((stat) => (
                <span key={stat.label} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur ${stat.className}`}>
                  {stat.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-black tabular-nums ${stat.valueClass}`}>{stat.value}</span>
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Scan Panel */}
          <div className="xl:col-span-1 space-y-5">
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">Quick Scan</h2>
                  <p className="text-[11px] text-slate-400">Cari PO transporter</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  <input id="validation-code" placeholder="Scan atau ketik PO..." className="input-field pl-9 bg-slate-50 text-sm py-2.5 focus:bg-white" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findDocument()} aria-label="Kode validasi" />
                </div>
                <button type="button" onClick={findDocument} disabled={busy || !code.trim()} className="btn-primary text-sm px-4 py-2.5 disabled:opacity-50 shrink-0">{busy ? '...' : 'Cari'}</button>
              </div>
              {lookup && (
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3 animate-fade-in">
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: 'PO', value: lookup.po_transporter, mono: true },
                      { label: 'Driver', value: lookup.driver_name || '-', mono: false },
                      { label: 'Nopol', value: lookup.nopol || '-', mono: true },
                      { label: 'Tujuan', value: lookup.destination_name || '-', mono: false },
                    ].map((item) => (
                      <div key={item.label}><p className="text-[10px] font-bold tracking-widest text-blue-500 uppercase">{item.label}</p><p className={`text-sm ${item.mono ? 'font-black text-slate-800 font-mono' : 'text-slate-700'}`}>{item.value}</p></div>
                    ))}
                  </div>
                  <button type="button" onClick={startValidation} disabled={busy || !hasPermission('sj_validation.create')} className="w-full btn-primary text-sm py-2.5 disabled:opacity-50">Mulai Validasi</button>
                </div>
              )}
            </section>

            {/* Progress Ring */}
            {totalCount > 0 && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Ringkasan Status</h3>
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24 shrink-0">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      {waitingCount > 0 && <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray={`${(waitingCount / totalCount) * 100}, 100`} strokeLinecap="round" className="transition-all duration-1000" />}
                      {inProgressCount > 0 && <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray={`${(inProgressCount / totalCount) * 100}, 100`} strokeLinecap="round" className="transition-all duration-1000" />}
                      {completedCount > 0 && <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray={`${(completedCount / totalCount) * 100}, 100`} strokeLinecap="round" className="transition-all duration-1000" />}
                      {cancelledCount > 0 && <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray={`${(cancelledCount / totalCount) * 100}, 100`} strokeLinecap="round" className="transition-all duration-1000" />}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-slate-800">{totalCount}</span>
                      <span className="text-[9px] text-slate-400 uppercase">Total</span>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
{[
                       { label: 'Menunggu', count: waitingCount, color: 'bg-amber-500', textColor: 'text-amber-600' },
                       { label: 'Diproses', count: inProgressCount, color: 'bg-blue-500', textColor: 'text-blue-600' },
                       { label: 'Selesai', count: completedCount, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                       { label: 'Dibatalkan', count: cancelledCount, color: 'bg-red-500', textColor: 'text-red-600' },
                     ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                          <span className="text-xs text-slate-600">{item.label}</span>
                        </div>
                        <span className={`text-xs font-black ${item.textColor}`}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Table Section */}
          <div className="xl:col-span-2">
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900">Daftar Validasi</h2>
                    <p className="text-[11px] text-slate-400">{items.length} entri ditemukan</p>
                  </div>
                </div>
                <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari PO transporter..." resultCount={items.length} resultLabel="validasi" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse">
                  <caption className="sr-only">Daftar validasi dokumen</caption>
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider opacity-60">No</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">PO Transporter</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">Driver</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider">Tujuan</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Selesai</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, index) => {
                      const cfg = statusConfig[item.status] || { label: item.status, bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' };
                      return (
                        <tr key={item.id} className="even:bg-slate-50/30 hover:bg-slate-50/70 transition-all duration-150">
                          <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">{(page - 1) * 20 + index + 1}</td>
                          <td className="px-4 py-3"><span className="text-sm font-black text-slate-900 font-mono">{item.rencana_kirim?.po_transporter || item.scan_code}</span></td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.rencana_kirim?.driver_name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.rencana_kirim?.destination_name || '-'}</td>
                          <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.text} border-current/10`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span></td>
                          <td className="px-4 py-3 text-center text-xs text-slate-500">{item.completed_at ? new Date(item.completed_at).toLocaleDateString('id-ID') : '-'}</td>
                          <td className="px-4 py-3 text-right"><button type="button" onClick={() => openDetail(item)} className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-all duration-150"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Detail</button></td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-400">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                            </div>
                            <p className="text-sm font-medium">Tidak ada validasi ditemukan</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!active} onClose={() => { setActive(null); setSelected(null); }} title="Detail Validasi Dokumen" subtitle="Pantau progres pemeriksaan dan validasi setiap item." size="2xl" footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            {active?.status === 'IN_PROGRESS' && (
              <button type="button" onClick={completeValidation} disabled={busy || pendingCount > 0} className="btn-primary inline-flex w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>
                Selesaikan Validasi
              </button>
            )}
            <button type="button" onClick={() => { setActive(null); setSelected(null); }} className="btn-secondary w-full text-sm sm:w-auto">Tutup</button>
        </div>
      }>
        {active && (
          <div className="space-y-5 pb-1 animate-slide-up">
            <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-900/10">
              <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[20px] border-primary-400/10" aria-hidden="true" />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-400/15 text-white shadow-lg ring-1 ring-white/10">
                    <svg className="w-5 h-5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">PO Transporter</p>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold ${statusConfig[active.status]?.text || 'text-slate-300'} bg-white/10`}><span className={`h-1.5 w-1.5 rounded-full ${statusConfig[active.status]?.dot || 'bg-slate-400'}`} />{statusConfig[active.status]?.label || active.status}</span>
                    </div>
                    <h3 className="mt-1 truncate text-xl font-black tracking-tight sm:text-2xl">{active.rencana_kirim?.po_transporter}</h3>
                    <p className="mt-1 text-xs text-white/60">{active.rencana_kirim?.driver_name || '-'} <span className="px-1 text-white/30">•</span> {active.rencana_kirim?.destination_name || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:w-auto">
                  <div className="rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 text-left sm:min-w-[100px]"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">Progres</p><p className="mt-0.5 text-xl font-black text-primary-300">{progress}%</p></div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 text-left sm:min-w-[100px]"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">Item</p><p className="mt-0.5 text-xl font-black text-emerald-300">{active.items?.length ?? 0}</p></div>
                </div>
              </div>
              <div className="relative mt-5">
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-white/45"><span>Progress pemeriksaan</span><span>{active.items?.length ?? 0} item</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary-400 transition-all duration-700" style={{ width: `${progress}%` }} /></div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                </div>
                <div><h3 className="text-sm font-black text-slate-900">Daftar Barang</h3><p className="text-[11px] text-slate-400">Tinjau hasil aktual setiap item</p></div>
                </div>
                <span className="w-fit rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">{active.items?.length ?? 0} item</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Kode</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Nama Barang</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Plan</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aktual</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Expired</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Catatan</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Foto</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {active.items?.map((item) => (
                      <tr key={item.id} className="even:bg-slate-50/30 hover:bg-slate-50/60 transition-all duration-150">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.kode_barang}</td>
                        <td className="px-4 py-3 text-sm text-slate-800 font-medium">{item.nama_barang}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{item.expected_qty} {item.satuan}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{item.actual_qty ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.expired_date ? new Date(item.expired_date).toLocaleDateString('id-ID') : '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={item.notes || ''}>{item.notes || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          {item.photo ? (
                            <a href={item.photo.startsWith('http') ? item.photo : `${API_ROOT}/storage/${item.photo}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                              Lihat
                            </a>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${itemStatusStyle[item.status] || 'bg-gray-100 text-gray-600'} border-current/10`}><span className={`w-1.5 h-1.5 rounded-full mr-1 ${item.status === 'PENDING' ? 'bg-amber-500' : item.status === 'VALIDATED' ? 'bg-emerald-500' : 'bg-red-500'}`} />{item.status}</span></td>
                        <td className="px-4 py-3 text-right">
                          {item.status === 'PENDING' && (
                            <button type="button" onClick={() => openItem(item)} className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${item.standarisasi?.status && item.standarisasi.status !== 'approved' ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'}`}>
                              {item.standarisasi?.status && item.standarisasi.status !== 'approved' && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
                              Validasi
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Item Validation Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Validasi Item" subtitle="Lengkapi pemeriksaan fisik sebelum menyimpan hasil validasi." size="lg" footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" onClick={() => setSelected(null)} className="btn-secondary w-full sm:w-auto">Batal</button>
          <button type="button" onClick={saveItem} disabled={busy || !form.actual_qty || (photoRequired && !photo)} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
            {busy ? 'Menyimpan...' : 'Simpan Validasi'}
          </button>
        </div>
      }>
        {selected && (
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
              <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[18px] border-cyan-400/10" aria-hidden="true" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5h13.5M7.5 4.5h9A2.25 2.25 0 0 1 18.75 6.75v10.5A2.25 2.25 0 0 1 16.5 19.5h-9a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 7.5 4.5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 11.25h7.5m-7.5 3.5h4.25" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Item yang diperiksa</p>
                  <p className="mt-1 text-sm font-bold leading-5 text-white">{selected.nama_barang}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    <span className="font-mono text-slate-300">{selected.kode_barang}</span>
                    <span className="text-slate-600">•</span>
                    <span>Rencana <strong className="font-semibold text-slate-200">{selected.expected_qty} {selected.satuan}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${itemSisaUmur && itemSisaUmur.totalDays <= 0 ? 'border-red-200 bg-red-50' : itemSisaUmur && itemSisaUmur.totalMonths < itemStandarUmur ? 'border-amber-200 bg-amber-50' : 'border-primary-100 bg-primary-50/60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Standar umur produk</p>
                  <p className="mt-1 text-[11px] text-slate-500">Acuan database dalam bulan</p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-primary-700 shadow-sm">DATABASE</span>
              </div>
              <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200/80">
                <div className="pr-3"><p className="text-[10px] text-slate-500">Standar</p><p className="mt-1 text-xl font-black text-slate-900">{itemStandarUmur}</p><p className="text-[10px] text-slate-500">bulan</p></div>
                <div className="px-3"><p className="text-[10px] text-slate-500">Sisa simpan</p><p className={`mt-1 text-xl font-black ${itemSisaUmur && itemSisaUmur.totalDays <= 0 ? 'text-red-600' : itemSisaUmur && itemSisaUmur.totalMonths < itemStandarUmur ? 'text-amber-600' : 'text-emerald-600'}`}>{itemSisaUmur ? itemSisaUmur.totalMonths : '-'}</p><p className="text-[10px] text-slate-500">bulan</p></div>
                <div className="pl-3"><p className="text-[10px] text-slate-500">Selisih</p><p className={`mt-1 text-sm font-black leading-5 ${itemUmurSelisih !== null && itemUmurSelisih < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{itemUmurSelisihDetail || '-'}</p><p className="text-[10px] text-slate-500">hari · bulan · tahun</p></div>
              </div>
              <p className="mt-3 border-t border-slate-200/80 pt-3 text-[11px] font-semibold text-slate-600">
                {!itemSisaUmur ? 'Isi tanggal expired untuk melihat perbandingan.' : itemSisaUmur.totalDays <= 0 ? 'Produk sudah kadaluarsa.' : itemUmurSelisih !== null && itemUmurSelisih < 0 ? `Sisa simpan kurang dari standar (${itemUmurSelisihDetail}).` : `Sisa simpan memenuhi standar (${itemUmurSelisihDetail}).`}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-primary-500" aria-hidden="true" />
                <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-800">Data pemeriksaan</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-slate-600">Qty Aktual <span className="text-primary-600">*</span>
                  <div className="relative mt-1.5">
                    <input type="number" min="0" value={form.actual_qty} onChange={(e) => setForm({ ...form, actual_qty: Number(e.target.value) })} className="input-field py-2.5 pr-14 text-sm font-semibold" />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-bold uppercase text-slate-400">{selected.satuan}</span>
                  </div>
                </label>
                <label className="block text-xs font-bold text-slate-600">Expired Date
                  <input type="date" value={form.expired_date} onChange={(e) => {
                    const val = e.target.value;
                    setForm({ ...form, expired_date: val });
                    const standar = selected?.umur ?? 0;
                    setStandarUmur(standar);
                    setSisaUmur(calcUmurInMonths(val));
                    setShowUmurPopup(true);
                  }} className="input-field mt-1.5 py-2.5 text-sm" />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-primary-500" aria-hidden="true" />
                <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-800">Identifikasi & kondisi</h3>
              </div>
              <label className="block text-xs font-bold text-slate-600">Kondisi <span className="text-primary-600">*</span>
                <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="select-field mt-1.5 w-full py-2.5 text-sm">
                  {['FISIK_BAGUS', 'FISIK_RUSAK', 'QTY_KURANG', 'ISI_KEMASAN_KURANG', 'EXPIRED_TIDAK_STANDAR', 'LAINNYA'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            {photoRequired && (
              <div className="space-y-3 rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50 to-orange-50/50 p-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-900">Bukti fotografi kondisi wajib</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">Ambil foto langsung atau pilih dari galeri sebagai bukti kondisi produk.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-white/60 px-3 py-3 text-center hover:bg-amber-50 transition-colors">
                      <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      <p className="text-[11px] font-bold text-amber-700">Kamera</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); if (f) setPhotoPreview(URL.createObjectURL(f)); }} className="sr-only" aria-label="Ambil foto dari kamera" />
                  </label>
                  <label className="flex-1 cursor-pointer">
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-white/60 px-3 py-3 text-center hover:bg-amber-50 transition-colors">
                      <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      <p className="text-[11px] font-bold text-amber-700">Galeri</p>
                    </div>
                    <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); if (f) setPhotoPreview(URL.createObjectURL(f)); }} className="sr-only" aria-label="Pilih foto dari galeri" />
                  </label>
                </div>
                {photoPreview && (
                  <div className="relative rounded-xl overflow-hidden border border-amber-200 bg-white">
                    <Image src={photoPreview} alt="Pratinjau foto kondisi" className="w-full h-48 object-cover" width={400} height={200} unoptimized />
                    <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(''); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors" aria-label="Hapus foto">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
              </div>
            )}
            <label className="block text-xs font-bold text-slate-600">Catatan <span className="font-medium text-slate-400">(opsional)</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Tambahkan catatan pemeriksaan..." className="input-field mt-1.5 min-h-[88px] resize-y py-2.5 text-sm" rows={3} />
            </label>
          </div>
        )}
      </Modal>

      {/* Standar Umur Popup Overlay */}
      {showUmurPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowUmurPopup(false)}>
          <div className="flex max-h-[min(680px,90vh)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="relative overflow-hidden bg-slate-950 px-5 py-5 text-white">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[20px] border-primary-400/10" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-400/15 text-primary-300 ring-1 ring-white/10">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-300">Pemeriksaan umur</p>
                    <h2 className="mt-1 text-base font-black text-white">Standar Umur Produk</h2>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{selected?.kode_barang || '-'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{selected?.nama_barang || 'Produk'}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowUmurPopup(false)} aria-label="Tutup" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary-600">Standar database</p>
                  <div className="mt-2 flex items-baseline gap-1.5"><span className="text-3xl font-black text-slate-900">{standarUmur || '-'}</span><span className="text-xs font-bold text-slate-500">bulan</span></div>
                  <p className="mt-1 text-[11px] text-slate-500">{standarUmur > 0 ? 'Standar minimum dalam bulan' : 'Data tidak tersedia'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tanggal expired</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{form.expired_date ? new Date(form.expired_date).toLocaleDateString('id-ID') : '-'}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Tanggal acuan perhitungan</p>
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${standarUmur <= 0 ? 'border-amber-200 bg-amber-50' : sisaUmur.totalDays <= 0 ? 'border-red-200 bg-red-50' : sisaUmur.totalMonths < standarUmur ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hasil pemeriksaan</p><p className="mt-1 text-sm font-bold text-slate-800">Sisa umur produk</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${standarUmur <= 0 ? 'bg-slate-200 text-slate-700' : sisaUmur.totalDays <= 0 ? 'bg-red-200 text-red-700' : sisaUmur.totalMonths < standarUmur ? 'bg-amber-200 text-amber-700' : 'bg-emerald-200 text-emerald-700'}`}>{standarUmur <= 0 ? 'DATA LENGKAP' : sisaUmur.totalDays <= 0 ? 'KADALUARSA' : sisaUmur.totalMonths < standarUmur ? 'PERLU PERHATIAN' : 'AMAN'}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200/80">
                  <div className="pr-3"><p className="text-[10px] text-slate-500">Sisa simpan</p><p className={`mt-1 text-xl font-black ${sisaUmur.totalDays <= 0 ? 'text-red-600' : sisaUmur.totalMonths < standarUmur ? 'text-amber-600' : 'text-emerald-600'}`}>{sisaUmur.totalMonths}</p><p className="text-[10px] text-slate-500">bulan</p></div>
                  <div className="px-3"><p className="text-[10px] text-slate-500">Standar</p><p className={`mt-1 text-xl font-black ${standarUmur <= 0 ? 'text-slate-300' : 'text-slate-800'}`}>{standarUmur || '-'}</p><p className="text-[10px] text-slate-500">bulan</p></div>
                  <div className="pl-3"><p className="text-[10px] text-slate-500">Selisih</p><p className={`mt-1 text-sm font-black leading-5 ${standarUmur <= 0 ? 'text-slate-400' : sisaUmur.totalDays <= 0 ? 'text-red-600' : umurSelisih < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{standarUmur <= 0 ? '-' : popupUmurSelisihDetail || '-'}</p><p className="text-[10px] text-slate-500">hari · bulan · tahun</p></div>
                </div>
                {standarUmur <= 0 ? (
                  <p className="mt-4 border-t border-slate-200/80 pt-3 text-xs font-bold text-slate-500">Standar umur produk tidak tersedia. Data standar umur perlu diisi di database standar umur produk.</p>
                ) : sisaUmur.totalDays <= 0 ? (
                  <p className="mt-4 border-t border-slate-200/80 pt-3 text-xs font-bold text-red-600">Produk sudah kadaluarsa dan perlu penanganan segera.</p>
                ) : sisaUmur.totalMonths < standarUmur ? (
                  <p className="mt-4 border-t border-slate-200/80 pt-3 text-xs font-bold text-amber-600">Sisa simpan kurang dari standar ({popupUmurSelisihDetail}).</p>
                ) : (
                  <p className="mt-4 border-t border-slate-200/80 pt-3 text-xs font-bold text-emerald-600">Sisa simpan memenuhi standar ({popupUmurSelisihDetail}).</p>
                )}
              </div>

<div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Perbandingan terhadap standar</span><span>{standarUmur > 0 ? `${umurRatio.toFixed(0)}%` : '-'}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all duration-700 ${standarUmur <= 0 ? 'bg-slate-400' : sisaUmur.totalDays <= 0 ? 'bg-red-500' : sisaUmur.totalMonths < standarUmur ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${standarUmur > 0 ? umurRatio : 0}%` }} /></div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>0 bulan</span><span>{standarUmur > 0 ? `Standar ${standarUmur} bulan` : 'Data standar tidak tersedia'}</span></div>
                </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:flex sm:justify-end">
              <button type="button" onClick={() => setShowUmurPopup(false)} className="btn-primary w-full sm:w-auto">Pahami</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}