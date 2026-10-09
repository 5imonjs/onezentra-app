import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GatePage from './page';

const { hasPermission, list, stats, byNoDokumen, depoList } = vi.hoisted(() => ({
  hasPermission: vi.fn<(slug: string) => boolean>(() => true),
  list: vi.fn(),
  stats: vi.fn(),
  byNoDokumen: vi.fn(),
  depoList: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/BarcodeScanner', () => ({
  default: () => null,
  SCAN_FORMATS_1D: [],
}));

vi.mock('@/lib/api', () => ({
  gateTransactions: { list, stats, byNoDokumen },
  rencanaKirim: { verify: vi.fn() },
  depo: { list: depoList },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

const permissionAlert = 'Anda tidak memiliki izin untuk aksi ini. Minta akses ke admin.';

const found = (status: string) => ({
  id: 5,
  rencana_kirim_id: 5,
  po_transporter: 'PO-GATE-1',
  nopol: 'KB 1234 XX',
  driver_name: 'Budi',
  status,
});

async function lookup(status: string) {
  byNoDokumen.mockResolvedValue({ data: { data: found(status) } });
  render(<GatePage />);
  const input = await screen.findByLabelText('Nomor PO transporter');
  fireEvent.change(input, { target: { value: 'PO-GATE-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cari' }));
  expect(await screen.findByText('PO-GATE-1')).toBeInTheDocument();
}

describe('GatePage — peringatan izin hanya saat aksi benar-benar tidak tersedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockImplementation((slug: string) => slug === 'gate.view');
    list.mockResolvedValue({ data: { data: [], last_page: 1, total: 0 } });
    stats.mockResolvedValue({ data: { data: { total: 0, hari_ini: 0, terjadwal: 0, selesai: 0 } } });
    depoList.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(() => {
    cleanup();
  });

  it('COMPLETED tidak menampilkan alert izin (tidak ada aksi gate)', async () => {
    await lookup('COMPLETED');

    expect(screen.queryByText(permissionAlert)).not.toBeInTheDocument();
  });

  it('SCHEDULED tanpa gate.create menampilkan alert izin', async () => {
    await lookup('SCHEDULED');

    expect(screen.getByText(permissionAlert)).toBeInTheDocument();
  });

  it('SCHEDULED dengan gate.create tidak menampilkan alert izin', async () => {
    hasPermission.mockImplementation((slug: string) => slug === 'gate.view' || slug === 'gate.create');
    await lookup('SCHEDULED');

    expect(screen.queryByText(permissionAlert)).not.toBeInTheDocument();
  });

  it('CHECKED_IN tanpa rencana_kirim.edit menampilkan alert izin', async () => {
    await lookup('CHECKED_IN');

    expect(screen.getByText(permissionAlert)).toBeInTheDocument();
  });
});
