import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegionAccessPage from './page';

const { push, validateRegion } = vi.hoisted(() => ({ push: vi.fn(), validateRegion: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/accessGateway', () => ({ validateRegion }));
vi.mock('@/lib/api', () => ({ getErrorMessage: (_e: unknown, fallback: string) => fallback }));

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
    validateRegion.mockResolvedValue({
      region_code: 'REGION-A',
      region_id: 'REGION-A',
      region_name: 'Region A',
      valid: true,
      message: 'Region validated',
    });

    render(<RegionAccessPage />);

    expect(screen.getByLabelText('Kode Region')).toBeInTheDocument();
    expect(screen.queryByLabelText('Port')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kode Region'), { target: { value: 'region-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validasi Region' }));

    await waitFor(() => {
      expect(validateRegion).toHaveBeenCalledWith('REGION-A');
      expect(JSON.parse(sessionStorage.getItem('region_access') ?? '{}')).toEqual({
        regionCode: 'REGION-A',
        regionId: 'REGION-A',
      });
    });
  });
});
