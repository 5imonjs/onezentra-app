import React from 'react';

export default function SecureLoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/10">
        <div className="text-xs uppercase tracking-widest text-amber-300 mb-2">Lingkungan: REGION A · DEPO A1</div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Secure Login</h1>
        <p className="text-sm text-ink-fg mb-8">Masuk ke akun operasional Anda</p>
        <label className="block mb-2 text-xs uppercase tracking-wider text-ink-fg-muted">Username</label>
        <input type="text" className="input-field w-full rounded-xl px-4 py-3 mb-4 text-ink-fg" placeholder="Masukkan username" />
        <label className="block mb-2 text-xs uppercase tracking-wider text-ink-fg-muted">Password</label>
        <input type="password" className="input-field w-full rounded-xl px-4 py-3 mb-4 text-ink-fg" placeholder="Masukkan password" />
        <button className="w-full rounded-xl py-3 bg-blue-600 hover:bg-blue-500 font-semibold transition shadow-lg">Login ke Sistem</button>
        <p className="text-xs text-ink-fg-muted text-center mt-4">Akses sesuai hak dan kewenangan pengguna</p>
      </div>
    </main>
  );
}
