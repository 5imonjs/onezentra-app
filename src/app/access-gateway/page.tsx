"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { getErrorMessage } from "@/lib/api";
import {
  fetchDepoOptions,
  validateDepo,
  validateRegion,
  type DepoOption,
} from "@/lib/accessGateway";
import { useAuthStore } from "@/store/auth";

type Step = "region" | "depo" | "login";
type Status = "idle" | "loading" | "ready" | "success" | "error";

type RegionContext = {
  code: string;
  name: string;
};

type SavedContext = {
  regionCode: string;
  regionName?: string;
  depoKode?: string;
  depoName?: string;
  depoId?: number;
  remember: boolean;
};

const STORAGE_KEY = "oz_access_context";

const STEPS: { id: Step; label: string }[] = [
  { id: "region", label: "Region" },
  { id: "depo", label: "Depo" },
  { id: "login", label: "Login" },
];

function readSavedContext(): SavedContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedContext>;
      if (parsed?.regionCode) {
        return {
          regionCode: parsed.regionCode,
          regionName: parsed.regionName,
          depoKode: parsed.depoKode,
          depoName: parsed.depoName,
          depoId: parsed.depoId,
          remember: parsed.remember ?? true,
        };
      }
    }

    const legacyRegionRaw =
      window.localStorage.getItem("region_access") ??
      window.sessionStorage.getItem("region_access");
    if (!legacyRegionRaw) {
      return null;
    }

    const legacyRegion = JSON.parse(legacyRegionRaw) as {
      regionCode?: string;
      code?: string;
      regionName?: string;
    };
    const regionCode = legacyRegion.regionCode ?? legacyRegion.code;
    if (!regionCode) {
      return null;
    }

    const legacyDepoRaw = window.sessionStorage.getItem("depo_access");
    const legacyDepo = legacyDepoRaw
      ? (JSON.parse(legacyDepoRaw) as {
          kodeDepo?: string;
          depoName?: string;
          depoId?: number;
        })
      : null;

    return {
      regionCode,
      regionName: legacyRegion.regionName,
      depoKode: legacyDepo?.kodeDepo,
      depoName: legacyDepo?.depoName,
      depoId: legacyDepo?.depoId,
      remember: true,
    };
  } catch {
    return null;
  }
}

function persistAccessContext(
  region: RegionContext,
  depo: DepoOption | null,
  remember: boolean,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: SavedContext = {
    regionCode: region.code,
    regionName: region.name,
    depoKode: depo?.kode_depo,
    depoName: depo?.nama_depo,
    depoId: depo?.id,
    remember,
  };

  // Konfigurasi Region/Depo bukan kredensial. Jangan pernah menyimpan
  // password/email di sini; session autentikasi tetap cookie HttpOnly.
  const serialized = JSON.stringify(payload);
  window.sessionStorage.setItem(STORAGE_KEY, serialized);
  window.sessionStorage.setItem(
    "region_access",
    JSON.stringify({
      regionCode: region.code,
      code: region.code,
      regionId: region.code,
      regionName: region.name,
    }),
  );

  if (depo) {
    window.sessionStorage.setItem(
      "depo_access",
      JSON.stringify({
        kodeDepo: depo.kode_depo,
        depoName: depo.nama_depo,
        depoId: depo.id,
        regionCode: region.code,
      }),
    );
  } else {
    window.sessionStorage.removeItem("depo_access");
  }

  if (remember) {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.localStorage.setItem(
      "region_access",
      JSON.stringify({
        regionCode: region.code,
        code: region.code,
        regionId: region.code,
        regionName: region.name,
      }),
    );
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem("region_access");
  }
}

