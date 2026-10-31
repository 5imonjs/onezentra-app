import React from 'react';

export default function SecureLoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/10">
        <div className="text-xs uppercase tracking-widest text-amber-300 mb-2">Lingkungan: REGION A · DEPO A1</div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Secure Login</h1>
        <p className="text-sm text-slate-300 mb-8">Masuk ke akun operasional Anda</p>
        <label className="block mb-2 text-xs uppercase tracking-wider text-slate-400">Username</label>
        <input type="text" className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-white placeholder:text-slate-500" placeholder="Masukkan username" />
        <label className="block mb-2 text-xs uppercase tracking-wider text-slate-400">Password</label>
        <input type="password" className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6 text-white placeholder:text-slate-500" placeholder="Masukkan password" />
        <button className="w-full rounded-xl py-3 bg-blue-600 hover:bg-blue-500 font-semibold transition shadow-lg">Login ke Sistem</button>
        <p className="text-xs text-slate-400 text-center mt-4">Akses sesuai hak dan kewenangan pengguna</p>
      </div>
    </main>
  );
}
