---
paths:
  - 'tests/**'
---

# Tests

## Tests harus selalu sqlite in-memory (config cache diabaikan via phpunit.xml)
Pernah terjadi data loss: `php artisan test` langsung (tanpa config:clear) saat bootstrap/cache/config.php ter-cache memakai RefreshDatabase yang menjalankan migrate:fresh ke DB MySQL asli, menghapus seluruh data. Proteksi: phpunit.xml mengarahkan APP_CONFIG_CACHE/APP_ROUTES_CACHE/APP_EVENTS_CACHE ke path yang tidak ada, jadi cache dev diabaikan dan DB_CONNECTION=sqlite:memory selalu berlaku; serta tests/TestCase.php punya guard yang melempar pengecualian bila database.default != sqlite. Jangan menonaktifkan redirect atau guard tersebut.

## SQLite tidak menangkap referensi kolom tak dikenal
SQLite memperlakukan double-quoted identifier yang tidak ada sebagai string literal, jadi query ke kolom yang sudah di-drop (mis. rkh_number) TIDAK error di test sqlite — hanya error di MySQL (42S22). Untuk regresi seperti ini, jangan hanya assertOk(); tangkap SQL lewat DB::listen dan pastikan nama kolom tak ada tidak muncul (contoh: tests/Feature/RencanaKirimSearchTest.php).
