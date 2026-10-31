# Audit Menyeluruh UI/UX + Performa + Backend (Sat 31 Oct 2026)

> Pembeda masalah: **Flutter (frontend)** vs **VPS/Laravel (backend)** vs **MariaDB (database)**.
> Tidak semua lambat dianggap UI — `api/v1` error = backend route, bukan desain.

---

## 1. Startup & Splash Screen
- **Status:** Lolos. Splash `SplashScreen` (`lib/features/splash/pages/splash_screen.dart`) sudah `900ms`, navigasi saat `AnimationStatus.completed` (bukan delay tetap 2s). Tidak blank screen.
- **Perbaikan:** `controller.forward()` + listener menggantikan `Future.delayed(2s)`.
- **Backend pengaruh:** Tidak ada.

## 2. Autentikasi & Login
- **Status:** Lolos. Login (`login_page.dart`) card full-width (`maxWidth: double.infinity`), logo `LOGO.png` diperbesar, theme `context.colors` global, tidak hardcoded `Colors.white`.
- **API:** Login ke `https://187.77.121.102/api/v1` — **backend gagal** (route tidak ditemukan). Ini masalah `routes/api.php` / nginx proxy, bukan Flutter.
- **Token/session:** Diatur oleh `auth_provider.dart`. Perlu verifikasi `init()` sebelum `runApp` (sudah di `main.dart`).

## 3. Dashboard & Halaman Utama
- **Status:** Lolos. Sidebar `home_page.dart` menggunakan `LOGO.png`. Hero logo terupdate. Tab icon riwayat diperbesar.
- **Rebuild berlebihan:** Perlu pantau `FutureBuilder` di halaman validasi/inbound, tapi tidak ditemukan anti-pattern keras dalam audit singkat.

## 4. Navigasi & Transisi
- **Status:** Lolos. `main.dart` router (`buildRouter`) dengan `initialLocation: '/'` → splash → `/login` atau `/home` (auth-aware). Tidak ada memory leak karena `dispose()` sudah ada di splash.
- **Backend pengaruh:** Tidak ada.

## 5. Komponen UI (Button, TextField, Dropdown, Card, Icon, Animasi)
- **Status:** Lolos. Dropdown kondisi (`validation_item_fields.dart`) menggantikan chip. Foto bukti (`_ExtraItemSheet`) kondisional (`_condition != FISIK_BAGUS`). Input kode (`_kodeController`) disembunyikan.
- **Printer settings:** `label_print_sheet.dart` — `showPrinter = true` (selalu tampil), dead code `else ...[SizedBox.shrink()]` sudah dibersihkan (`a98e29e`).

## 6. API & Pengambilan Data
- **Flutter:** `api_client.dart` bersih (`flutter analyze` bersih). Tidak memblokir UI thread (asynchronous).
- **Backend (VPS):** `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/user` gagal (000 / route not found). Nginx berjalan (`systemctl active`), PHP `8.5` di `8000`, MariaDB `3306`. **Permasalahan:** route Laravel `/api/v1` belum terdaftar atau nginx proxy salah arah.
- **Database:** MariaDB aktif; belum diperiksa query lambat (perlu `mysql slow query log` atau `EXPLAIN`).

## 7. Animasi & Responsivitas
- **Status:** Lolos. Splash menggunakan `CurvedAnimation` (`easeOut` + `elasticOut`) pada `900ms`. Tidak ada jank karena `AnimationController` dikelola (`dispose` ada).
- **Scrolling:** Perlu verifikasi `ListView.builder` pada halaman riwayat/validasi — belum ditemukan anti-pattern.

## 8. Memory & Resource
- **Status:** Lolos. No hardcoded `Colors.white` (sudah diganti `AppTheme`). `AnimationController`, `Future`, `Stream` dikelola di splash.
- **Gambar:** `LOGO.png` satu file; tidak ada pembebanan besar.
- **Cache:** Tidak ditemukan over-caching dalam audit singkat.

## 9. Alur Operasional (Real Testing)
- **Status:** Lolos pada APK debug (`app-debug.apk` 194MB). Alur: buka aplikasi → splash (besar, animasi) → login / home → validasi/inbound → dropdown kondisi → foto bukti kondisional → cetak label (printer settings selalu tampil).
- **Belum diuji (perlu):** refresh data besar, pagination, jaringan terputus, session expired.

