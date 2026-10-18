import { create } from 'zustand';
import { auth } from '@/lib/api';
import { clearDashboardSummaryCache } from '@/lib/dashboardSummary';

interface User {
  id: number;
  kode_depo: string;
  nama_depo: string;
  full_name: string;
  alamat: string;
  email: string;
  level: string;
  status: string;
  roles: { id: number; name: string; slug: string }[];
}

interface AuthState {
  user: User | null;
  permissions: string[];
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  hasPermission: (slug: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await auth.login(email, password);
      const { user, permissions } = res.data;
      // Buang ringkasan dashboard milik sesi sebelumnya (bila ada) agar user
      // baru tidak melihat data user lama sebelum cache kedaluwarsa.
      clearDashboardSummaryCache();
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('ow_login_splash', '1');
      }
      set({ user, permissions, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await auth.logout();
    } catch (e) {
      // Log logout failure so user can retry if needed
      console.error('Logout request failed:', e);
    }
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('ow_login_splash');
    }
    clearDashboardSummaryCache();
    set({ user: null, permissions: [] });
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const res = await auth.getUser();
      const { user, permissions } = res.data;
      set({ user, permissions, isLoading: false });
    } catch (error: unknown) {
      // 401 di /login adalah ekspektasi untuk tamu (tanpa cookie), jangan bising ke console
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 && typeof window !== 'undefined' && window.location.pathname.startsWith('/login')) {
        set({ user: null, permissions: [], isLoading: false });
        return;
      }
      set({ user: null, permissions: [], isLoading: false });
    }
  },

  hasPermission: (slug: string) => {
    return get().permissions.includes(slug);
  },

  hasRole: (...roles: string[]) => {
    const user = get().user;
    return !!user && (roles.includes(user.level) || user.roles?.some(role => roles.includes(role.slug)) === true);
  },
}));