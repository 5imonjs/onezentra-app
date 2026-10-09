import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DashboardCardGrid from './DashboardCardGrid';

describe('DashboardCardGrid', () => {
  afterEach(cleanup);

  it('memakai auto-fit agar kartu merentang mengisi baris, bukan kolom tetap', () => {
    const { container } = render(
      <DashboardCardGrid>
        <div>kartu-a</div>
        <div>kartu-b</div>
      </DashboardCardGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;

    expect(grid.className).toContain('repeat(auto-fit');
    expect(grid.className).not.toContain('grid-cols-5');
    expect(screen.getByText('kartu-a')).toBeInTheDocument();
    expect(screen.getByText('kartu-b')).toBeInTheDocument();
  });
});
