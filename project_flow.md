# ONEZENTRA Warehouse System — Dokumentasi Alur & Proses

Sistem manajemen gudang ONEZENTRA berbasis **Web (Next.js 16 frontend + Laravel 11 backend API)**.

> **Build tools:** Next.js 16.3.4 (App Router, React 19), Laravel 11, PHP 8.5, PostgreSQL (via `database.sqlite` untuk dev), Tailwind CSS 4, Zustand 5, Vitest 5, Vitest coverage v8.

---

## 📁 Struktur Proyek

```
onezentra-warehouse-system/
├── app/                          # Laravel backend (PHP)
│   ├── Console/Commands/         # Artisan commands (BackfillNpnDepo)
│   ├── Http/
│   │   ├── Controllers/Api/V1/   # 29 API controllers
│   │   ├── Middleware/           # CheckPermission, TrackUserActivity
│   │   └── Kernel.php
│   ├── Jobs/                     # LogUserActivity (queue)
│   ├── Models/                   # 32 Eloquent models + Concerns
│   ├── Providers/                # AppServiceProvider
│   ├── Services/                 # EmailNotificationService, OpnameExpiredService,
│   │                               BiayaApprovalService, ApprovalSectionResolver
│   ├── Exports/                  # 20 Laravel Excel exports + templates
│   └── Events/ Listeners/ Notifications/ Policies/ Traits/ Helpers/  # (tidak ada)
├── bootstrap/
├── config/                       # 16 config files
├── database/
│   ├── migrations/               # ~30 migration files
│   ├── factories/                # UserFactory
│   ├── seeders/                  # RoleSeeder, PermissionSeeder, dll
│   └── database.sqlite           # SQLite untuk development
├── routes/
│   ├── api.php                   # 220 baris route definitions
│   ├── web.php
│   └── console.php
├── public/                       # LOGO.png, biaya THL.jpeg, fonts/
├── storage/
├── onezentra-web/                # NEXT.JS FRONTEND
│   ├── src/
│   │   ├── app/                  # 30 route pages (App Router)
│   │   ├── components/           # ~15 shared components (setelah cleanup)
│   │   ├── lib/                  # api.ts, biayaPdf.ts, suratJalanPdf.ts, dll
│   │   ├── store/                # auth.ts, globalToast.ts (Zustand)
│   │   ├── proxy.ts              # Next.js 16 proxy (auth guard)
│   │   └── middleware.ts         # DIHAPUS (Next.js 16 deprecated)
│   ├── package.json              # dependencies + scripts
│   ├── next.config.ts            # security headers + images config
│   ├── vitest.config.ts          # test config + coverage thresholds
│   └── tsconfig.json
├── .ai/rules/                    # Project-specific AI rules
├── project_flow.md               # ← file ini
└── THL_RETRIBUSI_SYSTEM_FLOW.md  # Dokumentasi alur THL retribusi
```

---

## 🔧 Teknologi & Versi

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Frontend | Next.js (App Router) | 16.3.4 |
| Frontend | React | 19.2.8 |
| Frontend | TypeScript | 5.x |
| Frontend | Tailwind CSS | 4 (via @tailwindcss/postcss) |
| Frontend | Zustand | 5.0.15 |
| Frontend | jsPDF + jspdf-autotable | 4.x / 5.x |
| Frontend | pdf-lib | 1.17.1 |
| Frontend | @zxing/browser | 0.2.1 |
| Frontend | Vitest | 5.0.1 |
| Backend | Laravel | 11.x |
| Backend | PHP | 8.5 |
| Database | SQLite (dev) / PostgreSQL (prod) | — |
| Auth | Laravel Sanctum | — |
| Excel | Laravel Excel | — |
| Build | webpack (via `--webpack`) | — |

---

## Modul yang Ada di Sistem (Menu)

| Menu | Route API | Fungsi |
|------|-----------|--------|
| Dashboard | *(client-side)* | Ringkasan info — dirender client-side dari auth store |
| Penerimaan | `penerimaan` | Validasi data produk per Depo |
| Validasi Dokumen | `sj-validations` | Validasi dokumen (SJ/BA) oleh Cheker |
| NPN | `npn` | Master katalog produk |
| Standarisasi Tumpukan | `standarisasi-tumpukan` | Standar cara tumpuk |
| Standar Umur Produk | `standar-umur-produk` | Standar umur/expired produk |
| Rencana Kirim | `rencana-kirim` | Pembuatan & penjadwalan rencana kirim |
| Gate Check | `gate-transactions` | Check-in / check-out kendaraan |
| Receiving | `receivings` | Proses bongkar & penerimaan barang |
| Roles & Permissions | `roles`, `permissions` | Pengaturan RBAC |
| Users | `users` | Pengelolaan user |
| Setting Email | `email-settings` | Konfigurasi SMTP |
| Penerima Email | `email-recipients` | TO/CC penerima notifikasi |
| Laporan Selisih Qty | `reports/selisih-qty` | Laporan selisih qty, ekspor Excel |
| Laporan Biaya THL | `reports/biaya-thl` | Laporan biaya THL |
| Laporan Biaya Retribusi | `reports/biaya-retribusi` | Laporan biaya retribusi |
| Laporan Penerimaan | `reports/penerimaan` | Laporan penerimaan |
| Laporan Rencana Kirim | `reports/rencana-kirim` | Laporan rencana kirim |
| Opname Expired | `opname-expired` | Monitoring batch mendekati kedaluwarsa |
| Laporan Opname Expired | `reports/opname-expired` | Laporan status expired per depo |
| Approval Settings | `approval-assignments` | Pengaturan approval biaya THL |
| Tarif Retribusi | `tarif-retribusi` | Pengaturan tarif retribusi |
| Docks | `docks` | Master dock (AVAILABLE/OCCUPIED) |
| Gate | `gate` | Check-in/check-out (with barcode scanner) |
| Validasi SJ | `validasi-sj` | Validasi dokumen SJ/BA (with ZXing scanner) |

---

## Struktur Backend (Laravel)

### Controllers API (29 file)

