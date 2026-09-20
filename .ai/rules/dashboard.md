---
paths:
  - 'onezentra-web/src/app/dashboard/**'
---

# Dashboard

## Dashboard tanpa dashboard.view: serahkan redirect ke layout MENU_FALLBACK
dashboard/page.tsx cukup return null bila tanpa dashboard.view — JANGAN router.replace('/login') di page. Layout MENU_FALLBACK (dashboard/layout.tsx) mengarahkan user ke menu pertama yang boleh diakses; /reports/selisih-qty juga terdaftar di fallback. Redirect ke /login hanya untuk user tanpa permission sama sekali.
