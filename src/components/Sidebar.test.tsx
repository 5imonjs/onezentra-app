import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

const nav = vi.hoisted(() => ({ pathname: '/email-recipients' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => nav.pathname,
}));

vi.mock('next/image', () => ({
  default: () => <span data-testid="logo" />,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission: () => true,
    user: { full_name: 'Budi Santoso', roles: [], level: 'admin' },
    logout: vi.fn(),
  }),
}));

function renderSidebar() {
  return render(
    <Sidebar isCollapsed={false} onToggle={vi.fn()} mobileOpen={false} onClose={vi.fn()} />,
  );
}

describe('Sidebar — ikon menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = '/email-recipients';
  });

  afterEach(cleanup);

  it('menampilkan ikon pada setiap tautan menu yang terlihat', () => {
    renderSidebar();

    const nav = document.querySelector('nav') as HTMLElement;
    expect(nav).not.toBeNull();

    const links = Array.from(within(nav).getAllByRole('link')) as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThan(0);

    const tanpaIkon = links.filter((link) => link.querySelector('svg') === null);
    expect(tanpaIkon.map((link) => link.textContent)).toEqual([]);
  });

  it('memberi ikon pada menu "Penerima Email" (regresi: dulu key "mail-user" tidak terdaftar)', () => {
    renderSidebar();

    const link = screen.getByText('Penerima Email').closest('a');
    expect(link).not.toBeNull();
    expect(link?.querySelector('svg')).not.toBeNull();
  });

  it('membedakan ikon Setting Email dan Penerima Email', () => {
    renderSidebar();

    const setting = screen.getByText('Setting Email').closest('a')?.querySelector('path')?.getAttribute('d');
    const penerima = screen.getByText('Penerima Email').closest('a')?.querySelector('path')?.getAttribute('d');

    expect(setting).toBeTruthy();
    expect(penerima).toBeTruthy();
    expect(setting).not.toEqual(penerima);
  });

  it('membedakan ikon menu "Batch Expired" dan "Sesi Opname" (grup Opname)', () => {
    nav.pathname = '/opname-sessions';
    renderSidebar();

    const batchExpired = screen.getByText('Batch Expired').closest('a')?.querySelector('path')?.getAttribute('d');
    const sesiOpname = screen.getByText('Sesi Opname').closest('a')?.querySelector('path')?.getAttribute('d');

    expect(batchExpired).toBeTruthy();
    expect(sesiOpname).toBeTruthy();
    expect(batchExpired).not.toEqual(sesiOpname);
  });
});
