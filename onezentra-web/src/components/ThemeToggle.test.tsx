import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from './ThemeToggle';

const STORAGE_KEY = 'theme';

/** jsdom has no matchMedia; install a controllable one per test. */
function stubMatchMedia(prefersDark: boolean) {
  const media = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => true,
  };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  return media;
}

const attr = () => document.documentElement.getAttribute('data-theme');

/**
 * The contract this app depends on: next-themes must write `data-theme` on
 * <html>, because that is the attribute globals.css keys the entire palette
 * off. If the library were mounted with a different `attribute`, the theme
 * would toggle in the UI but the colours would never move.
 */
function renderToggle() {
  return render(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubMatchMedia(false);
});

describe('ThemeToggle dengan next-themes', () => {
  it('menampilkan ketiga pilihan tema', () => {
    renderToggle();

    expect(screen.getByRole('radio', { name: /tema terang/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /tema gelap/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /ikuti pengaturan sistem/i })).toBeInTheDocument();
  });

  it('menandai pilihan tersimpan sebagai aktif', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark');
    renderToggle();

    expect(screen.getByRole('radio', { name: /tema gelap/i })).toBeChecked();
  });

  it('memilih tema menulis data-theme yang dibaca CSS', () => {
    renderToggle();

    screen.getByRole('radio', { name: /tema gelap/i }).click();

    // The one assertion that matters: this attribute is what flips the palette.
    expect(attr()).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('kembali ke terang saat memilih opsi terang', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark');
    renderToggle();

    screen.getByRole('radio', { name: /tema terang/i }).click();

    expect(attr()).toBe('light');
  });

  it('mode system mengikuti preferensi OS', () => {
    stubMatchMedia(true);
    renderToggle();

    expect(attr()).toBe('dark');
    // And the option itself is still "system", not an explicit choice.
    expect(screen.getByRole('radio', { name: /ikuti pengaturan sistem/i })).toBeChecked();
  });
});
