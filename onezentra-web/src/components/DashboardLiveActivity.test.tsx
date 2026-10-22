import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLiveActivity from './DashboardLiveActivity';

const { liveActivity, hasPermission } = vi.hoisted(() => ({
  liveActivity: vi.fn(),
  hasPermission: vi.fn<(perm: string) => boolean>(() => true),
}));

vi.mock('@/lib/api', () => ({
  dashboard: { liveActivity },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/dashboardSummary', () => ({
  formatRelativeTime: vi.fn(() => 'baru saja'),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  user_id: 7,
  user_name: 'Budi Santoso',
  level: 'operator',
  kode_depo: 'DPO',
  nama_depo: 'Depo Test',
  method: 'GET',
  route: 'api/v1/rencana-kirim',
  module: 'Rencana Kirim',
  action: 'Melihat Rencana Kirim',
  occurred_at: '2026-10-22T08:00:00+07:00',
  ...overrides,
});

const payload = (events: ReturnType<typeof event>[]) => ({
  data: {
    data: {
      events,
      server_time: '2026-10-22T08:00:05+07:00',
    },
  },
});

describe('DashboardLiveActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveActivity.mockReset();
    hasPermission.mockReset();
    hasPermission.mockReturnValue(true);
    liveActivity.mockResolvedValue(payload([event()]));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('menampilkan siapa melakukan apa, modul, dan waktu secara real-time', async () => {
    render(<DashboardLiveActivity kodeDepo="DPO" />);

    expect(await screen.findByText('Aktivitas Real-time')).toBeInTheDocument();
    expect(screen.getByText('Melihat Rencana Kirim')).toBeInTheDocument();
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Depo Test')).toBeInTheDocument();
    expect(screen.getByText('Rencana Kirim')).toBeInTheDocument();
    expect(screen.getByText('api/v1/rencana-kirim')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(liveActivity).toHaveBeenCalledWith(0, 'DPO', expect.anything());
  });

  it('memuat aktivitas baru lewat polling lima detik memakai after_id terakhir', async () => {
    let poll: (() => void) | undefined;
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      // waitFor juga memakai setInterval; hanya tangkap interval polling 5 detik.
      if (timeout === 5_000) {
        poll = handler as () => void;
      }

      return realSetInterval(handler, timeout, ...args);
    });

    render(<DashboardLiveActivity kodeDepo="DPO" />);

    expect(await screen.findByText('Melihat Rencana Kirim')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Muat ulang aktivitas real-time' })).not.toBeDisabled());
    expect(poll).toBeTypeOf('function');

    liveActivity.mockResolvedValueOnce(payload([
      event({
        id: 2,
        method: 'POST',
        route: 'api/v1/biaya/10/approve',
        module: 'Biaya',
        action: 'Menyetujui Biaya',
      }),
    ]));

    act(() => poll?.());

    await waitFor(() => expect(liveActivity).toHaveBeenCalledTimes(2));
    expect(liveActivity).toHaveBeenLastCalledWith(1, 'DPO', expect.anything());
    expect(await screen.findByText('Menyetujui Biaya')).toBeInTheDocument();
  });

  it('mengganti depo memakai after_id dari snapshot depo baru, bukan ID depo lama', async () => {
    let poll: (() => void) | undefined;
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (timeout === 5_000) {
        poll = handler as () => void;
      }

      return realSetInterval(handler, timeout, ...args);
    });
    liveActivity
      .mockResolvedValueOnce(payload([event({ id: 99 })]))
      .mockResolvedValueOnce(payload([event({ id: 5, module: 'Biaya', action: 'Melihat Biaya' })]))
      .mockResolvedValueOnce(payload([event({ id: 6, module: 'NPN', action: 'Melihat NPN' })]));

    const { rerender } = render(<DashboardLiveActivity kodeDepo="DPO" />);

    expect(await screen.findByText('Melihat Rencana Kirim')).toBeInTheDocument();
    rerender(<DashboardLiveActivity kodeDepo="BDG" />);

    expect(await screen.findByText('Melihat Biaya')).toBeInTheDocument();
    await waitFor(() => expect(liveActivity).toHaveBeenCalledWith(0, 'BDG', expect.anything()));

    act(() => poll?.());

    await waitFor(() => expect(liveActivity).toHaveBeenCalledWith(5, 'BDG', expect.anything()));
    expect(await screen.findByText('Melihat NPN')).toBeInTheDocument();
  });

  it('tombol muat ulang mengambil snapshot terbaru dari awal', async () => {
    render(<DashboardLiveActivity kodeDepo="DPO" />);

    await screen.findByText('Melihat Rencana Kirim');

    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang aktivitas real-time' }));

    await waitFor(() => expect(liveActivity).toHaveBeenCalledTimes(2));
    expect(liveActivity).toHaveBeenLastCalledWith(0, 'DPO', expect.anything());
  });

  it('tidak dirender dan tidak memuat data tanpa users.view', () => {
    hasPermission.mockReturnValue(false);

    const { container } = render(<DashboardLiveActivity kodeDepo="DPO" />);

    expect(container).toBeEmptyDOMElement();
    expect(liveActivity).not.toHaveBeenCalled();
  });
});
