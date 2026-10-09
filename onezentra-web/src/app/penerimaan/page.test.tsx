import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import PenerimaanPage from './page';

const { hasPermission, groupsMock, depoList, searchProduct } = vi.hoisted(() => ({
  hasPermission: vi.fn<(perm: string) => boolean>(() => true),
  groupsMock: vi.fn(),
  depoList: vi.fn(),
  searchProduct: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  receivingItems: { groups: groupsMock },
  npn: { searchProduct },
  batches: { markPrinted: vi.fn() },
  depo: { list: depoList },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/components/ReceivingItemEditModal', () => ({ default: () => null }));
vi.mock('@/components/SearchInput', () => ({
  default: ({ value, placeholder }: { value: string; placeholder?: string }) => (
    <input aria-label={placeholder} value={value} readOnly />
  ),
}));
vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const emptyMeta = {
  total: 0,
  per_page: 20,
  current_page: 1,
  last_page: 1,
  from: null,
  to: null,
};

describe('PenerimaanPage — filter depo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchProduct.mockResolvedValue({ data: { data: [] } });
    groupsMock.mockResolvedValue({ data: { data: [], meta: emptyMeta } });
    depoList.mockResolvedValue({
      data: {
        data: [
          { kode_depo: 'PNK', nama_depo: 'Pontianak' },
          { kode_depo: 'SKW', nama_depo: 'Singkawang' },
        ],
      },
    });
  });

  afterEach(cleanup);

  it('menampilkan filter depo untuk user dengan izin depot.view_all', async () => {
    hasPermission.mockImplementation((perm) => perm === 'depot.view_all');

    render(<PenerimaanPage />);

    expect(await screen.findByLabelText('Filter depo')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Semua Depo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Singkawang (SKW)' })).toBeInTheDocument();
  });

  it('tidak menampilkan filter depo untuk user yang ter-scope ke satu depo', async () => {
    hasPermission.mockImplementation(() => false);

    render(<PenerimaanPage />);

    await waitFor(() => expect(groupsMock).toHaveBeenCalled());
    expect(depoList).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Filter depo')).not.toBeInTheDocument();
  });

  it('mengirim kode_depo ke server saat filter dipilih', async () => {
    hasPermission.mockImplementation((perm) => perm === 'depot.view_all');

    render(<PenerimaanPage />);

    const select = await screen.findByLabelText('Filter depo');
    fireEvent.change(select, { target: { value: 'SKW' } });

    await waitFor(() =>
      expect(groupsMock).toHaveBeenCalledWith(expect.objectContaining({ kode_depo: 'SKW' })),
    );
  });
});
