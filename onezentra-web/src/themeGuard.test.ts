import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

const files = walk(SRC);
const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => file.slice(SRC.length + 1);

/**
 * Regression guard for the dark/light theme.
 *
 * Every one of these checks corresponds to a bug that actually shipped: the
 * unit tests stayed green while blocks of white sat unreadable on the dark
 * canvas. Colours have no assertions, so the only defence is a lint that
 * refuses the classes the token system cannot fix.
 */
describe('theme token discipline', () => {
  it('has no raw hex colour literals in component source', () => {
    // A literal in a className or an inline style bypasses the theme entirely.
    // Allowed: explanatory comments that mention one. (The sidebar gradient
    // used to be a deliberate always-dark exception; it now follows the
    // theme ramp, so no source line should match — the Sidebar filter below
    // stays purely as a safety net.)
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /#[0-9a-fA-F]{6}\b/.test(text))
        .filter(({ rel: r, text }) => !r.endsWith('Sidebar.tsx') && !text.trim().startsWith('*') && !text.includes('literal')),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('uses no retired Tailwind colour families', () => {
    const retired = /\b(indigo|zinc|stone|neutral|lightBlue)-\d/;
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => retired.test(text))
        // `indigo` is a documented alias for `primary`; a literal indigo class
        // is still wrong but harmless, so only the others are hard failures.
        .filter(({ text }) => !/indigo-\d/.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never uses a solid bg-white, except the three intentional forms', () => {
    // Allowed: translucent glass (bg-white/NN), the status dot on a
    // saturated chip, and the ToggleSwitch thumb.
    const allowed = /bg-white\/|rounded-full bg-white|ToggleSwitch/;

    /**
     * Line numbers that sit inside a comment. Comments legitimately name the
     * class they are warning about, so scanning raw text would flag the guard's
     * own documentation. Tracked with a small state machine because matching
     * on line content alone is unreliable (the same text can appear twice).
     */
    const commentLines = (source: string) => {
      const inside = new Set<number>();
      let inBlock = false;
      let inJsxComment = false;

      source.split('\n').forEach((line, i) => {
        const n = i + 1;
        const trimmed = line.trim();

        if (inBlock) {
          inside.add(n);
          if (trimmed.includes('*/')) inBlock = false;
          return;
        }
        if (inJsxComment) {
          // A JSX comment opens as {/* and closes as */} — which may land on a
          // later line, so it needs its own state, not the /* ... */ one.
          inside.add(n);
          if (trimmed.includes('*/}')) inJsxComment = false;
          return;
        }

        if (trimmed.startsWith('/*')) {
          inside.add(n);
          if (!trimmed.includes('*/')) inBlock = true;
          return;
        }
        if (trimmed.startsWith('{/*')) {
          inside.add(n);
          if (!trimmed.includes('*/}')) inJsxComment = true;
          return;
        }
        if (trimmed.startsWith('//') || /^\*/.test(trimmed) || trimmed.startsWith('*')) {
          inside.add(n);
        }
      });
      return inside;
    };

    const offenders = files.flatMap((file) => {
      if (file.endsWith('ToggleSwitch.tsx')) return [];
      const source = read(file);
      const comments = commentLines(source);
      return source
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ line }) => !comments.has(line))
        .filter(({ text }) => /(?<![\w-])bg-white(?![\w/-])/.test(text))
        .filter(({ text }) => !allowed.test(text));
    });
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never focuses an input to a solid white background', () => {
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /focus:bg-white(?![\w/-])/.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never ends a gradient on a literal white', () => {
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /(?<![\w-])to-white(?![\w/-])/.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never paints a surface with a high-alpha white overlay', () => {
    // `bg-white/[0.60]` on a dark canvas is a light slab, not an elevation.
    // Low alpha is fine and is used as glass on the permanently-dark panels
    // (hero headers, sidebar), so only >= 0.3 is a hard failure.
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /bg-white\/\[(0\.[3-9]\d*|1(?:\.0+)?)\]/.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('paints no chart stroke or gradient with a literal hex', () => {
    // Chart colours must be var(--oz-*) so the ring follows the theme.
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /stroke="#|hex:\s*'#|hex:\s*"#/.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never fills or inks with the light pastels of the primary ramp', () => {
    // The `primary` ramp is the one scale that is deliberately NOT re-mapped
    // between themes, because 500-700 also back white-on-brand buttons. That
    // makes its 50/100/200 tints unusable as a fill: #e0e7ff is a bright slab
    // on the dark canvas, and `text-primary-600` on top of it has no contrast
    // left. Use chip-primary / accent-text / brand-wash instead.
    //
    // Gradients and shadows are exempt: a pastel stop inside a light-only
    // illustration is fine, and shadows are invisible either way.
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /\b(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:primary-(?:50|100|200))\b/.test(text))
        // 200 as a `from-`/`via-`/`to-` stop belongs to a brand gradient, and
        // text-primary-200 sits on a permanently-dark hero panel.
        .filter(({ text }) => !/\b(?:from|via|to)-primary-200\b/.test(text))
        .filter(({ text }) => !/\btext-primary-200\b/.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('gives every combobox a row-scoped listbox id', () => {
    // A hardcoded listbox id breaks the moment the component is rendered more
    // than once: every row then points aria-controls at the first row's list,
    // so the arrow keys drive the wrong dropdown. Ids must derive from a prop.
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /id="[a-z-]*listbox"/.test(text) || /aria-controls="[a-z-]*listbox"/.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never inks a dark panel with a step that flips between themes', () => {
    // `ink-*` panels and `bg-white/5..20` glass are dark in BOTH themes, but
    // the neutral ramp flips: in dark, `gray-300` is #24324a, which on a glass
    // panel is 1.2:1 and vanishes. Helper copy on the gate screen shipped
    // unreadable for exactly this reason. Dark panels take `ink-fg` instead.
    //
    // Both class names must appear on the same line, so ternaries that put a
    // dark fill and light ink in DIFFERENT branches are not flagged.
    const darkPanel = /\b(?:bg-ink-\d{3,4}|bg-white\/(?:5|10|20)\b)/;
    // Only the 300-400 band is genuinely broken. In dark those resolve to
    // #24324a / #909eb0, and on a glass panel #24324a is 1.2:1. The 100/200
    // steps stay light in both themes and read fine on ink; 500+ only ever
    // appear in a light-surface branch, which this same-line rule skips.
    const neutralInk = /\btext-(?:gray|slate)-(?:300|400)\b/;

    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => darkPanel.test(text) && neutralInk.test(text))
        // Fixed, theme-independent inks are correct on a dark panel.
        .filter(({ text }) => !/\btext-ink-(?:fg|fg-muted)\b/.test(text))
        // A hover tint is not the resting state of the copy. (The Sidebar
        // exemption below predates the theme-aware sidebar and stays only
        // as a safety net.)
        .filter(({ text }) => !/\bhover:bg-white\/(?:5|10|20)\b/.test(text))
        .filter(({ rel: r }) => !r.endsWith('Sidebar.tsx')),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never inks a dark panel from a CHILD line, not just the same line', () => {
    // The same-line rule above has a hole: a `bg-ink-950` wrapper and the copy
    // that sits on it are almost always separate lines, because the wrapper
    // also carries padding, radius and the decorative blob. The detail modal
    // on validasi-sj shipped `text-slate-300` code and `text-slate-200` totals
    // three lines below its `bg-ink-950` hero — #24324a on #080d18 is 1.2:1,
    // so the item identity was invisible in the dark theme while passing the
    // same-line check.
    //
    // Tracking is structural rather than textual, and it tracks the *effective*
    // surface, not just the nearest opener. A dark hero frequently contains a
    // light child — a `bg-card` stat tile, a `bg-*-50` status panel —
    // and neutral inks are correct on those. So a child that declares its own
    // surface wins over the ancestor it is nested in, and only genuinely
    // inherited copy is judged against the dark panel.
    // A dark surface is either a flat `bg-ink-*` or an ink gradient. The
    // gradient form matters: the heroes were migrated from `bg-ink-950` to
    // `bg-linear-to-br from-ink-900 via-ink-900 to-ink-800`, and a regex that
    // only knew `bg-ink-` would have silently stopped guarding every one of
    // them. `bg-white/NN` glass counts too — it is dark over a dark backdrop.
    const DARK = /\b(?:bg-ink-\d{3,4}|(?:from|via|to)-ink-\d{3,4}|bg-white\/(?:5|10|15|20)\b)/;
    // Any surface that is light in BOTH themes and therefore cancels the
    // inherited dark one. `gray/slate-50..200` are the light-theme pastels and
    // are deliberately excluded: they are the fills that flare on a dark canvas.
    const LIGHT =
      /\bbg-(?:surface(?:-card|-raised)?|card|popover|muted|background|white)\b|\bbg-(?:primary|emerald|amber|red|blue|orange|cyan|teal|sky|violet|purple|lime|yellow|pink)-(?:50|100|200)\b/;
    // 100-200 are surface steps and 300-400 are hairlines/muted inks. Measured
    // against ink-950 in the dark theme they land at 1.7:1 / 2.1:1 / 3.0:1 /
    // 7.3:1, so the first three are unreadable and 400 only just clears AA.
    // 500+ are never flagged: they are body inks, correct on the light branch.
    const BROKEN_INK = /\btext-(?:gray|slate)-(?:100|200|300|400)\b/;
    const SAFE_INK = /\btext-(?:ink-fg|ink-fg-muted|white)\b/;

    const indentOf = (line: string) => line.length - line.trimStart().length;

    const offenders = files.flatMap((file) => {
      const lines = read(file).split('\n');
      // Each entry is an opening tag that declared a surface, so the next
      // sibling at the same depth closes it.
      const surfaces: { indent: number; dark: boolean }[] = [];
      const hits: string[] = [];

      lines.forEach((text, i) => {
        if (!text.trim() || text.trimStart().startsWith('*')) return;
        const indent = indentOf(text);
        while (surfaces.length && surfaces[surfaces.length - 1].indent >= indent) surfaces.pop();

        const declaresDark = DARK.test(text);
        const declaresLight = LIGHT.test(text);
        // Nearest declared surface wins, not "any ancestor is dark": a light
        // stat tile nested in a dark hero is a light surface, and judging its
        // copy against the hero two levels up is exactly the false positive
        // this rule has to avoid.
        const nearest = surfaces.length ? surfaces[surfaces.length - 1].dark : false;
        const onDark = declaresDark || (!declaresLight && nearest);

        if (onDark && BROKEN_INK.test(text) && !SAFE_INK.test(text) && !/\bhover:bg-white\/(?:5|10|20)\b/.test(text)) {
          hits.push(`${rel(file)}:${i + 1}`);
        }

        if (declaresDark || declaresLight) surfaces.push({ indent, dark: declaresDark });
      });

      return hits;
    });

    // The Sidebar filter below predates the theme-aware sidebar (it used to
    // own always-dark app chrome) and stays only as a safety net.
    expect(offenders.filter((o) => !o.includes('components/Sidebar.tsx'))).toEqual([]);
  });

  it('never paints a dark panel with a hue ramp that inverts between themes', () => {
    // The tarif-retribusi header was `from-emerald-900 via-emerald-800
    // to-emerald-700` under `text-white`. Every hue ramp in globals.css is
    // role-based, so 700/800/900 flip from dark to near-white in the dark
    // theme: emerald-900 resolves to #f0fdf9 and emerald-800 to #ecfdf5. The
    // banner came out white-on-white and the page title vanished entirely.
    //
    // The fix is not a lighter ink, it is the theme-INDEPENDENT `ink` ramp
    // (from-ink-900 via-ink-900 to-ink-800) that all 19 sibling page headers
    // already use. Hue ramps are for accents and chips, never for the large
    // always-dark surface that carries a `text-white` heading.
    const DARK_PANEL_TEXT = /\btext-(?:white|ink-fg)\b/;
    // Gradient stops and fills at the deep end of a hue ramp: exactly the
    // steps that invert to near-white. `ink` is excluded because it is fixed
    // across themes by design.
    const INVERTING_STEP =
      /\b(?:from|via|to|bg)-(?:emerald|green|blue|red|amber|orange|cyan|teal|sky|purple|violet|yellow|pink|lime)-(?:700|800|900)\b/;
    // `hover:bg-slate-700` on a `bg-ink-900` button is the same inversion
    // wearing a disguise: slate-700 is #e2e8f0 in dark, so hovering an
    // always-dark button turns it near-white under white text. The dark
    // panel's own hover must stay in the `ink` ramp (hover:bg-ink-800).
    const NEUTRAL_HOVER_ON_INK = /\bbg-ink-\d{3}\b[\s\S]*?\bhover:bg-(?:slate|gray)-\d{3}\b/;

    // A className is often a ternary of mutually exclusive states, e.g.
    //   `${active ? 'bg-ink-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`
    // Splitting on the ternary boundary keeps each arm separate, so a hover
    // that belongs to the *other* arm is not mistaken for a hover on the ink
    // surface. Only a segment that holds both is a real offender.
    //
    // The split must not be a naive `text.split(':')`: Tailwind variants put
    // their own colons inside the very tokens being inspected
    // (`hover:bg-slate-700`), so a plain split tears `hover:` off `bg-slate-700`
    // and the rule silently stops matching the defect it exists to catch.
    // Mask token-internal colons first, split, then restore.
    const arms = (text: string) => {
      const MASK = '\u0000';
      const masked = text.replace(/[a-z0-9-]+:(?=[a-z0-9[])/gi, (m) => m.replace(':', MASK));
      return masked.split(/\?|:|\|\|/).map((arm) => arm.split(MASK).join(':'));
    };

    const scan = (predicate: (text: string) => boolean, why: string) =>
      files.flatMap((file) =>
        read(file)
          .split('\n')
          .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
          .filter(({ text }) => !text.trimStart().startsWith('*'))
          .flatMap(({ rel: r, line, text }) => (predicate(text) ? [`${r}:${line} (${why})`] : [])),
      );

    const offenders = [
      ...scan(
        (text) => arms(text).some((arm) => DARK_PANEL_TEXT.test(arm) && INVERTING_STEP.test(arm)),
        'inverting hue step on a dark panel',
      ),
      ...scan(
        (text) => arms(text).some((arm) => NEUTRAL_HOVER_ON_INK.test(arm)),
        'neutral hover on an ink surface',
      ),
    ];
    expect(offenders).toEqual([]);

    // Self-check: both halves of this guard must actually fire on the real
    // defects, or the rule is decoration that would have shipped the bug again.
    const header =
      'bg-linear-to-r from-emerald-900 via-emerald-800 to-emerald-700 p-6 text-white';
    expect(DARK_PANEL_TEXT.test(header) && INVERTING_STEP.test(header)).toBe(true);
    const button = 'rounded-lg bg-ink-900 text-white hover:bg-slate-700';
    expect(arms(button).some((arm) => NEUTRAL_HOVER_ON_INK.test(arm))).toBe(true);
    // A hover on the *other* arm of a ternary is legitimate and must not be
    // flagged; this is what the arm split exists to protect.
    const ternary = "${active ? 'bg-ink-900 text-white' : 'text-slate-600 hover:bg-slate-100'}";
    expect(arms(ternary).some((arm) => NEUTRAL_HOVER_ON_INK.test(arm))).toBe(false);
    // The sanctioned replacements must pass, so the guard cannot be satisfied
    // by simply banning the feature.
    const fixedHeader = 'bg-linear-to-r from-ink-900 via-ink-900 to-ink-800 p-6 text-white';
    expect(INVERTING_STEP.test(fixedHeader)).toBe(false);
    const fixedButton = 'rounded-lg bg-ink-900 text-white hover:bg-ink-800';
    expect(NEUTRAL_HOVER_ON_INK.test(fixedButton)).toBe(false);
  });

  it('builds no shadow from a neutral step, which flips between themes', () => {
    // `shadow-slate-900/10` on the validasi-sj hero meant "a faint dark
    // shadow" in the light theme and "a white glow halo" in the dark one,
    // because slate-900 is #0f172a in light and #ffffff in dark. A shadow is
    // not visible enough to be worth a theme-dependent colour at all: use
    // `shadow-black/NN`, or the bare `shadow-*` size step.
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /\bshadow-(?:gray|slate)-\d/.test(text))
        .filter(({ text }) => !text.trimStart().startsWith('*')),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('uses no arbitrary white alpha, which slips past the glass allowlist', () => {
    // The solid-`bg-white` guard allowlists `bg-white/NN` because that is the
    // documented glass idiom on dark heroes. `bg-white/[0.07]` looks like that
    // idiom but is an arbitrary value: it is not in the allowlist, and it is
    // a one-off that no other panel uses, so the hero ended up a different
    // shade of glass from every sibling. Write the step out, or use a token.
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /\bbg-white\/\[[^\]]+\]/.test(text))
        .filter(({ text }) => !text.trimStart().startsWith('*')),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never dims already-muted text with an opacity multiplier', () => {
    // `text-slate-500 opacity-50` looks like one token but is two: the ramp
    // already resolves `slate-500` per theme, and the opacity then composites
    // it a second time against whatever is behind it. On the biaya-thl step
    // rail that put #4d5a6d at 50% over ink-950 — 1.55:1 in the light theme,
    // i.e. the locked-step labels and their "Isi tanggal pengajuan..."
    // reasons were effectively invisible.
    //
    // The reason a step is locked is information the user needs, so it has to
    // stay readable; convey the locked state with the surface and the cursor
    // instead. A neutral ink and a dimming opacity in one className is always
    // a mistake, whatever the two were meant to achieve.
    //
    // `disabled:opacity-*` is the deliberate exception and is exempt: WCAG
    // exempts inactive controls, and every button in the app dims that way.
    // So strip the variant-prefixed opacities first, then look for a bare
    // `opacity-*` — one that still applies while the control is live, where
    // the copy is on screen and meant to be read.
    const variantOpacity = /(?:disabled|hover|focus|active|focus-visible|group-hover|aria-disabled):opacity-\d+/g;

    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /\btext-(?:gray|slate)-\d/.test(text))
        .filter(({ text }) => /(^|[\s"'`])opacity-\d/.test(text.replace(variantOpacity, ''))),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('never pairs a hairline ink with a surface it cannot be read on', () => {
    // The step pills in the biaya-thl wizard used `text-gray-300` on
    // `bg-popover`. Because the neutral ramp is role-based, gray-300 is
    // the *hairline* step: #cbd5e1 in light and #24324a in dark. On a raised
    // surface that is 1.42:1 and 1.00:1 — the pill looked like an empty box
    // with a missing label, in both themes.
    //
    // 300 and below are surface/hairline roles, never foreground. Copy on a
    // surface starts at 400 (muted) and should really sit at 500 (body) when
    // it is the only thing telling the user why a control is unavailable.
    const HAIRLINE_INK = /\btext-(?:gray|slate)-(?:50|100|200|300)\b/;
    // Surfaces a control is actually placed on, as opposed to `bg-white/NN`
    // glass, which is legitimately dark in both themes.
    const SURFACE =
      /\bbg-(?:surface(?:-card|-raised)?|gray-(?:50|100|200)|slate-(?:50|100|200))\b/;
    // `placeholder:` and `disabled:` inks are judged separately and are not
    // this rule's business: a placeholder is a hint the user overwrites, and a
    // disabled field is exempt from the contrast minimum. Strip them, along
    // with the comment lines that document the rule itself.
    const VARIANT_INK = /(?:placeholder|disabled):text-(?:gray|slate)-\d+/g;

    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .map(({ rel: r, line, text }) => ({ rel: r, line, text: text.replace(VARIANT_INK, '') }))
        .filter(({ text }) => HAIRLINE_INK.test(text) && SURFACE.test(text))
        .filter(({ text }) => !text.trimStart().startsWith('*')),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);
  });

  it('gives no form control a translucent white plate', () => {
    // `bg-white/80` on a form input is the "frosted field" look, and it is a
    // trap: over a light panel it is invisible, and over a dark one it becomes
    // a near-white slab. The biaya-thl date field paired it with
    // `text-gray-800`, which resolves to #f1f5f9 in the dark theme — light ink
    // on a light plate, 1.40:1. Use `input-field`, which already carries
    // `bg-card` + `text-gray-900` and flips with the theme.
    const offenders = files.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ rel: rel(file), line: i + 1, text: line }))
        .filter(({ text }) => /<(input|select|textarea)\b/.test(text))
        .filter(({ text }) => /\bbg-white\//.test(text)),
    );
    expect(offenders.map((o) => `${o.rel}:${o.line}`)).toEqual([]);

    // Self-check: the guard above must actually fire on the real defect, or it
    // is decoration. `input-field` is the sanctioned class precisely because it
    // carries `bg-card`; a hand-rolled `bg-white/80` plate is the bug.
    const probe = '<input type="date" className="w-full bg-white/80 border-2" />';
    expect(/<(input|select|textarea)\b/.test(probe) && /\bbg-white\//.test(probe)).toBe(true);
    const allowed = '<input type="date" className="input-field w-full border-2" />';
    expect(/\bbg-white\//.test(allowed)).toBe(false);
  });
});