| Controller | Endpoint Prefix | Function |
|------------|----------------|----------|
| `AuthController` | `/auth` (login, register, logout, user) | Auth + Sanctum cookie |
| `UserController` | `/users` | CRUD user + import |
| `RoleController` | `/roles` | CRUD role + permissions + import/export |
| `PermissionController` | `/permissions` | CRUD permissions |
| `NpnController` | `/npn` | Master produk + import/export |
| `PenerimaanController` | `/penerimaan` | Master data produk per depo |
| `StandarUmurProdukController` | `/standar-umur-produk` | Standard product shelf life |
| `StandarisasiTumpukanController` | `/standarisasi-tumpukan` | Stacking standardization |
| `RencanaKirimController` | `/rencana-kirim` | Delivery plan + state machine |
| `DockController` | `/docks` | Dock management |
| `GateTransactionController` | `/gate-transactions` | Vehicle check-in/out |
| `ReceivingController` | `/receivings` | Unloading process |
| `ReceivingItemController` | `/receiving-items` | Receiving items |
| `SjValidationController` | `/sj-validations` | Document validation (SJ/BA) |
| `BatchController` | `/batches` | Batch management |
| `OpnameExpiredController` | `/opname-expired` | Weekly expired monitoring |
| `DashboardController` | `/dashboard` | Activity + summary |
| `DepoController` | `/depo` | Depot list |
| `BiayaThlController` | `/biaya-thl` | THL cost + approval pipeline |
| `BiayaRetribusiController` | `/biaya-retribusi` | Retribution cost + approval |
| `BiayaConfigController` | `/biaya-config` | Biaya config |
| `BiayaThlPdfSettingController` | `/settings/biaya-thl-pdf` | PDF settings |
| `RetribusiRateController` | `/retribusi-rates` | Rate management |
| `EmailSettingController` | `/email-settings` | SMTP configuration |
| `EmailRecipientController` | `/email-recipients` | Notification recipients |
| `ReportController` | `/reports` | All report endpoints |
| `ApprovalAssignmentController` | `/approval-assignments` | Approval settings |

### Models (32 file)

| Model | Table | Key Relations |
|-------|-------|---------------|
| `User` | `users` | roles, permissions, activities, biayaThl, biayaRetribusi |
| `Role` | `roles` | users (via pivot), permissions |
| `Permission` | `permissions` | roles (via pivot) |
| `Npn` | `npn` | standarisasiTumpukan, standarUmurProduk |
| `StandarUmurProduk` | `standar_umur_produk` | npn |
| `StandarisasiTumpukan` | `standarisasi_tumpukan` | npn |
| `RencanaKirim` | `rencana_kirim` | items, gateTransactions, receivings, sjValidations |
| `RencanaKirimItem` | `rencana_kirim_items` | npn, rencanaKirim |
| `GateTransaction` | `gate_transactions` | rencanaKirim |
| `SjValidation` | `sj_validations` | rencanaKirim, items, batch |
| `SjValidationItem` | `sj_validation_items` | sjValidation, batch, receivingItem |
| `Receiving` | `receivings` | rencanaKirim, items, dock |
| `ReceivingItem` | `receiving_items` | receiving, rencanaKirimItem, sjValidationItem |
| `Batch` | `batches` | sjValidationItem, receiving, rencanaKirimItem |
| `Dock` | `docks` | receivings |
| `OpnameExpiredWave` | `opname_expired_waves` | validated_by, koreksi_by |
| `OpnameSetting` | `opname_settings` | — |
| `Penerimaan` | `penerimaan` | — |
| `EmailSetting` | `email_settings` | — |
| `EmailRecipient` | `email_recipients` | — |
| `BiayaThl` | `biaya_thl` | details, photos, approvalHistories |
| `BiayaThlDetail` | `biaya_thl_details` | biayaThl |
| `BiayaThlPhoto` | `biaya_thl_photos` | biayaThl |
| `BiayaThlPdfSetting` | `biaya_thl_pdf_settings` | — |
| `BiayaRetribusi` | `biaya_retribusi` | details, documents |
| `BiayaRetribusiDetail` | `biaya_retribusi_details` | biayaRetribusi |
| `BiayaRetribusiDocument` | `biaya_retribusi_documents` | biayaRetribusi |
| `RetribusiRate` | `retribusi_rates` | — |
| `ApprovalAssignment` | `approval_assignments` | — |
| `ApprovalHistory` | `approval_histories` | — |
| `UserActivityLog` | `user_activity_logs` | user |

### Middleware

| Middleware | Alias | Function |
|------------|-------|----------|
| `CheckPermission` | `permission` | Checks `auth()->user()->hasAnyPermission($slugs)`, returns 403 with required permissions |
| `TrackUserActivity` | `track.activity` | Logs user activity to `user_activity_logs` |

**Registration** (`bootstrap/app.php`):
- `statefulApi()` enabled (cookie-based Sanctum)
- `api` group includes `TrackUserActivity`
- `permission` alias → `CheckPermission::class`
- Guest redirect → `frontend_url/login`

### Jobs

| Job | Queue | Function |
|-----|-------|----------|
| `LogUserActivity` | default | Logs user activity after request |

### Services

| Service | Function |
|---------|----------|
| `EmailNotificationService` | Applies SMTP settings, sends emails per document type/trigger |
| `OpnameExpiredService` | Auto-classifies batch status (AMAN/PERHATIAN/KRITIS/EXPIRED) |
| `BiayaApprovalService` | Approval pipeline for biaya THL/retribusi |
| `ApprovalSectionResolver` | Resolves approval sections based on role |

### Exports (20 files)

Excel exports + templates: `BiayaThl`, `BiayaThlReport`, `BiayaRetribusi`, `BiayaRetribusiReport`, `Npn`, `Dock`, `Penerimaan`, `Receiving`, `ReceivingTemplate`, `ReceivingItemTemplate`, `RencanaKirim`, `RencanaKirimReport`, `RencanaKirimTemplate`, `RencanaKirimItemTemplate`, `SelisihQty`, `StandarUmurProduk`, `StandarUmurProdukTemplate`, `StandarisasiTumpukan`, `StandarisasiTumpukanTemplate`, `OpnameExpired`.

### Commands

| Command | Function |
|---------|----------|
| `BackfillNpnDepo` | Backfills NPN depo data |

### Routes (`routes/api.php` — 220 baris)

**Prefix:** `/api/v1`

**Auth routes** (no middleware or `auth:sanctum`):
- `POST /login` (throttle: 10,1)
- `POST /register` (`auth:sanctum`, `permission:users.create`)
- `POST /logout` (`auth:sanctum`)
- `POST /mobile/login`, `POST /mobile/logout`
- `GET /user`, `PUT /user` (`auth:sanctum`)
- `GET /depo` (`auth:sanctum`)

**Storage** (no auth!):
- `GET /storage/{path}` → serves files from `public/storage`

