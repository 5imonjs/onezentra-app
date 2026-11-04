import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegionAccessPage from './page';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('RegionAccessPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('hanya meminta kode region dan menyimpan konfigurasi tanpa port', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ region_code: 'REGION-A', region_id: 'REGION-A' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RegionAccessPage />);

    expect(screen.getByLabelText('Kode Region')).toBeInTheDocument();
    expect(screen.queryByLabelText('Port')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kode Region'), { target: { value: 'region-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validasi Region' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/region-validate', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ region_code: 'REGION-A' }),
      }));
      expect(JSON.parse(sessionStorage.getItem('region_access') ?? '{}')).toEqual({
        regionCode: 'REGION-A',
        regionId: 'REGION-A',
      });
    });
  });
});
