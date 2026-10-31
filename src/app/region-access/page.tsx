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
    <div style={{ minHeight: "100vh", background: "linear-gradient(to bottom right, #0f172a, #020617)", color: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: "28rem", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem", padding: "2rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7)" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "3.5rem", height: "3.5rem", borderRadius: "0.75rem", background: "linear-gradient(135deg, #f59e0b, #f97316)", color: "white", fontWeight: 800, fontSize: "1.25rem", marginBottom: "1rem" }}>●</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Akses Region</h1>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginTop: "0.5rem" }}>Identifikasi lingkungan operasional Anda sebelum masuk.</p>
        </div>

        <form onSubmit={handleValidate} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label htmlFor="region-port" style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem", color: "#cbd5e1" }}>Port / Alamat Region</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input id="region-port" type="text" value={port} onChange={(e) => setPort(e.target.value)} placeholder="Contoh: 8000" style={{ width: "6rem", borderRadius: "0.5rem", background: "rgba(30,41,59,0.6)", border: "1px solid #334155", padding: "0.625rem 0.75rem", fontSize: "0.875rem", color: "#f1f5f9" }} />
              <input type="text" value={regionCode} onChange={(e) => setRegionCode(e.target.value.toUpperCase())} placeholder="Kode Region (contoh: REGION-A)" style={{ flex: 1, borderRadius: "0.5rem", background: "rgba(30,41,59,0.6)", border: "1px solid #334155", padding: "0.625rem 0.75rem", fontSize: "0.875rem", color: "#f1f5f9", textTransform: "uppercase" }} />
            </div>
            <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>Port internal dikelola server. Masukkan kode Region yang valid.</p>
          </div>

          <button type="submit" disabled={status === "loading" || !regionCode.trim()} style={{ width: "100%", borderRadius: "0.75rem", background: "linear-gradient(135deg, #f59e0b, #f97316)", color: "#020617", fontWeight: 600, padding: "0.75rem", fontSize: "0.875rem", border: "none", cursor: status === "loading" ? "not-allowed" : "pointer", opacity: status === "loading" ? 0.5 : 1 }}>
            {status === "loading" ? "Memvalidasi..." : "Validasi Region"}
          </button>
        </form>

        <div style={{ marginTop: "1rem", minHeight: "2.5rem" }} aria-live="polite">
          {status === "success" && (
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", borderRadius: "0.75rem", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", padding: "0.75rem", fontSize: "0.875rem", color: "#d1fae5" }}>
              <span style={{ fontWeight: 700, color: "#34d399" }}>✓</span>
              <div>
                <p style={{ fontWeight: 500 }}>Konfigurasi Region valid</p>
                <p style={{ fontSize: "0.75rem", color: "#a7f3d0" }}>Region <strong>{regionCode}</strong> terverifikasi. Pastikan Depo sudah benar.</p>
              </div>
            </div>
          )}
          {status === "error" && (
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", borderRadius: "0.75rem", background: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.3)", padding: "0.75rem", fontSize: "0.875rem", color: "#ffe4e6" }}>
              <span style={{ fontWeight: 700, color: "#fb7185" }}>⚠</span>
              <div>
                <p style={{ fontWeight: 500 }}>Validasi gagal</p>
                <p style={{ fontSize: "0.75rem", color: "#fda4af" }}>{msg || "Region tidak ditemukan atau tidak aktif."}</p>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <button
            onClick={handleSave}
            disabled={status !== "success"}
            style={{ width: "100%", borderRadius: "0.75rem", background: "rgba(30,41,59,1)", border: "1px solid #334155", color: "#f1f5f9", fontWeight: 500, padding: "0.75rem", fontSize: "0.875rem", cursor: status === "success" ? "pointer" : "not-allowed", opacity: status === "success" ? 1 : 0.4 }}
          >
            Simpan Konfigurasi & Lanjutkan →
          </button>
          <p style={{ fontSize: "0.7rem", color: "#64748b", textAlign: "center" }}>
            Konfigurasi akses akan digunakan untuk sesi berikutnya.
          </p>
        </div>
      </div>
    </div>
  );
}
