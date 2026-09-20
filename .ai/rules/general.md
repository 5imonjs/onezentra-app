---
paths:
  - '**/*'
  - '**/*Seeder.php'
---

# General

## JANGAN pernah hapus data database yang sudah ada
Jangan jalankan `db:seed`, `migrate:fresh`, `db:wipe`, atau truncate kecuali user secara eksplisit minta. Jangan pakai `--force` pada seeder tanpa konfirmasi user. Data yang sudah ada di database dianggap fix dan tidak boleh dihapus/di-overwrite oleh agent.

## JANGAN jalankan seeder tanpa konfirmasi user
Seeder seperti RoleSeeder, PermissionSeeder, SingkawangDepotSeeder menggunakan truncate/delete yang menghapus data existing. JANGAN jalankan `php artisan db:seed` kecuali user secara eksplisit minta. Gunakan `updateOrCreate` via tinker jika perlu tambah data.

## JANGAN jalankan migrate:fresh atau db:wipe
Perintah `php artisan migrate:fresh` dan `php artisan db:wipe` akan menghapus SEMUA data di database. JANGAN jalankan perintah ini kecuali user secara eksplisit minta. Gunakan `php artisan migrate` untuk menjalankan migration baru tanpa menghapus data yang sudah ada.
