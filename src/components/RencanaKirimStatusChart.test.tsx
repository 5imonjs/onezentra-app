import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RencanaKirimStatusChart from './RencanaKirimStatusChart';

const { hasPermission, stats } = vi.hoisted(() => ({
  hasPermission: vi.fn<(perm: string) => boolean>(() => true),
  stats: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  rencanaKirim: { stats },
}));

type Row = { count: number; sum_qty: number; sum_kubikasi: number };

const row = (count = 0, sum_qty = 0, sum_kubikasi = 0): Row => ({ count, sum_qty, sum_kubikasi });

const statsResponse = (rows: Record<string, Row>) => ({ data: { data: rows } });

const ALL_ZERO: Record<string, Row> = {
  DRAFT: row(), SCHEDULED: row(), CHECKED_IN: row(), VERIFIED: row(),
  IN_PROGRESS: row(), COMPLETED: row(), CANCELLED: row(),
};

describe('RencanaKirimStatusChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    stats.mockResolvedValue(statsResponse(ALL_ZERO));
  });

  afterEach(cleanup);

  it('menampilkan satu kartu per tahap dengan label utuh (bukan dirapatkan)', async () => {
    stats.mockResolvedValue(statsResponse({
      ...ALL_ZERO,
      VERIFIED: row(1, 1233, 14.54),
      COMPLETED: row(2, 10, 1.5),
    }));

    render(<RencanaKirimStatusChart kodeDepo="DPO" />);

    // Label panjang tetap terbaca dengan spasi — dulu jadi "RENCANAKIRIM"/"SELESAIRECEIVING".
    expect(await screen.findByText('Rencana Kirim')).toBeInTheDocument();
    expect(screen.getByText('Gate Check-in')).toBeInTheDocument();
    expect(screen.getByText('Selesai Receiving')).toBeInTheDocument();

    expect(screen.getByText('Verifikasi').closest('[data-role]')).toHaveAttribute('data-count', '1');
    expect(screen.getByText('Selesai Receiving').closest('[data-role]')).toHaveAttribute('data-count', '2');
    expect(stats).toHaveBeenCalledWith('DPO');
  });

  it('menampilkan qty & kubikasi hanya pada tahap yang ada isinya', async () => {
    stats.mockResolvedValue(statsResponse({ ...ALL_ZERO, VERIFIED: row(1, 1233, 14.54) }));

    render(<RencanaKirimStatusChart />);

    const verified = (await screen.findByText('Verifikasi')).closest('[data-role]')!;
    expect(verified.textContent).toContain('1.233 qty');
    expect(verified.textContent).toContain('14.54 m³');

    // Tahap kosong tetap tampil sebagai kartu, tapi tanpa rincian.
    const draft = screen.getByText('Rencana Kirim').closest('[data-role]')!;
    expect(draft.textContent).not.toContain('qty');
  });

  it('menampilkan ringkasan total', async () => {
    stats.mockResolvedValue(statsResponse({
      ...ALL_ZERO,
      VERIFIED: row(1, 1233, 14.54),
    }));

    render(<RencanaKirimStatusChart />);

    expect(await screen.findByText('1 pengiriman')).toBeInTheDocument();
    expect(screen.getByText(/Total 1 pengiriman/)).toBeInTheDocument();
  });

  it('menampilkan empty state saat tidak ada pengiriman', async () => {
    render(<RencanaKirimStatusChart />);

    expect(await screen.findByText('Belum ada rencana kirim')).toBeInTheDocument();
    expect(screen.queryByText('Verifikasi')).not.toBeInTheDocument();
  });

  it('tidak merender apa pun tanpa izin rencana_kirim.view', async () => {
    hasPermission.mockReturnValue(false);

    const { container } = render(<RencanaKirimStatusChart />);

    await waitFor(() => expect(stats).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
