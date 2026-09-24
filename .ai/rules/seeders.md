---
paths:
  - 'database/seeders/**'
  - database/seeders/PermissionSeeder.php
---

# Seeders

## Seeder sistem aman & reports.view wajib ada
Seeder sistem (RoleSeeder/PermissionSeeder/UserSeeder/SingkawangDepotSeeder/EmailNotificationSeeder) SUDAH aman: semuanya pakai updateOrCreate/firstOrCreate/sync, tidak ada truncate. Untuk mendaftarkan user beserta level/role/permission bawaan, jalankan lewat `php artisan db:seed --class=NamaSeeder --force` (bukan via tinker karena butuh $this->command). Fitur Laporan pakai permission `reports.view` — HARUS ada di PermissionSeeder 'rolePermMap' (admin_master-auto, staff_logistic, blc, bac, admin_distirbusi, admin_planner, cheker) agar menu Laporan tampil.

## Label permission standarisasi = 'Standarisasi Tumpukan'
Permission untuk fitur standarisasi tumpukan memakai slug standarisasi.view/create/edit/delete dengan name & menu_group wajib berlabel 'Standarisasi Tumpukan' (bukan hanya 'Standarisasi'). UI halaman role/permission membaca name & menu_group langsung dari DB, sedangkan Sidebar.tsx memakai label statis 'Standarisasi Tumpukan' dengan permission standarisasi.view.

## rolePermMap & Role::LEVEL_SLUGS satu sumber kebenaran
Daftar role slug & level tunggal di Role::LEVEL_SLUGS (Role model); RoleSeeder & validasi in:... di AuthController/UserController/UserImport memakainya. cheker TIDAK punya users.import lagi; admin_planner diberi users.view (agar impor user bisa dipakai UI). Total permission sekarang 45 (ditambah receiving.delete). Permission `approval.view` (menu & halaman 'Pengaturan Approval') HANYA untuk admin_master — rlh/rfah/blc/bac tidak memegangnya (aksi approval tetap lewat approval.approve/check/reject/revise/rfah/submit).

## Perbarui jumlah permission 44 -> 45
Verifikasi jumlah setelah seed penuh: roles=10, users=20, email_recipients=8, role_permission=139 (bukan 143 — sejak approval.view dicabut dari rlh/rfah/blc/bac), permission=45 (bukan 44 — sejak penambahan slug receiving.delete yang digate di routes/api.php).
