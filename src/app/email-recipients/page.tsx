'use client';

import { useEffect, useState, useCallback } from 'react';
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
  recipient_type: string;
  field: string;
  email: string;
  user_id: number | null;
  role_slug: string | null;
  label: string;
  is_active: boolean;
  user?: { id: number; full_name: string; email: string };
}

interface Options {
  document_types: string[];
  triggers: string[];
  fields: string[];
  users: { id: number; full_name: string; email: string }[];
  roles: { id: number; name: string; slug: string }[];
}

const emptyForm = {
  document_type: 'rencana_kirim',
  trigger: 'created',
  recipient_type: 'role',
  field: 'TO',
  email: '',
  user_id: 0,
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
    { value: 'rejected', label: 'Biaya THL ditolak', description: 'Terpicu saat RLH menolak pengajuan beserta alasan penolakannya (pemroses: approval Biaya THL).' },
    { value: 'revisi', label: 'Biaya THL perlu revisi', description: 'Terpicu saat BAC/RLH mengirim pengajuan kembali untuk direvisi beserta catatan perbaikan (pemroses: approval Biaya THL).' },
  ],
  biaya_retribusi: [
    { value: 'submitted', label: 'Biaya Retribusi diajukan', description: 'Terpicu saat BLC (pengaju) mengirim pengajuan untuk diperiksa (pemroses: approval Biaya Retribusi).' },
    { value: 'checked', label: 'Biaya Retribusi diperiksa BAC', description: 'Terpicu saat BAC menandai pengajuan telah diperiksa (pemroses: approval Biaya Retribusi).' },
    { value: 'approved', label: 'Biaya Retribusi disetujui', description: 'Terpicu saat RLH menyetujui pengajuan. Jika nominal > Rp 1.000.000, pengajuan juga butuh pemantauan RFAH.' },
    { value: 'rejected', label: 'Biaya Retribusi ditolak', description: 'Terpicu saat RLH menolak pengajuan beserta alasan penolakannya (pemroses: approval Biaya Retribusi).' },
    { value: 'revisi', label: 'Biaya Retribusi perlu revisi', description: 'Terpicu saat BAC/RLH mengirim pengajuan kembali untuk direvisi beserta catatan perbaikan (pemroses: approval Biaya Retribusi).' },
  ],
};

const triggerLabel = (documentType: string, trigger: string): string =>
  triggerOptions[documentType]?.find((t) => t.value === trigger)?.label ?? trigger;

const triggerDescription = (documentType: string, trigger: string): string | undefined =>
  triggerOptions[documentType]?.find((t) => t.value === trigger)?.description;

