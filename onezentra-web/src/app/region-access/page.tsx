"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegionAccessPage() {
  const [port, setPort] = useState("8000");
  const [regionCode, setRegionCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const handleValidate = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch("/api/v1/region-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region_code: regionCode }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus("success");
        setMsg("Region " + (data.region_code || regionCode) + " valid.");
        if (typeof window !== "undefined") {
          sessionStorage.setItem("region_access", JSON.stringify({ port, regionCode, regionId: data.region_id }));
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setMsg(data.message || "Region tidak valid atau tidak aktif.");
      }
    } catch {
      setStatus("error");
      setMsg("Gagal menghubungi server Region.");
    }
  };

  const handleSave = () => {
    if (status === "success") router.push("/depo-identify");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/10 backdrop-blur-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-400 to-orange-500 text-xl font-black text-slate-950 shadow-lg shadow-amber-400/20">●</div>
          <h1 className="text-2xl font-bold tracking-tight">Akses Region</h1>
          <p className="mt-2 text-sm text-muted-foreground">Identifikasi lingkungan operasional Anda sebelum masuk.</p>
        </div>

        <form onSubmit={handleValidate} className="flex flex-col gap-5">
          <div>
            <label htmlFor="region-code" className="mb-1.5 block text-sm font-medium">Port / Alamat Region</label>
            <div className="flex gap-2">
              <input
                id="region-port"
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="Contoh: 8000"
                className="input-field w-24 shrink-0 rounded-lg"
              />
              <input
                id="region-code"
                type="text"
                value={regionCode}
                onChange={(e) => setRegionCode(e.target.value.toUpperCase())}
                placeholder="Kode Region (contoh: REGION-A)"
                className="input-field w-full flex-1 rounded-lg uppercase"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Port internal dikelola server. Masukkan kode Region yang valid.</p>
          </div>

          <button
            type="submit"
            disabled={status === "loading" || !regionCode.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:from-amber-400 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Memvalidasi..." : "Validasi Region"}
          </button>
        </form>

        <div className="mt-4 min-h-[2.5rem]" aria-live="polite">
          {status === "success" && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-bold text-emerald-600">✓</span>
              <div>
                <p className="font-medium">Konfigurasi Region valid</p>
                <p className="text-xs text-emerald-700">Region <strong>{regionCode}</strong> terverifikasi. Pastikan Depo sudah benar.</p>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span className="font-bold text-red-600">⚠</span>
              <div>
                <p className="font-medium">Validasi gagal</p>
                <p className="text-xs text-red-600">{msg || "Region tidak ditemukan atau tidak aktif."}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
          <button
            onClick={handleSave}
            disabled={status !== "success"}
            className="w-full rounded-xl border border-border bg-card py-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Simpan Konfigurasi &amp; Lanjutkan →
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            Konfigurasi akses akan digunakan untuk sesi berikutnya.
          </p>
        </div>
      </div>
    </div>
  );
}