export default function AccessGatewayPage() {
  const router = useRouter();
  const loginWithContext = useAuthStore((state) => state.loginWithContext);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [host, setHost] = useState("");
  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState<Step>("region");

  const [regionCode, setRegionCode] = useState("");
  const [region, setRegion] = useState<RegionContext | null>(null);
  const [regionStatus, setRegionStatus] = useState<Status>("idle");
  const [regionError, setRegionError] = useState("");

  const [depos, setDepos] = useState<DepoOption[]>([]);
  const [depoQuery, setDepoQuery] = useState("");
  const [selectedDepo, setSelectedDepo] = useState<DepoOption | null>(null);
  const [depoStatus, setDepoStatus] = useState<Status>("idle");
  const [depoError, setDepoError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredDepos = useMemo(() => {
    const query = depoQuery.trim().toLowerCase();
    if (!query) {
      return depos;
    }
    return depos.filter(
      (depo) =>
        depo.kode_depo.toLowerCase().includes(query) ||
        depo.nama_depo.toLowerCase().includes(query),
    );
  }, [depos, depoQuery]);

  const currentStepIndex = STEPS.findIndex((item) => item.id === step);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  const loadDepos = async (): Promise<void> => {
    setDepoStatus("loading");
    setDepoError("");
    try {
      const data = await fetchDepoOptions();
      setDepos(data.depos);
      setDepoStatus("ready");
    } catch (err) {
      setDepoStatus("error");
      setDepoError(getErrorMessage(err, "Gagal memuat daftar depo untuk region ini."));
    }
  };

  // Pulihkan konfigurasi terakhir dan validasi ulang ke server. Session
  // backend bisa saja sudah kedaluwarsa, jadi UI tidak boleh langsung
  // menganggap konfigurasi tersimpan masih valid.
  useEffect(() => {
    const saved = readSavedContext();
    if (!saved) {
      setBooting(false);
      return;
    }

    setRegionCode(saved.regionCode);
    setRemember(saved.remember);

    void (async () => {
      try {
        const validatedRegion = await validateRegion(saved.regionCode);
        const nextRegion = {
          code: validatedRegion.region_code,
          name: validatedRegion.region_name,
        };
        setRegion(nextRegion);

        const options = await fetchDepoOptions();
        setDepos(options.depos);
        setDepoStatus("ready");

        if (saved.depoKode) {
          const match = options.depos.find(
            (depo) => depo.kode_depo === saved.depoKode,
          );
          if (match) {
            const validatedDepo = await validateDepo(match.kode_depo);
            const nextDepo: DepoOption = {
              id: validatedDepo.depo_id,
              kode_depo: validatedDepo.kode_depo,
              nama_depo: validatedDepo.depo_name,
            };
            setSelectedDepo(nextDepo);
            setStep("login");
            persistAccessContext(nextRegion, nextDepo, saved.remember);
            return;
          }
        }

        setStep("depo");
        persistAccessContext(nextRegion, null, saved.remember);
      } catch (err) {
        setRegion(null);
        setStep("region");
        setRegionStatus("error");
        setRegionError(
          getErrorMessage(
            err,
            "Konfigurasi Region/Depo tersimpan tidak valid lagi. Masukkan Region Code kembali.",
          ),
        );
      } finally {
        setBooting(false);
      }
    })();
    // Hanya sekali saat halaman dibuka; fungsi API stabil (module-level).
  }, []);

  const handleValidateRegion = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const code = regionCode.trim().toUpperCase();
    if (!code) {
      setRegionStatus("error");
      setRegionError("Region Code wajib diisi.");
      return;
    }

    setRegionStatus("loading");
    setRegionError("");
    setSelectedDepo(null);
    setDepos([]);
    setDepoQuery("");

    try {
      const data = await validateRegion(code);
      const nextRegion = { code: data.region_code, name: data.region_name };
      setRegion(nextRegion);
      setRegionCode(data.region_code);
      setRegionStatus("success");
      setStep("depo");
      persistAccessContext(nextRegion, null, remember);
      await loadDepos();
    } catch (err) {
      setRegionStatus("error");
      setRegionError(
        getErrorMessage(err, "Region tidak ditemukan atau tidak aktif."),
      );
    }
  };

  const handleValidateDepo = async () => {
    if (!region || !selectedDepo) {
      return;
    }

    setDepoStatus("loading");
    setDepoError("");
    try {
      const data = await validateDepo(selectedDepo.kode_depo);
      const nextDepo: DepoOption = {
        id: data.depo_id,
        kode_depo: data.kode_depo,
        nama_depo: data.depo_name,
      };
      setSelectedDepo(nextDepo);
      setDepoStatus("success");
      persistAccessContext(region, nextDepo, remember);
      setLoginError("");
      setStep("login");
    } catch (err) {
      setDepoStatus("error");
      setDepoError(
        getErrorMessage(err, "Depo tidak ditemukan di region yang dipilih."),
      );
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");

    if (!region || !selectedDepo) {
      setStep("region");
      setLoginError("Konfigurasi Region dan Depo belum lengkap.");
      return;
    }

    setSubmitting(true);
    try {
      await loginWithContext(email.trim(), password);
      persistAccessContext(region, selectedDepo, remember);
      router.push("/dashboard");
    } catch (err) {
      const response = (
        err as {
          response?: {
            status?: number;
            data?: {
              message?: string;
              errors?: { email?: string[] };
            };
          };
        }
      ).response;
      const message =
        response?.data?.errors?.email?.[0] ??
        response?.data?.message ??
        "";
      const lower = message.toLowerCase();

      if (lower.includes("credentials")) {
        setLoginError("Email atau password tidak sesuai.");
      } else if (lower.includes("inactive")) {
        setLoginError("Akun Anda tidak aktif. Hubungi administrator.");
      } else if (response?.status === 403) {
        setLoginError(
          message ||
            "Akun tidak memiliki akses ke Region/Depo yang dipilih.",
        );
        if (message.toLowerCase().includes("konteks")) {
          setStep("region");
        }
      } else {
        setLoginError(getErrorMessage(err, "Login gagal. Silakan coba lagi."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRegion = () => {
    setStep("region");
    setRegion(null);
    setSelectedDepo(null);
    setDepos([]);
    setDepoQuery("");
    setDepoError("");
    setDepoStatus("idle");
    setRegionStatus("idle");
    setRegionError("");
    setLoginError("");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("depo_access");
    }
  };

  const handleChangeDepo = () => {
    setStep("depo");
    setSelectedDepo(null);
    setDepoStatus(depos.length > 0 ? "ready" : "idle");
    setDepoError("");
    setLoginError("");
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-11 w-11 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-600" />
          <div>
            <p className="font-semibold">Menyiapkan Access Gateway</p>
            <p className="text-sm text-muted-foreground">
              Memeriksa konfigurasi Region &amp; Depo terakhir.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-accent-500/10 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-sm font-black text-white shadow-lg shadow-primary-600/30">
            OZ
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">ONEZENTRA</p>
            <p className="text-xs text-muted-foreground">
              Multi-Region Management System
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-6 pb-12 sm:px-10 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:gap-14">
        <section className="hidden flex-col justify-center lg:flex">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-primary-600">
            Central Access · Secure Gateway
          </p>
          <h1 className="max-w-xl text-4xl font-black tracking-tight xl:text-5xl">
            Satu pintu masuk untuk setiap Region dan Depo.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Tentukan lingkungan operasional Anda terlebih dahulu. Region dan
            Depo adalah konteks akses — bukan autentikasi. Identitas Anda tetap
            dibuktikan dengan kredensial pada langkah terakhir.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Terisolasi",
                desc: "Depo hanya bisa dipilih dari Region yang aktif.",
              },
              {
                title: "Tervalidasi server",
                desc: "Region, Depo, dan hak akses diperiksa backend.",
              },
              {
                title: "Sesi terikat",
                desc: "Konteks akses disimpan di session server.",
              },
              {
                title: "Aman",
                desc: "Password tidak pernah disimpan di browser.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur"
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full max-w-xl justify-self-center">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-black/10 sm:p-8">
            <StepIndicator current={currentStepIndex} />

            {step === "region" && (
              <form className="mt-6 space-y-5" onSubmit={handleValidateRegion}>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    Central Access
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Identifikasi lingkungan operasional Anda sebelum masuk.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface-card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Region Access Address
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold">
                    {host || "onezentra.sbs"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Alamat dikelola server. Port internal tidak perlu diisi
                    manual.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="region-code"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Region Code
                  </label>
                  <input
                    id="region-code"
                    className="input-field font-mono uppercase tracking-wider"
                    placeholder="Contoh: 001"
                    value={regionCode}
                    onChange={(event) =>
                      setRegionCode(event.target.value.toUpperCase())
                    }
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kode region bukan username. Gunakan kode yang diberikan
                    administrator.
                  </p>
                </div>

                <ConnectionStatus
                  status={regionStatus}
                  successText={
                    region
                      ? `Terhubung ke ${region.code} · ${region.name}`
                      : "Region tervalidasi."
                  }
                />

                {regionError && <ErrorAlert message={regionError} />}

                <button
                  type="submit"
                  className="btn-primary w-full py-3"
                  disabled={regionStatus === "loading"}
                >
                  {regionStatus === "loading"
                    ? "Memvalidasi Region..."
                    : "Simpan & Lanjutkan"}
                </button>

                <p className="text-center text-xs text-muted-foreground">
                  Konfigurasi akan digunakan untuk sesi berikutnya.
                </p>
              </form>
            )}

            {step === "depo" && region && (
              <div className="mt-6 space-y-5">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    Identifikasi Depo
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pilih depo yang berada di Region {region.code}.
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-card px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600/10 text-xs font-bold text-primary-700">
                    R
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Region terpilih
                    </p>
                    <p className="truncate text-sm font-semibold">
                      {region.code} · {region.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleChangeRegion}
                    className="ml-auto text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Ubah
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="depo-search"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Cari Depo
                  </label>
                  <input
                    id="depo-search"
                    className="input-field"
                    placeholder="Ketik kode atau nama depo..."
                    value={depoQuery}
                    onChange={(event) => setDepoQuery(event.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div
                  className="max-h-72 space-y-2 overflow-y-auto pr-1"
                  aria-live="polite"
                >
                  {depoStatus === "loading" && (
                    <div className="space-y-2">
                      {[0, 1, 2].map((item) => (
                        <div
                          key={item}
                          className="h-16 animate-pulse rounded-2xl border border-border bg-surface-card"
                        />
                      ))}
                    </div>
                  )}

                  {depoStatus === "error" && (
                    <div className="space-y-3">
                      <ErrorAlert message={depoError} />
                      <button
                        type="button"
                        onClick={() => void loadDepos()}
                        className="btn-secondary w-full"
                      >
                        Coba lagi
                      </button>
                    </div>
                  )}

                  {depoStatus !== "loading" &&
                    depoStatus !== "error" &&
                    filteredDepos.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
                        <p className="text-sm font-semibold">
                          Tidak ada depo aktif
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Region ini belum memiliki depo yang bisa dipilih.
                          Hubungi administrator.
                        </p>
                      </div>
                    )}

                  {depoStatus !== "loading" &&
                    depoStatus !== "error" &&
                    filteredDepos.map((depo) => {
                      const active = selectedDepo?.id === depo.id;
                      return (
                        <button
                          key={depo.id}
                          type="button"
                          onClick={() => setSelectedDepo(depo)}
                          aria-pressed={active}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            active
                              ? "border-primary-500 bg-primary-500/10"
                              : "border-border bg-surface-card hover:border-primary-400"
                          }`}
                        >
                          <span className="rounded-lg bg-background px-2 py-1 font-mono text-xs font-bold">
                            {depo.kode_depo}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {depo.nama_depo}
                          </span>
                          {active && (
                            <span className="text-sm font-bold text-primary-600">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>

                {selectedDepo && (
                  <p className="text-xs text-muted-foreground">
                    Depo terpilih:{" "}
                    <strong className="text-foreground">
                      {selectedDepo.nama_depo}
                    </strong>
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={handleChangeRegion}
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    disabled={!selectedDepo || depoStatus === "loading"}
                    onClick={() => void handleValidateDepo()}
                  >
                    Lanjutkan
                  </button>
                </div>
              </div>
            )}

            {step === "login" && region && selectedDepo && (
              <form className="mt-6 space-y-5" onSubmit={handleLogin}>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    Secure Login
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Masuk ke akun operasional Anda.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Region
                    </p>
                    <p className="truncate text-sm font-semibold">
                      {region.code} · {region.name}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Depo
                    </p>
                    <p className="truncate text-sm font-semibold">
                      {selectedDepo.kode_depo} · {selectedDepo.nama_depo}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleChangeDepo}
                    className="ml-auto text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Ubah
                  </button>
                </div>

                <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6">
                  <div>
                    <label
                      htmlFor="gateway-email"
                      className="block text-sm font-semibold"
                    >
                      Email
                    </label>
                    <input
                      id="gateway-email"
                      type="email"
                      className="input-field"
                      placeholder="Masukkan email akun"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="gateway-password"
                      className="block text-sm font-semibold"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="gateway-password"
                        type={showPassword ? "text" : "password"}
                        className="input-field pr-24"
                        placeholder="Masukkan password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-500/10"
                        aria-pressed={showPassword}
                      >
                        {showPassword ? "Sembunyikan" : "Tampilkan"}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>
                    Ingat konfigurasi Region &amp; Depo di perangkat ini. Email
                    dan password tidak disimpan.
                  </span>
                </label>

                {loginError && <ErrorAlert message={loginError} />}

                <button
                  type="submit"
                  className="btn-primary w-full py-3"
                  disabled={submitting || isLoading}
                >
                  {submitting || isLoading ? "Memvalidasi..." : "Login ke Sistem"}
                </button>

                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  Akses diberikan sesuai hak dan kewenangan pengguna pada
                  Region/Depo terpilih.
                </p>
              </form>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Multi-Region Management System · ONEZENTRA
          </p>
        </section>
      </main>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Langkah akses">
      {STEPS.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={item.id} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? "bg-primary-600 text-white"
                  : active
                    ? "border-2 border-primary-600 text-primary-600"
                    : "border border-border text-muted-foreground"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {done ? "✓" : index + 1}
            </span>
            <span
              className={`text-xs font-semibold ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {item.label}
            </span>
            {index < STEPS.length - 1 && (
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ConnectionStatus({
  status,
  successText,
}: {
  status: Status;
  successText: string;
}) {
  if (status === "idle") {
    return null;
  }

  const color =
    status === "error"
      ? "bg-rose-500"
      : status === "loading"
        ? "bg-amber-500"
        : "bg-emerald-500";
  const text =
    status === "error"
      ? "Koneksi Region gagal."
      : status === "loading"
        ? "Menghubungi server Region..."
        : successText;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{text}</span>
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700"
    >
      {message}
    </div>
  );
}
