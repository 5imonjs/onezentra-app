'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DashboardLayout from '@/app/dashboard/layout';
import { getErrorMessage, sjValidations, batches, depo } from '@/lib/api';
import Modal from '@/components/Modal';
import BarcodeScanner, { SCAN_FORMATS_1D } from '@/components/BarcodeScanner';
import SearchInput from '@/components/SearchInput';
import { notifyGlobal } from '@/store/globalToast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuthStore } from '@/store/auth';
import { conditionRequiresPhoto, hasQty } from '@/lib/condition';
import { downloadBatchLabel, printBatchLabel, type BatchLabelData } from '@/lib/batchLabel';
import { clearPrintedLabels, isLabelPrinted, loadPrintedLabels, markLabelPrinted, unprintedCompleteItems } from '@/lib/labelPrint';
import { AUTHENTICATED_FILE_REL, storageFileUrl } from '@/lib/storageFile';
import { formatDateDmy, toDateInput } from '@/lib/dates';
import { fmtDate, fmtDateTime, batchCell, canEditItems, validationDuration } from '@/lib/validationTable';

/** Batch label yang dibuat server saat satu produk divalidasi. */
type BatchInfo = {
  /** Id batch — kunci endpoint mark-printed (sumber kebenaran jejak cetak). */
  id?: number;
  batch_number: string | null;
  barcode_label: string | null;
  status?: string | null;
  /** Dicatat server saat label dicetak; badge membaca ini (lintas device). */
  printed_at?: string | null;
};

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
  /** Batch label untuk produk ini — dibuat server saat item divalidasi. */
  batch?: BatchInfo | null;
  standarisasi?: { tier?: number; tinggi_tumpukan?: number; status?: string } | null;
};

type Validation = {
  id: number;
  status: string;
  // Dihitung backend: izin koreksi setelah selesai sudah dihitung di sini karena
  // hanya server yang tahu status Receiving. Absent = false (gagal ke aman).
  can_correct_completed?: boolean;
  scan_code: string;
  started_at: string | null;
  completed_at: string | null;
  // Detik, diisi server saat sesi mencapai status terminal. NULL = belum final
  // (sesi masih IN_PROGRESS), bukan berarti 0.
  duration_seconds?: number | null;
  rencana_kirim: {
    po_transporter: string;
    driver_name: string;
    nopol: string | null;
    destination_name: string | null;
    items?: { id: number }[];
  };
  items?: ValidationItem[];
  /** Barang di luar rencana kirim — catatan deviasi, tidak mengubah rencana. */
  extra_items?: ValidationExtraItem[];
};

