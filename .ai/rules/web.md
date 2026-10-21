# Web rules (`onezentra-web/**`)

- A page whose data comes from a permission-gated API must gate on the SAME
  permission before its first fetch. Pattern: read `hasPermission('x.view')`
  from `useAuthStore`, guard each `useEffect` (`if (canView) load();`), and
  early-return a "Anda tidak memiliki izin untuk melihat ..." block placed AFTER
  all hooks. Without this, direct-URL visits fire `403` requests and render a
  broken form. See `src/app/email-settings/page.tsx` and
  `src/app/email-recipients/page.tsx`.
- Page tests live beside the page (`src/app/<page>/page.test.tsx`) with `vitest`
  + `@testing-library/react`; mock `@/app/dashboard/layout`, `@/store/auth`,
  `@/lib/api`, and `@/lib/dates`. The auth mock must accept an argument:
  `vi.fn((_permission: string): boolean => true)`.
- `toBeInTheDocument`/`toBeDisabled` need `@testing-library/jest-dom` (already
  configured). `getByText` only sees an element's DIRECT text nodes, so inline
  text glued with ` — ` must be queried with a regex (or `findAllByText`), and
  text that renders in more than one place needs `findAllByText`/`getAllByText`.
- Setting Email is SMTP-only. `EmailNotificationService::applySmtpSettings()`
  honors only `mailer` = `smtp`|`log` (everything else is coerced to `smtp`),
  so the Mailer dropdown must not offer other drivers. If a legacy value is
  stored, show it as `(tidak didukung)` rather than silently changing it.
- Password is never prefilled into state/DOM; `handleSave` omits a blank
  password so an untouched field does not overwrite the stored secret.
- Never gate a page's FIRST fetch on a value derived from the response of that
  same fetch (deadlock). In `approval-settings`, `effectiveDepot` needed
  `depots`, but `depots` was only set by `load()` — so `load()` early-returned
  forever and the data area stayed an empty skeleton. Bootstrap the option list
  with an unconditional request (omit the param; the backend falls back to the
  user's depot) and only then request the resolved depot.
- `email-recipients` must let admins express "depot intentionally empty". The
  per-depot switch (options `depots[].is_enabled`, `PUT
  /email-recipients/depot-settings/{kode}`) is rendered as its own "Status Email
  per Depo" panel, because a depot with no rows has no group header to host a
  toggle. It must be reachable for depots that have zero recipients — a
  header-only toggle would be invisible exactly where it is needed. Off = no
  mail even when Global rows exist; a disabled depot's group shows "Email
  nonaktif".
- "Tambah Penerima" submits ALL chosen users/emails/role in ONE call
  (`emailRecipients.bulk(targets)` → `POST /email-recipients/bulk`); the
  backend is atomic, so a failed target saves nothing. Do not loop
  `emailRecipients.create()` per target — that used to leave half-saved rows
  with no way to undo. Bulk errors arrive keyed `targets.{i}.{field}`; strip
  that prefix before showing the toast so the message names the column.
- Reset Data is per depot. `/admin-database` must render a depot selector
  (options from `depots` in the summary response), send `kode_depo` on dry-run
  AND purge, and disable execution when no depot is available. Do not offer a
  global/“all depots” button — the backend requires `kode_depo`.
- The reset page has two modes: **Per Depo** (whole modules, existing flow) and
  **Pilih Dokumen** (`adminDatabase.documents` + `purgeItems`). Document mode
  must load the list for the selected depot/module, search by PO/SJ/document
  number, let the admin check one or more rows, and send only those IDs. Keep
  the document list cleared when the depot or module changes.
- Selected-document execution still requires dry-run preview and typing
  `HAPUS`; send `kode_depo`, `module`, `ids`, `confirm: 'HAPUS'`, and
  `dry_run`. Never infer IDs from the visible list without sending them back to
  the backend — the backend re-validates every ID against the depot.
- Legacy rows without `kode_depo` are handled by a separate "Data Legacy Tanpa
  Depo" panel: load a dry-run preview on mount (safe), show per-table
  total/resolved/manual counts plus samples, and require typing `BACKFILL`
  before `adminDatabase.backfillDepot({ dry_run: false, confirm: 'BACKFILL' })`.
  Never present the backfill as a reset or as a “Tanpa Depo” purge.
