---
paths:
  - onezentra-web/src/app/users/page.tsx
---

# Users

## Users page uses meta stats and modern table, not excel-*
Stats cards must read `res.data.meta.{total,active,inactive,admin_master}`, not `items.length`. Table uses clean slate-50 thead / divide-y rows (not `excel-header`/`excel-cell`/`excel-row`). Buttons: Import = btn-secondary, Tambah = btn-primary, order right-aligned.