**All other routes** (`auth:sanctum` + `permission:*`):
- `roles/*`, `permissions/*`, `npn/*`, `penerimaan/*`, `standar-umur-produk/*`, `standarisasi-tumpukan/*`, `biaya-thl/*`, `biaya-retribusi/*`, `retribusi-rates/*`, `settings/biaya-thl-pdf/*`, `users/*`, `rencana-kirim/*`, `docks/*`, `gate-transactions/*`, `receivings/*`, `receiving-items/*`, `opname-expired/*`, `batches/*`, `email-settings/*`, `email-recipients/*`, `sj-validations/*`, `reports/*`, `approval-assignments/*`, `dashboard/activity`, `dashboard/summary`

---

## Struktur Frontend (Next.js 16)

### App Router Pages (`src/app/`)

| Page | Component | Auth Guard |
|------|-----------|------------|
| `/` | Redirect → `/dashboard` | proxy.ts |
| `/login` | Login form | Public |
| `/dashboard/layout.tsx` | Route layout (Sidebar + topbar + splash) | Auth |
| `/dashboard/page.tsx` | Dashboard home | Auth |
| `/dashboard/profile/page.tsx` | User profile | Auth |
| `/penerimaan/page.tsx` | Penerimaan list | Auth |
| `/validasi-sj/page.tsx` | SJ Validation | Auth |
| `/gate/page.tsx` | Gate check | Auth |
| `/receiving/page.tsx` | Receiving | Auth |
| `/npn/page.tsx` | NPN catalog | Auth |
| `/standarisasi/page.tsx` | Stacking standardization | Auth |
| `/standar-umur/page.tsx` | Shelf life | Auth |
| `/rencana-kirim/page.tsx` | Delivery plan | Auth |
| `/docks/page.tsx` | Dock management | Auth |
| `/users/page.tsx` | User management | Auth |
| `/roles/page.tsx` | Roles & permissions | Auth |
| `/permissions/page.tsx` | Permissions (alias to /roles) | Auth |
| `/approval-settings/page.tsx` | Approval settings | Auth |
| `/tarif-retribusi/page.tsx` | Tariff settings | Auth |
| `/email-settings/page.tsx` | Email config | Auth |
| `/email-recipients/page.tsx` | Email recipients | Auth |
| `/opname-expired/page.tsx` | Opname expired | Auth |
| `/reports/*/page.tsx` | Reports (6 pages) | Auth |

### Shared Components (`src/components/`)

| Component | Function |
|-----------|----------|
| `Sidebar.tsx` | Navigation sidebar (481 lines) |
| `Modal.tsx` | Reusable modal (with aria, stable ID) |
| `ConfirmDialog.tsx` | Confirmation dialog |
| `SearchInput.tsx` | Search with debounce |
| `Toast.tsx` / `GlobalToast.tsx` | Toast notifications |
| `ToggleSwitch.tsx` | Toggle switch |
| `Calendar.tsx` | Date picker |
| `DashboardStatCards.tsx` | Dashboard KPI cards |
| `DashboardAlerts.tsx` | Dashboard alerts |
| `DashboardRecent.tsx` | Recent activity |
| `DashboardActivityChart.tsx` | Activity chart |
| `DashboardAlerts.tsx` | Pending actions |
| `PendingActions.tsx` | Pending action list |
| `ApprovalPipeline.tsx` | Approval pipeline visualization |
| `RencanaKirimStatusChart.tsx` | Rencana Kirim status |
| `StatusDropdown.tsx` | Status dropdown |
| `ReceivingItemEditModal.tsx` | Edit receiving item |
| `ManualBatchManager.tsx` | Manual batch management |
| `BarcodeScanner.tsx` | ZXing barcode scanner |

### Library Functions (`src/lib/`)

| File | Function |
|------|----------|
| `api.ts` | Axios client, auth functions, all API resource objects |
| `biayaPdf.ts` | PDF generation for biaya THL/retribusi (jsPDF) |
| `suratJalanPdf.ts` | Surat Jalan PDF (jsPDF + barcode Code39) |
| `biaya.ts` | Biaya config caching |
| `dashboardSummary.ts` | Dashboard summary caching |
| `condition.ts` | Condition label mapping |

### State Management (`src/store/`)

| Store | State |
|-------|-------|
| `auth.ts` | `user`, `permissions`, `login()`, `logout()`, `loadUser()`, `hasPermission()`, `hasRole()` |
| `globalToast.ts` | `notifyGlobal()`, `notifyPermissionDenied()` |

### Proxy / Middleware (`src/proxy.ts`)

Next.js 16 `proxy.ts` — authentication guard + API proxy:
- Redirects `/` → `/dashboard`
- Allows `/login` without cookie
- Redirects to `/login` if `SESSION_COOKIE` absent
- Skips static assets (`_next`, favicon, fonts, images)
- **Forwards `/api/*` to Laravel backend** (`http://localhost:8000`) — ensures `laravel-session` cookie is set on `localhost:3000` domain (critical for Sanctum stateful cookie auth)
- **Forwards `/sanctum/*` to Laravel backend** — CSRF cookie exchange (`/sanctum/csrf-cookie`)

**Why proxy forwarding is essential:** Without proxy forwarding, the frontend calls `apiClient` directly to `localhost:8000`. Cookies set by `localhost:8000` are NOT accessible to `localhost:3000` (different port = different origin). The proxy ensures all API/CSRF requests pass through `localhost:3000`, so cookies are bound to the correct domain.

**Frontend API layer (`src/lib/api.ts`):**
- `API_URL` = `/api/v1` (relative, via proxy)
- `CSRF_URL` = `/sanctum/csrf-cookie` (separate endpoint, not under `/api/v1`)
- `axios` configured with `withCredentials: true` + `withXSRFToken: true` for automatic CSRF token exchange

---

## Alur Utama yang Berjalan

### 1. Rencana Kirim → Gate → Validasi → Receiving (state machine rencana_kirim)

```text
DRAFT
  ↓ Admin Planner menyimpan & email notifikasi (TO BLC, CC Cheker) terkirim
SCHEDULED
  ↓ Security melakukan Gate In (gate_transactions INBOUND)
CHECKED_IN
  ↓ Cheker memulai Validasi SJ → snapshot item, input qty aktual, kondisi, expired
  ↓ Validasi SJ di-selesaikan → rencana_kirim di-set ke VERIFIED
  ↓ Receiving + ReceivingItems di-create OTOMATIS dari data validasi (status: PENDING)
VERIFIED
  ↓ Cheker buka menu Receiving → scan barcode PO Transporter → temukan Receiving
  ↓ Cheker klik "Selesai Bongkar" → Receiving: PENDING → IN_PROGRESS → COMPLETED
  ↓ dock AVAILABLE, batch BATCH-XXXX di-generate, email "Proses Bongkar Selesai"
COMPLETED
```

