import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Calendar from './Calendar';

afterEach(cleanup);

describe('Calendar — warna status rencana vs receiving', () => {
  it('membedakan titik dijadwalkan (biru) dan receiving selesai (hijau)', () => {
    const now = new Date();
    const day = now.getDate() === 15 ? 16 : 15;
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const { container } = render(
      <Calendar
        events={[
          { date: ymd, count: 2, status: 'SCHEDULED' },
          { date: ymd, count: 1, status: 'COMPLETED' },
        ]}
        onDateClick={vi.fn()}
      />,
    );

    const cell = screen.getByRole('gridcell', { name: /3 rencana: 2 SCHEDULED, 1 COMPLETED/ });
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent('3');

    const dots = cell.querySelectorAll('.rounded-full');
    const classes = Array.from(dots).map((dot) => dot.className);
    expect(classes.some((c) => c.includes('bg-blue-500'))).toBe(true);
    expect(classes.some((c) => c.includes('bg-emerald-500'))).toBe(true);

    expect(container).toHaveTextContent('Dijadwalkan');
    expect(container).toHaveTextContent('Receiving');
    expect(container).toHaveTextContent('Selesai');
  });

  it('memakai ikut fase receiving (cyan) untuk status IN_PROGRESS', () => {
    const now = new Date();
    const day = now.getDate() === 15 ? 16 : 15;
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    render(<Calendar events={[{ date: ymd, count: 1, status: 'IN_PROGRESS' }]} />);

    const cell = screen.getByRole('gridcell', { name: /1 rencana: 1 IN_PROGRESS/ });
    expect(cell.querySelector('.bg-cyan-500')).toBeTruthy();
  });
});
