---
paths:
  - 'database/**'
---

# Database

## Recover wiped system data by re-seeding (idempotent)
System data (roles/permissions/users/email_recipients) has been wiped externally at least 4 times in recent sessions (all counts = 0). Do NOT run migrate:fresh/db:wipe. Recovery: run in order `php artisan db:seed --class=RoleSeeder --force`, PermissionSeeder, UserSeeder, SingkawangDepotSeeder, EmailNotificationSeeder. All are idempotent (updateOrCreate/firstOrCreate/sync). Verify: roles=12, permissions=96, role_permission=451. (DB dev bisa lebih tinggi dari 418 bila ada grant manual lewat UI Roles & Permissions; `sync()` pada seed berikutnya akan mencabut grant ekstra itu — jangan reseed tanpa konfirmasi. Rincian drift: `docs/permission-drift-report.md`.)

## UserController index meta stats
`UserController::index` returns `meta.total`, `meta.active`, `meta.inactive`, `meta.admin_master` computed on the base query (before filters) so frontend stats cards show correct numbers, not per-page counts. Frontend must use `res.data.meta` and `res.data.total` (paginator total) — never `items.length`.

## Kolom condition = varchar(32), default FISIK_BAGUS
`receiving_items.condition` dan `sj_validation_items.condition` diperlebar ke varchar(32) (default `FISIK_BAGUS`) via migration widen_condition_columns — `EXPIRED_TIDAK_STANDAR` = 21 karakter tidak muat varchar(20). Jangan mengecilkan kembali ke 20; besar ini diperlukan untuk vocab condition kanonik FISIK_*.