export default function EmailRecipientsPage() {
  const { hasPermission } = useAuthStore();
  const [items, setItems] = useState<Recipient[]>([]);
  const [options, setOptions] = useState<Options>({ document_types: [], triggers: [], fields: [], users: [], roles: [] });
  const [search, setSearch] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Recipient | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await emailRecipients.list({ search, document_type: documentType || undefined });
      setItems(res.data.data);
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal memuat data'), type: 'error' });
    }
  }, [search, documentType]);

  const loadOptions = async () => {
    try {
      const res = await emailRecipients.options();
      setOptions(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOptions(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get('document_type');
    if (doc) {
      setDocumentType(doc);
      setShowCreate(false);
    }
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm });
    setShowCreate(true);
  };

  const openEdit = (r: Recipient) => {
    setEditTarget(r);
    setForm({
      document_type: r.document_type,
      trigger: r.trigger,
      recipient_type: r.recipient_type,
      field: r.field,
      email: r.email || '',
      user_id: r.user_id || 0,
      role_slug: r.role_slug || '',
      label: r.label || '',
      is_active: r.is_active,
    });
    setShowCreate(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        document_type: form.document_type,
        trigger: form.trigger,
        recipient_type: form.recipient_type,
        field: form.field,
        label: form.label,
        is_active: form.is_active,
      };
      if (form.recipient_type === 'email') payload.email = form.email;
      if (form.recipient_type === 'user') payload.user_id = form.user_id;
      if (form.recipient_type === 'role') payload.role_slug = form.role_slug;

      if (editTarget) {
        await emailRecipients.update(editTarget.id, payload);
      } else {
        await emailRecipients.create(payload);
      }
      setToast({ message: editTarget ? 'Penerima email diperbarui' : 'Penerima email ditambahkan', type: 'success' });
      setShowCreate(false);
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

  const describe = (r: Recipient) => {
    if (r.recipient_type === 'email') return r.email || '-';
    if (r.recipient_type === 'user') return r.user?.full_name || `User#${r.user_id}`;
    if (r.recipient_type === 'role') {
      const role = options.roles.find(o => o.slug === r.role_slug);
      return `Role: ${role?.name || r.role_slug}`;
    }
    return '-';
  };

  const fieldBadge = (field: string) =>
    field === 'TO'
      ? 'bg-blue-50 text-blue-700'
      : 'bg-purple-50 text-purple-700';

  const docBadge = (type: string): string => {
    const colors: Record<string, string> = {
      rencana_kirim: 'bg-sky-50 text-sky-700',
      sj_ba: 'bg-indigo-50 text-indigo-700',
      receiving: 'bg-teal-50 text-teal-700',
      selisih: 'bg-rose-50 text-rose-700',
      standarisasi_tumpukan: 'bg-amber-50 text-amber-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  const recipientInitial = (r: Recipient): string => {
    const name = r.recipient_type === 'email' ? r.email || 'E'
      : r.recipient_type === 'user' ? r.user?.full_name || 'U'
      : r.role_slug || 'R';
    return name.charAt(0).toUpperCase();
  };

  return (
    <DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-6">
        <div className="bg-linear-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Penerima Email</h1>
              <p className="text-gray-400 mt-0.5">Atur siapa yang menerima notifikasi (TO/CC) per jenis dokumen</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <SearchInput value={search} onChange={(v) => { setSearch(v); }} placeholder="Cari penerima..." resultCount={items.length} resultLabel="penerima" />
            </div>
            <div className="flex items-center gap-3">
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="select-field text-sm py-2" aria-label="Filter jenis dokumen">
                <option value="">Semua Dokumen</option>
                {(options.document_types || []).map((t) => (
                  <option key={t} value={t}>{docTypeLabel[t] || t}</option>
                ))}
              </select>
            {hasPermission('emails.edit') && (
              <button onClick={openCreate} className="btn-primary whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Tambah Penerima
                </span>
              </button>
            )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <caption className="sr-only">Daftar penerima email</caption>
              <thead>
                <tr className="bg-slate-50/80">
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">No</th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Dokumen</th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Trigger</th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Field</th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Penerima</th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Label</th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Aktif</th>
                  <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((r) => (
                  <tr key={r.id} className="group hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4 text-sm text-slate-500">{r.id}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${docBadge(r.document_type)}`}>
                        {docTypeLabel[r.document_type] || r.document_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">{triggerLabel(r.document_type, r.trigger)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ring-1 ring-inset ring-black/5 ${fieldBadge(r.field)}`}>{r.field}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                          {recipientInitial(r)}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{describe(r)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500">{r.label || <span className="text-gray-300">-</span>}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                        {r.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission('emails.edit') && (
                        <button onClick={() => openEdit(r)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200" title="Edit" aria-label="Edit">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                        )}
                        {hasPermission('emails.edit') && (
                        <button onClick={() => { setDeleteTargetId(r.id); setShowDeleteConfirm(true); }} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200" title="Hapus" aria-label="Hapus">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3" role="status">
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                          <svg className="w-7 h-7 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                        </div>
                        <p className="text-sm text-gray-500">Belum ada penerima email</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editTarget ? 'Edit Penerima Email' : 'Tambah Penerima Email'} footer={
        <>
          <button onClick={() => setShowCreate(false)} className="btn-secondary">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="er-document-type" className="block text-xs font-medium text-gray-500 mb-1">Jenis Dokumen</label>
              <select id="er-document-type" value={form.document_type}
                onChange={(e) => {
                  const doc = e.target.value;
                  const firstTrigger = triggerOptions[doc]?.[0]?.value ?? 'created';
                  setForm({ ...form, document_type: doc, trigger: firstTrigger });
                }}
                className="select-field">
                {options.document_types.map(t => (
                  <option key={t} value={t}>{docTypeLabel[t] || t}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="er-trigger" className="block text-xs font-medium text-gray-500 mb-1">Trigger</label>
              <select id="er-trigger" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} className="select-field">
                {triggerOptions[form.document_type]?.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {triggerDescription(form.document_type, form.trigger) && (
                <p className="mt-1.5 text-xs text-gray-400">{triggerDescription(form.document_type, form.trigger)}</p>
              )}
            </div>
            <div>
              <label htmlFor="er-field" className="block text-xs font-medium text-gray-500 mb-1">Field</label>
              <select id="er-field" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="select-field">
                {options.fields.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="er-recipient-type" className="block text-xs font-medium text-gray-500 mb-1">Tipe Penerima</label>
              <select id="er-recipient-type" value={form.recipient_type} onChange={(e) => setForm({ ...form, recipient_type: e.target.value })} className="select-field">
                <option value="email">Email Langsung</option>
                <option value="user">Pengguna Tertentu</option>
                <option value="role">Semua Anggota Role</option>
              </select>
              <p className="mt-1.5 text-xs text-gray-400">
                {form.recipient_type === 'email' && 'Kirim ke satu alamat email bebas.'}
                {form.recipient_type === 'user' && 'Kirim ke satu akun pengguna sistem.'}
                {form.recipient_type === 'role' && 'Kirim ke seluruh anggota role terpilih (contoh: semua BLC).'}
              </p>
            </div>
          </div>

          {form.recipient_type === 'email' && (
            <div>
              <label htmlFor="er-email" className="block text-xs font-medium text-gray-500 mb-1">Alamat Email</label>
              <input id="er-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@domain.com" className="input-field text-sm py-2" />
            </div>
          )}
          {form.recipient_type === 'user' && (
            <div>
              <label htmlFor="er-user" className="block text-xs font-medium text-gray-500 mb-1">Pilih Pengguna</label>
              <select id="er-user" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: parseInt(e.target.value) || 0 })} className="select-field">
                <option value={0}>Pilih user...</option>
                {options.users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </select>
            </div>
          )}
          {form.recipient_type === 'role' && (
            <div>
              <label htmlFor="er-role" className="block text-xs font-medium text-gray-500 mb-1">Pilih Role</label>
              <select id="er-role" value={form.role_slug} onChange={(e) => setForm({ ...form, role_slug: e.target.value })} className="select-field">
                <option value="">Pilih role...</option>
                {options.roles.map(r => (
                  <option key={r.id} value={r.slug}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="er-label" className="block text-xs font-medium text-gray-500 mb-1">Label (opsional)</label>
            <input id="er-label" type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Mis: BLC penerima" className="input-field text-sm py-2" />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="er-active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-primary-600" />
            <label htmlFor="er-active" className="text-sm text-gray-600">Aktif</label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }} onConfirm={confirmDelete} title="Hapus Penerima Email" message="Yakin ingin menghapus penerima email ini?" confirmLabel="Hapus" variant="danger" />
    </DashboardLayout>
  );
}