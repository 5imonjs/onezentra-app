import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DashboardPanel from './DashboardPanel';

const ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" />;

describe('DashboardPanel', () => {
  afterEach(cleanup);

  it('merender judul, subjudul, ikon, badge, aksi, dan konten', () => {
    render(
      <DashboardPanel
        ariaLabel="Panel uji"
        title="Mobilitas Penggunaan Sistem"
        subtitle="7 hari terakhir"
        icon={ICON}
        badge={<span>3 item</span>}
        actions={<button type="button">Muat ulang</button>}
      >
        <p>Isi panel</p>
      </DashboardPanel>,
    );

    expect(screen.getByRole('region', { name: 'Panel uji' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Mobilitas Penggunaan Sistem' })).toBeInTheDocument();
    expect(screen.getByText('7 hari terakhir')).toBeInTheDocument();
    expect(screen.getByText('3 item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Muat ulang' })).toBeInTheDocument();
    expect(screen.getByText('Isi panel')).toBeInTheDocument();
  });

  it('membungkus ikon dengan svg dekoratif agar path tampil sebagai glyph', () => {
    const { container } = render(<DashboardPanel title="Tanpa aksi" icon={ICON}>x</DashboardPanel>);

    const svg = container.querySelector('span[aria-hidden="true"] svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('path')).not.toBeNull();
  });

  it('tidak merender grup kanan bila badge dan aksi sama-sama kosong', () => {
    const { container } = render(<DashboardPanel title="Kosong">x</DashboardPanel>);

    expect(container.querySelector('.ml-auto')).toBeNull();
    expect(screen.getByText('Kosong')).toBeInTheDocument();
  });
});
