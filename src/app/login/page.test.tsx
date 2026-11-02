import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const { push, replace, login, loadUser, validateRegion, router } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return {
    push,
    replace,
    login: vi.fn(),
    loadUser: vi.fn(),
    validateRegion: vi.fn(),
    // Objek router STABIL (referensi sama tiap render) — meniru perilaku
    // useRouter() Next.js asli; objek baru per render memicu loop setState.
    router: { push, replace },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // Image asli punya prop boolean (fill, priority) yang bukan atribut HTML.
    // Stringify agar jsdom tidak memprotes "non-boolean attribute".
    const htmlProps = Object.fromEntries(
      Object.entries(props)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );
    // `eslint-disable-next-line` sits above `return (` rather than between it
    // and the element: a `//` comment in that position is legal but is
    // mis-parsed by some editors' TS services, producing phantom syntax errors.
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...htmlProps} alt="" />;
  },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    user: null,
    permissions: [],
    isLoading: false,
    login,
    loadUser,
  }),
}));

vi.mock('@/lib/accessGateway', () => ({
  validateRegion,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/login');
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan peringatan sesi berakhir saat URL ?expired=1, lalu membersihkan flag dari URL', async () => {
    window.history.replaceState({}, '', '/login?expired=1');

    render(<LoginPage />);

    expect(await screen.findByText('Sesi Anda telah berakhir. Silakan login kembali.')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/login', { scroll: false });
  });

  it('tidak menampilkan peringatan sesi berakhir saat URL polos', () => {
    render(<LoginPage />);

    expect(screen.queryByText('Sesi Anda telah berakhir. Silakan login kembali.')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('menampilkan fitur ONEZENTRA dan pilihan tema sistem', async () => {
    render(<LoginPage />);

    expect(screen.getByRole('region', { name: 'Keunggulan ONEZENTRA' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scheduling' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'Tema Sistem' })).toBeInTheDocument();
  });

  it('menggunakan token tema global untuk halaman, kartu, input, dan tombol login', () => {
    render(<LoginPage />);

    expect(screen.getByRole('main')).toHaveClass('bg-background');
    expect(screen.getByRole('heading', { name: 'Hallo, Welcome Back' }).parentElement?.parentElement).toHaveClass('bg-card', 'border-border');
    expect(screen.getByLabelText('Username')).toHaveClass('bg-background', 'border-input', 'text-foreground');
    expect(screen.getByRole('button', { name: 'SIGN IN' })).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('regresi: tidak memanggil loadUser saat dibuka — validasi sesi kini di proxy, bukan GET /user di browser', () => {
    render(<LoginPage />);

    expect(loadUser).not.toHaveBeenCalled();
  });

  it('spek UI: tombol SIGN IN tampil, link Region Access tepat di bawahnya, tanpa navigasi antarhalaman', () => {
    render(<LoginPage />);

    const signIn = screen.getByRole('button', { name: 'SIGN IN' });
    const regionLink = screen.getByRole('button', { name: /Region Access/i });

    // Urutan DOM: Region Access berada SETELAH tombol SIGN IN (di bawahnya).
    expect(signIn.compareDocumentPosition(regionLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Tidak ada tautan navigasi ke /region-access atau /depo-identify.
    expect(screen.queryByRole('link', { name: /region/i })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith('/region-access');
  });

  it('klik Region Access membuka MODAL di atas /login — bukan pindah halaman', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Region Access/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Masih di halaman login yang sama (tidak ada navigasi).
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('Hallo, Welcome Back')).toBeInTheDocument();
    // Modal hanya berisi Port, Region Code, dan tombol SAVE.
    expect(screen.getByLabelText('Port')).toBeInTheDocument();
    expect(screen.getByLabelText('Region Code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeInTheDocument();
  });

  it('Ubah Region Access memuat kembali kode dan port yang sudah tersimpan', async () => {
    localStorage.setItem('region_access', JSON.stringify({
      port: '8000',
      regionCode: '001',
      regionId: 1,
      code: '001',
    }));

    render(<LoginPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ubah Region Access' }));

    expect(await screen.findByLabelText('Region Code')).toHaveValue('001');
    expect(screen.getByLabelText('Port')).toHaveValue('8000');
  });

  it('SIGN IN tanpa konfigurasi Region Access: login TIDAK dipanggil, modal terbuka, pesan error tampil', async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'rahasia123' } });
    fireEvent.click(screen.getByRole('button', { name: 'SIGN IN' }));

    expect(login).not.toHaveBeenCalled();
    expect(await screen.findByText(/Konfigurasikan Region Access terlebih dahulu/)).toBeInTheDocument();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('SAVE dengan Region Code salah: pesan error tampil dan modal TETAP terbuka', async () => {
    validateRegion.mockRejectedValue({
      response: { status: 404, data: { message: 'Region not found or inactive' } },
    });

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Region Access/i }));
    fireEvent.change(await screen.findByLabelText('Port'), { target: { value: '9999' } });
    fireEvent.change(screen.getByLabelText('Region Code'), { target: { value: 'REGION-TIDAK-ADA' } });
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));

    expect(await screen.findByText(/Region not found or inactive/)).toBeInTheDocument();
    expect(validateRegion).toHaveBeenCalledWith('REGION-TIDAK-ADA');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(localStorage.getItem('region_access')).toBeNull();
  });

  it('SAVE dengan konfigurasi valid: konfigurasi persisten di localStorage, modal OTOMATIS tertutup, halaman tetap /login', async () => {
    validateRegion.mockResolvedValue({
      valid: true,
      region_id: 1,
      region_code: 'REG-001',
      region_name: 'Region 001',
      message: 'Region validated',
    });

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Region Access/i }));
    fireEvent.change(await screen.findByLabelText('Port'), { target: { value: '8000' } });
    fireEvent.change(screen.getByLabelText('Region Code'), { target: { value: 'REG-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));

    // Konfigurasi tersimpan PERSISTEN (localStorage, bertahan setelah browser ditutup).
    await waitFor(() => {
      expect(localStorage.getItem('region_access')).toContain('REG-001');
    });
    expect(validateRegion).toHaveBeenCalledWith('REG-001');
    // Modal tertutup otomatis (setTimeout 600ms), user tetap di halaman login.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }, { timeout: 2000 });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText('Hallo, Welcome Back')).toBeInTheDocument();
  });

  it('setelah konfigurasi tersimpan, SIGN IN memanggil autentikasi (login dipanggil)', async () => {
    localStorage.setItem('region_access', JSON.stringify({ port: '8000', regionCode: 'REG-001', regionId: 1, code: 'REG-001' }));

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'rahasia123' } });
    fireEvent.click(screen.getByRole('button', { name: 'SIGN IN' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('admin', 'rahasia123');
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});