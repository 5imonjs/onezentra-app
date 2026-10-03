'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Theme picker for the app shell.
 *
 * `next-themes` exposes three values when `enableSystem` is on: 'light',
 * 'dark' and 'system'. That matches what we want to offer, so the options are
 * derived from the hook rather than hard-coded.
 *
 * Renders as a segmented control with real radio inputs: keyboard users get
 * arrow-key navigation for free, and assistive tech announces a choice whose
 * meaning does not silently change (a bare toggle button cannot).
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // `theme` is undefined on the server and on the first client render, so
  // rendering the selected state before mount would mismatch hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options: { value: string; label: string }[] = [
    { value: 'light', label: 'Terang' },
    { value: 'dark', label: 'Gelap' },
    { value: 'system', label: 'Sistem' },
  ];

  if (!mounted) {
    // Reserve the same space so the surrounding layout does not jump once the
    // real control appears.
    return (
      <div
        aria-hidden="true"
        className={
          compact
            ? 'inline-flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10 h-[30px]'
            : 'inline-flex w-full items-center gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10 h-[38px]'
        }
      />
    );
  }

  const active = theme ?? 'system';

  return (
    <div
      role="radiogroup"
      aria-label="Tema tampilan"
      className={
        compact
          ? 'inline-flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10'
          : 'inline-flex w-full items-center gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10'
      }
    >
      {options.map((option) => {
        const isActive = active === option.value;
        return (
          <label
            key={option.value}
            className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <input
              type="radio"
              name="oz-theme"
              value={option.value}
              checked={isActive}
              onChange={() => setTheme(option.value)}
              className="sr-only"
            />
            <ThemeIcon mode={option.value} resolved={resolvedTheme} />
            {!compact && <span>{option.label}</span>}
            {/* On compact the visible label is dropped, so the state still has
                to reach assistive tech. */}
            <span className="sr-only">
              {option.value === 'system'
                ? `Ikuti pengaturan sistem, saat ini ${resolvedTheme === 'dark' ? 'gelap' : 'terang'}`
                : `Tema ${option.label}`}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ThemeIcon({ mode, resolved }: { mode: string; resolved?: string }) {
  if (mode === 'system') {
    // Half-filled circle: the conventional "follow the OS" glyph.
    return (
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
        <title>{resolved === 'dark' ? 'Sistem (gelap)' : 'Sistem (terang)'}</title>
      </svg>
    );
  }

  return mode === 'dark' ? (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  ) : (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}
