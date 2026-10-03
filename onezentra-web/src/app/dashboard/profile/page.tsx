'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { auth, getErrorMessage } from '@/lib/api';
import Toast from '@/components/Toast';
import Modal from '@/components/Modal';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuthStore } from '@/store/auth';

export default function ProfilePage() {
  const { user, loadUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: user?.full_name || '', email: user?.email || '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      setToast({ message: 'Nama dan email wajib diisi.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await auth.updateProfile({ full_name: form.full_name.trim(), email: form.email.trim() });
      await loadUser();
      setEditing(false);
      setToast({ message: 'Profil berhasil diperbarui.', type: 'success' });
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal memperbarui profil'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current_password || !passwordForm.password || !passwordForm.password_confirmation) {
      setToast({ message: 'Semua field password wajib diisi.', type: 'error' });
      return;
    }
    if (passwordForm.password !== passwordForm.password_confirmation) {
      setToast({ message: 'Konfirmasi password tidak cocok.', type: 'error' });
      return;
    }
    if (passwordForm.password.length < 8) {
      setToast({ message: 'Password baru minimal 8 karakter.', type: 'error' });
      return;
    }
    setSavingPassword(true);
    try {
      await auth.updateProfile({
        current_password: passwordForm.current_password,
        password: passwordForm.password,
        password_confirmation: passwordForm.password_confirmation,
      });
      setShowPasswordModal(false);
      setPasswordForm({ current_password: '', password: '', password_confirmation: '' });
      setToast({ message: 'Password berhasil diubah.', type: 'success' });
    } catch (e) {
      setToast({ message: getErrorMessage(e, 'Gagal mengubah password'), type: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm" aria-hidden="true">
              <svg className="w-6 h-6 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Profil Saya</h1>
              <p className="text-ink-fg-muted mt-0.5">Kelola informasi akun dan keamanan Anda</p>
            </div>
          </div>
        </div>

        {/* Profile Info Card */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-surface-card">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Informasi Profil</h2>
              {!editing && (
                <button onClick={() => { setForm({ full_name: user.full_name, email: user.email }); setEditing(true); }} className="btn-secondary text-sm">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                    Edit Profil
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            {editing ? (
              <div className="space-y-5 max-w-lg">
                <div>
                  <label htmlFor="profile-full-name" className="block text-sm font-medium text-gray-700 mb-1.5">Nama Lengkap</label>
                  <input
                    id="profile-full-name"
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input
                    id="profile-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={handleSaveProfile} disabled={saving} className="btn-primary disabled:opacity-50">
                    <span className="flex items-center gap-2">
                      {saving ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      )}
                      Simpan
                    </span>
                  </button>
                  <button onClick={() => setEditing(false)} className="btn-secondary">Batal</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="bg-surface-raised rounded-xl p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Nama Lengkap</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{user.full_name}</p>
                </div>
                <div className="bg-surface-raised rounded-xl p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Email</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{user.email}</p>
                </div>
                <div className="bg-surface-raised rounded-xl p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Level</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{user.level}</p>
                </div>
                <div className="bg-surface-raised rounded-xl p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Status</span>
                  <p className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${user.status?.toLowerCase() === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.status?.toLowerCase() === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      {user.status?.toLowerCase() === 'active' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </p>
                </div>
                <div className="bg-surface-raised rounded-xl p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Depo</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{user.nama_depo || '-'} ({user.kode_depo || '-'})</p>
                </div>
                <div className="bg-surface-raised rounded-xl p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Roles</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {user.roles?.length > 0 ? user.roles.map(r => r.name).join(', ') : user.level}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Card */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-surface-card">
            <h2 className="text-lg font-semibold text-gray-900">Keamanan</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Ubah Password</p>
                <p className="text-xs text-gray-500 mt-0.5">Perbarui password akun Anda secara berkala</p>
              </div>
              <button onClick={() => setShowPasswordModal(true)} className="btn-secondary text-sm">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                  Ubah Password
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Appearance — theme preference. Lives on the profile page rather than
            the sidebar so the choice is a deliberate setting, not a stray
            toggle, and it persists per browser via localStorage. */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-surface-card">
            <h2 className="text-lg font-semibold text-gray-900">Tampilan</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Pilih tema terang atau gelap. Pilihan ini tersimpan di browser Anda.
            </p>
          </div>
          <div className="p-6">
            <div className="max-w-md">
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Change Password Modal */}
        <Modal
          open={showPasswordModal}
          onClose={() => { setShowPasswordModal(false); setPasswordForm({ current_password: '', password: '', password_confirmation: '' }); }}
          title="Ubah Password"
          subtitle="Masukkan password lama dan password baru Anda"
          size="md"
          footer={
            <>
              <button onClick={() => { setShowPasswordModal(false); setPasswordForm({ current_password: '', password: '', password_confirmation: '' }); }} className="btn-secondary">Batal</button>
              <button onClick={handleChangePassword} disabled={savingPassword} className="btn-primary disabled:opacity-50">
                <span className="flex items-center gap-2">
                  {savingPassword ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                  )}
                  Simpan Password
                </span>
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1.5">Password Saat Ini</label>
              <input
                id="current-password"
                type="password"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                className="input-field"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">Password Baru</label>
              <input
                id="new-password"
                type="password"
                value={passwordForm.password}
                onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                className="input-field"
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">Konfirmasi Password Baru</label>
              <input
                id="confirm-password"
                type="password"
                value={passwordForm.password_confirmation}
                onChange={(e) => setPasswordForm({ ...passwordForm, password_confirmation: e.target.value })}
                className="input-field"
                autoComplete="new-password"
                minLength={8}
              />
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
