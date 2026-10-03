'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { emailSettings, getErrorMessage } from '@/lib/api';
import Toast from '@/components/Toast';
import { useAuthStore } from '@/store/auth';

interface EmailSetting {
  mailer: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: string;
  from_address: string;
  from_name: string;
  from_system_env: boolean;
  is_active: boolean;
}

const emptyForm: EmailSetting = {
  mailer: 'smtp',
  host: '',
  port: 587,
  username: '',
  password: '',
  encryption: 'tls',
  from_address: '',
  from_name: '',
  from_system_env: true,
  is_active: false,
};

export default function EmailSettingsPage() {
  const { hasPermission } = useAuthStore();
  const [form, setForm] = useState<EmailSetting>({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = async () => {
    try {
      const res = await emailSettings.get();
      const data = (res.data?.data ?? {}) as Partial<EmailSetting>;
      setForm({
        ...emptyForm,
        mailer: (data.mailer as string) ?? emptyForm.mailer,
        host: (data.host as string) ?? '',
        port: (data.port as number) ?? emptyForm.port,
        username: (data.username as string) ?? '',
        password: (data.password as string) ?? '',
        encryption: (data.encryption as string) ?? emptyForm.encryption,
        from_address: (data.from_address as string) ?? '',
        from_name: (data.from_name as string) ?? '',
        from_system_env: (data.from_system_env as boolean) ?? emptyForm.from_system_env,
        is_active: (data.is_active as boolean) ?? false,
      });
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal memuat setting'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await emailSettings.update(form as unknown as Record<string, unknown>);
      setToast({ message: 'Setting email berhasil disimpan', type: 'success' });
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal menyimpan'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) return;
    setSendingTest(true);
    try {
      const res = await emailSettings.test(testEmail);
      setToast({ message: res.data.message, type: 'success' });
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal mengirim email test'), type: 'error' });
    } finally {
      setSendingTest(false);
    }
  };

  const input = (key: keyof EmailSetting, value: EmailSetting[keyof EmailSetting]) => setForm(prev => ({ ...prev, [key]: value }));

  const canEdit = hasPermission('emails.edit');

  return (
    <DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-6">
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Setting Email</h1>
              <p className="text-ink-fg-muted mt-0.5">Konfigurasi SMTP untuk notifikasi email otomatis</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div role="status" className="text-center py-12 text-gray-400">Memuat...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-base font-bold text-gray-800 mb-1">SMTP Server</h2>
                <p className="text-xs text-gray-400 mb-5">Atur kredensial server email. Jika &quot;Gunakan .env&quot; aktif, kredensial SMTP diambil dari file .env.</p>

                <fieldset disabled={!canEdit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="mailer" className="block text-xs font-medium text-gray-500 mb-1">Mailer</label>
                      <select id="mailer" value={form.mailer} onChange={(e) => input('mailer', e.target.value)} className="select-field">
                        <option value="smtp">SMTP</option>
                        <option value="mailgun">Mailgun</option>
                        <option value="ses">SES</option>
                        <option value="postmark">Postmark</option>
                        <option value="log">Log (debug)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="host" className="block text-xs font-medium text-gray-500 mb-1">Host</label>
                      <input id="host" type="text" value={form.host} onChange={(e) => input('host', e.target.value)} placeholder="smtp.gmail.com" className="input-field text-sm py-2" />
                    </div>
                    <div>
                      <label htmlFor="port" className="block text-xs font-medium text-gray-500 mb-1">Port</label>
                      <input id="port" type="number" value={form.port} onChange={(e) => input('port', parseInt(e.target.value) || 0)} className="input-field text-sm py-2" />
                    </div>
                    <div>
                      <label htmlFor="encryption" className="block text-xs font-medium text-gray-500 mb-1">Encryption</label>
                      <select id="encryption" value={form.encryption} onChange={(e) => input('encryption', e.target.value)} className="select-field">
                        <option value="tls">TLS</option>
                        <option value="ssl">SSL</option>
                        <option value="">None</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="username" className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                      <input id="username" type="text" value={form.username} onChange={(e) => input('username', e.target.value)} placeholder="email@domain.com" className="input-field text-sm py-2" />
                    </div>
                    <div>
                      <label htmlFor="password" className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                      <input id="password" type="password" value={form.password} onChange={(e) => input('password', e.target.value)} placeholder="••••••••" className="input-field text-sm py-2" />
                    </div>
                  </div>

                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <h3 className="text-sm font-bold text-gray-800 mb-3">Pengirim (From)</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="from_address" className="block text-xs font-medium text-gray-500 mb-1">From Address</label>
                        <input id="from_address" type="email" value={form.from_address} onChange={(e) => input('from_address', e.target.value)} placeholder="notifikasi@onezentra.com" className="input-field text-sm py-2" />
                      </div>
                      <div>
                        <label htmlFor="from_name" className="block text-xs font-medium text-gray-500 mb-1">From Name</label>
                        <input id="from_name" type="text" value={form.from_name} onChange={(e) => input('from_name', e.target.value)} placeholder="ONEZENTRA Warehouse" className="input-field text-sm py-2" />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="from_system_env" checked={form.from_system_env} onChange={(e) => input('from_system_env', e.target.checked)} className="w-4 h-4 accent-primary-600" />
                      <label htmlFor="from_system_env" className="text-sm text-gray-600"><strong>Gunakan kredensial dari .env</strong><br /><span className="text-xs text-gray-400">Mengabaikan host/port/username di atas</span></label>
                    </div>
                    <div className="flex items-center gap-3">
                      <label htmlFor="is_active" className="text-sm text-gray-600">Aktifkan pengiriman</label>
                      <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => input('is_active', e.target.checked)} className="w-4 h-4 accent-primary-600" />
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-base font-bold text-gray-800 mb-4">Kirim Email Test</h3>
                <label htmlFor="test-email" className="block text-xs font-medium text-gray-500 mb-1">Alamat Email Test</label>
                <input id="test-email" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} disabled={!canEdit} placeholder="alamat@penerima.com" className="input-field text-sm py-2 mb-3" />
                <button onClick={handleTest} disabled={!testEmail || sendingTest || !canEdit} className="btn-secondary w-full disabled:opacity-50">
                  {sendingTest ? 'Mengirim...' : 'Kirim Test Email'}
                </button>
              </div>

              <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-base font-bold text-gray-800 mb-3">Informasi</h3>
                <ul className="text-xs text-gray-500 space-y-2 list-disc pl-4">
                  <li>Notifikasi dikirim otomatis saat rencana kirim dibuat.</li>
                  <li>Notifikasi hasil validasi dokumen dikirim ke BLC & CC.</li>
                  <li>Kelola penerima (TO/CC) di menu &quot;Penerima Email&quot;.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {!loading && canEdit && (
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="btn-primary min-w-[160px] disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan Setting'}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}