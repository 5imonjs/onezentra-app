---
paths:
  - 'database/**'
---

# Database

## Recover wiped system data by re-seeding (idempotent)
System data (roles/permissions/users/email_recipients) has been wiped externally at least 4 times in recent sessions (all counts = 0). Do NOT run migrate:fresh/db:wipe. Recovery: run in order `php artisan db:seed --class=RoleSeeder --force`, PermissionSeeder, UserSeeder, SingkawangDepotSeeder, EmailNotificationSeeder. All are idempotent (updateOrCreate/firstOrCreate/sync). Verify: roles=14, permissions=97, role_permission=511. Role `ga` (viewer luas, view-only) & `bh` (mirror admin_planner) ditambahkan 2026-10-09 via migration `2026_10_09_061200_add_ga_bh_roles` (untuk DB yang sudah ada) dan diselaraskan di RoleSeeder/PermissionSeeder/UserSeeder (untuk install fresh / re-seed). (DB dev bisa lebih tinggi dari 447 bila ada grant manual lewat UI Roles & Permissions; `sync()` pada seed berikutnya akan mencabut grant ekstra itu — jangan reseed tanpa konfirmasi. Rincian drift: `docs/permission-drift-report.md`.)

## UserController index meta stats
`UserController::index` returns `meta.total`, `meta.active`, `meta.inactive`, `meta.admin_master` computed on the base query (before filters) so frontend stats cards show correct numbers, not per-page counts. Frontend must use `res.data.meta` and `res.data.total` (paginator total) — never `items.length`.

## Kolom condition = varchar(32), default FISIK_BAGUS
`receiving_items.condition` dan `sj_validation_items.condition` diperlebar ke varchar(32) (default `FISIK_BAGUS`) via migration widen_condition_columns — `EXPIRED_TIDAK_STANDAR` = 21 karakter tidak muat varchar(20). Jangan mengecilkan kembali ke 20; besar ini diperlukan untuk vocab condition kanonik FISIK_*.

## users.level adalah ENUM MySQL — menambah level baru WAJIB memperlebar enum
`users.level` adalah kolom `enum('admin_master',...,'operator')` (bukan varchar bebas). Menambah level baru (mis. `ga`/`bh`) hanya dengan LEVEL_SLUGS + RoleSeeder + seeder role lain akan gagal saat insert user: `SQLSTATE[01000] Data truncated for column 'level'`. Izinnya ditambah via `Schema::table('users', ...$table->enum('level', [...])->default('admin_master')->change())` (pola `add_ga_bh_level_to_users_table`). Daftar nilai enum up()/down() HARUS merupakan nilai sebelum/sesudah perubahan. Di SQLite test tidak terpengaruh (SQLite tidak menegakkan ENUM), jadi bukti kebenaran hanya dari MySQL live.
