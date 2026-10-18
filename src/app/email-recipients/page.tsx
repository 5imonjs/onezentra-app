'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { emailRecipients, getErrorMessage } from '@/lib/api';
import SearchInput from '@/components/SearchInput';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Toast from '@/components/Toast';
import { useAuthStore } from '@/store/auth';

interface Recipient {
  id: number;
  document_type: string;
  trigger: string;
  kode_depo: string | null;
  recipient_type: string;
  field: string;
  email: string;
  user_id: number | null;
  role_slug: string | null;
  label: string;
  is_active: boolean;
  resolved_count?: number;
  user?: { id: number; full_name: string; email: string };
}

interface Options {
  document_types: string[];
  triggers: string[];
  fields: string[];
  users: { id: number; full_name: string; email: string }[];
  roles: { id: number; name: string; slug: string }[];
  depots: { kode_depo: string; nama_depo: string }[];
}

/** Form tambah (satu field TO/CC, banyak penerima sekaligus). */
interface CreateForm {
  document_type: string;
  trigger: string;
  kode_depo: string | null;
  field: 'TO' | 'CC';
  user_ids: number[];
  emails: string;
  role: string;
  label: string;
  is_active: boolean;
}

/** Form edit (satu baris penerima). */
interface EditForm {
  document_type: string;
  trigger: string;
  kode_depo: string | null;
  field: string;
  recipient_type: string;
  email: string;
  user_id: number | null;
  role_slug: string;
  label: string;
  is_active: boolean;
}

const emptyCreate: CreateForm = {
  document_type: 'rencana_kirim',
  trigger: 'created',
  kode_depo: null,
  field: 'TO',
  user_ids: [],
  emails: '',
  role: '',
  label: '',
  is_active: true,
};

const emptyEdit: EditForm = {
  document_type: 'rencana_kirim',
  trigger: 'created',
  kode_depo: null,
  field: 'TO',
  recipient_type: 'role',
  email: '',
  user_id: null,
  role_slug: 'blc',
  label: '',
  is_active: true,
};

const docTypeLabel: Record<string, string> = {
  rencana_kirim: 'Rencana Kirim',
  sj_ba: 'Validasi Dokumen',
  receiving: 'Receiving',
  selisih: 'Selisih Qty',
  standarisasi_tumpukan: 'Standarisasi Tumpukan',
  biaya_thl: 'Biaya THL',
  biaya_retribusi: 'Biaya Retribusi',
  opname_expired: 'Opname Expired',
};

