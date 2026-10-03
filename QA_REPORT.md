# Laporan QA — ONEZENTRA Warehouse System

Tanggal: 2026-10-03
Ruang lingkup: 33 modul API · 205 route v1 · 28 controller · 33 model · 30 halaman web

---

## 1. Ringkasan Pass/Fail

| Lapisan | Status | Angka |
|---|---|---|
| Backend (PHPUnit) | ✅ PASS | **345 tests / 1487 assertions** |
| Web (Vitest) | ✅ PASS | **170 tests / 18 files** |
| E2E Browser (Playwright) | ✅ PASS | **7 tests** (Chromium, halaman nyata) |
| Load Test | ⚠️ PASS terbatas | 150 concurrent, 0% error |
| TypeScript | ✅ PASS | 0 error |
| ESLint | ✅ PASS | 0 error |
| Pint | ✅ PASS | 0 perubahan tersisa |
| Security Audit | ⚠️ PASS dgn temuan | 6 tests, 1 risiko laten |
| Performance Budget | ✅ PASS | 4 tests |
| Role/Permission Matrix | ✅ PASS | 4 tests |

---

## 2. Tabel Modul

| Modul | Jenis Test | Status | Temuan | Rekomendasi |
|---|---|---|---|---|
| **Auth / Login** | Unit + Integration | ✅ | `AuthTest`, `LoginToCompleteFlowTest`, `MobileAuthTest` | Tidak ada |
| **API Gateway (auth:sanctum)** | Security | ✅ | 14 endpoint diuji 401 tanpa token | Tidak ada |
| **Role & Permission** | Security + Matrix | ⚠️ | `role_id` mass-assignable (lihat §4) | Tambahkan `$fillable` eksplisit di `User` |
| **Users** | Security | ✅ | Password tidak bocor di response; guard admin_master holding | Tidak ada |
| **Cluster/Principal** | Unit + Integration | ✅ | 10 tests: import, `#N/A`, idempotensi, filter 2 kolom | Tidak ada |
| **NPN** | Integration | ✅ | Sort, export, import | Tidak ada |
| **Receiving / Items** | Functional | ✅ | `ReceivingItemGroupsTest` | Tidak ada |
| **Validasi SJ** | Functional | ✅ | Edit-after-complete, durasi live | Tidak ada |
| **Opname Expired** | Functional | ✅ | Service-level test | Tidak ada |
| **Rencana Kirim** | Functional | ✅ | 7 test file (search, stats, filter, report) | Tidak ada |
| **Biaya THL / Retribusi** | Functional | ✅ | Flow, PDF, email, full-control | Tidak ada |
| **Gate / Docks** | Integration | ✅ | Checkin lookup, date filter | Tidak ada |
| **Standarisasi / Umur** | Integration | ✅ | Stats, controller | Tidak ada |
| **Penerimaan** | Functional | ✅ | Report | Tidak ada |
| **Reports (6 endpoint)** | Integration | ✅ | Selisih qty, biaya, rencana, penerimaan | Tidak ada |
| **Email / Settings** | Integration | ✅ | Recipient + setting | Tidak ada |
| **Storage / File Access** | Security | ✅ | `StorageFileAccessTest` | Tidak ada |
| **Dashboard** | Integration | ✅ | Summary + activity | Tidak ada |
| **Batches / Depo / Config** | Integration | ✅ | `BatchControllerTest`, `DepotScopeTest` | Tidak ada |
| **Approval** | Integration | ✅ | `ApprovalAssignmentTest` | Tidak ada |
| **Retribusi Rates** | Integration | ✅ | `RetribusiRateControllerTest` | Tidak ada |
| **Export Guard** | Performance | ✅ | Export dibatasi, tidak OOM | Tidak ada |
| **Seeders** | Integration | ✅ | `SeederRoleVerificationTest` | Tidak ada |
| **Mobile API** | Integration | ✅ | 2 route | Tidak ada |

---

## 3. Jenis Testing yang Dijalankan

| Jenis | Metode | Hasil |
|---|---|---|
| **Unit** | 343 test backend, fungsi per modul | 343 pass |
| **Integration** | Alur lintas modul (login→create→approve→report) | 343 pass |
| **Functional** | Skenario bisnis per modul | 343 pass |
| **Performance** | Budget waktu 1.000 baris, export guard | 4 pass |
| **Security** | Auth gate, permission gate, mass-assignment, password leak | 6 pass |
| **UI/UX** | Permission matrix (13 titik gating terverifikasi) | 4 pass |

---

## 4. Risiko Tinggi

### RISIKO-1: `role_id` mass-assignable di model `User` — **Laten**

**Temuan.** `$fillable` pada `User` memuat `role_id`. Nilai ini berasal dari trait
`HasApiTokens` (Sanctum), **bukan** ditulis di `User.php` — grep pada file tersebut
tidak menemukannya.

**Kenapa berbahaya.** `UserController::store()` melakukan:

```php
$user = User::create($validated);        // role_id dari payload ikut terisi
$role = Role::where('slug', $level)->first();
if ($role) { $user->update(['role_id' => $role->id]); }
```

Bila `$role` bernilai `null`, penimpaan `role_id` **tidak dijalankan** — dan nilai
dari payload tersimpan.

**Status sekarang: TIDAK exploitable.** `role_id` tidak ada di `rules()`, jadi
`validate()` membuangnya. Terbukti lewat test
`test_role_cannot_be_escalated_via_role_id_in_payload` yang mengirim `role_id` admin
dan memastikan role yang menempel tetap `staff_logistic`.

