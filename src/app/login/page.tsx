'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getErrorMessage } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, user } = useAuthStore();
  const router = useRouter();

  // Catatan: TIDAK ada probe `GET /user` di sini. Validasi sesi yang sudah ada
  // dilakukan server-side di proxy.ts (cookie sesi ber-flag httpOnly, jadi hanya
  // sisi server yang bisa melihatnya). Sebelumnya probe client-side ini membuat
  // tamu memicu 401 yang selalu tercatat di console browser. Bounce user yang
  // sudah login kini ditangani proxy sebelum halaman ini dirender.
  useEffect(() => {
    if (user) {
      router.push('/dashboard');
      return;
    }
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('expired') === '1') {
      setError('Sesi Anda telah berakhir. Silakan login kembali.');
      // Bersihkan flag dari URL: kalau dibiarkan, refresh/restore tab akan
      // memunculkan pesan ini berulang padahal tidak ada sesi baru berakhir.
      router.replace('/login', { scroll: false });
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      const response = (err as {
        response?: {
          status?: number;
          data?: { message?: string; errors?: { email?: string[] } };
        };
      }).response;
      const validationMessage = response?.data?.errors?.email?.[0] ?? response?.data?.message ?? '';
      const isInvalidCredentials = response?.status === 401 || validationMessage.toLowerCase().includes('credentials');

      setError(isInvalidCredentials ? 'Email atau password salah.' : getErrorMessage(err, 'Login gagal.'));
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-ink-900 via-primary-950 to-ink-900 flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-linear-to-br from-primary-600/20 to-transparent"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent-500/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          {/* Tanpa priority: hanya LCP yang boleh preload (lihat splash di
              dashboard/layout). loading="eager" tidak membuat preload —
              ia hanya menaikkan prioritas fetch gambar in-viewport ini. */}
          <Image src="/garuda-logo.png" alt="" width={560} height={560} loading="eager" className="w-full max-w-lg h-auto mb-8" />
          <h1 className="text-4xl font-bold text-white mb-10 tracking-tight">ONEZENTRA</h1>
          
          <div className="grid grid-cols-2 gap-6 max-w-md w-full">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <div className="w-10 h-10 bg-primary-500/20 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Inventory</h3>
              <p className="text-primary-300 text-sm">Track products</p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <div className="w-10 h-10 bg-accent-500/20 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Security</h3>
              <p className="text-accent-400 text-sm">Role-based access</p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <div className="w-10 h-10 bg-primary-500/20 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Analytics</h3>
              <p className="text-primary-300 text-sm">Real-time data</p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <div className="w-10 h-10 bg-accent-500/20 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Scheduling</h3>
              <p className="text-accent-400 text-sm">Plan ahead</p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
        {/* Kontrol tema global (tersimpan, berlaku sebelum login): tanpa ini
            halaman login selalu mengikuti OS dan pilihan di dashboard tidak
            terlihat di sini. */}
        <div className="absolute top-4 right-4">
          <ThemeToggle compact />
        </div>
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden text-center mb-8">
            <div className="relative w-44 h-16 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary-600/30 px-3 overflow-hidden">
              <Image src="/garuda-logo.png" alt="" fill className="object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">ONEZENTRA</h1>
          </div>

          <div className="bg-card rounded-3xl shadow-2xl shadow-black/10 p-8 border border-border">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">Hallo, Welcome Back</h2>
              <p className="text-muted-foreground">Welcome Back to ONEZENTRA</p>
            </div>

            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-3 animate-fade-in">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0" aria-hidden="true">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-sm font-semibold text-foreground mb-2">Email address</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="Masukkan email"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-semibold text-foreground mb-2">Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pr-12"
                    placeholder="Masukkan password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors min-w-11 min-h-11 flex items-center justify-center -mr-2"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-primary py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-ink-fg-muted mt-8 whitespace-nowrap">
            &copy; {new Date().getFullYear()} <span className="font-semibold text-ink-fg-muted">ONEZENTRA</span>
            <span className="mx-1.5 text-muted-foreground">&middot;</span>
            Developed by <span className="font-semibold text-ink-fg-muted">Langkau_kami</span>
            <span className="mx-1.5 text-muted-foreground">&middot;</span>
            All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}