const triggerOptions: Record<string, { value: string; label: string; description: string }[]> = {
  rencana_kirim: [
    { value: 'created', label: 'Rencana Kirim dibuat', description: 'Terpicu saat jadwal Rencana Kirim baru dibuat (pemroses: modul Rencana Kirim).' },
    { value: 'cancelled', label: 'Rencana Kirim dibatalkan', description: 'Terpicu saat Rencana Kirim dibatalkan dari status apa pun yang valid (pemroses: modul Rencana Kirim).' },
  ],
  sj_ba: [
    { value: 'validated', label: 'Validasi SJ/BA selesai', description: 'Terpicu saat dokumen SJ/BA selesai divalidasi (pemroses: modul Validasi Dokumen).' },
  ],
  receiving: [
    { value: 'completed', label: 'Proses bongkar selesai', description: 'Terpicu saat unit dinyatakan selesai bongkar (pemroses: modul Receiving).' },
  ],
  selisih: [
    { value: 'selisih_qty', label: 'Selisih Qty ditemukan', description: 'Terpicu saat validasi menemukan selisih qty ≠ 0 (pemroses: modul Validasi Dokumen).' },
  ],
  standarisasi_tumpukan: [
    { value: 'approved', label: 'Standarisasi Tumpukan disetujui', description: 'Terpicu saat pengajuan Standarisasi Tumpukan disetujui (pemroses: modul Standarisasi).' },
    { value: 'rejected', label: 'Standarisasi Tumpukan ditolak', description: 'Terpicu saat pengajuan Standarisasi Tumpukan ditolak (pemroses: modul Standarisasi).' },
  ],
  biaya_thl: [
    { value: 'submitted', label: 'Biaya THL diajukan', description: 'Terpicu saat BLC (pengaju) mengirim pengajuan untuk diperiksa (pemroses: approval Biaya THL).' },
    { value: 'checked', label: 'Biaya THL diperiksa BAC', description: 'Terpicu saat BAC menandai pengajuan telah diperiksa (pemroses: approval Biaya THL).' },
    { value: 'approved', label: 'Biaya THL disetujui', description: 'Terpicu saat RLH menyetujui pengajuan. Jika nominal > Rp 750.000, pengajuan juga butuh pemantauan RFAH.' },
    { value: 'rlh_approved', label: 'Biaya THL disetujui RLH (butuh RFAH)', description: 'Terpicu saat RLH menyetujui pengajuan dengan nominal > Rp 750.000 yang juga butuh pemantauan RFAH (pemroses: approval Biaya THL).' },
    { value: 'rejected', label: 'Biaya THL ditolak', description: 'Terpicu saat RLH menolak pengajuan beserta alasan penolakannya (pemroses: approval Biaya THL).' },
    { value: 'revisi', label: 'Biaya THL perlu revisi', description: 'Terpicu saat BAC/RLH mengirim pengajuan kembali untuk direvisi beserta catatan perbaikan (pemroses: approval Biaya THL).' },
  ],
  biaya_retribusi: [
    { value: 'submitted', label: 'Biaya Retribusi diajukan', description: 'Terpicu saat BLC (pengaju) mengirim pengajuan untuk diperiksa (pemroses: approval Biaya Retribusi).' },
    { value: 'checked', label: 'Biaya Retribusi diperiksa BAC', description: 'Terpicu saat BAC menandai pengajuan telah diperiksa (pemroses: approval Biaya Retribusi).' },
    { value: 'approved', label: 'Biaya Retribusi disetujui', description: 'Terpicu saat RLH menyetujui pengajuan. Jika nominal > Rp 1.000.000, pengajuan juga butuh pemantauan RFAH.' },
    { value: 'rlh_approved', label: 'Biaya Retribusi disetujui RLH (butuh RFAH)', description: 'Terpicu saat RLH menyetujui pengajuan dengan nominal > Rp 1.000.000 yang juga butuh pemantauan RFAH (pemroses: approval Biaya Retribusi).' },
    { value: 'rejected', label: 'Biaya Retribusi ditolak', description: 'Terpicu saat RLH menolak pengajuan beserta alasan penolakannya (pemroses: approval Biaya Retribusi).' },
    { value: 'revisi', label: 'Biaya Retribusi perlu revisi', description: 'Terpicu saat BAC/RLH mengirim pengajuan kembali untuk direvisi beserta catatan perbaikan (pemroses: approval Biaya Retribusi).' },
  ],
  opname_expired: [
    { value: 'completed', label: 'Opname Expired selesai', description: 'Terpicu saat sesi Opname Expired selesai (pemroses: modul Opname Expired).' },
    { value: 'reminder', label: 'Pengingat Opname Expired', description: 'Terpicu saat pengingat dikirim ke depo yang belum kirim (pemroses: modul Opname Expired).' },
  ],
};

const triggerLabel = (documentType: string, trigger: string): string =>
  triggerOptions[documentType]?.find((t) => t.value === trigger)?.label ?? trigger;

const triggerDescription = (documentType: string, trigger: string): string | undefined =>
  triggerOptions[documentType]?.find((t) => t.value === trigger)?.description;

// Alasan penerima aktif tidak akan terkirim (null = sehat).
const resolveProblem = (r: Recipient): string | null => {
  if (!r.is_active || (r.resolved_count ?? 1) > 0) return null;
  if (r.recipient_type === 'role') {
    return `Role "${r.role_slug}" tidak memiliki user aktif — email tidak akan terkirim.`;
  }
  if (r.recipient_type === 'user') {
    return 'User tidak aktif, dihapus, atau tanpa email — email tidak akan terkirim.';
  }
  return 'Alamat email kosong — email tidak akan terkirim.';
};

const fieldBadge = (field: string): string =>
  field === 'TO'
    ? 'bg-blue-50 text-blue-700 border border-blue-100'
    : 'bg-purple-50 text-purple-700 border border-purple-100';

