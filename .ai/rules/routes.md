---
paths:
  - routes/api.php
---

# Routes

## GET depo auth-only; receiving.delete permission baru
GET api/v1/depo cukup auth:sanctum (scoping depo per user dilakukan server-side), bukan digate rencana_kirim.view yang membuat blc/bac kehilangan dropdown depo di laporan. DELETE api/v1/receivings/{receiving} digate permission:receiving.delete (perm baru di PermissionSeeder, cheker & admin_master memilikinya; receiving.edit tidak lagi bisa hapus).