**Alur data:** Validasi SJ adalah **satu-satunya titik** di mana produk di-scan dan qty aktual dicatat. Data hasil validasi (actual_qty, condition, expired_date, barcode) **diteruskan otomatis** ke Receiving — tidak ada scan ulang produk di tahap receiving.

Status hanya bisa berpindah melalui transisi sah (`DRAFT→SCHEDULED→CHECKED_IN→VERIFIED→IN_PROGRESS→COMPLETED`, atau `→CANCELLED` dari status yang belum selesai). Transisi ilegal ditolak HTTP 422; `PUT /{rencana_kirim}` tidak dapat mengubah status.

### 2. Validasi Dokumen (Cheker)

```text
Scan Dokumen/RKH → sistem cari rencana_kirim (GET /sj-validations/lookup?scan_code=...)
    ↓
Mulai validasi → snapshot seluruh item rencana_kirim (POST /sj-validations/start/{rencanaKirim})
    ↓
Untuk setiap item (scan item): isi qty aktual, tanggal expired, kondisi
    ↓
Simpan Validasi → batch per produk otomatis di-generate (BATCH-/LBL-)
    ↓
Selesaikan → validasi dokumen COMPLETED, email notifikasi (TO BLC, CC) terkirim.
   Receiving + ReceivingItems di-create OTOMATIS dari data validasi (status: PENDING).
```

Field API untuk scan item validasi (`POST /sj-validations/{sjValidation}/scan`):
- `sj_validation_item_id` (wajib) — bukan scan by `kode_barang`
- `actual_qty` (wajib) — dibandingkan dengan `expected_qty`
- `expired_date` (opsional), `condition` (`GOOD|DAMAGED|MISSING`), `barcode` (opsional), `notes` (opsional)
- Idempoten: scan ulang pada `sj_validation_item_id` yang sama tidak membuat batch duplikat

### 2b. Batch per Produk & Cetak Label

Saat Cheker selesai memvalidasi **satu item produk**, sistem otomatis membuat **satu row `batches`** (relasi `sj_validation_item_id`), berisi `batch_number` (`BATCH-XXXXXXXX`) + `barcode_label` (`LBL-XXXXXXXX`).

**Cetak label** (frontend `validasi-sj`):
- Format label: QR code (encode `batch_number`) + teks (`nama_barang`, `batch_number`, `barcode_label`, `qty`, `satuan`)
- `src/lib/bluetoothPrint.ts`: builder byte ESC/POS + `printLabelViaBluetooth()` via Web Bluetooth + `buildBrowserPrintHtml()`
- `src/lib/suratJalanPdf.ts`: Code39 barcode rendering

### 3. Penerimaan

Modul terpisah untuk validasi data produk per Depo (master data stok NPN), berbeda dari proses Receiving bongkar truck.

### 4. Kubikasi Muatan (derived)

Rumus: `kubikasi (m³) = jumlah × npn.decVolume × npn.SAPdecUom ÷ 1.000.000`. Diturunkan dari data NPN, tidak disimpan di DB.

### 5. Standarisasi Tumpukan

Saat cheker mengisi `tier` & `tinggi_tumpukan` pada scan item, sistem meng-upsert record `pending` via `npn_id` → tabel `standarisasi_tumpukan`.

---

## Tabel Database yang Ada

| Table | Keterangan |
|-------|------------|
| `users` | User: kode/nama depo, level, status, 2FA |
| `npn` | Katalog produk NPN |
| `penerimaan` | Validasi penerimaan data produk |
| `standar_umur_produk` | Standar umur produk |
| `standarisasi_tumpukan` | Standar tumpukan — relasi ke `npn` via `npn_id` |
| `rencana_kirim` + `rencana_kirim_items` | Rencana kirim (state machine) + item |
| `docks` | Master dock (AVAILABLE/OCCUPIED) |
| `gate_transactions` | Transaksi masuk/keluar gate |
| `receivings` + `receiving_items` | Receiving/unload + item |
| `batches` | Batch saat receiving selesai DAN saat validasi SJ |
| `sj_validations` + `sj_validation_items` | Validasi dokumen (SJ/BA) cheker + item |
| `email_settings` | Konfigurasi SMTP |
| `email_recipients` | Penerima notifikasi TO/CC per jenis dokumen |
| `opname_expired_waves` | Batch opname mingguan — auto-classified |
| `opname_settings` | Threshold konfigurable |
| `permissions`, `roles`, `role_user`, `role_permission` | RBAC |
| `sessions` | Sesi login cookie Sanctum |
| `personal_access_tokens` | Sisa historis (auth murni cookie) |
| `biaya_thl`, `biaya_thl_details`, `biaya_thl_photos`, `biaya_thl_pdf_settings` | Biaya THL + dokumen |
| `biaya_retribusi`, `biaya_retribusi_details`, `biaya_retribusi_documents` | Biaya retribusi + dokumen |
| `retribusi_rates` | Tarif retribusi per depo |
| `approval_assignments`, `approval_histories` | Approval pipeline |
| `user_activity_logs` | Activity log |
| `gate_transactions` | Vehicle gate transactions |

---

## Verifikasi Alur End-to-End (uji langsung via API)

Alur di bawah sudah diuji langsung terhadap API berjalan (`/api/v1`) dan seluruhnya berhasil. Semua endpoint memakai `auth:sanctum` + middleware `permission:*`; autentikasi murni berbasis cookie sesi Sanctum (stateful) — login **tidak** menerbitkan Bearer token dan frontend tidak mengirim header `Authorization`.

### 1. LOGIN

`POST /api/v1/login` → `{email, password}`.
- Berhasil: `200` → `{ message, user, permissions }`. Sesi disimpan sebagai cookie (`laravel-session` + XSRF).
- Password salah: `422` (validasi).
- Sesi kedaluwarsa: `401` → frontend me-reload ke `/login?expired=1`.
- `proxy.ts` di frontend menangani redirect untuk cookie tidak ada.

Contoh user resmi (password `password` untuk akun bawaan): `admin@onezentra.com` (admin_master, **44 permission**), `stafflogistic`, `rlh`, `rfah`, `rh`, `blc`, `bac`, `admindistribusi`, `adminplanner`, `cheker`. Ada juga 10 akun depo Singkawang berdomain `.singkawang@onezentra.com`.

### 2. MEMBUAT USER

