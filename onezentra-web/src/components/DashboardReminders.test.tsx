import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardReminders from './DashboardReminders';

const { remindersList } = vi.hoisted(() => ({ remindersList: vi.fn() }));

vi.mock('@/lib/api', () => ({
  dashboard: { reminders: remindersList },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const payload = {
  threshold_minutes: 30,
  generated_at: '2026-11-20T10:00:00Z',
  total: 2,
  groups: [
    {
      key: 'sj_validation',
      label: 'Validasi SJ belum selesai',
      href: '/validasi-sj',
      count: 1,
      items: [{ id: 7, title: 'PO-77', subtitle: 'Depo Singkawang', elapsed_minutes: 47, at: '2026-11-20T09:13:00Z' }],
    },
    {
      key: 'gate',
      label: 'Kendaraan tertahan di gate',
      href: '/gate',
      count: 1,
      items: [{ id: 8, title: 'B 1234 CD', subtitle: 'Depo Singkawang', elapsed_minutes: 75, at: '2026-11-20T08:45:00Z' }],
    },
  ],
};

describe('DashboardReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remindersList.mockResolvedValue({ data: { data: payload } });
  });

  afterEach(cleanup);

  it('menampilkan grup dan durasi keterlambatan', async () => {
    render(<DashboardReminders kodeDepo="0127" />);

    expect(await screen.findByText('Proses Tertunda')).toBeInTheDocument();
    expect(screen.getByText('Validasi SJ belum selesai')).toBeInTheDocument();
    expect(screen.getByText('Kendaraan tertahan di gate')).toBeInTheDocument();
    expect(screen.getByText('47 mnt')).toBeInTheDocument();
    expect(screen.getByText('1 jam 15 mnt')).toBeInTheDocument();
    expect(remindersList).toHaveBeenCalledWith('0127');
  });

  it('tidak menampilkan panel bila tidak ada proses tertunda', async () => {
    remindersList.mockResolvedValue({ data: { data: { ...payload, total: 0, groups: [] } } });

    const { container } = render(<DashboardReminders />);
    await waitFor(() => expect(remindersList).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });

  it('menampilkan error dan tombol coba lagi', async () => {
    remindersList.mockRejectedValue(new Error('offline'));

    render(<DashboardReminders />);

    expect(await screen.findByText(/Gagal memuat reminder/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(remindersList).toHaveBeenCalledTimes(2);
  });
});
