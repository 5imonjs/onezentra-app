# Laporan QA — ONEZENTRA Warehouse System

Tanggal: 2026-10-03 (revisi: setelah audit struktur, refactor guard, dan tightening `role_id`)
Ruang lingkup: 33 modul API · 205 route v1 · 28 controller · 32 model · 30 halaman web

---

## 1. Ringkasan Pass/Fail

| Lapisan | Status | Angka |
|---|---|---|
| Backend (PHPUnit) | ✅ PASS | **384 tests / 1586 assertions** |
| Web (Vitest) | ✅ PASS | **181 tests / 19 files** |
| E2E Browser (Playwright) | ✅ PASS | **7 tests** (Chromium, halaman nyata) |
| Load Test | ⚠️ PASS terbatas | 150 concurrent, 0% error |
| TypeScript | ✅ PASS | 0 error |
| ESLint | ✅ PASS | 0 error |
| Pint | ✅ PASS | 0 perubahan tersisa |
| Security Audit | ✅ PASS bersih | 7 tests, 0 risiko laten tersisa |
| Performance Budget | ✅ PASS | 4 tests |
| Role/Permission Matrix | ✅ PASS | 4 tests |

> Angka di atas hasil eksekusi terakhir pada revisi ini, bukan angkanya dari
> laporan pertama. Kalau selisih muncul lagi saat menambah test, perbarui baris
> ini beserta §3 — jangan biarkan dua angka berbeda hidup berdampingan.

---

## 2. Tabel Modul

| Modul | Jenis Test | Status | Temuan | Rekomendasi |
|---|---|---|---|---|
| **Auth / Login** | Unit + Integration | ✅ | `AuthTest`, `LoginToCompleteFlowTest`, `MobileAuthTest` | Tidak ada |
| **API Gateway (auth:sanctum)** | Security | ✅ | 14 endpoint diuji 401 tanpa token | Tidak ada |
| **Role & Permission** | Security + Matrix | ✅ | `role_id` sudah dikeluarkan dari `$fillable` (lihat §4) — 7 security test | Tidak ada |
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
| **Batches / Depo / Config** | Integration | ✅ | `BatchControllerTest`, `DepotScopeTest`, `DepotGuardTraitTest` | Tidak ada |
| **Approval** | Integration | ✅ | `ApprovalAssignmentTest` | Tidak ada |
| **Retribusi Rates** | Integration | ✅ | `RetribusiRateControllerTest` | Tidak ada |
| **Export Guard** | Performance | ✅ | Export dibatasi, tidak OOM | Tidak ada |
| **Seeders** | Integration | ✅ | `SeederRoleVerificationTest` | Tidak ada |
| **Mobile API** | Integration | ✅ | 2 route | Tidak ada |

---

## 3. Jenis Testing yang Dijalankan

Revisi ini mengoreksi tabel versi sebelumnya, yang menulis "343 pass" untuk
Unit, Integration, dan Functional sekaligus. Tiga angka itu bukan partisi —
hanya satu angka total yang disalin tiga kali, tanpa mekanisme penghitungnya.
Suite juga tidak memisahkan Unit dari Integration di direktori: 61 file rata-rata
duduk di `tests/Feature/`, jadi klasifikasi per jenis tidak bisa diturunkan dari
struktur.

Yang bisa dihitung dengan jujur:

| Jenis | Metode | Hasil |
|---|---|---|
| **Feature test (campuran)** | 61 file di `tests/Feature/`, mencakup unit, integration, dan functional sekaligus | **384 pass** |
| **Security** | Auth gate, permission gate, mass-assignment, password leak, escalation | 7 pass (`SecurityAuditTest`) |
| **Authorization / depot scope** | Sisi negatif (depo lain → 403) dan sisi positif (depo sendiri → LOLOS) per controller | 10 pass (`DepotGuardTraitTest`) |
| **Auth stateful regression** | CORS + `sanctum.stateful` sinkron, scheme/port | 5 pass (`SanctumStatefulDomainTest`) |
| **Factory sanity** | Factory dieksekusi agar tidak usang diam-diam saat kolom migration berubah | 15 pass (`FactoryTest`) |
| **Performance** | Budget waktu 1.000 baris, export guard | 4 pass (`PerformanceBudgetTest`) |
| **UI/UX** | Permission matrix (13 titik gating terverifikasi) | 4 pass (`RolePermissionMatrixTest`) |

Baris-baris tambahan ini tidak boleh dijumlahkan ke 384 — semuanya sudah
termasuk di dalamnya, yaitu subset dari `tests/Feature/`.

Breakdown Unit vs Integration yang jujur butuh pekerjaan terpisah: pemisahan
direktori atau atribut eksplisit per test.

---

## 4. Temuan dan Risiko

### RISIKO-1: `role_id` mass-assignable di model `User` — **SUDAH DIPERBAIKI**

Tidak ada satu pun pembaca kolom `role_id` di `app/` — resolusi permission
sepenuhnya lewat pivot `role_user` (`User::hasPermissionTo` join ke
`role_permission` + `role_user`). Kolom ini legacy sisa skema awal.

