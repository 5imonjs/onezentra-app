import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

// The ramp now in globals.css, read back from the file so this cannot drift.
const css = readFileSync(join(SRC, 'src', 'app', 'globals.css'), 'utf8');
type Theme = 'light' | 'dark';
type Hex = string;

const section = (start: string, end?: string): string =>
  css.slice(css.indexOf(start), end === undefined ? undefined : css.indexOf(end));

const readRamp = (block: string): Record<string, string> =>
  Object.fromEntries(
    [...block.matchAll(/--oz-gray-(\d{3}):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].slice(1)]),
  );

const RAMP: Record<Theme, Record<string, Hex>> = {
  light: readRamp(section(':root', "[data-theme='dark']")),
  dark: readRamp(section("[data-theme='dark']")),
};

const SURF: Record<Theme, Record<string, Hex>> = {
  light: { card: 'ffffff', raised: 'f8fafc', canvas: 'f1f5f9' },
  dark: { card: '162033', raised: '24324a', canvas: '0f172a' },
};

const lum = (h: Hex): number => {
  const c = (h.match(/\w\w/g) ?? []).map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const cr = (a: Hex, b: Hex): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return +((x + 0.05) / (y + 0.05)).toFixed(2);
};

const worst = (theme: Theme, hex: Hex): number =>
  Math.min(...Object.values(SURF[theme]).map((s) => cr(hex, s)));

/** Composites `fg` at `alpha` over `bg`, the way a browser resolves a tint. */
function blend(fg: Hex, alpha: number, bg: Hex): Hex {
  const f = (fg.match(/\w\w/g) ?? []).map((x) => parseInt(x, 16));
  const b = (bg.match(/\w\w/g) ?? []).map((x) => parseInt(x, 16));
  return f
    .map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Rekursif seluruh file di `src` — guard ini memindai class yang benar-benar
 * dipakai, bukan hanya yang ada di globals.css.
 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx|ts|css)$/.test(entry.name) ? [full] : [];
  });
}

describe('palette families are registered in @theme', () => {
  // Tailwind v4 hanya membalik nilai yang dideklarasikan lewat @theme. Keluarga
  // warna yang TIDAK terdaftar di sana (mis. `green`) diam-diam jatuh ke palet
  // default Tailwind: nilainya hex/oklch statis yang tidak bergerak saat ganti
  // tema. Digabung ramp netral yang membalik, hasilnya teks terang di atas
  // latar terang — toast sukses `bg-green-50` + `text-foreground` hanya 1.18:1
  // di dark tapi 9.89:1 di light, jadi temanya gelap saja yang rusak dan
  // penyebabnya tak terlihat kalau hanya salah satu tema yang dicek.
  const registered = new Set([...css.matchAll(/--color-([a-z]+)-\d+:/g)].map((m) => m[1]));

  // Token non-warna yang tetap punya pasangan di @theme (surface, overlay, ...).
  const nonPalette = new Set(['surface', 'overlay', 'row', 'chip', 'focus', 'selection']);

  it('tidak ada keluarga warna yang dipakai tapi tidak terdaftar di @theme', () => {
    const used = new Set<string>();
    // Hanya prefiks yang benar-benar bisa menghasilkan kelas warna Tailwind,
    // sehingga `grid-cols-2` atau `min-h-10` tidak ikut terhitung.
    const prefixes = 'bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|decoration|accent|caret|divide';
    const pattern = new RegExp(`\\b(?:${prefixes})-([a-z]+)-\\d{2,3}\\b`, 'g');

    for (const file of walk(join(SRC, 'src'))) {
      // Buang komentar: file ini sendiri menyebut `bg-green-50` untuk
      // mendokumentasikan bug-nya, dan guard tidak boleh menyabot dirinya sendiri.
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

      for (const m of source.matchAll(pattern)) used.add(m[1]);
    }

    const missing = [...used]
      .filter((family) => !registered.has(family) && !nonPalette.has(family))
      .sort();

    expect(missing).toEqual([]);
  });
});

