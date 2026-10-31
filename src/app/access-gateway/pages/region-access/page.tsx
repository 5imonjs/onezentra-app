import React from 'react';

export default function RegionAccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-6 text-center">Central Access</h1>
        <p className="text-sm text-slate-300 mb-8 text-center">Identifikasi lingkungan operasional Anda sebelum masuk sistem</p>
        <label className="block mb-2 text-xs uppercase tracking-wider text-slate-400">Region Access Code</label>
        <input type="text" placeholder="Contoh: REGION-A-8000" className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-white placeholder:text-slate-500" />
        <button className="w-full rounded-xl py-3 bg-blue-600 hover:bg-blue-500 font-semibold transition shadow-lg mb-3">Simpan & Lanjutkan</button>
        <p className="text-xs text-slate-400 text-center">Konfigurasi akan digunakan untuk sesi berikutnya</p>
      </div>
    </main>
  );
}
