import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

const nav = vi.hoisted(() => ({ pathname: '/email-recipients' }));
const auth = vi.hoisted(() => ({ can: (_permission: string): boolean => true }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => nav.pathname,
}));

vi.mock('next/image', () => ({
  default: () => <span data-testid="logo" />,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission: (permission: string) => auth.can(permission),
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
    auth.can = () => true;
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

  it('membedakan ikon menu "Monitoring Kedaluwarsa" dan "Stock Opname" (grup Stok & Kedaluwarsa)', () => {
    nav.pathname = '/opname-sessions';
    renderSidebar();

    const monitoring = screen.getByText('Monitoring Kedaluwarsa').closest('a')?.querySelector('path')?.getAttribute('d');
    const stock = screen.getByText('Stock Opname').closest('a')?.querySelector('path')?.getAttribute('d');

    expect(monitoring).toBeTruthy();
    expect(stock).toBeTruthy();
    expect(monitoring).not.toEqual(stock);
  });

  it('menaruh Laporan Monitoring di grup Stok & Kedaluwarsa dan memberi nama grup yang jelas', () => {
    nav.pathname = '/reports/opname-expired';
    renderSidebar();

    expect(screen.getByText('Alur Inbound')).toBeInTheDocument();
    expect(screen.getByText('Stok & Kedaluwarsa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Laporan Monitoring' })).toBeInTheDocument();
    expect(screen.queryByText('Laporan Replenishment')).not.toBeInTheDocument();
  });

  it('menyembunyikan "Stock Opname" dari viewer murni (opname.view tanpa opname.session.view)', () => {
    nav.pathname = '/opname-expired';
    auth.can = (permission: string) => permission !== 'opname.session.view';
    renderSidebar();

    expect(screen.getByText('Monitoring Kedaluwarsa')).toBeInTheDocument();
    expect(screen.queryByText('Stock Opname')).not.toBeInTheDocument();
  });
});
