import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpnameSessionsPage from './page';

const { list, get, officers, expiredList, depoList, notifyGlobal } = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  officers: vi.fn(),
  expiredList: vi.fn(),
  depoList: vi.fn(),
  notifyGlobal: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    hasPermission: () => true,
    user: { kode_depo: 'DPO', nama_depo: 'Depo Test' },
  }),
}));

vi.mock('@/store/globalToast', () => ({ notifyGlobal }));

vi.mock('@/components/OpnameSessionDetailModal', () => ({
  SessionDetailModal: () => null,
}));

vi.mock('@/lib/api', () => ({
  opnameSessions: { list, get, officers },
  opnameExpired: { list: expiredList },
  depo: { list: depoList },
  getErrorMessage: (_e: unknown, fallback?: string) => fallback ?? 'error',
}));

describe('OpnameSessionsPage — deep link dari Monitoring Kedaluwarsa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: { data: { data: [] } } });
    officers.mockResolvedValue({ data: { data: [] } });
    expiredList.mockResolvedValue({ data: { data: { data: [] } } });
    depoList.mockResolvedValue({ data: { data: [{ kode_depo: '0126', nama_depo: 'Depo Pontianak' }] } });
    window.history.replaceState({}, '', '/opname-sessions?week_start=2026-11-05&kode_depo=0126&create=1');
  });

  afterEach(cleanup);

  it('menerapkan minggu+depo dan langsung membuka modal buat sesi', async () => {
    render(<OpnameSessionsPage />);

    expect(await screen.findByLabelText('Minggu (Senin) *')).toHaveValue('2026-11-02');
    expect(screen.getByLabelText('Kode Depo *')).toHaveValue('0126');

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({
        week_start: '2026-11-02',
        kode_depo: '0126',
      }));
    });

    // Penanda create dibuang agar reload tidak membuka modal lagi.
    expect(window.location.search).not.toContain('create=1');
    expect(window.location.search).toContain('week_start=2026-11-02');
    expect(window.location.search).toContain('kode_depo=0126');
  });

  it('menampilkan pager dan memuat halaman berikutnya', async () => {
    window.history.replaceState({}, '', '/opname-sessions');
    const session = {
      id: 1,
      week_start: '2026-11-02',
      kode_depo: '0126',
      nama_depo: 'Depo Pontianak',
      assigned_to: 7,
      assignee: { full_name: 'Budi Petugas' },
      status: 'OPEN',
      items: [],
    };
    list.mockResolvedValueOnce({
      data: {
        data: {
          data: [session],
          current_page: 1,
          last_page: 2,
          total: 26,
          from: 1,
          to: 25,
        },
      },
    });
    list.mockResolvedValueOnce({
      data: {
        data: {
          data: [session],
          current_page: 2,
          last_page: 2,
          total: 26,
          from: 26,
          to: 26,
        },
      },
    });

    render(<OpnameSessionsPage />);

    expect(await screen.findByText('Halaman 1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, per_page: 25 }));
    });
    expect(await screen.findByText('Halaman 2 / 2')).toBeInTheDocument();
  });
});