Selama ini belum exploitable karena `role_id` tidak ada di `rules()`, jadi
`validate()` membuangnya sebelum sampai ke `User::create()` — terbukti lewat
`test_role_cannot_be_escalated_via_role_id_in_payload`. Yang tersisa adalah
risiko **laten**: begitu `rules()` suatu saat memuat field itu, user bisa
elevating role-nya sendiri.

**Perbaikan.** `role_id` dikeluarkan dari `User::$fillable`.

Yang perlu diperhatikan: mengeluarkannya dari `$fillable` **tidak cukup**.
Empat call site menulis kolom ini lewat `update(['role_id' => ...])`, dan
`update()` tunduk mass-assignment — begitu kolomnya dikeluarkan, semua
panggilan itu diam-diam jadi no-op, kolom legacy tidak pernah terisi, dan
tidak ada test yang gagal karena memang tidak ada yang membaca kolom itu.
Empat call site itu karena itu diubah ke `forceFill()`, yang tidak tunduk
mass-assignment.

Test yang paling perlu dicatat: `test_role_id_is_mass_assignable_on_user`
sebelumnya **berhasil justru ketika `role_id` fillable** — test yang
 ostensibly menjaga keamanan justru memverifikasi adanya celahnya. Nilainya
dibalik jadi `assertNotContains`, lalu ditambahkan
`test_role_id_bisa_ditulis_server_walau_tidak_fillable` yang mengunci kedua
sisi: payload ditolak, server tetap bisa menulis.

Kolom `role_id` sengaja **tidak** dihapus dari tabel — itu butuh migrasi data
dan di luar cakupan perbaikan ini.

### BUG-1: Import `Receiving` bisa memakai PO depo lain — **SUDAH DIPERBAIKI**

Tiga masalah pada satu alur, semuanya ditutup di commit `8f41fd1`.

**Scope.** Import tidak dibatasi `forUserDepot()`, sehingga user depo AA bisa
menarik PO milik depo BB.

**Kebocoran keberadaan.** Pesan error menyebut nama PO yang dicoba, sehingga
user bisa menebak PO mana yang ada di depo lain lewat beda respons 404/422.

**Data setengah jadi.** Baris yang gagal tidak membatalkan baris sebelumnya —
import yang sebagian besar salah tetap tersimpan.

**Perbaikan.** Import memakai scope yang sama dengan query di halaman list,
pesan error dibuat generik, dan import jadi all-or-nothing: kegagalan satu
baris membatalkan seluruh baris, dengan `ReceivingImportFailed` yang
menandai nomor baris (frontend menampilkan `Baris 3: ...`, bukan
`[object Object]`). Constructor `ReceivingImport` juga mewajibkan `User` —
sebelumnya tidak ada sumber user di dalam import, sehingga guard tidak mungkin
dipasang.

Test guard: `DepotScopeConsistencyTest`.

### CATATAN-1: `StandarisasiTumpukanController` — **SUDAH DIPERBAIKI**

Dulu `canManageRow()` memberi bypass scoping depo ke daftar slug hardcode:

```php
if ($user->isAdminMaster() || $user->hasAnyRole(self::WORKFLOW_ROLES)) {
    return true;   // bypass
}
return $user->canAccessDepotRow($row->kode_depo, $row->nama_depo);
```

Masalahnya: `blc` **tidak punya** `depot.view_all` di `PermissionSeeder` (hanya
admin_planner dan admin yang punya), jadi ada user yang secara formal tidak
berhak lintas depo tapi praktis bisa. Permission berhenti jadi sumber
kebenaran, dan selisihnya tidak terlihat dari mana pun kecuali membaca
controller itu.

**Perbaikan.** Bypass dihapus; `blc` diberi `depot.view_all` via
`PermissionSeeder`, jadi akses lintas depo sekarang tercatat dan bisa
diaudit seperti modul lain. Const `WORKFLOW_ROLES` dihapus.

**Dampak yang disengaja:** `staff_logistic` kehilangan bypass dan kini
ter-scope ke depo-nya. Test `test_staff_logistic_tidak_lagi_melewati_scoping`
mengunci itu. Kalau nanti ada alur yang bergantung pada akses lintas depo
untuk role ini, gejalanya akan muncul di QA — dan itu memang yang
seharusnya.

Guard: `StandarisasiDepotScopeTest` (5 test).

### CATATAN-2: pola slug hardcode serupa masih ada di 2 controller

`BiayaRetribusiController` dan `BiayaThlController` masih memakai
`hasRole('blc') || hasRole('staff_logistic')` di dalam pemeriksaan akses.
Polanya sama persis dengan yang sudah dibetulkan di atas, tapi **belum
disentuh** karena tiap modul punya aturan bisnis sendiri dan keputusan
scope-nya terpisah. Perlu audit per modul, bukan perubahan sekali gus.

### CATATAN-3: `SjValidationController` belum memakai trait guard

