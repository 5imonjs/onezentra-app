'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { opnameExpired, opnameSessions, getErrorMessage } from '@/lib/api';
import { mondayOfWeek } from '@/lib/dates';
import { notifyGlobal } from '@/store/globalToast';

export interface WaveOption {
  id: number;
  kode_barang: string;
  nama_barang: string | null;
  kode_depo?: string;
  expired_date_ini: string;
  qty_ini_crt: number;
  status_ini: string;
  /** Sudah dipakai sesi yang belum selesai — wave terkunci. */
  has_open_session?: boolean;
}

const todayMonday = (): string => {
  const d = new Date();
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function CreateSessionModal({ userDepo, initialWeekStart, onClose, onCreated }: {
  userDepo: { kode_depo: string; nama_depo: string };
  initialWeekStart?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => initialWeekStart ? mondayOfWeek(initialWeekStart) : todayMonday());
  const [kodeDepo, setKodeDepo] = useState(userDepo.kode_depo);
  const [namaDepo, setNamaDepo] = useState(userDepo.nama_depo);
  const [assignedTo, setAssignedTo] = useState('');
  const [userOptions, setUserOptions] = useState<{ id: number; full_name: string; email: string; level: string }[]>([]);
  const [loadingOfficers, setLoadingOfficers] = useState(false);
  const [waves, setWaves] = useState<WaveOption[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loadingWaves, setLoadingWaves] = useState(false);
  const [saving, setSaving] = useState(false);

  // Petugas dipanggil dari backend per depo (bukan input ID manual), dan
  // di-refresh saat kode depo berubah. Pilihan lama yang tak ada di depo
  // baru otomatis direset agar assignee selalu satu depo dengan sesi.
  useEffect(() => {
    if (!kodeDepo) {
      setUserOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingOfficers(true);
    opnameSessions.officers(kodeDepo)
      .then((res) => {
        if (cancelled) return;
        const items = (res.data?.data ?? []) as { id: number; full_name: string; email: string; level: string }[];
        const list = Array.isArray(items) ? items : [];
        setUserOptions(list);
        setAssignedTo((prev) => (prev && list.some((u) => String(u.id) === prev) ? prev : ''));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setUserOptions([]);
        notifyGlobal(getErrorMessage(e, 'Gagal memuat daftar petugas.'), 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingOfficers(false);
      });
    return () => { cancelled = true; };
  }, [kodeDepo]);

  const loadWaves = useCallback(async () => {
    setLoadingWaves(true);
    try {
      // Ambil SEMUA halaman: cap server 100/halaman, wave bisa ratusan.
      // Filter depo dikirim ke server supaya hitungan halaman tidak salah
      // ketika wave depo lain dibuang di sisi klien.
      const all: WaveOption[] = [];
      let page = 1;
      for (;;) {
        const res = await opnameExpired.list({ week_start: weekStart || undefined, kode_depo: kodeDepo || undefined, per_page: 100, page }) as {
          data: { data: { data: WaveOption[] } };
        };
        const rows = res.data.data.data;
        all.push(...rows);
        if (rows.length < 100 || all.length >= 2000) break;
        page++;
      }
      // Server sudah memfilter depo, tetapi user multi-depo bisa tetap
      // menerima baris depo lain. Sesi hanya boleh berisi satu depo, jadi
      // buang sisanya sebelum user memilih.
      const targetDepo = kodeDepo.trim();
      const scoped = targetDepo
        ? all.filter((w) => !w.kode_depo || w.kode_depo === targetDepo)
        : all;
      setWaves(scoped);
      // Wave yang sudah masuk sesi berjalan tidak boleh dipilih lagi;
      // backend akan menolaknya dengan 422.
      setPicked(new Set(scoped.filter((w) => !w.has_open_session).map((w) => w.id)));
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal memuat baris monitoring'));
    } finally {
      setLoadingWaves(false);
    }
  }, [weekStart, kodeDepo]);

  useEffect(() => { loadWaves(); }, [loadWaves]);

  const lockedCount = waves.filter((w) => w.has_open_session).length;
  const pickableCount = waves.length - lockedCount;

  const save = async () => {
    if (!assignedTo || picked.size === 0) {
      notifyGlobal(
        waves.length > 0 && pickableCount === 0
          ? 'Semua baris monitoring untuk minggu/depo ini sudah masuk sesi berjalan. Buka sesi yang ada atau tambahkan baris dari detail sesi.'
          : 'Pilih petugas dan minimal satu baris monitoring.',
        'error',
      );
      return;
    }
    setSaving(true);
    try {
      await opnameSessions.create({
        week_start: weekStart,
        kode_depo: kodeDepo,
        nama_depo: namaDepo || undefined,
        assigned_to: Number(assignedTo),
        wave_ids: Array.from(picked),
      });
      notifyGlobal('Sesi Stock Opname dibuat.', 'success');
      onCreated();
    } catch (e) {
      notifyGlobal(getErrorMessage(e, 'Gagal membuat sesi'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Buat Sesi Stock Opname" subtitle="Pilih minggu + depo, tugaskan baris monitoring ke petugas lapangan" size="xl"
      footer={<><button onClick={onClose} className="btn-secondary">Batal</button><button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Menyimpan...' : 'Buat Sesi'}</button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cs-week" className="block text-sm font-medium text-foreground mb-1.5">Minggu (Senin) *</label>
          <input
            id="cs-week"
            type="date"
            value={weekStart}
            onChange={(e) => {
              const value = e.target.value;
              if (value) setWeekStart(mondayOfWeek(value));
            }}
            className="input-field"
            required
          />
        </div>
        <div>
          <label htmlFor="cs-depo" className="block text-sm font-medium text-foreground mb-1.5">Kode Depo *</label>
          <input id="cs-depo" value={kodeDepo} onChange={(e) => setKodeDepo(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label htmlFor="cs-nama-depo" className="block text-sm font-medium text-foreground mb-1.5">Nama Depo</label>
          <input id="cs-nama-depo" value={namaDepo} onChange={(e) => setNamaDepo(e.target.value)} className="input-field" />
        </div>
        <div>
          <label htmlFor="cs-assigned" className="block text-sm font-medium text-foreground mb-1.5">Petugas *</label>
          <select
            id="cs-assigned"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="input-field"
            required
            disabled={loadingOfficers}
          >
            <option value="">
              {loadingOfficers
                ? 'Memuat petugas…'
                : userOptions.length === 0
                  ? '— Tidak ada petugas aktif di depo ini —'
                  : '— Pilih petugas —'}
            </option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}{u.email ? ` (${u.email})` : ''}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Baris Monitoring ({picked.size}/{pickableCount})</p>
        {loadingWaves ? <p className="text-sm text-muted-foreground">Memuat baris monitoring...</p> : waves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada baris monitoring minggu ini — buat baris monitoring dulu di Monitoring Kedaluwarsa.</p>
        ) : (
          <>
            {lockedCount > 0 && (
              <p className="text-xs text-amber-700 mb-2">
                {lockedCount} baris sudah masuk sesi berjalan dan tidak bisa dipilih lagi.
              </p>
            )}
            <div className="max-h-64 overflow-auto border border-border rounded-xl divide-y divide-gray-100">
              {waves.map((w) => (
                <label
                  key={w.id}
                  className={`flex items-center gap-3 px-3 py-2 ${w.has_open_session ? 'opacity-60 cursor-not-allowed' : 'hover:bg-overlay-50 cursor-pointer'}`}
                >
                  <input type="checkbox" checked={picked.has(w.id)} disabled={w.has_open_session} onChange={() => setPicked((p) => {
                    const n = new Set(p);
                    if (n.has(w.id)) n.delete(w.id);
                    else n.add(w.id);
                    return n;
                  })} className="w-4 h-4 accent-primary-600" />
                  <span className="font-mono text-sm">{w.kode_barang}</span>
                  <span className="text-xs text-muted-foreground truncate">{w.nama_barang || ''}</span>
                  {w.has_open_session && <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">Sesi berjalan</span>}
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{w.qty_ini_crt} CRT · {w.status_ini}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