export default function EmailRecipientsPage() {
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('emails.edit');

  const [rawItems, setRawItems] = useState<Recipient[]>([]);
  const [options, setOptions] = useState<Options>({ document_types: [], triggers: [], fields: [], users: [], roles: [], depots: [] });
  const [search, setSearch] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [kodeDepoFilter, setKodeDepoFilter] = useState<string>('');

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Recipient | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit);
  const [depoLocked, setDepoLocked] = useState(false);
  const [fieldLocked, setFieldLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Ambil SEMUA baris, filter dilakukan di klien agar pencarian kode depo
  // (yang tidak didukung backend) tetap bekerja.
  const load = useCallback(async () => {
    try {
      const res = await emailRecipients.list();
      setRawItems(res.data.data);
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal memuat data'), type: 'error' });
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const res = await emailRecipients.options();
      setOptions(res.data);
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal memuat opsi'), type: 'error' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOptions(); }, [loadOptions]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get('document_type');
    if (doc) setDocumentType(doc);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawItems.filter((r) => {
      if (documentType && r.document_type !== documentType) return false;
      if (kodeDepoFilter && r.kode_depo !== kodeDepoFilter) return false;
      if (q) {
        const haystack = [r.email, r.label, r.user?.full_name, r.role_slug, r.document_type, r.trigger, r.field, r.kode_depo]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rawItems, search, documentType, kodeDepoFilter]);

  // Kelompokkan per depo -> { TO, CC }. Global (null) selalu paling atas.
  const depoGroups = useMemo(() => {
    const map = new Map<string | null, { to: Recipient[]; cc: Recipient[] }>();
    for (const r of filtered) {
      const key = r.kode_depo ?? null;
      if (!map.has(key)) map.set(key, { to: [], cc: [] });
      const g = map.get(key)!;
      (r.field === 'CC' ? g.cc : g.to).push(r);
    }
    const order = Array.from(map.keys()).sort((a, b) => {
      if (a === b) return 0;
      if (a === null) return -1;
      if (b === null) return 1;
      return a.localeCompare(b);
    });
    return order.map((k) => [k, map.get(k)!] as const);
  }, [filtered]);

  const totals = useMemo(() => {
    let ok = 0, broken = 0, to = 0, cc = 0;
    for (const r of filtered) {
      if (resolveProblem(r) === null) ok += 1; else broken += 1;
      if (r.field === 'TO') to += 1; else cc += 1;
    }
    return { total: filtered.length, ok, broken, to, cc };
  }, [filtered]);

  const brokenRecipients = useMemo(() => filtered.filter((r) => resolveProblem(r) !== null), [filtered]);

  const depotLabel = (kodeDepo: string | null): string => {
    if (!kodeDepo) return 'Global (Semua Depo)';
    const d = options.depots.find((x) => x.kode_depo === kodeDepo);
    return d ? `${kodeDepo} — ${d.nama_depo}` : kodeDepo;
  };

  const describe = (r: Recipient): string => {
    if (r.recipient_type === 'email') return r.email || '-';
    if (r.recipient_type === 'user') return r.user?.full_name || `User#${r.user_id}`;
    if (r.recipient_type === 'role') {
      const role = options.roles.find((o) => o.slug === r.role_slug);
      return `Role: ${role?.name || r.role_slug}`;
    }
    return '-';
  };

  const recipientInitial = (r: Recipient): string => {
    const name = r.recipient_type === 'email' ? r.email || 'E'
      : r.recipient_type === 'user' ? r.user?.full_name || 'U'
      : r.role_slug || 'R';
    return name.charAt(0).toUpperCase();
  };

  // --- Buka form ---
  const openCreateGeneric = () => {
    setEditTarget(null);
    setDepoLocked(false);
    setFieldLocked(false);
    setCreateForm({
      ...emptyCreate,
      document_type: documentType || 'rencana_kirim',
      trigger: triggerOptions[documentType || 'rencana_kirim']?.[0]?.value ?? 'created',
      kode_depo: kodeDepoFilter || null,
      field: 'TO',
    });
    setShowForm(true);
  };

  const openCreateFor = (depo: string | null, field: 'TO' | 'CC') => {
    setEditTarget(null);
    setDepoLocked(true);
    setFieldLocked(true);
    const doc = documentType || 'rencana_kirim';
    setCreateForm({
      ...emptyCreate,
      document_type: doc,
      trigger: triggerOptions[doc]?.[0]?.value ?? 'created',
      kode_depo: depo,
      field,
    });
    setShowForm(true);
  };

  const openEdit = (r: Recipient) => {
    setEditTarget(r);
    setDepoLocked(false);
    setFieldLocked(false);
    setEditForm({
      document_type: r.document_type,
      trigger: r.trigger,
      kode_depo: r.kode_depo,
      field: r.field,
      recipient_type: r.recipient_type,
      email: r.email || '',
      user_id: r.user_id,
      role_slug: r.role_slug || '',
      label: r.label || '',
      is_active: r.is_active,
    });
    setShowForm(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const base: Record<string, unknown> = {
        document_type: createForm.document_type,
        trigger: createForm.trigger,
        kode_depo: createForm.kode_depo,
        field: createForm.field,
        label: createForm.label,
        is_active: createForm.is_active,
      };
      const targets: Array<Record<string, unknown>> = [];
      for (const uid of createForm.user_ids) targets.push({ ...base, recipient_type: 'user', user_id: uid });
      for (const e of createForm.emails.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
        targets.push({ ...base, recipient_type: 'email', email: e });
      }
      if (createForm.role) targets.push({ ...base, recipient_type: 'role', role_slug: createForm.role });

      if (targets.length === 0) throw new Error('Pilih minimal satu penerima (pengguna, email, atau role).');

      let created = 0;
      for (const t of targets) {
        await emailRecipients.create(t);
        created += 1;
      }
      setToast({ message: `${created} penerima ${createForm.field} ditambahkan ke ${depotLabel(createForm.kode_depo)}`, type: 'success' });
      setShowForm(false);
      load();
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal menyimpan'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        document_type: editForm.document_type,
        trigger: editForm.trigger,
        kode_depo: editForm.kode_depo,
        field: editForm.field,
        recipient_type: editForm.recipient_type,
        label: editForm.label,
        is_active: editForm.is_active,
      };
      if (editForm.recipient_type === 'email') payload.email = editForm.email;
      if (editForm.recipient_type === 'user') payload.user_id = editForm.user_id;
      if (editForm.recipient_type === 'role') payload.role_slug = editForm.role_slug;

      await emailRecipients.update(editTarget.id, payload);
      setToast({ message: 'Penerima email diperbarui', type: 'success' });
      setShowForm(false);
      load();
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal menyimpan'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await emailRecipients.delete(deleteTargetId);
      setToast({ message: 'Penerima email dihapus', type: 'success' });
      load();
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal menghapus'), type: 'error' });
    }
    setShowDeleteConfirm(false);
    setDeleteTargetId(null);
  };

  const hasSearch = search.trim().length > 0 || documentType !== '' || kodeDepoFilter !== '';

  const renderRow = (r: Recipient) => {
    const problem = resolveProblem(r);
    return (
      <div key={r.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-surface-raised p-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
          {recipientInitial(r)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900 wrap-break-word">{describe(r)}</span>
            {problem && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600 ring-1 ring-red-200" title={problem} role="img" aria-label="Peringatan: penerima tidak akan terkirim">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                Tak terkirim
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {docTypeLabel[r.document_type] || r.document_type} · {triggerLabel(r.document_type, r.trigger)}
          </p>
          {r.label && <p className="mt-0.5 text-xs text-gray-400">{r.label}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
            {r.is_active ? 'Aktif' : 'Nonaktif'}
          </span>
          {canEdit && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit" aria-label={`Edit ${describe(r)}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
              </button>
              <button onClick={() => { setDeleteTargetId(r.id); setShowDeleteConfirm(true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Hapus" aria-label={`Hapus ${describe(r)}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderColumn = (depoKey: string | null, field: 'TO' | 'CC', list: Recipient[]) => (
    <div className="rounded-xl border border-slate-100 bg-surface-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-black/5 ${fieldBadge(field)}`}>
          {field}
          <span className="tabular-nums opacity-70">({list.length})</span>
        </span>
        {canEdit && (
          <button
            onClick={() => openCreateFor(depoKey, field)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-500/10 transition-colors"
            aria-label={`Tambah penerima ${field} untuk ${depotLabel(depoKey)}`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Tambah {field}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="px-1 py-3 text-xs text-gray-400">Belum ada penerima {field} untuk depo ini.</p>
      ) : (
        <div className="space-y-2">{list.map(renderRow)}</div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Penerima Email per Depo</h1>
              <p className="text-ink-fg-muted mt-0.5">Atur siapa yang menerima notifikasi (TO/CC), dikelompokkan per depo</p>
            </div>
          </div>
        </div>

        {/* Audit ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Total Penerima</p>
            <p className="text-2xl font-bold text-gray-900">{totals.total}</p>
          </div>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-blue-100 p-5">
            <p className="text-xs text-blue-600 uppercase font-bold tracking-wider mb-1">TO</p>
            <p className="text-2xl font-bold text-blue-700">{totals.to}</p>
          </div>
          <div className="bg-surface-card rounded-2xl shadow-sm border border-purple-100 p-5">
            <p className="text-xs text-purple-600 uppercase font-bold tracking-wider mb-1">CC</p>
            <p className="text-2xl font-bold text-purple-700">{totals.cc}</p>
          </div>
          <div className={`bg-surface-card rounded-2xl shadow-sm p-5 border ${totals.broken > 0 ? 'border-amber-200' : 'border-emerald-200'}`}>
            <p className={`text-xs uppercase font-bold tracking-wider mb-1 ${totals.broken > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Kesehatan</p>
            <p className={`text-2xl font-bold ${totals.broken > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {totals.ok}/{totals.total} aman
            </p>
            {totals.broken > 0 && <p className="text-xs text-amber-600 mt-1">{totals.broken} bermasalah</p>}
          </div>
        </div>

        {/* Alert penerima bermasalah */}
        {brokenRecipients.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4" role="alert">
            <svg className="h-5 w-5 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900">{brokenRecipients.length} penerima tidak akan terkirim</p>
              <ul className="mt-1 space-y-0.5">
                {brokenRecipients.slice(0, 5).map((r) => (
                  <li key={r.id} className="text-xs text-amber-700">
                    {depotLabel(r.kode_depo)} ({r.field}) · {docTypeLabel[r.document_type] || r.document_type} · {triggerLabel(r.document_type, r.trigger)} — {resolveProblem(r)}
                  </li>
                ))}
                {brokenRecipients.length > 5 && (
                  <li className="text-xs text-amber-600">+{brokenRecipients.length - 5} lainnya — periksa badge &quot;Tak terkirim&quot; pada daftar di bawah.</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Kontrol filter + aksi */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1 min-w-0">
              <SearchInput value={search} onChange={(v) => setSearch(v)} placeholder="Cari email, nama, role, atau kode depo..." resultCount={filtered.length} resultLabel="penerima" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="select-field text-sm py-2" aria-label="Filter jenis dokumen">
                <option value="">Semua Dokumen</option>
                {(options.document_types || []).map((t) => (
                  <option key={t} value={t}>{docTypeLabel[t] || t}</option>
                ))}
              </select>
              <select value={kodeDepoFilter} onChange={(e) => setKodeDepoFilter(e.target.value)} className="select-field text-sm py-2 lg:w-52" aria-label="Fokus depo">
                <option value="">Semua Depo</option>
                {(options.depots || []).map((d) => (
                  <option key={d.kode_depo} value={d.kode_depo}>{d.kode_depo} — {d.nama_depo}</option>
                ))}
              </select>
              {canEdit && (
                <button onClick={openCreateGeneric} className="btn-primary whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Penerima
                  </span>
                </button>
              )}
            </div>
          </div>
          {kodeDepoFilter !== '' && (
            <p className="mt-3 text-xs text-primary-700 bg-primary-500/5 rounded-lg px-3 py-2">
              Fokus depo <strong>{depotLabel(kodeDepoFilter)}</strong>. Tombol <strong>Tambah</strong> akan otomatis memakai depo ini.
            </p>
          )}
        </div>

        {/* Daftar per depo */}
        {depoGroups.length === 0 ? (
          <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 px-5 py-16 text-center">
            <div className="flex flex-col items-center gap-3" role="status">
              <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-gray-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              </div>
              <p className="text-sm text-gray-500">{hasSearch ? 'Tidak ada penerima sesuai filter' : 'Belum ada penerima email'}</p>
              {!hasSearch && canEdit && (
                <button onClick={openCreateGeneric} className="btn-primary">Tambah Penerima</button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {depoGroups.map(([depoKey, g]) => {
              const broken = g.to.filter((r) => resolveProblem(r) !== null).length + g.cc.filter((r) => resolveProblem(r) !== null).length;
              const total = g.to.length + g.cc.length;
              const global = depoKey === null;
              return (
                <section key={depoKey ?? 'global'} className={`rounded-2xl shadow-sm border overflow-hidden ${broken > 0 ? 'border-amber-200' : 'border-gray-100'} ${global ? 'ring-1 ring-amber-100' : ''}`}>
                  <header className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 ${global ? 'bg-amber-50' : 'bg-surface-raised'}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${global ? 'bg-amber-100 text-amber-700' : 'bg-primary-500/10 text-accent-text'}`}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" /></svg>
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{depotLabel(depoKey)}</p>
                        <p className="text-xs text-gray-500">{total} penerima · TO {g.to.length} · CC {g.cc.length}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${broken > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {broken > 0 ? `${broken} perlu perbaikan` : 'Sehat'}
                    </span>
                  </header>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4 bg-surface-card">
                    {renderColumn(depoKey, 'TO', g.to)}
                    {renderColumn(depoKey, 'CC', g.cc)}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal create/edit */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editTarget ? 'Edit Penerima Email' : `Tambah Penerima ${createForm.field}`}
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Batal</button>
            <button onClick={editTarget ? handleUpdate : handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </>
        }
      >
        {editTarget ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ef-doc" className="block text-xs font-medium text-gray-500 mb-1">Jenis Dokumen</label>
                <select id="ef-doc" value={editForm.document_type}
                  onChange={(e) => {
                    const doc = e.target.value;
                    setEditForm({ ...editForm, document_type: doc, trigger: triggerOptions[doc]?.[0]?.value ?? 'created' });
                  }}
                  className="select-field">
                  {options.document_types.map((t) => <option key={t} value={t}>{docTypeLabel[t] || t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ef-trigger" className="block text-xs font-medium text-gray-500 mb-1">Trigger</label>
                <select id="ef-trigger" value={editForm.trigger} onChange={(e) => setEditForm({ ...editForm, trigger: e.target.value })} className="select-field">
                  {triggerOptions[editForm.document_type]?.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ef-depo" className="block text-xs font-medium text-gray-500 mb-1">Depo</label>
                <select id="ef-depo" value={editForm.kode_depo || ''} onChange={(e) => setEditForm({ ...editForm, kode_depo: e.target.value || null })} className="select-field">
                  <option value="">Global (Semua Depo)</option>
                  {(options.depots || []).map((d) => <option key={d.kode_depo} value={d.kode_depo}>{d.kode_depo} — {d.nama_depo}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ef-field" className="block text-xs font-medium text-gray-500 mb-1">Field</label>
                <select id="ef-field" value={editForm.field} onChange={(e) => setEditForm({ ...editForm, field: e.target.value })} className="select-field">
                  <option value="TO">TO</option>
                  <option value="CC">CC</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="ef-type" className="block text-xs font-medium text-gray-500 mb-1">Tipe Penerima</label>
              <select id="ef-type" value={editForm.recipient_type} onChange={(e) => setEditForm({ ...editForm, recipient_type: e.target.value })} className="select-field">
                <option value="email">Email Langsung</option>
                <option value="user">Pengguna Tertentu</option>
                <option value="role">Semua Anggota Role</option>
              </select>
            </div>
            {editForm.recipient_type === 'email' && (
              <div>
                <label htmlFor="ef-email" className="block text-xs font-medium text-gray-500 mb-1">Alamat Email</label>
                <input id="ef-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="nama@domain.com" className="input-field text-sm py-2" />
              </div>
            )}
            {editForm.recipient_type === 'user' && (
              <div>
                <label htmlFor="ef-user" className="block text-xs font-medium text-gray-500 mb-1">Pilih Pengguna</label>
                <select id="ef-user" value={editForm.user_id ?? 0} onChange={(e) => setEditForm({ ...editForm, user_id: parseInt(e.target.value) || null })} className="select-field">
                  <option value={0}>Pilih user...</option>
                  {options.users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                </select>
              </div>
            )}
            {editForm.recipient_type === 'role' && (
              <div>
                <label htmlFor="ef-role" className="block text-xs font-medium text-gray-500 mb-1">Pilih Role</label>
                <select id="ef-role" value={editForm.role_slug} onChange={(e) => setEditForm({ ...editForm, role_slug: e.target.value })} className="select-field">
                  <option value="">Pilih role...</option>
                  {options.roles.map((r) => <option key={r.id} value={r.slug}>{r.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="ef-label" className="block text-xs font-medium text-gray-500 mb-1">Label (opsional)</label>
              <input id="ef-label" type="text" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} placeholder="Mis: BLC penerima" className="input-field text-sm py-2" />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="ef-active" checked={editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} className="w-4 h-4 accent-primary-600" />
              <label htmlFor="ef-active" className="text-sm text-gray-600">Aktif</label>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Konteks depo & field */}
            <div className={`rounded-xl px-4 py-3 text-sm ${depoLocked || fieldLocked ? 'bg-brand-wash border border-chip-primary-border' : 'bg-surface-raised'}`}>
              <p className="text-xs text-gray-500 mb-1">Penerima ini akan dibuat untuk:</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-card border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700">
                  <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" /></svg>
                  {depotLabel(createForm.kode_depo)}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${fieldBadge(createForm.field)}`}>
                  Field {createForm.field}
                </span>
                {depoLocked && <span className="text-[11px] text-primary-700">terkunci dari pilihan Anda</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cf-doc" className="block text-xs font-medium text-gray-500 mb-1">Jenis Dokumen</label>
                <select id="cf-doc" value={createForm.document_type}
                  onChange={(e) => {
                    const doc = e.target.value;
                    setCreateForm({ ...createForm, document_type: doc, trigger: triggerOptions[doc]?.[0]?.value ?? 'created' });
                  }}
                  className="select-field">
                  {options.document_types.map((t) => <option key={t} value={t}>{docTypeLabel[t] || t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="cf-trigger" className="block text-xs font-medium text-gray-500 mb-1">Trigger</label>
                <select id="cf-trigger" value={createForm.trigger} onChange={(e) => setCreateForm({ ...createForm, trigger: e.target.value })} className="select-field">
                  {triggerOptions[createForm.document_type]?.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {triggerDescription(createForm.document_type, createForm.trigger) && (
                  <p className="mt-1.5 text-xs text-gray-400">{triggerDescription(createForm.document_type, createForm.trigger)}</p>
                )}
              </div>
              {!depoLocked && (
                <div>
                  <label htmlFor="cf-depo" className="block text-xs font-medium text-gray-500 mb-1">Depo</label>
                  <select id="cf-depo" value={createForm.kode_depo || ''} onChange={(e) => setCreateForm({ ...createForm, kode_depo: e.target.value || null })} className="select-field">
                    <option value="">Global (Semua Depo)</option>
                    {(options.depots || []).map((d) => <option key={d.kode_depo} value={d.kode_depo}>{d.kode_depo} — {d.nama_depo}</option>)}
                  </select>
                </div>
              )}
              {!fieldLocked && (
                <div>
                  <label htmlFor="cf-field" className="block text-xs font-medium text-gray-500 mb-1">Field</label>
                  <div className="flex gap-2">
                    {(['TO', 'CC'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, field: f })}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors ${createForm.field === f ? fieldBadge(f) : 'bg-surface-card border-gray-200 text-gray-500 hover:bg-surface-raised'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-bold text-slate-700">Penerima {createForm.field}</p>
              <div>
                <label htmlFor="cf-users" className="block text-xs font-medium text-gray-500 mb-1">Pengguna (bisa lebih dari satu)</label>
                <select id="cf-users" multiple value={createForm.user_ids.map(String)} onChange={(e) => {
                  const vals = Array.from(e.target.selectedOptions).map((o) => parseInt(o.value)).filter(Boolean);
                  setCreateForm({ ...createForm, user_ids: vals });
                }} className="select-field min-h-[120px]">
                  {options.users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="cf-emails" className="block text-xs font-medium text-gray-500 mb-1">Email tambahan (luar sistem)</label>
                <textarea id="cf-emails" value={createForm.emails} onChange={(e) => setCreateForm({ ...createForm, emails: e.target.value })} placeholder="nama1@domain.com, nama2@domain.com" className="input-field text-sm py-2 min-h-[60px]" />
              </div>
              <div>
                <label htmlFor="cf-role" className="block text-xs font-medium text-gray-500 mb-1">Role (semua anggota)</label>
                <select id="cf-role" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} className="select-field">
                  <option value="">Tidak ada</option>
                  {options.roles.map((r) => <option key={r.id} value={r.slug}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="cf-label" className="block text-xs font-medium text-gray-500 mb-1">Label (opsional)</label>
              <input id="cf-label" type="text" value={createForm.label} onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })} placeholder="Mis: BLC penerima" className="input-field text-sm py-2" />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="cf-active" checked={createForm.is_active} onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })} className="w-4 h-4 accent-primary-600" />
              <label htmlFor="cf-active" className="text-sm text-gray-600">Aktif</label>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }} onConfirm={confirmDelete} title="Hapus Penerima Email" message="Yakin ingin menghapus penerima email ini?" confirmLabel="Hapus" variant="danger" />
    </DashboardLayout>
  );
}
