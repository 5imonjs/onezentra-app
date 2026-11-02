import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateRegion } from './accessGateway';

const { ensureCsrfCookie, post } = vi.hoisted(() => ({
  ensureCsrfCookie: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./api', () => ({
  apiClient: { post },
  ensureCsrfCookie,
}));

describe('validateRegion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menyiapkan cookie CSRF sebelum mengirim POST validasi Region', async () => {
    ensureCsrfCookie.mockImplementation(async () => {
      expect(post).not.toHaveBeenCalled();
    });
    post.mockResolvedValue({
      data: {
        valid: true,
        region_id: '1',
        region_code: '001',
        region_name: 'Region 001',
        message: 'Region validated',
      },
    });

    await expect(validateRegion('001')).resolves.toMatchObject({
      valid: true,
      region_code: '001',
    });

    expect(ensureCsrfCookie).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith('/region-validate', { region_code: '001' });
  });
});
