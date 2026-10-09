import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from './layout';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { full_name: 'Budi Santoso' },
    loadUser: vi.fn(),
    isLoading: false,
    hasPermission: () => true,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard',
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
});