`POST /api/v1/users` → wajib `kode_depo`, `nama_depo`, `full_name`, `email` (unik), `password` (min 8 karakter), `level`.
- Level validasi ketat: `admin_master, staff_logistic, rlh, rfah, rh, blc, bac, admin_distirbusi, admin_planner, cheker`.
- Sistem otomatis menyambungkan user ke role yang slug-nya sama dengan level.
- Berhasil: `201`.

### 3. ROLES & PERMISSIONS

- `GET /api/v1/permissions` → daftar semua permission.
- `POST /api/v1/roles` → buat role (`name`, `slug`, `description`).
- `PUT /api/v1/roles/{id}/permissions` → sync permission via array `permission_ids`.
- `POST /api/v1/roles/import` → import role dari Excel.
- `GET /api/v1/roles/export` → export role ke Excel.

### 4. RENCANA KIRIM → GATE → VALIDASI → RECEIVING

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| POST | `/rencana-kirim` | Buat rencana | `rencana_kirim.create` |
| GET | `/rencana-kirim` | Daftar rencana | `rencana_kirim.view` |
| GET | `/{id}` | Detail | `rencana_kirim.view` |
| PUT | `/{id}` | Update (tidak ubah status) | `rencana_kirim.edit` |
| DELETE | `/{id}` | Hapus | `rencana_kirim.delete` |
| POST | `/{id}/schedule` | Status → SCHEDULED | `rencana_kirim.edit` |
| POST | `/{id}/verify` | Status → VERIFIED | `rencana_kirim.edit` |
| POST | `/{id}/cancel` | Status → CANCELLED | `rencana_kirim.edit` |
| POST | `/{id}/import` | Import dari Excel | `rencana_kirim.import` |
| GET | `/{id}/item-template` | Template import barang | `rencana_kirim.view` |
| POST | `/{id}/import-items` | Resolve barang Excel | `rencana_kirim.import` |
| GET | `/template` | Template rencana | `rencana_kirim.view` |

### 5. SETTING EMAIL (konfigurasi SMTP)

- `GET /api/v1/email-settings` → config SMTP saat ini.
- `PUT /api/v1/email-settings` → simpan config (password di-hash bcrypt).
- `POST /api/v1/email-settings/test` → uji kirim.

### 6. PENERIMA EMAIL (TO/CC notifikasi per dokumen)

- `GET /api/v1/email-recipients/options` → daftar document_types, triggers, users, roles.
- `POST /api/v1/email-recipients` → tambah penerima.
- `GET /api/v1/email-recipients` → daftar penerima.

---

## FLOW DETAIL ADMIN PLANNER: RENCANA KIRIM

### 1. TANGGUNG JAWAB ADMIN PLANNER

Admin Planner bertanggung jawab untuk: menentukan tanggal rencana, mengisi identitas dokumen (No. Dokumen/SJ-BA = PO Transporter + tanggal RKH), mengisi data kendaraan/driver/expedisi, menentukan pengirim/tujuan, memilih produk dari NPN, memasukkan jumlah/satuan/keterangan, meninjau sebelum menyimpan, menjadwalkan rencana.

### 2. PRAKONDISI

| Data | Wajib |
|------|-------|
| No. Dokumen (SJ/BA) | Ya |
| Tanggal RKH | Ya |
| Nama driver | Ya |
| Ekspedisi | Ya |
| Nopol | Ya |
| Pengirim | Ya |
| Tujuan | Ya |
| Produk | Minimal satu |

### 3. MEMBUKA FORM VIA KALENDER

Kalender adalah pintu utama pembuatan rencana. Planner memilih bulan → memilih tanggal → sistem membuka form Create Rencana Kirim. Tombol tambah rencana di header tidak digunakan.

### 4. PENGISIAN FORM BERURUTAN

**Langkah 1: Informasi Dokumen** — No. Dokumen (SJ/BA) + Tanggal RKH.
- `po_transporter` unik per depo (case-insensitive) — duplikat ditolak 422.
- Nomor PO Transporter digunakan sebagai teks dan barcode di PDF Surat Jalan.

**Langkah 2: Kendaraan dan Driver** — driver, ekspedisi, nopol, jenis kendaraan (CDD/CDE/L300/FUSO/TRONTON/CONTAINER 20 FT/CONTAINER 40 FT/LAINNYA, hanya label).

**Langkah 3: Pengirim dan Tujuan** — nama pengirim, alamat, HP, nama tujuan, kode/nama depo.

**Langkah 4: Daftar Barang** — cari produk NPN via `szNickName`/`szNickNameNew`, kode barang diambil dari `BOSnetszProductId`, masukkan jumlah/satuan/keterangan.
- Import Barang via Excel (`POST /rencana-kirim/import-items`) → resolve ke NPN.
- Kubikasi ditampilkan live: `jumlah × decVolume × SAPdecUom ÷ 1.000.000`.

**Langkah 5: Catatan** — informasi operasional tambahan.

### 5. STATUS RENCANA KIRIM

```text
DRAFT → SCHEDULED → CHECKED_IN → VERIFIED → IN_PROGRESS → COMPLETED
                                                    ↘ CANCELLED
```

### 6. AKSI DI DAFTAR

Melihat detail, menjadwalkan, membatalkan, menghapus, preview Surat Jalan, mengunduh Surat Jalan PDF (client-side via jsPDF).

### 7. SERAH TERIMA KE SECURITY DAN CHEKER

Planner simpan (DRAFT) → email → jadwalkan (SCHEDULED) → Security Gate In (CHECKED_IN) → Cheker validasi SJ (VERIFIED) → auto-create Receiving → Cheker scan barcode → COMPLETED → batch di-generate → email "Proses Bongkar Selesai".

---

## ALUR MODUL OPNAME EXPIRED

### 1. Konsep

Sistem mengklasifikasikan batch berdasarkan **sisa hari** hingga expired date:

| Status | Sisa Hari | Keterangan |
|--------|-----------|------------|
| **AMAN** | ≥ `threshold_aman` (default 90) | Stok aman, FIFO normal |
| **PERHATIAN** | ≥ `threshold_perhatian` (default 30) | Prioritaskan produk |
| **KRITIS** | < `threshold_perhatian` (≥ 0) | Waspada / SEGERA kirim/retur |
| **EXPIRED** | < 0 | Batch kedaluwarsa, wajib ditarik |

### 2. Generate Mingguan

```text
Klik "Generate" → hitung week_start (Senin) s.d. week_end (Minggu)
    ↓ Ambil data ReceivingItem minggu ini
    ↓ Aggregate per (kode_depo, kode_barang, expired_date)
    ↓ Roll-forward batch minggu lalu jika masih valid
    ↓ Setiap batch: sisa_hari, status_ini, perubahan, rekomendasi
    ↓ Simpan ke opname_expired_waves (upsert)
```

