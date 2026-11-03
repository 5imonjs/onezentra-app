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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/10 backdrop-blur-md sm:p-10">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-400 to-teal-500 text-2xl shadow-lg shadow-amber-400/20">●</div>
          <h1 className="text-2xl font-bold tracking-tight">Identifikasi Depo</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pilih koperasi/perwakilan data dalam Region yang sudah dipilih.</p>
        </div>

        {regionCode && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-bold text-amber-600">&#9679;</span>
            <span>Region aktif: <strong>{regionCode}</strong>. Pastikan Depo terdaftar di sini.</span>
          </div>
        )}

        <form onSubmit={handleValidate} className="space-y-5">
          <div>
            <label htmlFor="depo-code" className="mb-1.5 block text-sm font-medium">Kode Depo</label>
            <input
              id="depo-code"
              type="text"
              value={kodeDepo}
              onChange={(e) => setKodeDepo(e.target.value.toUpperCase())}
              placeholder="Contoh: DEPO-A1"
              className="input-field w-full rounded-lg uppercase"
            />
            <p className="mt-1 text-xs text-muted-foreground">Masukkan kode Depo yang valid dalam Region ini.</p>
          </div>

          <button
            type="submit"
            disabled={status === "loading" || !kodeDepo.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:from-amber-400 hover:to-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>●</span>
            {status === "loading" ? "⏳ Memvalidasi..." : "Validasi Depo"}
          </button>
        </form>

        <div aria-live="polite" className="mt-4 min-h-[2.5rem]">
          {status === "success" && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-bold text-emerald-600">✓</span>
              <div>
                <p className="font-medium">Depo terverifikasi</p>
                <p className="text-xs text-emerald-700">{depoName || kodeDepo} — siap melanjutkan ke autentikasi.</p>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span className="font-bold text-red-600">⚠</span>
              <div>
                <p className="font-medium">Validasi gagal</p>
                <p className="text-xs text-red-600">{msg || "Depo tidak ditemukan dalam Region ini."}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
          <button
            onClick={handleContinue}
            disabled={status !== "success"}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>→</span>
            Lanjutkan ke Login
          </button>
          <p className="text-center text-[11px] text-muted-foreground">Konfigurasi Region dan Depo sudah tersimpan untuk sesi ini.</p>
        </div>
      </div>
    </div>
  );
}