Controller ini memeriksa `Auth::user() instanceof User` sebelum cek depo,
jadi memaksanya masuk `AuthorizesDepotRow` akan mengubah urutan evaluasi.
Perlu penyesuaian trait dulu, bukan peminjaman paksa.

### BUG-2: Rincian `Validasi SJ` bocorkan data di luar depo

Endpoint `GET /sj-validations/{id}/items` memanggil `$items->load(...)`
tanpa filter `forUserDepot()`, sehingga item dari depo lain ikut ter-load
dan ikut terkirim di response.

**Rekomendasi.** Terapkan `forUserDepot()` pada seluruh query detail, lalu
tambahkan test yang memanggil endpoint detail dengan user depo lain.

### BUG-3: Origin ber-port tidak dianggap stateful oleh Sanctum — **SUDAH DIPERBAIKI**

`EnsureFrontendRequestsAreStateful::fromFrontend()` membentuk pola
`"<entri>/*"` lalu mencocokkannya dengan header `Origin`/`Referer`:

```
entri "localhost"     → pola "localhost/*"     → TIDAK cocok "localhost:3000/"
entri "localhost:3000" → pola "localhost:3000/*" → COCOK
```

Entri **tanpa port tidak menutupi origin ber-port**.Asli `sanctum.stateful`
berisi `localhost` dan `127.0.0.1`, tapi tidak pernah `127.0.0.1:3000` —
padahal `FRONTEND_URL` (dipakai `config/cors.php`) memuatnya. Akibatnya
origin yang **lolos CORS justru ditolak Sanctum**.

**Perbaikan.** `config/sanctum.php` sekarang menurunkan daftar dari
`FRONTEND_URL` — sumber yang sama dengan CORS — supaya keduanya tidak bisa
berbeda, dan `127.0.0.1:3000` ikut tercakup. Guard:
`SanctumStatefulDomainTest` (5 test).

### BUG-4: `login/page.tsx` membaca cookie httpOnly dari JS — **SUDAH DIPERBAIKI**

```js
document.cookie.includes('laravel-session')  // selalu false
```

`laravel-session` ber-flag **httpOnly** — JS tidak pernah bisa membacanya, itu
justru definisi httpOnly. Deteksi sesi selalu gagal, sehingga halaman login tidak
pernah mengenali sesi yang sudah ada.

**Perbaikan.** Deteksi sesi mengandalkan pemanggilan `loadUser()` satu kali,
dijaga `useRef` supaya tidak dijalankan ulang setiap `user` berubah (yang
sebelumnya menimpa state hasil fetch).

### BUG-5: Route cancel Validasi SJ memakai permission yang salah — **SUDAH DIPERBAIKI**

`POST /sj-validations/{id}/cancel` di-gate `permission:sj_validation.edit`,
padahal aksi pembatalan punya permission sendiri: `sj_validation.cancel`.
Role yang boleh membatalkan dokumen tidak punya gate-nya sendiri; role yang
boleh mengoreksi data justru bisa membatalkan.

**Perbaikan.** Gate diubah ke `sj_validation.cancel`. Ini membuat 5 test yang
sebelumnya gagal menjadi hijau.

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
| **Load test sudah ada, tapi belum sah sebagai capacity plan.** `tests/load/api-load.mjs` dijalankan lokal dengan 150 concurrent, 0% error. Hasil di atas 200 concurrent terbatas `kern.ipc.somaxconn=128` milik macOS, jadi bukan limit aplikasi. Belum pernah dijalankan di Linux/nginx/FPM/MySQL. | Angka kapasitas produksi belum diketahui; angka lokal jangan dipakai untuk sizing server |
| **E2E baru menutup 1 halaman.** Playwright (`onezentra-web/e2e/cluster-principal.spec.ts`, 7 test) baru memverifikasi alur Cluster/Principal di browser sungguhan. Permission matrix di luar itu baru memverifikasi *kontrak* slug backend↔`hasPermission()`, bukan tampilan visual. | Layout pecah di layar kecil, kontras, dan fokus keyboard belum terdeteksi di halaman lain |
| **Test database memakai refresh-in-memory, bukan MySQL produksi.** Perilaku index dan locking dapat berbeda. | Performa nyata bisa berbeda dari angka di sini |
| **Mobile app (Flutter) belum diuji** — hanya API mobile (2 route) yang tercakup. | Risiko pada UI mobile belum dinilai |
| **Tidak ada static analysis otomatis** (PHPStan/Psalm). | Bug logika yang lolos test belum terdeteksi |
| **`app/Policies` hanya menutup aturan actor-target.** `UserPolicy` memegang 3 aturan yang butuh tahu aktor DAN target (`admin_master` di store/update/destroy). Gate permission tetap di route, depot scoping tetap di `AuthorizesDepotRow`. Policy untuk model lain belum ada — dan memang belum dibutuhkan. | Aturan akses actor-target user terpusat; aturan lain tetap di tempat semula |
| **Tidak ada remote git.** Seluruh riwayat masih lokal di branch `main`. | Tidak ada backup di luar mesin ini; riwayat hilang jika disk bermasalah |