**Roll-forward:** Batch minggu lalu yang bukan EXPIRED dibawa ke minggu ini.
**Perubahan:** BARU, TETAP, NAIK +X, TURUN -X, status X → Y.

### 3. API Endpoints

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/opname-expired` | Daftar batch, filter | `opname.view` |
| POST | `/opname-expired/generate` | Generate/update | `opname.create` |
| GET | `/{wave}` | Detail | `opname.view` |
| PUT | `/{wave}` | Update koreksi qty | `opname.edit` |
| GET | `/settings` | Lihat threshold | `opname.view` |
| PUT | `/settings` | Update threshold | `opname.edit` |
| GET | `/export` | Export Excel | `opname.view` |

### 4. Auto-Classification

`OpnameExpiredService::status()` berdasarkan `sisa_hari` dan threshold. Tidak ada validasi manual — monitoring-only.

### 5. Database

**`opname_expired_waves`:** Unique `(week_start, kode_depo, kode_barang, expired_date_ini)`. Qty: `qty_ini_crt/pcs`, `qty_lalu_crt/pcs`, `qty_koreksi_crt/pcs`. Status: `status_ini`, `status_lalu`, `perubahan`, `rekomendasi`, `sisa_hari`. Relasi: `validated_by`, `koreksi_by`.

**`opname_settings`:** Key-value `threshold_aman`, `threshold_perhatian`, `threshold_kritis`.

---

## ALUR BIAYA THL (THALANGAN)

### State Machine (Biaya THL)

```text
DRAFT
  ↓ Admin menyiapkan data
CHECKED
  ↓ Supervisor memeriksa
RLH_APPROVED
  ↓ RLH menyetujui
APPROVED
  ↓ Final approval
REJECTED ← ditolak di tahap mana pun
REVISI ← revisi dikembalikan
```

### Endpoints

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET/POST | `/biaya-thl` | List/Create |
| GET/PUT/DELETE | `/biaya-thl/{id}` | Detail/Update/Delete |
| POST | `/biaya-thl/{id}/submit` | Submit |
| POST | `/biaya-thl/{id}/check` | Check |
| POST | `/biaya-thl/{id}/approve` | Approve |
| POST | `/biaya-thl/{id}/rfah-approve` | RFah approve |
| POST | `/biaya-thl/{id}/reject` | Reject |
| POST | `/biaya-thl/{id}/revise` | Revise |
| POST | `/biaya-thl/{id}/import` | Import Excel |
| GET | `/biaya-thl/{id}/pdf` | Download PDF |
| POST | `/biaya-thl/import` | Bulk import |
| GET | `/settings/biaya-thl-pdf` | PDF settings |
| POST | `/settings/biaya-thl-pdf` | Save PDF settings |

### Approval Pipeline

`BiayaApprovalService` + `ApprovalSectionResolver` mengelola pipeline: draft → checked → rlh_approved → approved → rejected/revise. Setiap tahap melibatkan user berbeda sesuai role.

### Foto & Dokumen

- `BiayaThlPhoto` model untuk foto dokumen
- `MAX_DOC_BYTES` membatasi ukuran upload
- Client-side validation `file.type === 'image/jpeg' && file.size <= 2 * 1024 * 1024`
- `next.config.ts` `images.remotePatterns` mengizinkan `localhost:8000`

---

## ALUR BIAYA RETRIBUSI

### State Machine (Biaya Retribusi)

```text
DRAFT → SUBMIT → CHECKED → RLH_APPROVED → APPROVED → REJECTED/REVISI
```

### Endpoints

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET/POST | `/biaya-retribusi` | List/Create |
| GET/PUT/DELETE | `/biaya-retribusi/{id}` | Detail/Update/Delete |
| POST | `/biaya-retribusi/{id}/submit` | Submit |
| POST | `/biaya-retribusi/{id}/check` | Check |
| POST | `/biaya-retribusi/{id}/approve` | Approve |
| POST | `/biaya-retribusi/{id}/rfah-approve` | RFah approve |
| POST | `/biaya-retribusi/{id}/reject` | Reject |
| POST | `/biaya-retribusi/{id}/revise` | Revise |
| POST | `/biaya-retribusi/{id}/import` | Import Excel |
| GET | `/biaya-retribusi/{id}/pdf` | Download PDF |
| POST | `/biaya-retribusi/import` | Bulk import |

### Dokumen

- `BiayaRetribusiDocument` model
- `BiayaRetribusiExport` + `BiayaRetribusiReportExport`
- Dokumen disimpan di `public/storage` (unauthenticated via `GET /storage/{path}`)

### Retribusi Rates

`GET /retribusi-rates`, `POST /retribusi-rates`, `DELETE /retribusi-rates/{kodeDepo}`.

---

## ALUR LAPORAN

### 6 Halaman Laporan

| Route | Endpoint API | Format Export |
|-------|-------------|---------------|
| `reports/selisih-qty` | `/reports/selisih-qty` | Excel |
| `reports/penerimaan` | `/reports/penerimaan` | Excel |
| `reports/rencana-kirim` | `/reports/rencana-kirim` | Excel |
| `reports/biaya-thl` | `/reports/biaya-thl` | Excel |
| `reports/biaya-retribusi` | `/reports/biaya-retribusi` | Excel |
| `reports/opname-expired` | `/reports/opname-expired` | Excel |

Semua laporan menggunakan filter tanggal + depo. Semua punya permission gate `reports.view` di halaman.

---

## ALUR VALIDASI SJ

### Endpoints

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/sj-validations` | Daftar | `sj_validation.view` |
| GET | `/sj-validations/stats` | Stats | `sj_validation.view` |
| GET | `/sj-validations/{id}` | Detail | `sj_validation.view` |
| GET | `/sj-validations/lookup` | Lookup by scan | — |
| POST | `/sj-validations/start-by-code` | Mulai by barcode | `sj_validation.create` |
| POST | `/sj-validations/{id}/scan` | Scan item | `sj_validation.create` |
| POST | `/sj-validations/{id}/complete` | Selesaikan | `sj_validation.create` |
| POST | `/sj-validations/{id}/cancel` | Batal | `sj_validation.create` |
| DELETE | `/sj-validations/{id}/items/{itemId}` | Hapus item | `sj_validation.create` |

---

## ALUR GATE & RECEIVING