type ValidationExtraItem = {
  id: number;
  kode_barang: string;
  nama_barang: string;
  qty: number;
  satuan: string | null;
  condition: string;
  expired_date: string | null;
  photo: string | null;
  notes?: string | null;
  recorder?: { full_name?: string | null } | null;
  created_at?: string | null;
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

const itemStatusLabel: Record<string, string> = {
  PENDING: 'Menunggu',
  VALIDATED: 'Tervalidasi',
  MISMATCH: 'Selisih',
};

const conditionLabels: Record<string, string> = {
  FISIK_BAGUS: 'Fisik Bagus',
  FISIK_RUSAK: 'Fisik Rusak',
  QTY_KURANG: 'Qty Kurang',
  ISI_KEMASAN_KURANG: 'Isi Kemasan Kurang',
  EXPIRED_TIDAK_STANDAR: 'Expired / Tidak Standar',
  LAINNYA: 'Lainnya',
};

const emptyForm = { actual_qty: '', expired_date: '', condition: 'FISIK_BAGUS', notes: '', barcode: '', tier: 1, tinggi_tumpukan: 1 };

/** Jumlah item yang sudah divalidasi (jadi sudah punya batch label tercetak). */
function validatedCount(validation: Validation | null): number {
  return validation?.items?.filter((item) => item.status !== 'PENDING').length ?? 0;
}

/**
 * Sel "No. Batch" pada tabel detail validasi. Nomor batch lahir hanya saat
 * item divalidasi, jadi sel kosong berarti item belum divalidasi — bukan
 * batch yang hilang. Nomor yang sudah dibatalkan tetap ditampilkan supaya
 * petugas bisa menemukan label fisik yang harus dibuang dari rak.
 */
function BatchCell({ batch, printed }: { batch?: BatchInfo | null; printed?: boolean }) {
  const state = batchCell(batch);

  if (state.kind === 'none') {
    return <span className="text-slate-400">-</span>;
  }

  if (state.kind === 'cancelled') {
    return (
      <div className="min-w-37.5">
        <p className="font-mono text-xs font-bold text-slate-500 line-through">{state.number}</p>
        <span className="mt-0.5 inline-flex items-center whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
          Dibatalkan
        </span>
      </div>
    );
  }

  return (
    <div className="min-w-37.5">
      <p className="font-mono text-xs font-bold text-slate-800">{state.number}</p>
      {state.barcode && <p className="mt-0.5 font-mono text-[10px] text-slate-500">{state.barcode}</p>}
      {printed ? (
        <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>
          Label tercetak
        </span>
      ) : (
        <span className="mt-0.5 inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
          Label belum dicetak
        </span>
      )}
    </div>
  );
}




export default function ValidasiSjPage() {
  const { hasPermission } = useAuthStore();
  const router = useRouter();
  const [wasRedirected, setWasRedirected] = useState(false);
  const [items, setItems] = useState<Validation[]>([]);
  // Jam untuk menghitung elapsed sesi IN_PROGRESS. Tanpa ini, kolom Durasi
  // untuk sesi yang sedang berjalan hanya akan ikut berubah saat tabel di-refresh
  // — padahal justru sesi itulah yang paling perlu dipantau, karena operator
  // sedang menunggu selesai.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [kodeDepo, setKodeDepo] = useState('');
  const [depots, setDepots] = useState<{ kode_depo: string; nama_depo: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [lookup, setLookup] = useState<Validation['rencana_kirim'] | null>(null);
  const [active, setActive] = useState<Validation | null>(null);
  const [selected, setSelected] = useState<ValidationItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showUmurPopup, setShowUmurPopup] = useState(false);
  const [standarUmur, setStandarUmur] = useState(0);
  const [sisaUmur, setSisaUmur] = useState({ totalMonths: 0, totalDays: 0 });
  const [photo, setPhoto] = useState<File | null>(null);
  /** Batch dari validasi terakhir — sumber data tombol cetak label. */
  const [lastBatch, setLastBatch] = useState<BatchInfo | null>(null);
  /** Item yang barusan disimpan; menyertakan batch-nya untuk cetak label. */
  const [lastScanned, setLastScanned] = useState<ValidationItem | null>(null);
  /**
   * Jejak barcode_label yang sudah dicetak pada sesi yang sedang dibuka.
   * Dimuat ulang setiap modal detail dibuka (lihat openDetail) supaya sesi
   * yang dibuka ulang setelah reload browser tetap ingat progres cetaknya.
   */
  const [printedLabels, setPrintedLabels] = useState<string[]>([]);
  // Anti race: respons basi dibuang.
  const listReqRef = useRef(0);
  const detailReqRef = useRef(0);

  const calcUmurInMonths = (expiredDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expired = new Date(`${expiredDate}T00:00:00`);
    // Input date yang diketik sebagian (mis. "2026-09-") menghasilkan Invalid Date;
    // tanpa guard ini totalMonths/totalDays = NaN lalu bocor ke children React.
    if (Number.isNaN(expired.getTime())) return null;

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
    if (Number.isNaN(expired.getTime())) return null;
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
  // Barang di luar rencana kirim (deviation record): modal + form terpisah
  // dari item rencana. Foto bukti selalu wajib — menggantikan catatan kertas.
  const emptyExtraForm = { barcode: '', kode_barang: '', nama_barang: '', qty: '', satuan: '', condition: 'FISIK_BAGUS', expired_date: '', notes: '' };
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraForm, setExtraForm] = useState(emptyExtraForm);
  const [extraPhoto, setExtraPhoto] = useState<File | null>(null);
  const [extraPhotoPreview, setExtraPhotoPreview] = useState('');
  // Target pembatalan = baris tabel (satu PO transporter beserta seluruh
  // itemnya), bukan modal item. `null` = dialog tertutup.
  const [cancelTarget, setCancelTarget] = useState<Validation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lastPage, setLastPage] = useState(1);
  const [svStats, setSvStats] = useState<{ today: number; in_progress: number; completed: number; cancelled: number; total: number } | null>(null);

  const loadItems = useCallback(async () => {
    const reqId = ++listReqRef.current;
    setLoading(true);
    try {
      const response = await sjValidations.list({ search: debouncedSearch, page, per_page: 20, ...(kodeDepo ? { kode_depo: kodeDepo } : {}) });
      if (listReqRef.current !== reqId) return;
      setItems(response.data.data);
      const pages = Number(response.data.last_page) || 1;
      setLastPage(pages);
      setTotalRows(Number(response.data.total) || 0);
      // Halaman aktif bisa keluar dari jangkauan: filter mempersempit hasil, atau
      // record terakhir dihapus dari halaman terakhir. Server lalu membalas data
      // kosong dan UI terjebak di layar kosong — tidak ada tombol mundur karena
      // `lastPage > 1` ikut jadi false.
      if (page > pages) setPage(pages);
    } catch (error) {
      if (listReqRef.current !== reqId) return;
      notifyGlobal(getErrorMessage(error, 'Gagal memuat validasi dokumen.'), 'error');
    } finally {
      if (listReqRef.current === reqId) setLoading(false);
    }
  }, [debouncedSearch, page, kodeDepo]);

  const loadDepots = useCallback(async () => {
    try {
      const res = await depo.list();
      const list = res.data?.data ?? [];
      setDepots(list);
      // User scoped hanya punya 1 opsi depo: kunci langsung.
      if (list.length === 1) setKodeDepo(list[0].kode_depo);
    } catch (e) {
      console.error('[Depo]', e);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await sjValidations.stats(kodeDepo ? { kode_depo: kodeDepo } : undefined);
      setSvStats(response.data.data);
    } catch {
      // Statistik gagal dimuat: chip menampilkan 0, daftar tetap berfungsi.
    }
  }, [kodeDepo]);

  // Debounce pencarian — tanpa ini tiap ketikan menembak API.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadDepots(); }, [loadDepots]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Detak jam untuk kolom Durasi, HANYA saat ada sesi IN_PROGRESS yang tampil.
  // Tanpa penjadan ini, timer akan tetap berjalan di halaman yang isinya sudah
  // tidak ada yang perlu dihitung — sia-sia battery dan re-render.
  const hasRunningSession = items.some((v) => v.status === 'IN_PROGRESS');
  useEffect(() => {
    if (!hasRunningSession) return;

    const timer = setInterval(() => setNowIso(new Date().toISOString()), 30_000);
    return () => clearInterval(timer);
  }, [hasRunningSession]);

  // Popup umur dapat ditutup dengan Escape.
  useEffect(() => {
    if (!showUmurPopup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowUmurPopup(false); };
    window.addEventListener('keydown', onKey, { passive: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [showUmurPopup]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'standarisasi') setWasRedirected(true);
  }, []);

  const openDetail = async (validation: Validation) => {
    const reqId = ++detailReqRef.current;
    setDetailLoading(true);
    setActive(validation as Validation);
    setPrintedLabels(loadPrintedLabels(validation.id));
    // Label milik validasi sebelumnya tidak boleh terbawa: tombol cetak
    // bisa menempelkan label salah bila modal dibuka untuk baris lain.
    setLastBatch(null);
    setLastScanned(null);
    try {
      const response = await sjValidations.get(validation.id);
      if (detailReqRef.current !== reqId) return;
      setActive(response.data.data);
    } catch (error) {
      if (detailReqRef.current !== reqId) return;
      notifyGlobal(getErrorMessage(error, 'Gagal memuat detail validasi.'), 'error');
    } finally {
      if (detailReqRef.current === reqId) setDetailLoading(false);
    }
  };

  const findDocument = async (raw?: string) => {
    const value = (raw ?? code).trim();
    if (!value) return;
    setBusy(true);
    try {
      const response = await sjValidations.lookup(value);
      setLookup(response.data.data);
    } catch (error) {
      setLookup(null);
      notifyGlobal(getErrorMessage(error, 'Dokumen tidak ditemukan.'), 'error');
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
      loadStats();
    } catch (error) {
      notifyGlobal(getErrorMessage(error, 'Gagal memulai validasi.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openItem = (item: ValidationItem) => {
    // Penjaga lapis kedua: tombol sudah disembunyikan saat dokumen selesai,
    // tapi form ini juga bisa terbuka lewat jalur lain (draft yang dipulihkan,
    // atau state modal yang belum ter-render ulang setelah status berubah).
    // Backend pasti menolak dengan 422; di sini kita menolak lebih dulu
    // supaya operator tidak sampai mengisi form yang pasti ditolak.
    if (!canEditItems(active, { canCorrectCompleted: active?.can_correct_completed })) {
      notifyGlobal('Validasi sudah selesai sehingga hasil item tidak dapat diubah.', 'error');
      return;
    }
    if (!item.standarisasi || item.standarisasi.status !== 'approved') {
      const npnId = item.kode_barang;
      router.push(`/standarisasi?productId=${npnId}&from=standarisasi`);
      return;
    }
    setSelected(item);
    setForm({
      // Disimpan sebagai string mentah, bukan `Number(...)`. Kalau dikonversi
      // saat mengetik, field yang dikosongkan user jadi `Number('') === 0`, dan
      // "belum diisi" berubah jadi "barang tidak datang" — dua hal yang sangat
      // berbeda. String membuat keduanya tetap dapat dibedakan.
      actual_qty: item.actual_qty != null ? String(item.actual_qty) : '',
      expired_date: toDateInput(item.expired_date),
      condition: item.condition || 'FISIK_BAGUS',
      notes: item.notes ?? '',
      barcode: item.barcode ?? '',
      tier: 1,
      tinggi_tumpukan: 1,
    });
    setPhoto(null);
    setPhotoPreview('');
  };

  const saveItem = async () => {
    if (!active || !selected || !hasQty(form.actual_qty) || !form.expired_date) return;
    // Sama seperti openItem: validasi yang sudah COMPLETED tidak bisa diubah.
    // Kirim request sia-sia hanya menghasilkan 422, dan membiarkan form terisi
    // membuat operator mengira perubahan tersimpan padahal receiving_items
    // sudah lebih dulu menjadi snapshot final.
    if (!canEditItems(active, { canCorrectCompleted: active?.can_correct_completed })) {
      notifyGlobal('Validasi sudah selesai sehingga hasil item tidak dapat diubah.', 'error');
      return;
    }
    // Invariant ini harus tinggal di fungsi yang benar-benar menyimpan, bukan
    // hanya di `disabled` tombol. Tombol adalah satu dari beberapa jalan masuk ke
    // handler ini (mis. restore state dari draft), dan kalau penjaganya hanya di UI,
    // request tanpa foto tetap terkirim lalu ditolak backend dengan error
    // membingungkan — user sudah isi condition "Fisik Rusak" tapi tidak diberi
    // tahu foto itu wajib.
    if (conditionRequiresPhoto(form.condition) && !photo) {
      notifyGlobal('Kondisi ini wajib disertai foto bukti.', 'error');
      return;
    }
    const isReEdit = selected.status !== 'PENDING';
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
      const scanResponse = await sjValidations.scan(active.id, payload);
      // Batch dibuat server tepat di scan(), dan ikut dikembalikan di respons.
      // Simpan agar UI bisa menawarkan cetak label tanpa fetch kedua.
      const scannedBatch = (scanResponse.data?.data as { batch?: BatchInfo | null } | undefined)?.batch ?? null;
      setLastBatch(scannedBatch);
      const response = await sjValidations.get(active.id);
      setActive(response.data.data);
      setLastScanned((scanResponse.data?.data as ValidationItem | undefined) ?? null);
      setSelected(null);
      setPhoto(null);
      setPhotoPreview('');
      // Tabel + statistik belakang modal ikut disegarkan agar status baris
      // tidak basi sampai refresh manual.
      loadItems();
      loadStats();
      notifyGlobal(isReEdit ? 'Perubahan item disimpan.' : 'Item berhasil divalidasi.', 'success');
    } catch (error) {
      notifyGlobal(getErrorMessage(error, 'Gagal menyimpan validasi item.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Catat barang di luar rencana kirim (deviation record).
   *
   * Penjaga foto tetap di sini, bukan hanya di `disabled` tombol — alur masuk
   * yang sama dengan saveItem. Rencana tidak pernah diubah: request hanya
   * menambah baris deviasi, planner diberi tahu lewat email oleh server.
   */
  const saveExtraItem = async () => {
    if (!active || !hasQty(extraForm.qty) || !extraPhoto) return;
    // Identitas barang harus bisa dilacak: barcode (dikunci ke master NPN di
    // server) atau kode + nama manual lengkap. Tanpa itu backend menolak dan
    // pesannya jauh lebih sulit dipahami dari sini.
    if (!extraForm.barcode && (!extraForm.kode_barang || !extraForm.nama_barang)) {
      notifyGlobal('Isi barcode, atau kode + nama barang manual.', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = new FormData();
      payload.append('qty', String(extraForm.qty));
      payload.append('condition', extraForm.condition);
      if (extraForm.barcode) payload.append('barcode', extraForm.barcode);
      if (extraForm.kode_barang) payload.append('kode_barang', extraForm.kode_barang);
      if (extraForm.nama_barang) payload.append('nama_barang', extraForm.nama_barang);
      if (extraForm.satuan) payload.append('satuan', extraForm.satuan);
      if (extraForm.expired_date) payload.append('expired_date', extraForm.expired_date);
      if (extraForm.notes) payload.append('notes', extraForm.notes);
      payload.append('photo', extraPhoto);
      await sjValidations.reportExtraItem(active.id, payload);
      const response = await sjValidations.get(active.id);
      setActive(response.data.data);
      setExtraOpen(false);
      setExtraForm(emptyExtraForm);
      setExtraPhoto(null);
      setExtraPhotoPreview('');
      loadItems();
      loadStats();
      notifyGlobal('Barang luar rencana tercatat — planner telah diberi tahu.', 'success');
    } catch (error) {
      notifyGlobal(getErrorMessage(error, 'Gagal melaporkan barang luar rencana.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Susun payload label dari item yang barusan divalidasi.
   *
   * Batch dibuat server di scan() dan tidak pernah berubah setelah itu, jadi
   * label yang dicetak di sini persis sama dengan yang menempel di produk.
   */
  const buildLastLabel = (): BatchLabelData | null => {
    const item = lastScanned;
    if (!item || !lastBatch) return null;
    return {
      batch_number: lastBatch.batch_number,
      barcode_label: lastBatch.barcode_label,
      kode_barang: item.kode_barang,
      nama_barang: item.nama_barang,
      actual_qty: item.actual_qty,
      satuan: item.satuan,
      expired_date: item.expired_date,
      condition: item.condition,
      po_transporter: active?.rencana_kirim?.po_transporter ?? null,
    };
  };

  /**
   * Laporkan percetakan ke server (POST /batches/{id}/mark-printed) supaya
   * badge "Label tercetak" bertahan lintas device/halaman — jejak localStorage
   * tetap dipasang lebih dulu (optimis) supaya UI langsung berubah walau
   * request gagal (offline); server adalah sumber kebenaran utama.
   */
  const markBatchPrinted = (batch?: { id?: number } | null) => {
    if (!batch?.id) return;
    void batches.markPrinted(batch.id).catch(() => {
      // Gagal lapor server tidak menghalangi cetak; badge tetap benar
      // di perangkat ini lewat localStorage.
    });
  };

  /**
   * Cetak label satu item dan tandai tercetak. Sumber datanya batch milik
   * item itu sendiri (bukan panel "item terakhir") supaya operator bisa
   * menyelesaikan item lama yang panelnya sudah tertimpa item baru.
   *
   * Penandaan "tercetak" hanya dilakukan kalau cetak benar-benar jalan —
   * kalau tidak, tombol berubah jadi "Cetak Ulang" padahal label belum pernah
   * keluar dari printer.
   */
  const printItemLabel = async (item: ValidationItem, viaDownload: boolean) => {
    const barcode = item.batch?.barcode_label?.trim() ?? '';
    if (!barcode || item.batch?.status === 'CANCELLED') return;
    const label: BatchLabelData = {
      batch_number: item.batch?.batch_number ?? null,
      barcode_label: barcode,
      kode_barang: item.kode_barang,
      nama_barang: item.nama_barang,
      actual_qty: item.actual_qty,
      satuan: item.satuan,
      expired_date: item.expired_date,
      condition: item.condition,
      po_transporter: active?.rencana_kirim?.po_transporter ?? null,
    };
    if (viaDownload) {
      downloadBatchLabel(label);
    } else {
      const printed = await printBatchLabel(label);
      if (!printed) return;
    }
    if (active) setPrintedLabels(markLabelPrinted(active.id, barcode));
    markBatchPrinted(item.batch);
  };

  const handlePrintLabel = async () => {
    const label = buildLastLabel();
    if (!label) return;
    const printed = await printBatchLabel(label);
    if (!printed) return;
    if (active && label.barcode_label) setPrintedLabels(markLabelPrinted(active.id, label.barcode_label));
    markBatchPrinted(lastBatch);
  };

  const handleDownloadLabel = () => {
    const label = buildLastLabel();
    if (!label) return;
    downloadBatchLabel(label);
    if (active && label.barcode_label) setPrintedLabels(markLabelPrinted(active.id, label.barcode_label));
    markBatchPrinted(lastBatch);
  };

  const completeValidation = async () => {
    if (!active || active.items?.some((item) => item.status === 'PENDING' || item.actual_qty == null || !item.expired_date)) return;
    setBusy(true);
    try {
      await sjValidations.complete(active.id);
      notifyGlobal(
        mismatchCount > 0
          ? `Validasi dokumen selesai. ${mismatchCount} item selisih — notifikasi email dikirim ke BLC & Admin Distribusi.`
          : 'Validasi dokumen selesai.',
        'success'
      );
      setActive(null);
      if (active) clearPrintedLabels(active.id);
      loadItems();
      loadStats();
    } catch (error) {
      notifyGlobal(getErrorMessage(error, 'Gagal menyelesaikan validasi.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelValidation = async () => {
    if (!cancelTarget) return;
    const po = cancelTarget.rencana_kirim?.po_transporter || cancelTarget.scan_code;
    setBusy(true);
    try {
      await sjValidations.cancel(cancelTarget.id);
      notifyGlobal(`Validasi PO ${po} dibatalkan. Batch label ikut dibatalkan.`, 'success');
      setCancelTarget(null);
      setActive(null);
      setSelected(null);
      loadItems();
      loadStats();
    } catch (error) {
      notifyGlobal(getErrorMessage(error, 'Gagal membatalkan validasi.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = active?.items?.filter((item) => item.status === 'PENDING').length ?? 0;
  // Item "lengkap": sudah divalidasi + qty terisi + expired terisi.
  // Selesaikan Validasi diblokir sampai semua item lengkap (cegah submit data bolong).
  const isItemComplete = (item: ValidationItem): boolean =>
    item.status !== 'PENDING' && item.actual_qty != null && !!item.expired_date;
  const incompleteItems = active?.items?.filter((item) => !isItemComplete(item)) ?? [];
  const mismatchCount = active?.items?.filter((item) => item.status === 'MISMATCH').length ?? 0;
  /**
   * Hard gate cetak: item yang sudah lengkap tapi labelnya belum ditandai
   * tercetak. Selesaikan Validasi terkunci selama daftar ini tidak kosong —
   * label fisik wajib menempel sebelum dokumen boleh selesai.
   */
  const unprintedItems = unprintedCompleteItems(active?.items, printedLabels);
  const progress = active?.items?.length ? Math.round(((active.items.length - pendingCount) / active.items.length) * 100) : 0;
  const photoRequired = conditionRequiresPhoto(form.condition);
  const umurSelisih = sisaUmur.totalMonths - standarUmur;
  const umurRatio = standarUmur > 0 ? Math.max(0, Math.min((sisaUmur.totalMonths / standarUmur) * 100, 100)) : 0;
  const itemStandarUmur = selected?.umur ?? 0;
  const itemSisaUmur = form.expired_date ? calcUmurInMonths(form.expired_date) : null;
  const itemUmurSelisih = itemSisaUmur ? itemSisaUmur.totalMonths - itemStandarUmur : null;
  const itemUmurSelisihDetail = form.expired_date ? formatUmurSelisih(form.expired_date, itemStandarUmur) : null;
  const popupUmurSelisihDetail = form.expired_date ? formatUmurSelisih(form.expired_date, standarUmur) : null;
  // Statistik header/ring dari server (global per depo), bukan hitungan halaman aktif.
  // Level PENDING tidak ada pada validasi dokumen — record langsung berstatus IN_PROGRESS.
  const svToday = svStats?.today ?? 0;
  const svInProgress = svStats?.in_progress ?? 0;
  const svCompleted = svStats?.completed ?? 0;
  const svCancelled = svStats?.cancelled ?? 0;
  const svTotal = svStats?.total ?? 0;
  // Dipakai empty-state: apakah pencarian aktif (UI saja).
  const hasSearch = search.trim().length > 0;

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
      {wasRedirected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">Standarisasi Tumpukan Belum Disetujui</p>
              <p className="text-xs text-amber-700 mt-1">Buat dan approv standarisasi tumpukan terlebih dahulu di halaman Standarisasi. Setelah disetujui BLC, baru lanjutkan validasi dokumen.</p>
            </div>
            <button onClick={() => router.push('/standarisasi')} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-amber-50 hover:bg-amber-800 transition-colors">
              Buat Standarisasi
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
            </button>
          </div>
        </div>
      )}
      <div className="mt-5 space-y-5">
        {/* Header — reflektif, konsisten dengan pola desain modern */}
        <header className="rounded-2xl bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <svg aria-hidden="true" className="h-6 w-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Validasi Dokumen</h1>
                <p className="mt-0.5 text-ink-fg-muted">Kontrol fisik produk, quantity, kondisi, dan expired.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: 'Hari ini', value: svToday, badge: 'bg-white/20 text-white', dot: 'bg-surface-card' },
                { label: 'Berjalan', value: svInProgress, badge: 'bg-blue-400 text-blue-950', dot: 'bg-blue-400' },
                { label: 'Selesai', value: svCompleted, badge: 'bg-emerald-400 text-emerald-950', dot: 'bg-emerald-400' },
                { label: 'Total', value: svTotal, badge: 'bg-white/20 text-white', dot: 'bg-gray-300' },
              ].map((stat) => (
                <span key={stat.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                  <span className={`h-1.5 w-1.5 rounded-full ${stat.dot}`} />
                  {stat.label}
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums ${stat.badge}`}>{stat.value}</span>
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Scan Panel */}
          <div className="xl:col-span-1 space-y-5">
            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white shadow-sm">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Quick Scan</h2>
                    <p className="mt-0.5 text-xs text-slate-400">Cari PO transporter untuk memulai validasi</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    <input id="validation-code" placeholder="Scan atau ketik PO..." className="input-field pl-9 bg-surface-raised text-sm py-2.5 focus:bg-surface-card" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findDocument()} aria-label="Kode validasi" />
                  </div>
                  <button type="button" onClick={() => findDocument()} disabled={busy || !code.trim()} className="btn-primary text-sm px-4 py-2.5 disabled:opacity-50 shrink-0">{busy ? '...' : 'Cari'}</button>
                  <button type="button" onClick={() => setShowScanner(true)} aria-label="Buka scanner barcode" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-surface-card px-3 py-2.5 text-slate-700 transition-colors hover:bg-surface-raised shrink-0">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>
                {lookup && (
                  <div className="mt-4 space-y-3 rounded-xl border border-gray-100 bg-overlay-70 p-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { label: 'PO', value: lookup.po_transporter, mono: true },
                        { label: 'Driver', value: lookup.driver_name || '-', mono: false },
                        { label: 'Nopol', value: lookup.nopol || '-', mono: true },
                        { label: 'Tujuan', value: lookup.destination_name || '-', mono: false },
                      ].map((item) => (
                        <div key={item.label}><p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{item.label}</p><p className={`text-sm ${item.mono ? 'font-mono font-bold text-slate-800' : 'text-slate-700'}`}>{item.value}</p></div>
                      ))}
                    </div>
                    <button type="button" onClick={startValidation} disabled={busy || !hasPermission('sj_validation.create')} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-ink-800 active:scale-[0.98] disabled:opacity-50">
                      {busy ? 'Memulai...' : 'Mulai Validasi'}
                    </button>
                  </div>
                )}
              </div>
            </section>

            <BarcodeScanner
              open={showScanner}
              onClose={() => setShowScanner(false)}
              formats={SCAN_FORMATS_1D}
              onDetected={(detected) => {
                setShowScanner(false);
                setCode(detected);
                findDocument(detected);
              }}
            />

            {/* Progress Ring */}
            {svTotal > 0 && (
              <section className="bg-surface-card rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Ringkasan Status</h3>
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24 shrink-0 text-gray-300">
                    {/* Stroke colours come from CSS variables, not raw hex: a
                        literal would keep its light-mode value on the dark
                        theme. The track in particular was near-white, which made
                        the empty part of the ring invisible. */}
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--oz-gray-300)" strokeWidth="3" />
                      {svInProgress > 0 && <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--oz-blue-600)" strokeWidth="3" strokeDasharray={`${(svInProgress / svTotal) * 100}, 100`} strokeDashoffset="0" strokeLinecap="round" className="transition-all duration-1000" />}
                      {svCompleted > 0 && <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--oz-emerald-500)" strokeWidth="3" strokeDasharray={`${(svCompleted / svTotal) * 100}, 100`} strokeDashoffset={`${-(svInProgress / svTotal) * 100}`} strokeLinecap="round" className="transition-all duration-1000" />}
                      {svCancelled > 0 && <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--oz-red-500)" strokeWidth="3" strokeDasharray={`${(svCancelled / svTotal) * 100}, 100`} strokeDashoffset={`${-((svInProgress + svCompleted) / svTotal) * 100}`} strokeLinecap="round" className="transition-all duration-1000" />}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-slate-800">{svTotal}</span>
                      <span className="text-[9px] text-slate-400 uppercase">Total</span>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
{[
                       { label: 'Diproses', count: svInProgress, color: 'bg-blue-500', textColor: 'text-blue-600' },
                       { label: 'Selesai', count: svCompleted, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                       { label: 'Dibatalkan', count: svCancelled, color: 'bg-red-500', textColor: 'text-red-600' },
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
            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-chip-primary">
                    <svg className="h-5 w-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Daftar Validasi</h2>
                    <p className="mt-0.5 text-xs text-slate-400">{totalRows} entri ditemukan</p>
                  </div>
                </div>
                <div className="w-full sm:w-72">
                  <SearchInput value={search} onChange={(v) => setSearch(v)} placeholder="Cari PO transporter..." resultCount={totalRows} resultLabel="validasi" />
                </div>
                {depots.length > 1 && (
                  <div className="relative w-full sm:w-56">
                    <label htmlFor="sj-depo" className="sr-only">Filter depo</label>
                    <select
                      id="sj-depo"
                      value={kodeDepo}
                      onChange={(e) => { setKodeDepo(e.target.value); setPage(1); }}
                      className="w-full appearance-none rounded-xl border border-gray-300 bg-surface-card px-3 pr-9 py-2 text-sm text-gray-900 leading-tight shadow-sm cursor-pointer focus:border-primary-500 focus:outline-none focus:ring-primary-500"
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

              {/* Table - Desktop */}
              <div className="overflow-x-auto overflow-y-auto hidden md:block max-h-[560px]">
                <table className="w-full min-w-180 border-collapse">
                  <caption className="sr-only">Daftar validasi dokumen</caption>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-300 bg-surface-raised">
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">No</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">PO Transporter</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Driver</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Tujuan</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Mulai</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Selesai</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Durasi</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`skel-${i}`} className="animate-pulse">
                          <td className="px-5 py-3"><div className="h-4 w-8 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="h-4 w-32 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="mx-auto h-4 w-28 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="mx-auto h-4 w-20 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="h-4 w-24 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="mx-auto h-5 w-20 rounded-full bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="mx-auto h-4 w-20 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="mx-auto h-4 w-20 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="mx-auto h-4 w-14 rounded bg-slate-100" /></td>
                          <td className="px-5 py-3"><div className="ml-auto h-7 w-16 rounded-lg bg-slate-100" /></td>
                        </tr>
                      ))
                    ) : items.map((item, index) => {
                      const cfg = statusConfig[item.status] || { label: item.status, bg: 'bg-surface-raised', text: 'text-gray-600', dot: 'bg-gray-400' };
                      return (
                        <tr key={item.id} className="transition-colors even:bg-overlay-30 hover:bg-overlay-70">
                          <td className="px-5 py-3 text-center font-mono text-xs text-slate-400">{(page - 1) * 20 + index + 1}</td>
                          <td className="px-5 py-3"><span className="font-mono text-sm font-bold text-slate-900">{item.rencana_kirim?.po_transporter || item.scan_code}</span></td>
                          <td className="px-5 py-3 text-sm text-slate-600">{item.rencana_kirim?.driver_name || '-'}</td>
                          <td className="px-5 py-3 text-sm text-slate-600">{item.rencana_kirim?.destination_name || '-'}</td>
                          <td className="px-5 py-3 text-center"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.text} border-current/10`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span></td>
                          <td className="px-5 py-3 text-center text-xs tabular-nums text-slate-600">{fmtDateTime(item.started_at)}</td>
                          <td className="px-5 py-3 text-center text-xs tabular-nums text-slate-600">{fmtDateTime(item.completed_at)}</td>
                          <td className="px-5 py-3 text-center text-xs tabular-nums text-slate-600">{validationDuration(item, nowIso)}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Pembatalan berlevel PO, bukan per-item: satu baris
                                  = satu PO transporter beserta seluruh itemnya.
                                  Karena itu tombolnya di baris tabel (bukan di
                                  modal item), tapi hanya untuk status IN_PROGRESS. */}
                              {item.status === 'IN_PROGRESS' && (
                                <button
                                  type="button"
                                  onClick={() => setCancelTarget(item)}
                                  disabled={busy || !hasPermission('sj_validation.cancel')}
                                  title={!hasPermission('sj_validation.cancel') ? 'Anda tidak memiliki izin membatalkan validasi' : `Batalkan seluruh validasi PO ${item.rencana_kirim?.po_transporter || ''}`}
                                  className="btn-danger inline-flex min-h-8 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Batalkan
                                </button>
                              )}
                              <button type="button" onClick={() => openDetail(item)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-300 bg-surface-card px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-primary-300 hover:bg-chip-primary hover:text-accent-text"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Detail</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && items.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-400">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                              {hasSearch ? (
                                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                              ) : (
                                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              )}
                            </div>
                            {hasSearch ? (
                              <>
                                <p className="text-sm font-medium">Tidak ada hasil untuk &quot;{search}&quot;</p>
                                <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-medium">Belum ada validasi dokumen</p>
                                <p className="text-xs text-slate-400">Scan atau cari PO transporter di panel Quick Scan untuk memulai.</p>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-gray-100 md:hidden max-h-[560px] overflow-y-auto">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-m-${i}`} className="animate-pulse p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-36 rounded bg-slate-100" />
                          <div className="h-3 w-28 rounded bg-slate-100" />
                        </div>
                        <div className="h-5 w-16 rounded-full bg-slate-100" />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="h-3 w-32 rounded bg-slate-100" />
                        <div className="h-5 w-20 rounded-full bg-slate-100" />
                      </div>
                    </div>
                  ))
                ) : items.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-slate-400">{hasSearch ? `Tidak ada hasil untuk "${search}"` : 'Belum ada validasi dokumen'}</p>
                    {hasSearch && (
                      <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="mt-1 text-xs font-semibold text-accent-text hover:underline">Hapus pencarian</button>
                    )}
                  </div>
                ) : items.map((item) => {
                  const cfg = statusConfig[item.status] || { label: item.status, bg: 'bg-surface-raised', text: 'text-gray-600', dot: 'bg-gray-400' };
                  return (
                    <div key={item.id} className="flex flex-col gap-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-bold text-slate-900">{item.rencana_kirim?.po_transporter || item.scan_code}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{item.rencana_kirim?.driver_name || '-'} <span className="text-slate-300">•</span> {item.rencana_kirim?.destination_name || '-'}</p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cfg.bg} ${cfg.text} border-current/10`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">
                          Selesai: <span className="tabular-nums">{fmtDateTime(item.completed_at)}</span>
                          <span className="text-slate-300"> • </span>
                          Durasi: <span className="tabular-nums font-semibold text-slate-600">{validationDuration(item, nowIso)}</span>
                        </p>
                        <button type="button" onClick={() => openDetail(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-surface-card px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-surface-raised">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          Detail
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {lastPage > 1 && (
                <div className="border-t border-gray-100 bg-overlay-50 px-5 py-4">
                  <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="btn-secondary w-full text-sm disabled:opacity-40 disabled:cursor-not-allowed sm:w-auto">Sebelumnya</button>
                    <span className="text-xs text-slate-500 sm:text-sm">Halaman <strong className="text-slate-800">{page}</strong> dari {lastPage}</span>
                    <button type="button" disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))} className="btn-secondary w-full text-sm disabled:opacity-40 disabled:cursor-not-allowed sm:w-auto">Selanjutnya</button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!active} onClose={() => { setActive(null); setSelected(null); }} title="Detail Validasi Dokumen" subtitle="Pantau progres pemeriksaan dan validasi setiap item." size="2xl" footer={
        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {active?.status === 'IN_PROGRESS' && (
              <button type="button" onClick={completeValidation} disabled={busy || incompleteItems.length > 0 || unprintedItems.length > 0 || !hasPermission('sj_validation.complete')} title={incompleteItems.length > 0 ? `Lengkapi ${incompleteItems.length} item terlebih dahulu (qty & expired)` : (unprintedItems.length > 0 ? `Cetak label ${unprintedItems.length} item terlebih dahulu (${unprintedItems.slice(0, 3).map((i) => i.kode_barang).join(', ')}${unprintedItems.length > 3 ? '…' : ''})` : (!hasPermission('sj_validation.complete') ? 'Anda tidak memiliki izin menyelesaikan validasi' : (mismatchCount > 0 ? `Siap diselesaikan — ${mismatchCount} item selisih, email notifikasi akan dikirim` : undefined)))} className="btn-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>
                Selesaikan Validasi
              </button>
            )}
            <button type="button" onClick={() => { setActive(null); setSelected(null); }} className="btn-secondary w-full px-4 py-2 text-sm sm:w-auto">Tutup</button>
          </div>
          {/* Alasan tombol Selesaikan terkunci. Penuh lebar di baris sendiri —
              di dalam baris tombol yang sudah rapat, teks ini akan terpotong. */}
          {active?.status === 'IN_PROGRESS' && incompleteItems.length > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-amber-700">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              {pendingCount > 0 ? `Validasi ${pendingCount} item terlebih dahulu` : `Lengkapi ${incompleteItems.length} item terlebih dahulu`}
            </p>
          )}
          {active?.status === 'IN_PROGRESS' && incompleteItems.length === 0 && unprintedItems.length > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-amber-700">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
              {unprintedItems.length} label belum dicetak ({unprintedItems.slice(0, 3).map((i) => i.kode_barang).join(', ')}{unprintedItems.length > 3 ? ` +${unprintedItems.length - 3} lainnya` : ''}) — Selesaikan Validasi terkunci sampai semua label tercetak
            </p>
          )}
        </div>
      }>
        {active && (
          <div className="space-y-5 pb-1 animate-slide-up">
            {detailLoading ? (
              <div className="space-y-5 animate-pulse">
                <div className="rounded-2xl bg-slate-200 h-40" />
                <div className="rounded-2xl border border-slate-300 bg-surface-card p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-slate-200" />
                    <div className="space-y-2"><div className="h-4 w-32 rounded bg-slate-200" /><div className="h-3 w-48 rounded bg-slate-200" /></div>
                  </div>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-4 py-3 border-t border-slate-100">
                      <div className="h-4 w-24 rounded bg-slate-200" />
                      <div className="h-4 flex-1 rounded bg-slate-200" />
                      <div className="h-4 w-16 rounded bg-slate-200" />
                      <div className="h-4 w-16 rounded bg-slate-200" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
            <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 p-5 text-white shadow-xl shadow-black/20">
              <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-20 border-primary-400/10" aria-hidden="true" />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-400/15 text-white shadow-lg ring-1 ring-white/10">
                    <svg className="w-5 h-5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-fg-muted">PO Transporter</p>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-ink-fg`}><span className={`h-1.5 w-1.5 rounded-full ${statusConfig[active.status]?.dot || 'bg-ink-fg-muted'}`} />{statusConfig[active.status]?.label || active.status}</span>
                    </div>
                    <h3 className="mt-1 truncate text-xl font-black tracking-tight sm:text-2xl">{active.rencana_kirim?.po_transporter}</h3>
                    <p className="mt-1 text-xs text-ink-fg-muted">{active.rencana_kirim?.driver_name || '-'} <span className="px-1 text-ink-fg-muted/50">•</span> {active.rencana_kirim?.destination_name || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:w-auto">
                  <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-left sm:min-w-25"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-fg-muted">Progres</p><p className="mt-0.5 text-xl font-black text-primary-300">{progress}%</p></div>
                  <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-left sm:min-w-25"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-fg-muted">Item</p><p className="mt-0.5 text-xl font-black text-emerald-300">{active.items?.length ?? 0}</p></div>
                </div>
              </div>
              <div className="relative mt-5">
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-ink-fg-muted"><span>Progress pemeriksaan</span><span>{active.items?.length ?? 0} item</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-primary-400 transition-all duration-700" style={{ width: `${progress}%` }} /></div>
              </div>
            </div>

            {/* Label batch siap cetak untuk produk yang barusan divalidasi.
                One item = one batch, jadi tidak ada ambiguitas label mana yang
                dicetak. Tanpa tombol ini batch tetap terbentuk di server tapi
                tidak pernah sampai ke tangan petugas. */}
            {lastBatch && lastScanned && active.status === 'IN_PROGRESS' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-900">
                    Label batch siap dicetak — {lastScanned.kode_barang}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-emerald-800">
                    {lastBatch.barcode_label}
                    {lastBatch.batch_number ? ` · ${lastBatch.batch_number}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => { void handlePrintLabel(); }} className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" title="Cetak label baru untuk item yang baru divalidasi">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
                    Cetak Label Baru
                  </button>
                  <button type="button" onClick={handleDownloadLabel} className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold">
                    Unduh PDF
                  </button>
                  <button type="button" onClick={() => { setLastBatch(null); setLastScanned(null); }} className="btn-secondary rounded-lg px-2 py-2 text-xs font-bold" aria-label="Tutup panel label">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            )}

            {active.status === 'IN_PROGRESS' && incompleteItems.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="alert">
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <div>
                  <p className="text-xs font-bold text-amber-900">{incompleteItems.length} item belum lengkap — Selesaikan Validasi terkunci</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    {incompleteItems.slice(0, 3).map((i) => i.kode_barang).join(', ')}{incompleteItems.length > 3 ? ` +${incompleteItems.length - 3} lainnya` : ''} — lengkapiQty aktual & tanggal expired via tombol Validasi/Ubah.
                  </p>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 bg-overlay-60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white shadow-sm">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                </div>
                <div><h3 className="text-sm font-black text-slate-900">Daftar Barang</h3><p className="text-[11px] text-slate-400">Tinjau hasil aktual setiap item</p></div>
                </div>
                <span className="w-fit rounded-full bg-chip-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-text">{active.items?.length ?? 0} item</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse">
                  <caption className="sr-only">Rincian item dan hasil validasi dokumen {active.rencana_kirim?.po_transporter}</caption>
                  <thead>
                    <tr className="bg-surface-raised border-b border-gray-300">
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Kode</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Nama Barang</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Plan</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aktual</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Expired</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">No. Batch</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Catatan</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Foto</th>
                      <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {active.items?.map((item) => (
                      <tr key={item.id} className="even:bg-overlay-30 hover:bg-overlay-60 transition-all duration-150">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.kode_barang}</td>
                        <td className="px-4 py-3 text-sm text-slate-800 font-medium">{item.nama_barang}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{item.expected_qty} {item.satuan}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{item.status === 'PENDING' ? '-' : (item.actual_qty ?? '-')}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {item.expired_date ? fmtDate(item.expired_date) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                              Belum diisi
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          <BatchCell batch={item.batch} printed={isLabelPrinted(item, printedLabels)} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={item.notes || ''}>{item.notes || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          {item.photo ? (
                            <a href={storageFileUrl(item.photo) ?? '#'} target="_blank" rel={AUTHENTICATED_FILE_REL} className="inline-flex items-center gap-1 text-xs text-accent-text hover:text-accent-text-strong font-medium">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                              Lihat
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center"><span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${itemStatusStyle[item.status] || 'bg-gray-100 text-gray-600'} border-current/10`}><span className={`w-1.5 h-1.5 rounded-full mr-1 ${item.status === 'PENDING' ? 'bg-amber-500' : item.status === 'VALIDATED' ? 'bg-emerald-500' : 'bg-red-500'}`} />{itemStatusLabel[item.status] || item.status}</span></td>
                        <td className="px-4 py-3 text-right">
                          {canEditItems(active, { canCorrectCompleted: active?.can_correct_completed }) && hasPermission('sj_validation.validate') ? (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {/* Cetak per baris: panel hijau di atas hanya menampilkan
                                  item TERAKHIR, jadi tanpa tombol ini operator tidak
                                  bisa menandai item lama yang panelnya sudah tertimpa. */}
                              {item.status !== 'PENDING' && item.batch?.barcode_label && item.batch?.status !== 'CANCELLED' && lastScanned?.id !== item.id && (
                                <button
                                  type="button"
                                  onClick={() => { void printItemLabel(item, false); }}
                                  title={isLabelPrinted(item, printedLabels) ? `Cetak ulang label ${item.batch.barcode_label}` : `Cetak label ${item.batch.barcode_label} (belum pernah dicetak)`}
                                  className={`inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${isLabelPrinted(item, printedLabels) ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-300 bg-surface-card text-slate-600 hover:bg-surface-raised'}`}
                                >
                                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
                                  {isLabelPrinted(item, printedLabels) ? 'Cetak Ulang' : 'Cetak'}
                                </button>
                              )}
                              {item.status === 'PENDING' ? (
                              <button
                                type="button"
                                onClick={() => openItem(item)}
                                disabled={item.standarisasi?.status === 'pending'}
                                title={item.standarisasi?.status === 'pending' ? 'Standarisasi tumpukan sudah diajukan dan menunggu approval. Silakan tunggu atau buka halaman Standarisasi.' : undefined}
                                className={`inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${item.standarisasi?.status === 'pending' ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed' : item.standarisasi?.status && item.standarisasi.status !== 'approved' ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-chip-primary-border bg-chip-primary text-accent-text hover:bg-chip-primary'}`}
                              >
                                {item.standarisasi?.status && item.standarisasi.status !== 'approved' && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
                                {item.standarisasi?.status === 'pending' ? 'Menunggu Approval' : 'Validasi'}
                              </button>
                            ) : (
                              (active.status === 'IN_PROGRESS' || active?.can_correct_completed) ? (
                                <button type="button" onClick={() => openItem(item)} title="Ubah hasil validasi item ini" className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 bg-surface-card px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-surface-raised">
                                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                                  Ubah
                                </button>
                              ) : null
                            )}
                            </div>
                          ) : (
                            /* Fallback kolom AKSI. Sengaja teks, bukan ikon
                               kunci: yang perlu diketahui operator adalah
                               kenapa tidak bisa diubah, bukan sekadar tidak
                               ada tombol. Dua sebabnya dibedakan karena
                               tindakan berikutnya berbeda — supervisor butuh
                               izin, sedangkan Receiving yang sudah tutup tidak
                               bisa dibuka oleh siapa pun. */
                            <span className="text-[11px] font-semibold text-slate-400">
                              {active.status === 'IN_PROGRESS'
                                ? '-'
                                : hasPermission('sj_validation.edit_completed')
                                  ? 'Koreksi di menu Receiving'
                                  : 'Dokumen selesai'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Barang di luar rencana kirim (deviation record). Rencana tidak
                diubah oleh catatan ini — planner menerima notifikasi email
                dan memutuskan tindak lanjutnya (fase approval). */}
            {((active.extra_items?.length ?? 0) > 0 || (active.status === 'IN_PROGRESS' && hasPermission('sj_validation.extra'))) && (
              <div className="overflow-hidden rounded-2xl border border-amber-200 bg-surface-card shadow-sm">
                <div className="flex flex-col gap-3 border-b border-amber-100 bg-linear-to-br from-amber-50 to-orange-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.62 10.226a2.25 2.25 0 0 1-2.247 2.146H6.617a2.25 2.25 0 0 1-2.247-2.146L3.75 7.5m6 4.125h4.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Barang di luar rencana</h3>
                      <p className="text-[11px] text-amber-700">Rencana tidak diubah — planner diberi tahu setiap catatan baru.</p>
                    </div>
                  </div>
                  {active.status === 'IN_PROGRESS' && hasPermission('sj_validation.extra') && (
                    <button type="button" onClick={() => { setExtraForm(emptyExtraForm); setExtraPhoto(null); setExtraPhotoPreview(''); setExtraOpen(true); }} className="btn-primary inline-flex w-fit items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Laporkan Barang
                    </button>
                  )}
                </div>
                {(active.extra_items?.length ?? 0) === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-slate-400">Belum ada catatan barang di luar rencana.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {active.extra_items?.map((extra) => (
                      <li key={extra.id} className="flex flex-col gap-1.5 px-5 py-3 even:bg-overlay-30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-800">{extra.nama_barang} <span className="ml-1 font-mono text-[11px] font-medium text-slate-500">{extra.kode_barang}</span></p>
                          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                            {extra.qty} {extra.satuan || ''} · {conditionLabels[extra.condition] || extra.condition}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {extra.expired_date ? <>Expired: <span className="font-semibold">{fmtDate(extra.expired_date)}</span><span className="text-slate-300"> • </span></> : null}
                          {extra.notes ? <>{extra.notes}<span className="text-slate-300"> • </span></> : null}
                          Dicatat oleh <span className="font-semibold text-slate-600">{extra.recorder?.full_name || '-'}</span>
                          {extra.photo && (
                            <>
                              <span className="text-slate-300"> • </span>
                              <a href={storageFileUrl(extra.photo) ?? '#'} target="_blank" rel={AUTHENTICATED_FILE_REL} className="font-semibold text-accent-text hover:text-accent-text-strong">Lihat foto</a>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
            )}
          </div>
        )}
      </Modal>

      {/* Konfirmasi pembatalan satu PO transporter beserta seluruh itemnya.
          Batch label yang sudah terlanjur dicetak ikut jadi tidak berlaku,
          jadi pesan menyebut konsekuensinya — bukan sekadar "apakah Anda yakin?". */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelValidation}
        title="Batalkan Validasi"
        message={
          cancelTarget ? `Seluruh validasi untuk PO transporter ${cancelTarget.rencana_kirim?.po_transporter || cancelTarget.scan_code} akan dibatalkan, termasuk seluruh item di dalamnya${validatedCount(cancelTarget) > 0 ? ' dan batch label yang sudah dicetak' : ''}. Tindakan ini tidak dapat dibatalkan.` : ''
        }
        confirmLabel="Ya, Batalkan"
        cancelLabel="Kembali"
        variant="danger"
        loading={busy}
      />

      {/* Item Validation Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Validasi Item" subtitle="Lengkapi pemeriksaan fisik sebelum menyimpan hasil validasi." size="lg" footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" onClick={() => setSelected(null)} className="btn-secondary w-full sm:w-auto">Batal</button>
          <button type="button" onClick={saveItem} disabled={busy || !hasQty(form.actual_qty) || !form.expired_date || (photoRequired && !photo) || !hasPermission('sj_validation.validate')} title={!form.expired_date ? 'Isi tanggal expired terlebih dahulu' : undefined} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
            {busy ? 'Menyimpan...' : 'Simpan Validasi'}
          </button>
        </div>
      }>
        {selected && (
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 p-5 text-white shadow-lg shadow-black/20">
              <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[18px] border-cyan-400/10" aria-hidden="true" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5h13.5M7.5 4.5h9A2.25 2.25 0 0 1 18.75 6.75v10.5A2.25 2.25 0 0 1 16.5 19.5h-9a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 7.5 4.5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 11.25h7.5m-7.5 3.5h4.25" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Item yang diperiksa</p>
                  <p className="mt-1 text-sm font-bold leading-5 text-white">{selected.nama_barang}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-fg-muted">
                    <span className="font-mono text-ink-fg">{selected.kode_barang}</span>
                    <span className="text-ink-fg-muted/50">•</span>
                    <span>Rencana <strong className="font-semibold text-white">{selected.expected_qty} {selected.satuan}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${itemSisaUmur && itemSisaUmur.totalDays <= 0 ? 'border-red-200 bg-red-50' : itemSisaUmur && itemSisaUmur.totalMonths < itemStandarUmur ? 'border-amber-200 bg-amber-50' : 'border-chip-primary-border bg-chip-primary/60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Standar umur produk</p>
                  <p className="mt-1 text-[11px] text-slate-500">Acuan database dalam bulan</p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-accent-text shadow-sm">DATABASE</span>
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
                <label className="block text-xs font-bold text-slate-600">Qty Aktual <span className="text-accent-text">*</span>
                  <div className="relative mt-1.5">
                    <input type="number" min="0" value={form.actual_qty} onChange={(e) => setForm({ ...form, actual_qty: e.target.value })} className="input-field py-2.5 pr-14 text-sm font-semibold" />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-bold uppercase text-slate-400">{selected.satuan}</span>
                  </div>
                </label>
                <label className="block text-xs font-bold text-slate-600">Expired Date <span className="text-accent-text">*</span>
                  <input type="date" value={form.expired_date} onChange={(e) => {
                    const val = e.target.value;
                    setForm({ ...form, expired_date: val });
                    const standar = selected?.umur ?? 0;
                    setStandarUmur(standar);
                    setSisaUmur(calcUmurInMonths(val) ?? { totalMonths: 0, totalDays: 0 });
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
              <label className="block text-xs font-bold text-slate-600">Kondisi <span className="text-accent-text">*</span>
                <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="select-field mt-1.5 w-full py-2.5 text-sm">
                  {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-surface-card px-3 py-3 text-center transition-colors hover:bg-amber-50">
                      <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      <p className="text-[11px] font-bold text-amber-700">Kamera</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); setPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; }); }} className="sr-only" aria-label="Ambil foto dari kamera" />
                  </label>
                  <label className="flex-1 cursor-pointer">
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-surface-card px-3 py-3 text-center transition-colors hover:bg-amber-50">
                      <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      <p className="text-[11px] font-bold text-amber-700">Galeri</p>
                    </div>
                    <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); setPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; }); }} className="sr-only" aria-label="Pilih foto dari galeri" />
                  </label>
                </div>
                {photoPreview && (
                  <div className="relative rounded-xl overflow-hidden border border-amber-200 bg-surface-card">
                    <Image src={photoPreview} alt="Pratinjau foto kondisi" className="w-full h-48 object-cover" width={400} height={200} unoptimized />
                    <button type="button" onClick={() => { setPhoto(null); setPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return ''; }); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors" aria-label="Hapus foto">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
              </div>
            )}
            <label className="block text-xs font-bold text-slate-600">Catatan <span className="font-medium text-slate-400">(opsional)</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Tambahkan catatan pemeriksaan..." className="input-field mt-1.5 min-h-22 resize-y py-2.5 text-sm" rows={3} />
            </label>
          </div>
        )}
      </Modal>

      {/* Modal Barang di Luar Rencana — foto bukti wajib, rencana tidak diubah. */}
      <Modal open={extraOpen} onClose={() => setExtraOpen(false)} title="Barang di Luar Rencana" subtitle="Barang dibawa transporter tapi tidak ada di rencana kirim." size="lg" footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" onClick={() => setExtraOpen(false)} className="btn-secondary w-full sm:w-auto">Batal</button>
          <button
            type="button"
            onClick={saveExtraItem}
            disabled={busy || !hasQty(extraForm.qty) || !extraPhoto || (!extraForm.barcode && (!extraForm.kode_barang || !extraForm.nama_barang))}
            title={!extraPhoto ? 'Foto bukti wajib diunggah' : ((!extraForm.barcode && (!extraForm.kode_barang || !extraForm.nama_barang)) ? 'Isi barcode, atau kode + nama barang manual' : undefined)}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.75 9.25 17 19 7.25" /></svg>}
            {busy ? 'Menyimpan...' : 'Laporkan'}
          </button>
        </div>
      }>
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="alert">
            <svg className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            <p className="text-[11px] font-medium leading-5 text-amber-800">
              Barang tercatat sebagai <strong>deviasi</strong> — rencana kirim tidak diubah. Barcode mengunci barang ke master data; bila tidak dikenal, isi kode &amp; nama manual dari kertas.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-primary-500" aria-hidden="true" />
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-800">Identitas barang</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-600">Barcode
                <input type="text" value={extraForm.barcode} onChange={(e) => setExtraForm({ ...extraForm, barcode: e.target.value })} placeholder="Scan / ketik barcode kemasan" className="input-field mt-1.5 py-2.5 font-mono text-sm" />
              </label>
              <label className="block text-xs font-bold text-slate-600">Satuan <span className="font-medium text-slate-400">(opsional)</span>
                <input type="text" value={extraForm.satuan} onChange={(e) => setExtraForm({ ...extraForm, satuan: e.target.value })} placeholder="CRT / ZAK / PCS" className="input-field mt-1.5 py-2.5 text-sm uppercase" />
              </label>
              <label className="block text-xs font-bold text-slate-600">Kode Barang <span className={`${extraForm.barcode ? 'font-medium text-slate-400' : 'text-accent-text'}`}>{extraForm.barcode ? '(opsional bila barcode dikenal)' : '*'}</span>
                <input type="text" value={extraForm.kode_barang} onChange={(e) => setExtraForm({ ...extraForm, kode_barang: e.target.value })} placeholder="Dari kertas / manual" className="input-field mt-1.5 py-2.5 font-mono text-sm" />
              </label>
              <label className="block text-xs font-bold text-slate-600">Nama Barang <span className={`${extraForm.barcode ? 'font-medium text-slate-400' : 'text-accent-text'}`}>{extraForm.barcode ? '(opsional bila barcode dikenal)' : '*'}</span>
                <input type="text" value={extraForm.nama_barang} onChange={(e) => setExtraForm({ ...extraForm, nama_barang: e.target.value })} placeholder="Nama barang" className="input-field mt-1.5 py-2.5 text-sm" />
              </label>
              <label className="block text-xs font-bold text-slate-600">Jumlah <span className="text-accent-text">*</span>
                <input type="number" min="0.01" value={extraForm.qty} onChange={(e) => setExtraForm({ ...extraForm, qty: e.target.value })} className="input-field mt-1.5 py-2.5 text-sm font-semibold" />
              </label>
              <label className="block text-xs font-bold text-slate-600">Kondisi <span className="text-accent-text">*</span>
                <select value={extraForm.condition} onChange={(e) => setExtraForm({ ...extraForm, condition: e.target.value })} className="select-field mt-1.5 w-full py-2.5 text-sm">
                  {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-600">Expired Date <span className="font-medium text-slate-400">(opsional)</span>
                <input type="date" value={extraForm.expired_date} onChange={(e) => setExtraForm({ ...extraForm, expired_date: e.target.value })} className="input-field mt-1.5 py-2.5 text-sm" />
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50 to-orange-50/50 p-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900">Foto bukti wajib <span className="text-accent-text">*</span></p>
                <p className="text-[11px] text-amber-700 mt-0.5">Menggantikan catatan manual di kertas — ambil langsung atau pilih dari galeri.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer">
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-surface-card px-3 py-3 text-center transition-colors hover:bg-amber-50">
                  <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  <p className="text-[11px] font-bold text-amber-700">Kamera</p>
                </div>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0] ?? null; setExtraPhoto(f); setExtraPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; }); }} className="sr-only" aria-label="Ambil foto dari kamera" />
              </label>
              <label className="flex-1 cursor-pointer">
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-surface-card px-3 py-3 text-center transition-colors hover:bg-amber-50">
                  <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                  <p className="text-[11px] font-bold text-amber-700">Galeri</p>
                </div>
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; setExtraPhoto(f); setExtraPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; }); }} className="sr-only" aria-label="Pilih foto dari galeri" />
              </label>
            </div>
            {extraPhotoPreview && (
              <div className="relative rounded-xl overflow-hidden border border-amber-200 bg-surface-card">
                <Image src={extraPhotoPreview} alt="Pratinjau foto bukti" className="w-full h-48 object-cover" width={400} height={200} unoptimized />
                <button type="button" onClick={() => { setExtraPhoto(null); setExtraPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return ''; }); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors" aria-label="Hapus foto">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
          </div>

          <label className="block text-xs font-bold text-slate-600">Catatan <span className="font-medium text-slate-400">(opsional)</span>
            <textarea value={extraForm.notes} onChange={(e) => setExtraForm({ ...extraForm, notes: e.target.value })} placeholder="Keterangan tambahan..." className="input-field mt-1.5 min-h-22 resize-y py-2.5 text-sm" rows={3} />
          </label>
        </div>
      </Modal>

      {/* Standar Umur Popup Overlay */}
      {showUmurPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/45 p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowUmurPopup(false)}>
          <div className="flex max-h-[min(680px,90vh)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-surface-card shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="relative overflow-hidden bg-linear-to-br from-ink-900 via-ink-900 to-ink-800 px-5 py-5 text-white">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[20px] border-primary-400/10" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-400/15 text-primary-300 ring-1 ring-white/10">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-300">Pemeriksaan umur</p>
                    <h2 className="mt-1 text-base font-black text-white">Standar Umur Produk</h2>
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-fg-muted">{selected?.kode_barang || '-'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-fg-muted">{selected?.nama_barang || 'Produk'}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowUmurPopup(false)} aria-label="Tutup" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-fg-muted transition-colors hover:bg-white/10 hover:text-white">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-chip-primary-border bg-chip-primary/60 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent-text">Standar database</p>
                  <div className="mt-2 flex items-baseline gap-1.5"><span className="text-3xl font-black text-slate-900">{standarUmur || '-'}</span><span className="text-xs font-bold text-slate-500">bulan</span></div>
                  <p className="mt-1 text-[11px] text-slate-500">{standarUmur > 0 ? 'Standar minimum dalam bulan' : 'Data tidak tersedia'}</p>
                </div>
                <div className="rounded-2xl border border-slate-300 bg-surface-raised p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tanggal expired</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{formatDateDmy(form.expired_date)}</p>
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

<div className="rounded-2xl border border-slate-300 bg-surface-card p-4">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Perbandingan terhadap standar</span><span>{standarUmur > 0 ? `${umurRatio.toFixed(0)}%` : '-'}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all duration-700 ${standarUmur <= 0 ? 'bg-slate-400' : sisaUmur.totalDays <= 0 ? 'bg-red-500' : sisaUmur.totalMonths < standarUmur ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${standarUmur > 0 ? umurRatio : 0}%` }} /></div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>0 bulan</span><span>{standarUmur > 0 ? `Standar ${standarUmur} bulan` : 'Data standar tidak tersedia'}</span></div>
                </div>
            </div>

            <div className="border-t border-slate-100 bg-overlay-70 p-4 sm:flex sm:justify-end">
              <button type="button" onClick={() => setShowUmurPopup(false)} className="btn-primary w-full sm:w-auto">Pahami</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}