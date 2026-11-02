import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccessGatewayPage from './page';

const {
  push,
  loginWithContext,
  validateRegion,
  fetchDepoOptions,
  validateDepo,
  router,
} = vi.hoisted(() => {
  const push = vi.fn();
  return {
    push,
    loginWithContext: vi.fn(),
    validateRegion: vi.fn(),
    fetchDepoOptions: vi.fn(),
    validateDepo: vi.fn(),
    // Referensi router stabil, meniru useRouter() Next.js.
    router: { push, replace: vi.fn() },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ loginWithContext, isLoading: false }),
}));

vi.mock('@/lib/accessGateway', () => ({
  validateRegion,
  fetchDepoOptions,
  validateDepo,
}));

const REGION = {
  valid: true,
  region_id: '001',
  region_code: '001',
  region_name: 'REGION JATAKALBAR',
  message: 'Region validated',
};

const DEPO = {
  id: 1,
  kode_depo: '0126',
  nama_depo: 'Depo Pontianak',
};

const DEPO_VALIDATION = {
  valid: true,
  depo_id: 1,
  kode_depo: '0126',
  depo_name: 'Depo Pontianak',
  message: 'Depo validated',
};

function mockHappyPath() {
  validateRegion.mockResolvedValue(REGION);
  fetchDepoOptions.mockResolvedValue({
    valid: true,
    region_code: '001',
    region_name: 'REGION JATAKALBAR',
    depos: [DEPO],
  });
  validateDepo.mockResolvedValue(DEPO_VALIDATION);
}

async function goToDepoStep() {
  render(<AccessGatewayPage />);

  await screen.findByRole('heading', { name: 'Central Access' });
  fireEvent.change(screen.getByLabelText('Region Code'), {
    target: { value: '001' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Simpan & Lanjutkan/i }));

  await screen.findByText('Identifikasi Depo');
}

async function goToLoginStep() {
  await goToDepoStep();

  const depoName = await screen.findByText('Depo Pontianak');
  const depoButton = depoName.closest('button');
  expect(depoButton).not.toBeNull();
  fireEvent.click(depoButton as HTMLButtonElement);
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan' }));

  await screen.findByText('Secure Login');
}

describe('AccessGatewayPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan langkah Region tanpa field Port teknis', async () => {
    render(<AccessGatewayPage />);

    expect(
      await screen.findByRole('heading', { name: 'Central Access' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Region Code')).toBeInTheDocument();
    expect(screen.getByText('Region Access Address')).toBeInTheDocument();
    expect(screen.queryByLabelText('Port')).not.toBeInTheDocument();
    expect(validateRegion).not.toHaveBeenCalled();
  });

  it('Region tidak valid menampilkan error dan tetap di langkah Region', async () => {
    validateRegion.mockRejectedValue({
      response: { data: { message: 'Region tidak ditemukan.' } },
    });

    render(<AccessGatewayPage />);
    fireEvent.change(await screen.findByLabelText('Region Code'), {
      target: { value: 'TIDAK-ADA' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Simpan & Lanjutkan/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Region tidak ditemukan.',
    );
    expect(
      screen.getByRole('heading', { name: 'Central Access' }),
    ).toBeInTheDocument();
    expect(fetchDepoOptions).not.toHaveBeenCalled();
  });

  it('Region valid memuat daftar depo dan menampilkan empty state bila kosong', async () => {
    validateRegion.mockResolvedValue(REGION);
    fetchDepoOptions.mockResolvedValue({
      valid: true,
      region_code: '001',
      region_name: 'REGION JATAKALBAR',
      depos: [],
    });

    await goToDepoStep();

    expect(await screen.findByText('Tidak ada depo aktif')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lanjutkan' }),
    ).toBeDisabled();
  });

  it('Depo valid membawa konteks Region/Depo ke langkah Login', async () => {
    mockHappyPath();

    await goToLoginStep();

    expect(screen.getByText(/001 · REGION JATAKALBAR/)).toBeInTheDocument();
    expect(screen.getByText(/0126 · Depo Pontianak/)).toBeInTheDocument();
    expect(validateDepo).toHaveBeenCalledWith('0126');
  });

  it('login memanggil loginWithContext dan menuju dashboard', async () => {
    mockHappyPath();
    loginWithContext.mockResolvedValue(undefined);

    await goToLoginStep();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'staff@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login ke Sistem' }));

    await waitFor(() => {
      expect(loginWithContext).toHaveBeenCalledWith(
        'staff@example.com',
        'secret',
      );
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('password salah menampilkan pesan yang ramah, bukan pesan teknis', async () => {
    mockHappyPath();
    loginWithContext.mockRejectedValue({
      response: {
        status: 422,
        data: {
          errors: { email: ['The provided credentials are incorrect.'] },
        },
      },
    });

    await goToLoginStep();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'staff@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'salah' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login ke Sistem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email atau password tidak sesuai.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('memulihkan konfigurasi tersimpan lalu memvalidasi ulang ke server', async () => {
    localStorage.setItem(
      'oz_access_context',
      JSON.stringify({
        regionCode: '001',
        regionName: 'REGION JATAKALBAR',
        depoKode: '0126',
        depoName: 'Depo Pontianak',
        depoId: 1,
        remember: true,
      }),
    );
    mockHappyPath();

    render(<AccessGatewayPage />);

    expect(await screen.findByText('Secure Login')).toBeInTheDocument();
    expect(validateRegion).toHaveBeenCalledWith('001');
    expect(validateDepo).toHaveBeenCalledWith('0126');
  });
});