describe('neutral ramp contrast', () => {
  // The 400/500/600 steps carry body copy in ~1250 call sites. They used to
  // fail WCAG AA in BOTH themes (light 400 was 2.56:1, dark 400 was 2.71:1),
  // which is unreadable text rather than a subtle tint. The fix is at the token
  // level so every call site is corrected without touching them.
  it.each(['light', 'dark'] as const)('%s: steps 400-600 clear 4.5:1 on every surface', (theme) => {
    const failures = ['400', '500', '600']
      .map((step) => `${step}=${RAMP[theme][step]}(${worst(theme, RAMP[theme][step])}:1)`)
      .filter((entry) => Number(entry.match(/\(([\d.]+):1\)/)![1]) < 4.5);
    expect(failures).toEqual([]);
  });

  it.each(['light', 'dark'] as const)('%s: keeps 400 -> 700 strictly monotonic', (theme) => {
    // A non-monotonic ramp silently breaks the visual hierarchy: two steps
    // that look the same make it impossible to tell body ink from muted ink.
    const steps = ['400', '500', '600', '700'].map((s) => RAMP[theme][s]);
    for (let i = 1; i < steps.length; i++) {
      const rising = lum(steps[i]) > lum(steps[i - 1]);
      const expected = theme === 'dark';
      expect(rising, `${theme}: ${steps[i - 1]} -> ${steps[i]} went the wrong way`).toBe(expected);
    }
  });
});

describe('ink-panel foreground', () => {
  // `ink-*` panels are dark in BOTH themes, so their text cannot come from the
  // neutral ramp — that ramp flips. In dark, gray-300 is #24324a, which on an
  // ink panel is 1.2:1 and completely invisible; this shipped as unreadable
  // helper copy on the gate screen. The ink foregrounds are fixed values.
  const INK_PANEL = '0f172a';
  // The gate card stacks a white/5 glass over the ink panel, which lifts the
  // effective background and makes it the strictest of the cases.
  const GLASS_PANEL = blend('ffffff', 0.05, INK_PANEL);

  it('declares a foreground for ink panels', () => {
    expect(css).toMatch(/--color-ink-fg:/);
    expect(css).toMatch(/--color-ink-fg-muted:/);
  });

  it.each(['light', 'dark'])('%s: ink foregrounds clear 4.5:1 on ink and on glass', (theme) => {
    const inkFg = css.match(/--color-ink-fg:\s*(#[0-9a-f]{6})/i)![1].slice(1);
    const mutedFg = css.match(/--color-ink-fg-muted:\s*(#[0-9a-f]{6})/i)![1].slice(1);

    expect(cr(inkFg, INK_PANEL), `${theme} ink-fg on ink`).toBeGreaterThanOrEqual(4.5);
    expect(cr(inkFg, GLASS_PANEL), `${theme} ink-fg on glass`).toBeGreaterThanOrEqual(4.5);
    expect(cr(mutedFg, INK_PANEL), `${theme} ink-fg-muted on ink`).toBeGreaterThanOrEqual(4.5);
    expect(cr(mutedFg, GLASS_PANEL), `${theme} ink-fg-muted on glass`).toBeGreaterThanOrEqual(4.5);

    // Muted must stay a step below full ink so hierarchy survives.
    expect(lum(mutedFg), `${theme}: muted is not dimmer than full ink`).toBeLessThan(lum(inkFg));
    void theme;
  });

  it('keeps neutral ink out of dark glass panels', () => {
    // The dark value of gray-300 is the worst offender: it equals the raised
    // surface, so any use of it on glass disappears. The guard reads the real
    // dark value from globals.css so it cannot be defeated by a token rename.
    const dark300 = RAMP.dark['300'];
    expect(cr(dark300, GLASS_PANEL), `gray-300 (${dark300}) is unusable on a dark glass panel`)
      .toBeLessThan(4.5);
  });
});
