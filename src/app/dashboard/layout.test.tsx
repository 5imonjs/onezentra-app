import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from './layout';

const { authState, pathnameRef } = vi.hoisted(() => ({
  authState: {
    user: { full_name: 'Budi Santoso' },
    loadUser: vi.fn(),
    isLoading: false,
    hasPermission: () => true,
  },
  pathnameRef: { value: '/dashboard' as string },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => pathnameRef.value,
}));

vi.mock('next/image', () => ({
  default: () => <span data-testid="logo" />,
}));

vi.mock('@/components/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/GlobalToast', () => ({ default: () => null }));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => authState,
}));

describe('DashboardLayout — scroll konten mandiri', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameRef.value = '/dashboard';
  });

  afterEach(cleanup);

  it('menjadikan area konten sebagai satu-satunya container scroll', async () => {
    render(
      <DashboardLayout>
        <div>KONTEN</div>
      </DashboardLayout>,
    );

    await screen.findByText('KONTEN');

    const main = document.getElementById('main-content');
    expect(main).not.toBeNull();
    expect(main?.className).toContain('overflow-y-auto');

    // Root mengunci tinggi viewport agar sidebar & topbar tidak ikut bergulir.
    const root = main?.parentElement as HTMLElement;
    expect(root.className).toContain('h-dvh');
    expect(root.className).toContain('overflow-hidden');
  });

  it('tidak memunculkan splash ulang saat pindah menu', async () => {
    const { rerender } = render(
      <DashboardLayout>
        <div>KONTEN</div>
      </DashboardLayout>,
    );

    // Tunggu hingga splash selesai (visible → fade out → gone) sebelum pindah.
    await screen.findByText('KONTEN');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 2000 });

    // Pindah menu: splash tidak boleh muncul lagi. Sebelum fix, pathname di-
    // dependency splash → overlay muncul ulang (~350 ms fade + 600 ms hilang).
    pathnameRef.value = '/gate';
    rerender(
      <DashboardLayout>
        <div>KONTEN GATE</div>
      </DashboardLayout>,
    );
    await screen.findByText('KONTEN GATE');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