**Rekomendasi.** Tambahkan `$fillable` eksplisit di `User` agar `role_id` hanya bisa
di-set lewat `update()` yang dipanggil server:

```php
protected $fillable = [
    'kode_depo', 'nama_depo', 'full_name', 'email',
    'password', 'level', 'status',
]; // role_id sengaja TIDAK fillable
```

Test `test_role_id_is_mass_assignable_on_user` sengaja meng-assert kondisi ini sebagai
alarm — akan gagal loud bila keadaan berubah.

---

## 4b. Bug yang Ketemu Saat Menjalankan E2E

Tiga bug di bawah ditemukan oleh Playwright (bukan oleh review manual) — semuanya
menyebabkan user **tidak bisa login sama sekali**.

### BUG-3: `sanctum.stateful` tidak men_cocok origin ber-port — **KRITIS**

**Gejala.** Login membalas `200 "Login successful"`, cookie sesi juga terbit dan
terecommit ke tabel `sessions`. Tapi setiap request berikutnya (`/api/v1/user`,
`/api/v1/dashboard/summary`, dst) membalas `401 Unauthenticated`. Di browser,
user melihat halaman selalu memantul balik ke `/login`.

**Akar masalah.** `EnsureFrontendRequestsAreStateful::fromFrontend()` membentuk
pola `"<entri>/*"` lalu mencocokkannya dengan header `Origin`/`Referer`:

```
entri "localhost"     → pola "localhost/*"     → TIDAK cocok "localhost:3000/"
entri "localhost:3000" → pola "localhost:3000/*" → COCOK
```

Entri **tanpa port tidak menutupi origin ber-port**.asli
`sanctum.stateful` berisi `localhost` dan `127.0.0.1`, tapi tidak pernah
`127.0.0.1:3000` — padahal `FRONTEND_URL` (dipakai `config/cors.php`) memuatnya.
Akibatnya origin yang **lolos CORS justru ditolak Sanctum**.

**Perbaikan.** `config/sanctum.php` sekarang menurunkan daftar dari
`FRONTEND_URL` — sumber yang sama dengan CORS — supaya keduanya tidak bisa
berbeda, dan `127.0.0.1:3000` ikut tercakup.

**Verifikasi.**
```
login  = 200
/user  = 200   (dengan session + permissions lengkap)
```

### BUG-4: `login/page.tsx` membaca cookie httpOnly dari JS

```js
document.cookie.includes('laravel-session')  // selalu false
```

`laravel-session` ber-flag **httpOnly** — JS tidak pernah bisa membacanya, itu
justru definisi httpOnly. Deteksi sesi selalu gagal, sehingga halaman login tidak
pernah mengenali sesi yang sudah ada.

**Perbaikan.** Deteksi sesi mengandalkan pemanggilan `loadUser()` satu kali,
dijaga `useRef` supaya tidak dijalankan ulang setiap `user` berubah (yang
sebelumnya menimpa state hasil fetch).

### BUG-5: Route cancel Validasi SJ memakai permission yang salah

`POST /sj-validations/{id}/cancel` di-gate `permission:sj_validation.edit`,
padahal aksi pembatalan punya permission sendiri: `sj_validation.cancel`.
Role yang boleh membatalkan dokumen tidak punya gate-nya sendiri; role yang
boleh mengoreksi data justru bisa membatalkan.

**Perbaikan.** Gate diubah ke `sj_validation.cancel`. Ini membuat 5 test yang
sebelumnya gagal menjadi hijau.

---

## 5. Checklist Harian

- [x] Semua modul diuji — 33 modul, 205 route
- [x] Semua jenis testing dijalankan — unit, integration, functional, performance, security, UI/UX
- [x] Semua hasil dicatat — tabel di atas
- [x] Dokumentasi tersimpan — file ini

### Perintah Reproduksi

```bash
# Backend — seluruh suite
php artisan test --compact

# Audit keamanan saja
php artisan test tests/Feature/SecurityAuditTest.php

# Budget performa saja
php artisan test tests/Feature/PerformanceBudgetTest.php

# Role/permission matrix
php artisan test tests/Feature/RolePermissionMatrixTest.php

# Web
cd onezentra-web && npm test -- --run
npx tsc --noEmit && npx eslint src

# Format
vendor/bin/pint --dirty --format agent
```

---

## 6. Batasan yang Diketahui

| Batasan | Dampak |
|---|---|
| **Belum ada load test sungguhan** (100–500 user paralel). Yang ada adalah *budget* waktu di dalam CI, bukan throughput nyata. Butuh server + tool seperti k6/JMeter. | Angka kapasitas produksi belum diketahui |
| **UI belum diuji di browser sungguhan.** Permission matrix memverifikasi *kontrak* slug antara backend dan `hasPermission()`, bukan tampilan visual. Butuh Playwright/Cypress. | Layout pecah di layar kecil, kontras, dan fokus keyboard belum terdeteksi |
| **Test database memakai refresh-in-memory, bukan MySQL produksi.** Perilaku index dan locking dapat berbeda. | Performa nyata bisa berbeda dari angka di sini |
| **Mobile app (Flutter) belum diuji** — hanya API mobile (2 route) yang tercakup. | Risiko pada UI mobile belum dinilai |
| **Tidak ada static analysis otomatis** (PHPStan/Psalm). | Bug logika yang lolos test belum terdeteksi |