---
paths:
  - routes/api.php
---

# Routes

## GET depo auth-only; receiving.delete permission baru
GET api/v1/depo cukup auth:sanctum (scoping depo per user dilakukan server-side), bukan digate rencana_kirim.view yang membuat blc/bac kehilangan dropdown depo di laporan. DELETE api/v1/receivings/{receiving} digate permission:receiving.delete (perm baru di PermissionSeeder, cheker & admin_master memilikinya; receiving.edit tidak lagi bisa hapus).

## Rute mobile untuk aplikasi eksternal — jangan hapus
POST api/v1/mobile/login + mobile/logout (Bearer token per-perangkat, throttle:10,1) milik aplikasi mobile eksternal — tidak dipakai web SPA (cookie-only via /login). Tercakup MobileAuthTest. Jangan hapus tanpa konfirmasi pemilik aplikasi mobile.
