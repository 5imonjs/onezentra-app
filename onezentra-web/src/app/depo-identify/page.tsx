"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DepoIdentifyPage() {
  const [kodeDepo, setKodeDepo] = useState("");
  const [depoName, setDepoName] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("region_access");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.regionCode) setRegionCode(parsed.regionCode);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleValidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch("/api/v1/depo-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depo_code: kodeDepo, region_code: regionCode }),
      });
      if (res.ok) {
        const data = await res.json();
        setDepoName(data.depo_code || kodeDepo);
        setStatus("success");
        setMsg(`Depo ${data.depo_code || kodeDepo} valid dalam Region ${regionCode}.`);
        sessionStorage.setItem("depo_access", JSON.stringify({ kodeDepo, depoName: data.depo_code || kodeDepo, regionCode }));
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setMsg(data.message || "Depo tidak ditemukan dalam Region ini.");
      }
    } catch {
      setStatus("error");
      setMsg("Gagal menghubungi server Depo.");
    }
  };

  const handleContinue = () => {
    if (status === "success") router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100 flex items-center justify-center px-4 sm:px-6 py-12" style={{ background: "linear-gradient(to bottom right, #0f172a, #020617)", color: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1rem" }}>
      <div className="w-full max-w-md bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-8 sm:p-10" style={{ width: "100%", maxWidth: "28rem", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem", padding: "2rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7)" }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-tr from-amber-400 to-teal-500 shadow-lg mb-4 text-2xl" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "3.5rem", height: "3.5rem", borderRadius: "0.75rem", background: "linear-gradient(135deg, #f59e0b, #14b8a6)", boxShadow: "0 10px 25px -5px rgba(245,158,11,0.3)", marginBottom: "1rem", fontSize: "1.5rem", color: "#fff" }}>●</div>
          <h1 className="text-2xl font-bold tracking-tight">Identifikasi Depo</h1>
          <p className="text-sm text-slate-400 mt-2">Pilih koperasi/perwakilan data dalam Region yang sudah dipilih.</p>
        </div>

        {regionCode && (
          <div className="mb-4 rounded-lg bg-amber-900/20 border border-amber-500/20 px-4 py-3 text-sm text-amber-100 flex items-center gap-3" style={{ borderRadius: "0.75rem", background: "rgba(120,53,15,0.2)", border: "1px solid rgba(245,158,11,0.2)", padding: "0.75rem", fontSize: "0.875rem", color: "#fef3c7", display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ fontWeight: 700 }}>&#9679;</span>
            <span>Region aktif: <strong>{regionCode}</strong>. Pastikan Depo terdaftar di sini.</span>
          </div>
        )}

        <form onSubmit={handleValidate} className="space-y-5">
          <div>
            <label htmlFor="depo-code" className="block text-sm font-medium mb-1.5 text-slate-300">Kode Depo</label>
            <input
              id="depo-code"
              type="text"
              value={kodeDepo}
              onChange={(e) => setKodeDepo(e.target.value.toUpperCase())}
              placeholder="Contoh: DEPO-A1"
              className="w-full rounded-lg bg-slate-800/60 border border-slate-700 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400 transition uppercase"
            />
            <p className="text-xs text-slate-500 mt-1">Masukkan kode Depo yang valid dalam Region ini.</p>
          </div>

          <button
            type="submit"
            disabled={status === "loading" || !kodeDepo.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 hover:from-amber-400 hover:to-teal-400 text-slate-950 font-semibold py-3 text-sm shadow-lg transition disabled:opacity-50 disabled:ursor-not-allowed flex items-center justify-center gap-2"
          >
            <span>●</span>
            {status === "loading" ? "⏳ Memvalidasi..." : "Validasi Depo"}
          </button>
        </form>

        <div aria-live="polite" className="mt-4 min-h-[2.5rem]">
          {status === "success" && (
            <div className="flex items-start gap-3 rounded-xl bg-emerald-900/30 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-100">
              <span style={{ fontWeight: 700, color: "#34d399" }}>✓</span>
              <div>
                <p className="font-medium">Depo terverifikasi</p>
                <p className="text-emerald-200/80 text-xs">{depoName || kodeDepo} — siap melanjutkan ke autentikasi.</p>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-3 rounded-xl bg-rose-900/30 border border-rose-500/30 px-4 py-3 text-sm text-rose-100">
              <span style={{ fontWeight: 700, color: "#fb7185" }}>⚠</span>
              <div>
                <p className="font-medium">Validasi gagal</p>
                <p className="text-rose-200/80 text-xs">{msg || "Depo tidak ditemukan dalam Region ini."}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col gap-3">
          <button
            onClick={handleContinue}
            disabled={status !== "success"}
            className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-medium py-3 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span>→</span>
            Lanjutkan ke Login
          </button>
          <p className="text-[11px] text-slate-500 text-center">Konfigurasi Region dan Depo sudah tersimpan untuk sesi ini.</p>
        </div>
      </div>
    </div>
  );
}