### Gate Transactions

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/gate-transactions` | Daftar | `gate.view` |
| GET | `/gate-transactions/stats` | Stats | `gate.view` |
| POST | `/gate-transactions` | Check-in/out | `gate.create` |
| GET | `/gate-transactions/search/by-dokumen` | Search by PO | `gate.create` |

**Validasi state:** `INBOUND` hanya saat `SCHEDULED`, `OUTBOUND` hanya saat `COMPLETED`. Duplikat ditolak 422.

### Receiving

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/receivings` | Daftar | `receiving.view` |
| POST | `/receivings` | Create | `receiving.create` |
| POST | `/receivings/{id}/start` | Start | `receiving.create` |
| POST | `/receivings/{id}/scan` | Scan | `receiving.create` |
| POST | `/receivings/{id}/complete` | Complete | `receiving.complete` |
| POST | `/receivings/{id}/cancel` | Cancel | `receiving.edit` |
| POST | `/receivings/import` | Import | `receiving.import` |
| GET | `/receivings/export` | Export | `receiving.export` |

**Quick Scan** mencari berdasarkan `po_transporter` atau `driver_name`. Barcode harus cocok dengan `po_transporter` rencana.

### Batches

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/batches` | Daftar |
| GET | `/batches/search/by-number` | Search by batch number |

---

## ALUR DAN MODUL LAINNYA

### NPN

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET/POST | `/npn` | List/Create | `npn.view`/`npn.create` |
| GET/PUT/DELETE | `/npn/{id}` | Detail/Update/Delete | `npn.view`/`npn.edit`/`npn.delete` |
| POST | `/npn/bulk-delete` | Bulk delete | `npn.delete` |
| POST | `/npn/import` | Import Excel | `npn.create` |
| GET | `/npn/export` | Export | `npn.view` |
| GET | `/npn/search-product` | Search | `npn.view` |

### Penerimaan

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET/POST | `/penerimaan` | List/Create | `penerimaan.view`/`penerimaan.create` |
| GET/PUT/DELETE | `/penerimaan/{id}` | Detail/Update/Delete | `penerimaan.view`/`penerimaan.edit`/`penerimaan.delete` |

### Standarisasi Tumpukan

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET/POST | `/standarisasi-tumpukan` | List/Create | `standarisasi.view`/`standarisasi.create` |
| GET | `/standarisasi-tumpukan/stats` | Stats | `standarisasi.view` |
| GET | `/standarisasi-tumpukan/search-product` | Search | — |
| GET/PUT/DELETE | `/standarisasi-tumpukan/{id}` | Detail/Update/Delete | `standarisasi.view`/`standarisasi.edit`/`standarisasi.delete` |
| POST | `/standarisasi-tumpukan/approve` | Approve | `standarisasi.approve` |
| POST | `/standarisasi-tumpukan/reject` | Reject | `standarisasi.approve` |
| POST | `/standarisasi-tumpukan/notify` | Notify | `standarisasi.view` |
| POST | `/standarisasi-tumpukan/import` | Import Excel | `standarisasi.create` |
| GET | `/standarisasi-tumpukan/export` | Export | `standarisasi.view` |
| POST | `/standarisasi-tumpukan/bulk-delete` | Bulk delete | `standarisasi.delete` |

### Standar Umur Produk

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET/POST | `/standar-umur-produk` | List/Create | `standar_umur.view`/`standar_umur.create` |
| GET/PUT/DELETE | `/standar-umur-produk/{id}` | Detail/Update/Delete | `standar_umur.view`/`standar_umur.edit`/`standar_umur.delete` |
| POST | `/standar-umur-produk/bulk-delete` | Bulk delete | `standar_umur.delete` |
| GET | `/standar-umur-produk/export` | Export | `standar_umur.view` |
| POST | `/standar-umur-produk/import` | Import | `standar_umur.create` |

### Roles & Permissions

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET/POST | `/roles` | List/Create | `roles.view`/`roles.create` |
| GET/PUT/DELETE | `/roles/{id}` | Detail/Update/Delete | `roles.view`/`roles.edit`/`roles.delete` |
| GET | `/roles/{id}/permissions` | Role permissions | `roles.view` |
| PUT | `/roles/{id}/permissions` | Sync permissions | `roles.edit` |
| POST | `/roles/import` | Import | `roles.import` |
| GET | `/roles/export` | Export | `roles.export` |
| GET | `/roles/template` | Template | `roles.template` |
| GET/POST | `/permissions` | List/Create | `roles.view`/`roles.create` |
| GET/PUT/DELETE | `/permissions/{id}` | Detail/Update/Delete | `roles.view`/`roles.edit`/`roles.delete` |

### Users

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/users` | Daftar | `users.view` |
| POST | `/users` | Create | `users.create` |
| GET/PUT/DELETE | `/users/{id}` | Detail/Update/Delete | `users.view`/`users.edit`/`users.delete` |
| POST | `/users/import` | Import Excel | `users.import` |

### Email Settings & Recipients

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/email-settings` | Config | `emails.edit` |
| PUT | `/email-settings` | Update | `emails.edit` |
| POST | `/email-settings/test` | Test | `emails.edit` |
| GET | `/email-recipients/options` | Options | `emails.view` |
| GET/POST | `/email-recipients` | List/Create | `emails.view`/`emails.create` |
| GET/PUT/DELETE | `/email-recipients/{id}` | Detail/Update/Delete | `emails.view`/`emails.edit`/`emails.delete` |

### Dashboard

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/dashboard/activity` | Activity data | `dashboard.view` |
| GET | `/dashboard/summary` | Summary data | `dashboard.view` |

### Approval Assignments

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/approval-assignments` | List | `approval.view` |
| POST | `/approval-assignments` | Upsert | `approval.manage` |

### Reports

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/reports/selisih-qty` | Selisih Qty | `reports.view` |
| GET | `/reports/selisih-qty/export` | Export | `reports.view` |
| GET | `/reports/rencana-kirim` | Rencana Kirim | `reports.view` |
| GET | `/reports/rencana-kirim/export` | Export | `reports.view` |
| GET | `/reports/penerimaan` | Penerimaan | `reports.view` |
| GET | `/reports/penerimaan/export` | Export | `reports.view` |
| GET | `/reports/biaya-thl` | Biaya THL | `reports.view` |
| GET | `/reports/biaya-thl/export` | Export | `reports.view` |
| GET | `/reports/biaya-retribusi` | Biaya Retribusi | `reports.view` |
| GET | `/reports/biaya-retribusi/export` | Export | `reports.view` |

---

## Alur Surat Jalan PDF (Client-Side)

