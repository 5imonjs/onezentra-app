'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import GlobalToast from '@/components/GlobalToast';
import { useAuthStore } from '@/store/auth';

// Urutan menu mengikuti Sidebar: arahkan user tanpa dashboard.view ke menu
// pertama yang ia boleh akses, bukan dashboard kosong.
const MENU_FALLBACK: [string, string][] = [
  ['/dashboard', 'dashboard.view'],
  ['/rencana-kirim', 'rencana_kirim.view'],
  ['/gate', 'gate.view'],
  ['/validasi-sj', 'sj_validation.view'],
  ['/receiving', 'receiving.view'],
  ['/penerimaan', 'penerimaan.view'],
  ['/opname-expired', 'opname.view'],
  ['/opname-sessions', 'opname.session.view'],
  ['/npn', 'npn.view'],
  ['/standar-umur', 'standar_umur.view'],
  ['/standarisasi', 'standarisasi.view'],
  ['/roles', 'roles.view'],
  ['/users', 'users.view'],
  ['/email-settings', 'emails.view'],
  ['/email-recipients', 'emails.view'],
  ['/reports/rencana-kirim', 'reports.view'],
  ['/reports/penerimaan', 'reports.view'],
  ['/reports/selisih-qty', 'reports.view'],
  ['/reports/opname-expired', 'reports.view'],
  ['/reports/biaya-thl', 'reports.biaya_thl'],
  ['/reports/biaya-retribusi', 'reports.biaya_retribusi'],
];

function SplashScreen({ leaving = false, immersive = false }: { leaving?: boolean; immersive?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 transition-opacity duration-500 ${immersive ? 'bg-ink-950' : ''} ${leaving ? 'opacity-0' : 'opacity-100'}`}>
      {/* priority: logo splash adalah LCP halaman (di atas fold & besar),
          jadi ia satu-satunya pemilik preload — memuaskan peringatan LCP Next
          sekaligus menghindari preload ganda tak terpakai. Sidebar bukan LCP:
          sebagai gambar in-viewport ia tetap di-fetch langsung tanpa preload. */}
      <Image src="/LOGO.png" alt="ONEZENTRA" width={560} height={136} priority className="w-[min(82vw,560px)] h-auto object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)] animate-logo-pop" />
      {immersive && (
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 animate-splash-bar"></div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loadUser, isLoading, hasPermission } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileOpen(false), []);
  // Konten digulir di dalam <main>, bukan window. Karena itu Next tidak bisa
  // mengatur ulang posisi scroll saat pindah halaman — kita lakukan manual.
  const mainRef = useRef<HTMLElement | null>(null);
  const [splash, setSplash] = useState<{ visible: boolean; leaving: boolean; immersive: boolean }>({ visible: false, leaving: false, immersive: false });

  const loadUserFn = useCallback(() => loadUser(), [loadUser]);

  useEffect(() => {
    setMounted(true);
    if (!user) {
      loadUserFn();
    }
  }, [user, loadUserFn]);

  useEffect(() => {
    if (!mounted || !user) return;
    const loginSplash = typeof window !== 'undefined' && sessionStorage.getItem('ow_login_splash') === '1';
    setSplash({ visible: true, leaving: false, immersive: loginSplash });
    const t1 = setTimeout(() => setSplash(s => ({ ...s, leaving: true })), 350);
    const t2 = setTimeout(() => {
      if (loginSplash) {
        sessionStorage.removeItem('ow_login_splash');
      }
      setSplash({ visible: false, leaving: false, immersive: false });
    }, 600);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [mounted, user, pathname]);

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      router.push('/login');
    }
  }, [mounted, isLoading, user, router]);

  useEffect(() => {
    if (!mounted || isLoading || !user) return;
    const current = MENU_FALLBACK.find(([path]) => path === pathname);
    if (current && !hasPermission(current[1])) {
      const fallback = MENU_FALLBACK.find(([, perm]) => hasPermission(perm));
      router.push(fallback ? fallback[0] : '/login');
    }
  }, [mounted, isLoading, user, pathname, hasPermission, router]);

  // Drawer mobile: tutup otomatis saat pindah halaman, kunci scroll body saat terbuka.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Pindah halaman selalu mulai dari atas konten (window tidak lagi scroll).
  useEffect(() => {
    const el = mainRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  if (!mounted || isLoading) {
    return <SplashScreen immersive />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-100">
      <a href="#main-content" className="skip-link">Langsung ke konten utama</a>
      <GlobalToast />

      {/* Topbar mobile: satu-satunya pemicu drawer di layar kecil. */}
      <header className="z-20 shrink-0 border-b border-slate-200/80 bg-white/85 backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka navigasi"
            aria-expanded={mobileOpen}
            aria-controls="primary-navigation"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <p className="text-sm font-black tracking-[0.18em] text-slate-900">ONEZENTRA</p>
          <Link
            href="/dashboard/profile"
            aria-label="Buka profil saya"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-sm font-bold text-white shadow-md shadow-primary-600/20 transition-transform active:scale-95"
          >
            {user.full_name?.charAt(0) || 'A'}
          </Link>
        </div>
      </header>

      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onHoverChange={setSidebarHovered}
        mobileOpen={mobileOpen}
        onClose={closeMobileNav}
      />

      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={closeMobileNav}
          className="fixed inset-0 z-30 animate-fade-in bg-ink-950/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain transition-all duration-300 ease-in-out ${
          !sidebarCollapsed || sidebarHovered ? 'lg:ml-[260px]' : 'lg:ml-[72px]'
        }`}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {splash.visible && (
        <SplashScreen leaving={splash.leaving} immersive={splash.immersive} />
      )}
    </div>
  );
}