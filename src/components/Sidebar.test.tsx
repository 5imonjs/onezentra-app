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

  it('membedakan ikon menu "Monitoring Kedaluwarsa" dan "Sesi Opname" (grup Stok & Opname)', () => {
    nav.pathname = '/opname-sessions';
    renderSidebar();

    const monitoring = screen.getByText('Monitoring Kedaluwarsa').closest('a')?.querySelector('path')?.getAttribute('d');
    const stock = screen.getByText('Sesi Opname').closest('a')?.querySelector('path')?.getAttribute('d');

    expect(monitoring).toBeTruthy();
    expect(stock).toBeTruthy();
    expect(monitoring).not.toEqual(stock);
  });

  it('menaruh satu laporan stok kedaluwarsa di grup Laporan', () => {
    nav.pathname = '/reports/expired-stock';
    renderSidebar();

    expect(screen.getByText('Inbound')).toBeInTheDocument();
    expect(screen.getByText('Stok & Opname')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Laporan Stok Kedaluwarsa' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Laporan Monitoring Kedaluwarsa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Laporan Batch Kedaluwarsa' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Laporan Replenishment' })).toBeInTheDocument();
  });

  it('menyembunyikan laporan kedaluwarsa bila tidak ada izin lama maupun izin monitoring', () => {
    nav.pathname = '/reports/expired-stock';
    auth.can = (permission: string) => !['reports.penerimaan_batch_expired', 'reports.view', 'opname.view'].includes(permission);
    renderSidebar();

    expect(screen.queryByRole('link', { name: 'Laporan Stok Kedaluwarsa' })).not.toBeInTheDocument();
  });

  it('menampilkan alur inbound dengan label jelas incl. detail penerimaan', () => {
    nav.pathname = '/rencana-kirim';
    renderSidebar();

    expect(screen.getByText('Inbound')).toBeInTheDocument();
    for (const label of ['Rencana Kirim', 'Gate Check-in', 'Validasi SJ', 'Receiving', 'Detail Inbound']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Inbound (SJ)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Check In Point' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Check Out Point' })).not.toBeInTheDocument();
  });

  it('menaruh Detail Inbound di alur inbound, bukan di Stok & Opname', () => {
    nav.pathname = '/penerimaan';
    renderSidebar();

    expect(screen.getByText('Inbound')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Detail Inbound' })).toBeInTheDocument();
    // Grup Stok & Opname tidak dibuka saat halaman Detail Inbound aktif.
    expect(screen.queryByRole('link', { name: 'Monitoring Kedaluwarsa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Stok Manual' })).not.toBeInTheDocument();
  });

  it('menyembunyikan "Sesi Opname" dari viewer murni (opname.view tanpa opname.session.view)', () => {
    nav.pathname = '/opname-expired';
    auth.can = (permission: string) => permission !== 'opname.session.view';
    renderSidebar();

    expect(screen.getByText('Monitoring Kedaluwarsa')).toBeInTheDocument();
    expect(screen.queryByText('Sesi Opname')).not.toBeInTheDocument();
  });
});
