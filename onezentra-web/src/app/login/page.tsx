"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getErrorMessage } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [regionContext, setRegionContext] = useState<{ code?: string; depo?: string } | null>(null);
  const { login, isLoading, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("region_access");
      const depo = sessionStorage.getItem("depo_access");
      if (saved) {
        const parsed = JSON.parse(saved);
        const depoParsed = depo ? JSON.parse(depo) : {};
        setRegionContext({ code: parsed?.regionCode || parsed?.code, depo: depoParsed?.depoName || depoParsed?.kodeDepo });
      }
    } catch {
      // ignore
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      const response = (err as {
        response?: { status?: number; data?: { message?: string; errors?: { email?: string[] } } };
      }).response;
      const validationMessage = response?.data?.errors?.email?.[0] ?? response?.data?.message ?? "";
      const isInvalidCredentials = response?.status === 401 || validationMessage.toLowerCase().includes("credentials");
      setError(isInvalidCredentials ? "Email atau password tidak sesuai." : validationMessage || "Login gagal.");
    }
  };

  return (
    <div className="min-h-full bg-background text-foreground font-sans antialiased">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 to-transparent"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent-500/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <img
            alt="Logo"
            loading="eager"
            width="560"
            height="560"
            decoding="async"
            className="w-full max-w-lg h-auto mb-8"
            src="/_next/image?url=%2FLOGO.png&w=1200&q=75"
          />
          <div className="grid grid-cols-2 gap-6 max-w-md w-full">
            {[
              { title: "Inventory", desc: "Track products", icon: "🏭" },
              { title: "Security", desc: "Role-based access", icon: "🔒" },
              { title: "Analytics", desc: "Real-time data", icon: "📊" },
              { title: "Scheduling", desc: "Plan ahead", icon: "📅" },
            ].map((item) => (
              <div key={item.title} className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <div className="w-10 h-10 bg-primary-500/20 rounded-xl flex items-center justify-center mb-3 text-xl">{item.icon}</div>
                <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                <p className="text-primary-300 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </</div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden text-center mb-8">
            <div className="relative w-44 h-16 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary-600/30 px-3 overflow-hidden">
              <img alt="Logo" loading="lazy" decoding="async" src="/_next/image?url=%2FLOGO.png&w=1200&q=75" className="object-contain w-full h-full" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">ONEZENTRA</h1>
          </div>

          <div className="bg-card rounded-3xl shadow-2xl shadow-black/10 p-8 border border-border">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2">Hallo, Welcome Back</h2>
              <p className="text-muted-foreground">Welcome Back to ONEZENTRA</p>
            </div>

            {regionContext && (
              <div className="mb-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-400/20 px-4 py-3 text-sm text-slate-200 flex items-center gap-3">
                <span className="text-lg">🌐</span>
                <div>
                  <p className="font-medium">Region: <strong>{regionContext.code || "—"}</strong></p>
                  {regionContext.depo && <p className="text-xs text-amber-200">Depo: {regionContext.depo}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/region-access")}
                  className="ml-auto text-xs bg-white/10 hover:bg-white/20 border border-white/10 rounded-md px-2 py-1 transition"
                >
                  Ubah
                </button>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-email" className="block text-sm font-semibold text-foreground mb-2">Email address</label>
                <input id="login-email" type="email" className="input-field" placeholder="Masukkan email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm font-semibold text-foreground mb-2">Password</label>
                <div className="relative">
                  <input id="login-password" type={showPassword ? "text" : "password"} className="input-field pr-12" placeholder="Masukkan password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label="Tampilkan password" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2" aria-pressed={showPassword}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-semibold py-3.5 rounded-xl shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLoading}>
                {isLoading ? "Memvalidasi..." : "Login"}
              </button>
            </form>

            {error && (
              <div className="mt-4 rounded-xl bg-rose-900/20 border border-rose-500/20 px-4 py-3 text-sm text-rose-100 flex items-start gap-3">
                <span className="font-bold text-rose-400">⚠</span>
                <div>
                  <p className="font-medium">Login gagal</p>
                  <p className="text-xs text-rose-200/80">{error}</p>
                </div>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-white/10 flex flex-col gap-3 text-sm text-slate-400">
              <a href="/region-access" className="flex items-center gap-2 text-amber-300 hover:text-amber-200 transition">
                <span>⚙</span>
                <span>Atur Konfigurasi Region / Depo</span>
              </a>
              <p className="text-xs text-slate-500">Jika belum menyimpan Region/Depo, konfigurasi akan diminta sebelum login.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
