"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import ThemeToggle from "@/components/ThemeToggle";

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
    <div className="min-h-full bg-background text-foreground font-sans antialiased">
      {/* Background layer - subtle gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-600/15 to-accent/10 pointer-events-none z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl bg-primary-500/20"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl bg-accent/20"></div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" aria-hidden="true">
        {/* Left side - Branding showcase */}
        <div className="absolute inset-0 bg-linear-to-br from-primary-600/20 to-transparent pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl bg-primary-500/10"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl bg-accent/10"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center w-full p-6">
          <img
            alt="Logo"
            loading="eager"
            decoding="async"
            className="w-20 h-20 rounded-2xl object-contain mb-8 bg-white/5 p-3"
            src="/_next/image?url=%2FLOGO.png&w=1200&q=75"
          />
          
          {/* Feature cards - subtle and modern */}
          <div className="grid grid-cols-2 gap-3 max-w-md w-full">
            {[
              { title: "Inventory", desc: "Track products", icon: "🏭" },
              { title: "Security", desc: "Role-based access", icon: "🔒" },
              { title: "Analytics", desc: "Real-time data", icon: "📊" },
              { title: "Scheduling", desc: "Plan ahead", icon: "📅" },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 transition-all hover:border-white/20 hover:bg-white/10"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-primary-500/20">
                  {item.icon}
                </div>
                <h3 className="text-sm font-medium text-white">{item.title}</h3>
                <p className="text-xs text-primary-300/80">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Login form with modern card design */}
      <div className="lg:w-1/2 flex items-center justify-center py-8 px-6 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile version - stacked logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="relative w-32 h-32 rounded-full bg-primary-600/20 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/20">
              <img alt="Logo" loading="lazy" decoding="async" src="/_next/image?url=%2FLOGO.png&w=600&q=75" className="object-contain w-full h-full" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">ONEZENTRA</h1>
          </div>

          {/* Desktop/Tablet card - the main login container */}
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/5 border border-white/20 p-8 md:p-10">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2">Hallo, Welcome Back</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Welcome Back to ONEZENTRA
              </p>
            </div>

            {/* Region context if saved - modern badge */}
            {regionContext && (
              <div className="mb-5 rounded-xl bg-linear-to-r from-amber-500/5 to-orange-500/5 border border-amber-400/20 px-4 py-3 text-sm text-slate-700 flex items-center gap-3">
                <span className="text-amber-400">🌐</span>
                <div>
                  <p className="font-medium">Region: <strong>{regionContext.code || "—"}</strong></p>
                  {regionContext.depo && <p className="text-xs text-amber-300">Depo: {regionContext.depo}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => { setRegionModalOpen(true); setRegionStatus("idle"); setRegionMsg(""); }}
                  className="ml-auto text-xs font-semibold text-amber-500 hover:text-amber-400 transition"
                  aria-label="Ubah Region Access"
                >
                  Ubah
                </button>
              </div>
            )}

            {/* Modern login form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* Username input - modern text input */}
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">
                  Username
                </label>
                <input
                  id="login-email"
                  type="text"
                  className="input-field w-full rounded-lg bg-white/80 border border-white/20 px-3.5 py-2.5 placeholder-text-color text-sm focus:bg-white focus:border-primary-400 focus:outline-none transition-colors"
                  placeholder="Masukkan username"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Password input - modern with eye toggle */}
              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-foreground mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="input-field w-full rounded-lg bg-white/80 border border-white/20 px-3.5 py-2.5 pr-14 placeholder-text-color text-sm focus:bg-white focus:border-primary-400 focus:outline-none transition-colors"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M1.236 10.236a1 1 0 010.708-.293l12.73 12.73a1 1 0 01-.708 1.707L9.5 13.793l-4.236 4.236z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-6-6 6-6" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Remember me and error */}
              {error && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-600 flex items-start gap-3">
                  <span className="font-bold text-rose-400">⚠</span>
                  <div>
                    <p className="font-medium">Login gagal</p>
                    <p className="text-xs text-rose-300/80">{error}</p>
                  </div>
                </div>
              )}

              {/* Remember checkbox in a modern row */}
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border flex-shrink-0"
                  checked={true}
                  onChange={() => {}}
                />
                <span>
                  Ingat konfigurasi Region & Depo di perangkat ini. Email
                  dan password tidak disimpan.
                </span>
              </div>

              {/* Modern submit button - primary action */}
              <button
                type="submit"
                className="w-full bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-medium py-3 rounded-xl shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? "Memvalidasi..." : "LOGIN"}
              </button>
            </form>

            {/* Footer links - subtle and modern */}
            <p className="mt-5 text-xs text-slate-400">
              Jika belum menyimpan Region Access, konfigurasi akan diminta sebelum login.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}