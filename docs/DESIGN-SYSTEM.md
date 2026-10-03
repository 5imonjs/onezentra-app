# ONEZENTRA Design System

## Overview

Design system ini mendefinisikan token, komponen, dan pedoman aksesibilitas untuk seluruh aplikasi ONEZENTRA Warehouse Management System. Semua elemen UI harus mengikuti pedoman ini untuk menjaga konsistensi dan kepatuhan WCAG 2.2 AA.

---

## 1. Color Palette

### Primary (Indigo)
| Token | Hex | Use Case |
|-------|-----|----------|
| `primary-50` | `#eef2ff` | Light backgrounds, hover states |
| `primary-100` | `#e0e7ff` | Badge backgrounds |
| `primary-200` | `#c7d2fe` | Border accents |
| `primary-300` | `#a5b4fc` | Text on dark backgrounds |
| `primary-400` | `#818cf8` | Icons on dark backgrounds |
| `primary-500` | `#6366f1` | Focus rings |
| `primary-600` | `#4f46e5` | Primary buttons, active states |
| `primary-700` | `#4338ca` | Button hover |
| `primary-800` | `#3730a3` | Dark text accents |
| `primary-900` | `#312e81` | Selection backgrounds |
| `primary-950` | `#1e1b4b` | Dark backgrounds |

### Accent (Teal)
| Token | Hex | Use Case |
|-------|-----|----------|
| `accent-400` | `#2dd4bf` | Decorative accents |
| `accent-500` | `#14b8a6` | Kubikasi indicators |

### Surface
| Token | Hex | Use Case |
|-------|-----|----------|
| `surface` | `#f8fafc` | Page background |
| `surface-card` | `#ffffff` | Card backgrounds |
| `surface-hover` | `#f1f5f9` | Hover states |

### Gray (Slate)
| Token | Hex | WCAG Contrast | Use Case |
|-------|-----|---------------|----------|
| `gray-50` | `#f8fafc` | - | Subtle backgrounds |
| `gray-100` | `#f1f5f9` | - | Borders, dividers |
| `gray-200` | `#e2e8f0` | - | Input borders |
| `gray-300` | `#cbd5e1` | - | Placeholder text (avoid) |
| `gray-400` | `#94a3b8` | 3.03:1 (avoid for text) | Icons only |
| `gray-500` | `#64748b` | 4.63:1 | Secondary text, captions |
| `gray-600` | `#475569` | 6.43:1 | Body text |
| `gray-700` | `#334155` | 9.07:1 | Primary text |
| `gray-800` | `#1e293b` | 13.37:1 | Headings |
| `gray-900` | `#0f172a` | 18.06:1 | Maximum emphasis |