Surat Jalan PDF **tidak** dibuat oleh endpoint backend. Seluruh preview & unduhan PDF dirender **client-side di frontend** via `jsPDF` (`onezentra-web/src/lib/suratJalanPdf.ts`), memakai data rencana dari `GET /api/v1/rencana-kirim/{id}`.

- Nomor RKH sebagai identitas
- Barcode Code39 dari nomor RKH
- Nama driver, No. Dokumen (SJ/BA), pengirim, alamat, telepon
- Tujuan, kendaraan, detail produk
- Total jumlah barang, catatan
- Area tanda tangan Pengirim, Mengetahui, Supir, Penerima
- `normalizeRkhDate()` parse tanggal secara tekstual (regex `^(\d{4})-(\d{2})-(\d{2})`), bukan `new Date()` — mencegah timezone shift

---

## Alur Cetak Label & Batch (Client-Side)

Format label: **QR code** (encode `batch_number`) + teks (`nama_barang`, `batch_number`, `barcode_label`, `qty`, `satuan`).

- `src/lib/bluetoothPrint.ts`: builder byte **ESC/POS** (init, center, bold, **QR via `GS ( k`**, feed, potong `GS V`)
- `printLabelViaBluetooth()` via **Web Bluetooth** (Chrome/Edge desktop)
- `buildBrowserPrintHtml()` → dialog print browser sebagai fallback
- **Catatan:** Web Bluetooth hanya jalan di Chrome/Edge desktop. Untuk **aplikasi mobile**, builder byte ESC/POS & format QR/teks ini tinggal di-port ke Bluetooth native (mis. `flutter_blue_plus` / React Native `react-native-ble-plx`) — format datanya sudah siap dipakai ulang.

---

## Alur Notifikasi Email

`EmailNotificationService` mengirim notifikasi email otomatis berdasarkan trigger per jenis dokumen:
- `rencana_kirim / created` → TO BLC, CC Cheker
- `sj_ba / validated` → CC role cheker
- `receiving / completed` → TO BLC, CC admin_distribusi
- `selisih_qty` → Penerima dengan `document_type=selisih, trigger=selisih_qty`

Email dikirim via SMTP yang dikonfigurasi di `email_settings`. Password disimpan ter-hash bcrypt. `EmailNotificationService::applySmtpSettings()` mengatur runtime mail config.

---

## Alur Opname Expired

`OpnameExpiredService::status()` mengklasifikasikan otomatis berdasarkan `sisa_hari` dan threshold. Batch di-generate mingguan dari data ReceivingItem. Roll-forward batch minggu lalu yang masih valid. Perubahan dicatat (BARU/TETAP/NAIK/TURUN/status change). Update koreksi hanya menerima `qty_koreksi_crt` dan `qty_koreksi_pcs`.

---

## Konfigurasi Penting (config/)

| Config | Catatan |
|--------|---------|
| `session.php` | `secure => env('SESSION_SECURE_COOKIE')`, `http_only => true`, `same_site => 'lax'` |
| `cors.php` | `allowed_origins` = `[FRONTEND_URL, http://127.0.0.1:3000]`, `supports_credentials: true` |
| `sanctum.php` | Stateful domains untuk cookie auth |
| `auth.php` | Sanctum guard untuk API |
| `mail.php` | SMTP config |
| `queue.php` | Queue connection |
| `biaya.php` | Biaya THL config |
| `biaya_thl_pdf.php` | PDF approval section settings |
| `permission.php` | Permission definitions |
| `services.php` | External service config |
| `.env` | `SESSION_SECURE_COOKIE`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS` harus di-set di production |

---

## Verifikasi & Pengujian

### Frontend Testing

- **Framework:** Vitest 5 + @testing-library/react
- **Test files:** 11 (`src/**/*.test.{ts,tsx}`)
- **Coverage config:** `vitest.config.ts` (v8 provider, thresholds 30%)
- **Lint:** ESLint 9 dengan `eslint-config-next`
- **Build:** `next build --webpack` (webpack, bukan Turbopack)
- **Dev:** `next dev` (Turbopack)

### Backend Testing

- PHPUnit (`phpunit.xml`)
- Factory: `UserFactory`
- Database: SQLite (`database/database.sqlite`)
- Seeders: `RoleSeeder`, `PermissionSeeder`, `SingkawangDepotSeeder`

---

## Catatan Teknis Penting

1. **Tidak ada `any`** di seluruh kode frontend (`src/`) — disiplin tipis yang kuat.
2. **0 `setInterval`** di seluruh kode frontend — tidak ada polling.
3. **Auth state di memori saja** (Zustand tanpa persist) — tidak ada token di localStorage.
4. **Proxy (Next.js 16)** menggantikan `middleware.ts` yang deprecated. `proxy.ts` mengautentikasi halaman DAN meneruskan `/api/*` serta `/sanctum/*` ke backend — ini esensial agar cookie sesi `laravel-session` dan `XSRF-TOKEN` ditetapkan di domain `localhost:3000` (tanpa proxy, cookie dari `localhost:8000` tidak dapat diakses).
5. **Frontend menggunakan `apiClient` (axios)** dengan `withCredentials: true` dan `withXSRFToken: true` untuk CSRF protection. `API_URL` = `/api/v1` (relatif, via proxy), `CSRF_URL` = `/sanctum/csrf-cookie`.
6. **Semua state-changing request** melalui `apiClient` — tidak ada raw `fetch` kecuali untuk font lokal dan file download PDF yang sudah diperbaiki.
7. **File `storage/{path}` tanpa auth** — untuk melayani dokumen/photo yang di-upload. Path di-randomisasi (40-hex) sebagai mitigasi.
8. **`next.config.ts`** memiliki security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy) dan `images.remotePatterns` untuk localhost:8000.
9. **Tidak ada Events/Listeners/Notifications/Policies/Traits/Helpers** di backend — semua logika ada di Controller, Service, atau Model.
10. **`project_flow.md`** ini adalah versi terbaru yang mencerminkan state sistem setelah audit dan perbaikan menyeluruh.

---

## Modul yang Tidak Ada

> Appointment, ASN, Yard, Gates Master, Receiving Schedule, Put Away, Opname (non-expired), FEFO, Aplikasi Mobile — **tidak ada** dalam sistem ini dan tidak didokumentasikan. `onezentra-mobile-flutter/` telah dihapus dari proyek.

---

## Referensi

- `THL_RETRIBUSI_SYSTEM_FLOW.md` — Dokumentasi alur THL retribusi yang lebih detail
- `AGENTS.md` (root & onezentra-web) — Instructions for AI agents
- `.ai/rules/` — Project-specific rules
- `node_modules/next/dist/docs/` — Next.js 16 documentation
