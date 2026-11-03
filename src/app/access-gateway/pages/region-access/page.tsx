import React from 'react';

export default function RegionAccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-6 text-center">Central Access</h1>
        <p className="text-sm text-ink-fg mb-8 text-center">Identifikasi lingkungan operasional Anda sebelum masuk sistem</p>
        <label className="block mb-2 text-xs uppercase tracking-wider text-ink-fg-muted">Region Access Code</label>
        <input type="text" placeholder="Contoh: REGION-A-8000" className="input-field w-full rounded-xl px-4 py-3 mb-4 text-ink-fg" />
        <button className="w-full rounded-xl py-3 bg-blue-600 hover:bg-blue-500 font-semibold transition shadow-lg mb-3">Simpan & Lanjutkan</button>
        <p className="text-xs text-ink-fg-muted text-center">Konfigurasi akan digunakan untuk sesi berikutnya</p>
      </div>
    </main>
  );
}