> **WCAG Note**: `gray-400` (#94a3b8) hanya boleh digunakan untuk ikon dekoratif, bukan untuk teks. Gunakan `gray-500` atau lebih gelap untuk teks.

---

## 2. Typography

### Font Family
```css
--font-sans: 'Roboto', system-ui, -apple-system, sans-serif;
```

### Type Scale
| Class | Size | Line Height | Use Case |
|-------|------|-------------|----------|
| `text-xs` | 12px | 16px | Labels, captions, badges |
| `text-sm` | 14px | 20px | Secondary text, table cells |
| `text-base` | 16px | 24px | Body text, form inputs |
| `text-lg` | 18px | 28px | Subheadings, card titles |
| `text-xl` | 20px | 28px | Section titles |
| `text-2xl` | 24px | 32px | Page titles |
| `text-3xl` | 30px | 36px | Hero text |

### Font Weights
| Weight | Use Case |
|--------|----------|
| 300 (Light) | Decorative text only |
| 400 (Regular) | Body text |
| 500 (Medium) | Labels, secondary headings |
| 700 (Bold) | Primary headings, emphasis |

---

## 3. Spacing & Sizing

### Border Radius
| Token | Value | Use Case |
|-------|-------|----------|
| `rounded-lg` | 8px | Small elements (badges, tags) |
| `rounded-xl` | 12px | Standard elements (buttons, inputs, cards) |
| `rounded-2xl` | 16px | Large cards, modals |
| `rounded-3xl` | 24px | Featured cards |
| `rounded-full` | 9999px | Avatars, status dots |

### Minimum Touch Targets (WCAG 2.5.8)
All interactive elements must be at least **44x44px**:
```css
min-w-11 min-h-11
```
> Gunakan kelas kanonik skala spacing (Tailwind v4: `--spacing` = 0.25rem),
> bukan nilai arbitrary — 11 × 4px = 44px, identik, dan editor tidak lagi
> menandai kelasnya sebagai "bukan kanonik".

---

## 4. Component API

### Buttons

#### `.btn-primary`
```html
<button class="btn-primary">Label</button>
```
- Background: `primary-600` → hover: `primary-700`
- Text: white
- Shadow: `shadow-lg shadow-primary-600/20`
- Min height: 44px (with padding)

#### `.btn-secondary`
```html
<button class="btn-secondary">Label</button>
```
- Background: white → hover: `gray-50`
- Border: `gray-200` → hover: `gray-300`
- Text: `gray-700`

#### `.btn-danger`
```html
<button class="btn-danger">Label</button>
```
- Background: `red-500` → hover: `red-600`
- Text: white
- Shadow: `shadow-lg shadow-red-500/20`

### Form Elements

#### `.input-field`
```html
<input class="input-field" />
```
- Border: `gray-200`
- Focus: `ring-2 ring-primary-500` with accessible focus ring
- Border radius: `rounded-xl`
- Padding: `px-4 py-3`

#### `.select-field`
```html
<select class="select-field"></select>
```
- Custom chevron icon via background-image
- Same styling as input-field

### Status Badges

#### `.badge`
Base class for all badges.
```html
<span class="badge badge-success">Selesai</span>
```

| Class | Background | Text | Border |
|-------|------------|------|--------|
| `.badge-success` | `emerald-50` | `emerald-700` | `emerald-200` |
| `.badge-warning` | `amber-50` | `amber-700` | `amber-200` |
| `.badge-danger` | `red-50` | `red-700` | `red-200` |
| `.badge-info` | `blue-50` | `blue-700` | `blue-200` |

### Tables

#### `.table-header`
Gradient header cell with uppercase labels.

#### `.table-cell`
Standard table cell with border.

#### Excel-like Tables
```html
<table>
  <thead><tr class="excel-header">...</tr></thead>
  <tbody>
    <tr class="excel-row"><td class="excel-cell">...</td></tr>
  </tbody>
</table>
```

---

## 5. Accessibility Checklist

### WCAG 2.2 AA Requirements

#### Perceivable
- [ ] Color contrast minimum 4.5:1 for normal text
- [ ] Color contrast minimum 3:1 for large text (18px+)
- [ ] Color contrast minimum 3:1 for UI components
- [ ] Text can be resized to 200% without loss of content
- [ ] Images have descriptive `alt` text
- [ ] Decorative images use `alt=""` and `aria-hidden="true"`

#### Operable
- [ ] All interactive elements reachable via keyboard
- [ ] Visible focus indicator on all focusable elements
- [ ] Skip-to-content link present
- [ ] No keyboard traps
- [ ] Touch targets minimum 44x44px
- [ ] Animations respect `prefers-reduced-motion`

#### Understandable
- [ ] Page language set (`lang="id"`)
- [ ] Form labels associated with inputs (`htmlFor`/`id`)
- [ ] Error messages linked to form fields (`aria-describedby`)
- [ ] Consistent navigation across pages
- [ ] Clear error identification (`role="alert"`)

#### Robust
- [ ] Valid HTML semantics (`<main>`, `<nav>`, `<header>`)
- [ ] ARIA roles where needed (`role="dialog"`, `role="alert"`, `role="switch"`)
- [ ] `aria-label` on icon-only buttons
- [ ] `aria-expanded` on collapsible elements
- [ ] `aria-live` regions for dynamic content

### Component-Specific ARIA

#### Modal
```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Title</h2>
  <!-- content -->
</div>
```

#### Toast
```html
<div role="alert" aria-live="assertive" aria-atomic="true">
  <!-- toast content -->
</div>
```

#### Toggle Switch
```html
<button role="switch" aria-checked="true" aria-label="Toggle feature">
  <!-- toggle -->
</button>
```

#### Calendar
```html
<div role="region" aria-label="Calendar">
  <div role="grid" aria-label="Month Year">
    <button role="gridcell" aria-label="15 Januari 2026, 3 jadwal" aria-selected="false">
      15
    </button>
  </div>
</div>
```

#### Tables
```html
<table>
  <caption class="sr-only">Description for screen readers</caption>
  <thead>
    <tr>
      <th scope="col">Column Header</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Cell content</td>
    </tr>
  </tbody>
</table>
```

#### Status Dropdown
```html
<button aria-expanded="false" aria-haspopup="true" aria-label="Status: Draft. Klik untuk ubah.">
  Draft ▼
</button>
```

---

## 6. Do's and Don'ts

### Do
- Use semantic HTML elements (`<main>`, `<nav>`, `<button>`, `<table>`)
- Add `aria-label` to all icon-only interactive elements
- Use `text-gray-500` or darker for secondary text
- Ensure all form inputs have associated labels
- Use `role="alert"` for error messages
- Use `role="status"` for loading/empty states
- Add `min-w-11 min-h-11` to all interactive elements (setara 44x44px)
- Use `scope="col"` on table headers
- Add `<caption>` to tables for screen readers

### Don't
- Don't use `text-gray-400` for text (insufficient contrast)
- Don't use `title` attribute as sole accessible name
- Don't use `<div>` for interactive elements (use `<button>`)
- Don't rely on color alone to convey information
- Don't use `outline: none` without providing visible focus
- Don't animate content without `prefers-reduced-motion` support
- Don't use `placeholder` as label replacement
- Don't use `display: none` for focusable elements

---

## 7. CSS Variables

```css
:root {
  --background: #f1f5f9;
  --foreground: #0f172a;
  --sidebar-width: 260px;
  --sidebar-collapsed-width: 72px;
  --focus-ring: 0 0 0 2px #ffffff, 0 0 0 4px #4f46e5;
  --focus-ring-inset: inset 0 0 0 2px #ffffff, inset 0 0 0 4px #4f46e5;
}
```

---

## 8. Animation

### Respect Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Available Animations
| Class | Duration | Use Case |
|-------|----------|----------|
| `.animate-fade-in` | 0.2s | Content appearance |
| `.animate-slide-in` | 0.3s | Sidebar, panels |
| `.animate-slide-up` | 0.25s | Modals, dropdowns |
| `.animate-pulse-gentle` | 2s infinite | Loading indicators |

---

## 9. File Structure

```
onezentra-web/
├── src/
│   ├── app/
│   │   ├── globals.css          # Design tokens & utilities
│   │   ├── layout.tsx           # Root layout
│   │   ├── login/page.tsx
│   │   └── dashboard/
│   │       ├── layout.tsx       # Auth layout with sidebar
│   │       └── page.tsx
│   ├── components/
│   │   ├── Modal.tsx            # Dialog (role="dialog")
│   │   ├── Toast.tsx            # Notification (role="alert")
│   │   ├── ConfirmDialog.tsx    # Confirm (role="alertdialog")
│   │   ├── SearchInput.tsx      # Search (role="combobox")
│   │   ├── Sidebar.tsx          # Navigation (aria-label)
│   │   ├── ToggleSwitch.tsx     # Toggle (role="switch")
│   │   ├── Calendar.tsx         # Calendar (role="grid")
│   │   ├── StatusDropdown.tsx   # Status (aria-haspopup)
│   │   └── ...
│   ├── lib/
│   │   └── api.ts
│   └── store/
│       ├── auth.ts
│       └── globalToast.ts
└── docs/
    └── DESIGN-SYSTEM.md         # This file
```
