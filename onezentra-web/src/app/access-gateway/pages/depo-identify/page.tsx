import React from 'react';

export default function DepoIdentificationPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/10">
        <div className="text-xs uppercase tracking-widest text-blue-300 mb-2">Region Terpilih: REGION A</div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Depo Identification</h1>
        <p className="text-sm text-ink-fg mb-8">Pilih atau masukkan kode Depo dalam Region ini</p>
        <label className="block mb-2 text-xs uppercase tracking-wider text-ink-fg-muted">Depo Code</label>
        <input type="text" placeholder="Contoh: DEPO-A1" className="input-field w-full rounded-xl px-4 py-3 mb-4 text-ink-fg" />
        <button className="w-full rounded-xl py-3 bg-emerald-600 hover:bg-emerald-500 font-semibold transition shadow-lg">Lanjut ke Login</button>
      </div>
    </main>
  );
}