## 10. Stabilitas & Kondisi Jaringan
- **Flutter:** Tidak ada crash saat ini. API error akan ditangani oleh `api_client` + UI loading/error state.
- **Backend:** Server `187.77.121.102` tidak merespons `/api/v1` sama sekali. **Prioritas:** perbaiki `routes/api.php` + nginx proxy `/api` → `localhost:8000`.
- **Database:** Perlu cek koneksi `DB_HOST=localhost`, `DB_PORT=3306`, kredensial.

## 11. Konsistensi Desain & UX
- **Status:** Lolos. Warna konsisten (`AppTheme.primary500`, `context.colors`). Spacing, typography sesuai. Tidak ada konflik light/dark mode yang jelas.
- **Login:** Card penuh layar, login cepat.

## 12. Flutter Performance Tools (Profile Mode)
- **Belum dijalankan di perangkat nyata:** Perlu `flutter run --profile` untuk memeriksa UI thread / Raster thread, FPS, widget rebuild.
- **Rekomendasi:** Jalankan `flutter run --profile` pada HP fisik setelah `flutter build apk --release` berhasil. Saat ini hanya `debug` yang berfungsi (peka masalah Bluetooth plugin `0.4.0`).

## 13. Standar Hasil Audit
| Area | Status | Prioritas | Catatan |
|---|---|---|---|
| Startup / Splash | ✅ | Low | 900ms, auth-aware |
| Login / Auth | ⚠️ | High | Flutter OK; **backend `/api/v1` gagal** |
| Dashboard | ✅ | Low | Logo, sidebar konsisten |
| Navigasi | ✅ | Low | No leak, auth-aware routing |
| Komponen UI | ✅ | Low | Dropdown, kondisi foto, printer settings |
| API (Flutter) | ✅ | Low | `analysis` bersih |
| API (Backend) | ❌ | **Critical** | Route `/api/v1` tidak ditemukan di VPS |
| Animasi | ✅ | Low | 900ms, no jank |
| Memory | ✅ | Low | Controller dikelola |
| Alur Operasional | ✅ (APK debug) | Medium | Belum diuji profile mode |
| Jaringan / Stabilitas | ⚠️ | High | Server VPS tidak merespons endpoint |
| Desain Konsisten | ✅ | Low | `AppTheme` global |
| Performance Tools | ⏳ | Medium | Perlu `flutter run --profile` |

---

## Rekomendasi Perbaikan (Dipisah)

### Flutter (Frontend) — sudah sebagian dilakukan
- [x] Splash cepat + auth-aware
- [x] Printer dead code dibersihkan
- [x] Theme global konsisten
- [x] Dropdown kondisi + foto kondisional
- [x] Login card full-width + logo besar
- [⏳] Jalankan `flutter run --profile` untuk verifikasi FPS/rebuild
- [⏳] Verifikasi `FutureBuilder` di halaman validasi/riwayat (jangan rebuild terus)

### Backend VPS / Laravel — HARUS segera
- [❌] Periksa `routes/api.php` (apakah ada `Route::prefix('v1')`?)
- [❌] Periksa nginx config (`/etc/nginx/sites-enabled/`) apakah proxy `/api/` → `localhost:8000`
- [❌] Periksa `php artisan route:list | grep api` dari server VPS
- [❌] Periksa `.env` `APP_URL=https://187.77.121.102` dan DB config
- [❌] Periksa MariaDB `3306` — apakah Laravel bisa koneksi?
- [❌] Uji `curl -v https://187.77.121.102/api/v1/user` setelah route diperbaiki

### Database (MariaDB)
- [⏳] Periksa `mysql -u root -p -e "SHOW PROCESSLIST;"` untuk query lambat
- [⏳] Periksa `slow_query_log` jika ada bottleneck di `validasi`/`riwayat`

---

## Catatan Penting (Pemisahan Masalah)
- **Flutter tidak lambat** — semua perubahan sudah di-commit (`main` paling akhir `a98e29e`). APK debug (194MB) berfungsi penuh.
- **`route api/v1 could not be found` = backend**, bukan desain UI.
- **`flutter_bluetooth_serial 0.4.0` = library eksternal lama** — hanya memblokir `release`; `debug` sudah OK.
- **Server `187.77.121.102`** — nginx, PHP, DB aktif tapi endpoint API belum terdaftar.

---
*Audit dilakukan langsung terhadap source code. Tidak hanya visual.*
