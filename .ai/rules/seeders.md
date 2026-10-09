---
paths:
  - 'database/seeders/**'
  - database/seeders/PermissionSeeder.php
---

# Seeders

## Seeder sistem aman & reports.view wajib ada
Seeder sistem (RoleSeeder/PermissionSeeder/UserSeeder/SingkawangDepotSeeder/EmailNotificationSeeder) SUDAH aman: semuanya pakai updateOrCreate/firstOrCreate/sync, tidak ada truncate. Untuk mendaftarkan user beserta level/role/permission bawaan, jalankan lewat `php artisan db:seed --class=NamaSeeder --force` (bukan via tinker karena butuh $this->command). Fitur Laporan pakai permission `reports.view` — HARUS ada di PermissionSeeder 'rolePermMap' (admin_master-auto, staff_logistic, blc, bac, admin_distirbusi, admin_planner, cheker) agar menu Laporan tampil. Verifikasi pasca-seed: roles=12, permission=96, role_permission=418.

## Label permission standarisasi = 'Standarisasi Tumpukan'
Permission untuk fitur standarisasi tumpukan memakai slug standarisasi.view/create/edit/delete dengan name & menu_group wajib berlabel 'Standarisasi Tumpukan' (bukan hanya 'Standarisasi'). UI halaman role/permission membaca name & menu_group langsung dari DB, sedangkan Sidebar.tsx memakai label statis 'Standarisasi Tumpukan' dengan permission standarisasi.view.

## rolePermMap & Role::LEVEL_SLUGS satu sumber kebenaran
Daftar role slug & level tunggal di Role::LEVEL_SLUGS (Role model); RoleSeeder & validasi in:... di AuthController/UserController/UserImport memakainya. cheker TIDAK punya users.import lagi; admin_planner diberi users.view (agar impor user bisa dipakai UI). Total permission 96 (sudah termasuk `biaya_thl.export` & `biaya_retribusi.export`; keduanya mengikuti `*.view` otomatis lewat post-processing di akhir penulisan rolePermMap — jangan diduplikasi manual, `admin_master` sudah lewat `$allPermSlugs`). Permission `approval.view` (menu & halaman 'Pengaturan Approval') HANYA untuk admin_master — rlh/rfah/blc/bac tidak memegangnya (aksi approval tetap lewat approval.approve/check/reject/revise/rfah/submit). Role `operator` mirror permission cheker, role `sac` mirror bac (keputusan akses user; implementasi di akhir PermissionSeeder agar tidak drift).

## Perbarui jumlah permission 44 -> 45
Verifikasi jumlah setelah seed penuh: roles=12, users=20, email_recipients=8, role_permission=418, permission=96. Permission `depot.move` (Pindah Depo Dokumen, grup Umum) HANYA untuk admin_master secara default — gantinya hardcode level di RencanaKirimController::update; role lain dicentang manual di UI. `opname.progress_all` diturunkan otomatis dari `opname.view` di dalam PermissionSeeder (jangan ditulis manual di `rolePermMap`) agar `sync()` tidak mencabut grant migration `grant_opname_progress_all_to_opname_viewers`.
