"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/store/auth";
import ThemeToggle from "@/components/ThemeToggle";

const featureCards = [
  { title: "Inventory", desc: "Track products", icon: "inventory" },
  { title: "Security", desc: "Role-based access", icon: "security" },
  { title: "Analytics", desc: "Real-time data", icon: "analytics" },
  { title: "Scheduling", desc: "Plan ahead", icon: "scheduling" },
] as const;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [regionContext, setRegionContext] = useState<{ code?: string; depo?: string } | null>(null);
  const { login, isLoading, user } = useAuthStore();
  const router = useRouter();

  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [regionPort, setRegionPort] = useState("8000");
  const [regionCode, setRegionCode] = useState("");
  const [regionStatus, setRegionStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [regionMsg, setRegionMsg] = useState("");

  const loadRegionContext = () => {
    try {
      const saved = localStorage.getItem("region_access");
      if (saved) {
        const parsed = JSON.parse(saved);
        const code = parsed?.regionCode || parsed?.code;
        const depo = parsed?.depoName || parsed?.depo;
        // Bail-out: nilai sama → kembalikan state lama, hindari render ulang
        // tanpa henti saat effect jalan ulang.
        setRegionContext((prev) => (prev?.code === code && prev?.depo === depo ? prev : { code, depo }));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("region_access");
      const depo = sessionStorage.getItem("depo_access");
      if (saved) {
        const parsed = JSON.parse(saved);
        const depoParsed = depo ? JSON.parse(depo) : {};
        const code = parsed?.regionCode || parsed?.code;
        const depoName = depoParsed?.depoName || depoParsed?.kodeDepo;
        setRegionContext((prev) => (prev?.code === code && prev?.depo === depoName ? prev : { code, depo: depoName }));
      }
    } catch {
      // ignore
    }
    loadRegionContext();
    if (user) {
      router.push("/dashboard");
      return;
    }
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("expired") === "1") {
      setError("Sesi Anda telah berakhir. Silakan login kembali.");
      router.replace("/login", { scroll: false });
    }
  }, [user, router]);

  const handleRegionSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setRegionStatus("loading");
    setRegionMsg("");
    try {
      const res = await fetch("/api/v1/region-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ region_code: regionCode.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setRegionStatus("success");
        setRegionMsg("Region valid.");
        localStorage.setItem("region_access", JSON.stringify({ port: regionPort, regionCode: regionCode.trim(), regionId: data.region_id, code: data.region_code }));
        setRegionContext({ code: regionCode.trim(), depo: undefined });
        setTimeout(() => { setRegionModalOpen(false); setRegionStatus("idle"); setRegionMsg(""); }, 600);
      } else {
        const data = await res.json().catch(() => ({}));
        setRegionStatus("error");
        setRegionMsg(data.message || "Region tidak valid atau tidak aktif.");
      }
    } catch {
      setRegionStatus("error");
      setRegionMsg("Gagal menghubungi server Region.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("region_access") : null;
      if (!saved) {
        setRegionModalOpen(true);
        setError("Konfigurasikan Region Access terlebih dahulu.");
        return;
      }
      const parsed = JSON.parse(saved);
      if (!parsed?.regionCode && !parsed?.code) {
        setRegionModalOpen(true);
        setError("Konfigurasi Region Access tidak valid. Silakan perbarui.");
        return;
      }
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      const response = (err as {
        response?: { status?: number; data?: { message?: string; errors?: { email?: string[] } } };
      }).response;
      const validationMessage = response?.data?.errors?.email?.[0] ?? response?.data?.message ?? "";
      const isInvalidCredentials = response?.status === 401 || validationMessage.toLowerCase().includes("credentials");
      setError(isInvalidCredentials ? "Username atau password tidak sesuai." : validationMessage || "Login gagal.");
    }
  };

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-background font-sans text-foreground antialiased lg:grid-cols-2">
      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-white/5 lg:block" aria-hidden="true" />

      <section
        aria-label="Keunggulan ONEZENTRA"
        className="relative hidden min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(115deg,#1b1d50_0%,#171a3c_48%,#101629_100%)] px-10 py-14 text-white lg:flex xl:px-16"
      >
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-indigo-400/10 to-transparent" aria-hidden="true" />
        <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
          <div className="mb-5 flex h-48 w-48 items-center justify-center rounded-3xl bg-white p-2 shadow-2xl shadow-black/20">
            <Image
              alt="Logo"
              priority
              width={560}
              height={560}
              className="h-full w-full object-contain"
              src="/LOGO.png"
            />
          </div>
          <h1 className="mb-10 text-3xl font-bold tracking-wide text-white">ONEZENTRA</h1>

          <div className="grid w-full max-w-md grid-cols-2 gap-5">
            {featureCards.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-sm backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-400/20 text-indigo-200">
                  <FeatureIcon name={item.icon} />
                </div>
                <h2 className="mb-1 font-semibold text-white">{item.title}</h2>
                <p className="text-sm text-indigo-200/80">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-20 sm:px-8 lg:px-12">
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
          <ThemeToggle compact includeSystem />
        </div>

        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden text-center mb-8">
            <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-2xl bg-white p-1.5 shadow-xl shadow-black/20">
              <Image alt="Logo" loading="lazy" width={600} height={600} src="/LOGO.png" className="object-contain w-full h-full" />
            </div>
            <h1 className="text-2xl font-bold tracking-wide text-foreground">ONEZENTRA</h1>
          </div>

          <div className="rounded-3xl border border-border bg-card p-7 text-card-foreground shadow-2xl shadow-black/20 sm:p-9">
            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-bold tracking-tight text-card-foreground">Hallo, Welcome Back</h2>
              <p className="text-sm text-muted-foreground">Welcome Back to ONEZENTRA</p>
            </div>

            {regionContext && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground">
                <svg className="h-5 w-5 shrink-0 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M3 12h18M12 3a14 14 0 010 18m0-18a14 14 0 000 18" />
                </svg>
                <div>
                  <p className="font-medium">Region: <strong>{regionContext.code || "—"}</strong></p>
                  {regionContext.depo && <p className="text-xs text-muted-foreground">Depo: {regionContext.depo}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => { setRegionModalOpen(true); setRegionStatus("idle"); setRegionMsg(""); }}
                  className="ml-auto rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground transition hover:bg-accent hover:text-accent-foreground"
                  aria-label="Ubah Region Access"
                >
                  Ubah
                </button>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-card-foreground">Username</label>
                <input
                  id="login-email"
                  type="text"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15"
                  placeholder="Masukkan username"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-card-foreground">Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15"
                    placeholder="Masukkan password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label="Tampilkan password"
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86L1.82 18.5A2 2 0 003.55 21h16.9a2 2 0 001.73-2.5L13.7 3.86a2 2 0 00-3.4 0z" />
                  </svg>
                  <div>
                    <p className="font-medium">Login gagal</p>
                    <p className="text-xs opacity-85">{error}</p>
                  </div>
                </div>
              )}
              <button
                type="submit"
                className="w-full rounded-xl bg-primary py-3.5 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? "Memvalidasi..." : "SIGN IN"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setRegionModalOpen(true); setRegionStatus("idle"); setRegionMsg(""); }}
              className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15l.3 1.8-1.5 2.6-1.8-.5-1.5.9-.5 1.7h-3l-.5-1.7-1.5-.9-1.8.5-1.5-2.6.3-1.8-.9-1.5-1.7-.5v-3l1.7-.5.9-1.5-.3-1.8 1.5-2.6 1.8.5 1.5-.9.5-1.7h3l.5 1.7 1.5.9 1.8-.5 1.5 2.6-.3 1.8.9 1.5 1.7.5v3l-1.7.5-.9 1.5z" />
              </svg>
              <span>Region Access</span>
            </button>

            <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              Jika belum menyimpan Region Access, konfigurasi akan diminta sebelum login.
            </p>
          </div>
          <footer className="mt-7 text-center text-xs text-muted-foreground">
            © 2026 ONEZENTRA <span className="px-1">·</span> Developed by Langkau_kami <span className="px-1">·</span> All rights reserved
          </footer>
        </div>
      </section>

      {regionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Region Access">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Region Access</h3>
              <button onClick={() => { setRegionModalOpen(false); setRegionStatus("idle"); setRegionMsg(""); }} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleRegionSave} className="space-y-4">
              <div>
                <label htmlFor="region-port-modal" className="mb-1 block text-sm font-medium">Port</label>
                <input id="region-port-modal" type="text" value={regionPort} onChange={(e) => setRegionPort(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label htmlFor="region-code-modal" className="mb-1 block text-sm font-medium">Region Code</label>
                <input id="region-code-modal" type="text" value={regionCode} onChange={(e) => setRegionCode(e.target.value.toUpperCase())} placeholder="Contoh: REGION-A" required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <button
                type="button"
                onClick={() => { void handleRegionSave(); }}
                disabled={regionStatus === "loading" || !regionCode.trim()}
                className="w-full rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {regionStatus === "loading" ? "Memvalidasi..." : "SAVE"}
              </button>
            </form>
            {regionStatus === "success" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-success">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
                </svg>
                {regionMsg}
              </div>
            )}
            {regionStatus === "error" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86L1.82 18.5A2 2 0 003.55 21h16.9a2 2 0 001.73-2.5L13.7 3.86a2 2 0 00-3.4 0z" />
                </svg>
                {regionMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function FeatureIcon({ name }: { name: "inventory" | "security" | "analytics" | "scheduling" }) {
  const paths = {
    inventory: <path strokeLinecap="round" strokeLinejoin="round" d="M5 6h14M5 10h14M5 14h14M5 18h14" />,
    security: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z" />,
    analytics: <path strokeLinecap="round" strokeLinejoin="round" d="M5 19v-5m5 5V9m5 10V5m5 14V11" />,
    scheduling: (
      <>
        <rect x="4" y="6" width="16" height="15" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v6m8-6v6M4 11h16" />
      </>
    ),
  };

  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}