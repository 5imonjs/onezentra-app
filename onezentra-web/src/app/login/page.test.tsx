import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const { push, replace, login, loadUser } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  login: vi.fn(),
  loadUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
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

describe('LoginPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/login');
    vi.clearAllMocks();
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
});