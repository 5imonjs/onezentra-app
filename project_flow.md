# ONEZENTRA Warehouse System — Dokumentasi Alur & Proses

Aplikasi ini adalah sistem manajemen gudang (ONEZENTRA) berbasis **Web (Next.js frontend + Laravel backend/API)**. Dokumen ini hanya menggambarkan modul dan proses yang benar-benar ada dan terhubung di sistem berjalan.

## Modul yang Ada di Sistem (Menu)

| Menu | Route (/…/v1) | Fungsi |
|------|---------------|--------|
| Dashboard | *(halaman frontend)* | Ringkasan informasi — dirender **client-side** di Next.js dari data auth store (tidak ada endpoint `/api/v1/dashboard`) |
| Penerimaan | `penerimaan` | Validasi data produk per Depo (master data stok NPN) |
| Validasi Dokumen | `sj-validations` | Validasi dokumen (SJ/BA) oleh Cheker |
| NPN | `npn` | Master katalog produk |
| Standarisasi Tumpukan | `standarisasi-tumpukan` | Standar cara tumpuk |
| Standar Umur Produk | `standar-umur-produk` | Standar umur/expired produk |
| Rencana Kirim | `rencana-kirim` | Pembuatan & penjadwalan rencana kirim (Admin Planner) |
| Gate Check | `gate-transactions` | Check-in / check-out kendaraan |
| Receiving | `receivings` | Proses bongkar & penerimaan barang di dock, generate batch |
| Roles & Permissions | `roles`, `permissions` | Pengaturan RBAC (halaman `/permissions` adalah alias/tab dari `/roles`) |
| Users | `users` | Pengelolaan user |
| Setting Email | `email-settings` | Konfigurasi SMTP |
| Penerima Email | `email-recipients` | TO/CC penerima notifikasi per dokumen |
| Laporan Selisih Qty | `reports` | Laporan selisih qty (filter depo + rentang tanggal), ekspor **Excel (.xlsx)** |
| Opname Expired | `opname-expired` | Monitoring batch mendekati kedaluwarsa, generate mingguan, threshold otomatis, ekspor Excel |
| Laporan Opname Expired | `reports/opname-expired` | Laporan read-only status expired per depo & minggu |

> Modul (mis. appointment, ASN, yard, gates master, receiving schedule, put away, opname, FEFO, aplikasi mobile) **tidak ada** dalam sistem ini dan tidak didokumentasikan.

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
   (rencana_kirim di-set ke VERIFIED — COMPLETED rencana_kirim ditetapkan dari
    selesainya proses Receiving/final)
```

**Penting:** Validasi SJ adalah proses **verifikasi fisik** bahwa barang yang datang sesuai rencana kirim. Data yang dicatat di validasi (actual_qty, condition, expired_date, barcode) **diteruskan otomatis** ke Receiving — tidak perlu scan ulang di tahap receiving.

Field API untuk scan item validasi (`POST /sj-validations/{sjValidation}/scan`):

- `sj_validation_item_id` (wajib, id item hasil snapshot) — **bukan** scan by `kode_barang`.
- `actual_qty` (wajib angka) — dibandingkan dengan `expected_qty` → status item menjadi `VALIDATED` (cocok) atau `MISMATCH` (selisih).
- `expired_date` (opsional), `condition` (`GOOD|DAMAGED|MISSING`), `barcode` (opsional), `notes` (opsional).
- Idempoten: scan ulang pada `sj_validation_item_id` yang sama tidak membuat batch duplikat (hanya satu `batches.sj_validation_item_id` per item).

### 2b. Batch per Produk & Cetak Label (fondasi untuk aplikasi mobile)

Saat Cheker selesai memvalidasi **satu item produk** (`scanItem` / "Simpan Validasi"), sistem otomatis membuat **satu row `batches` untuk produk tsb** (relasi `sj_validation_items.batch` → `batches`), berisi `batch_number` (`BATCH-XXXXXXXX`) + `barcode_label` (`LBL-XXXXXXXX`). Ini berbeda dari `Receiving` yang membuat satu batch berisi snapshot banyak item.

- Migrasi `make_batches_receiving_nullable_add_validation_item`: kolom `batches.receiving_id` dibuat **nullable** + ditambah `batches.sj_validation_item_id` (index).
- `app/Models/Batch.php`: `sj_validation_item_id` fillable + relasi `validationItem()`.
- `app/Models/SjValidationItem.php`: relasi `batch()` (HasOne).
- `SjValidationController`: `scanItem` membuat batch per item bila belum ada; `show()` & `complete()` eager-load `items.batch` sehingga tiap item mengembalikan `batch.batch_number` & `batch.barcode_label`.

**Cetak label batch** (frontend `validasi-sj`, "Cetak Label" per item — fondasi untuk mobile):

- Format label: **QR code** (encode `batch_number`) + teks (`nama_barang`, `batch_number`, `barcode_label`, `qty`, `satuan`).
- `src/lib/bluetoothPrint.ts`: builder byte **ESC/POS** (init, center, bold, **QR via `GS ( k`**, feed, potong `GS V`) + `printLabelViaBluetooth()` via **Web Bluetooth** + `buildBrowserPrintHtml()` (dialog print browser / fallback) + `isWebBluetoothSupported()`.
  - **Catatan**: Web Bluetooth hanya jalan di Chrome/Edge desktop. Untuk **aplikasi mobile**, builder byte ESC/POS & format QR/teks ini tinggal di-port ke Bluetooth native (mis. `flutter_blue_plus` / React Native `react-native-ble-plx`) — format datanya sudah siap dipakai ulang.
- `src/components/LabelPrinter.tsx`: komponen cetak label reusable — preview **QR**, opsi ukuran (80mm / 58mm / custom), tombol "Cetak Bluetooth" (ESC/POS) & "Cetak Browser", deteksi dukungan Web Bluetooth.

### 3. Penerimaan

Modul terpisah untuk validasi data produk per Depo (master data stok NPN), berbeda dari proses Receiving bongkar truck.

## Tabel Database yang Ada

| Table | Keterangan |
|-------|------------|
| `users` | User: kode/nama depo, level, status, 2FA |
| `npn` | Katalog produk NPN |
| `penerimaan` | Validasi penerimaan data produk |
| `standar_umur_produk` | Standar umur produk |
| `standarisasi_tumpukan` | Standarisasi tumpukan — ber-relasi ke `npn` via **`npn_id`** (FK, `nullOnDelete`), kolom BOSnet denormal dihapus. Berisi `tier`, `tinggi_tumpukan`, `total_tier_tinggi`, `status` (`pending`/`approved`/`rejected`), `requested_by`/`approved_by` (email), `kode_depo`, `nama_depo` |
| `rencana_kirim` + `rencana_kirim_items` | Rencana kirim (state machine) + item. Header memiliki **`jenis_kendaraan`** (tipe kendaraan, teks) — kubikasi muatan **tidak disimpan** di tabel (lihat §Kubikasi) |
| `docks` | Master dock (AVAILABLE/OCCUPIED) |
| `gate_transactions` | Transaksi masuk/keluar gate |
| `receivings` + `receiving_items` | Receiving/unload + item (diisi dari data validasi SJ: actual_qty, condition, expired_date, barcode) |
| `batches` | Batch otomatis saat receiving selesai **dan** batch per produk saat validasi SJ (`sj_validation_item_id`) |
| `sj_validations` + `sj_validation_items` | Validasi dokumen (SJ/BA) cheker + item |
| `email_settings` | Konfigurasi SMTP (satu baris) |
| `email_recipients` | Penerima notifikasi TO/CC per jenis dokumen |
| `opname_expired_waves` | Batch opname expired mingguan — auto-generated dari receiving_items, status otomatis (AMAN/PERHATIAN/KRITIS/EXPIRED) berdasarkan sisa hari & threshold |
| `opname_settings` | Threshold konfigurable: `threshold_aman` (default 90 hari), `threshold_perhatian` (default 30 hari), `threshold_kritis` (default 7 hari) |
| `permissions`, `roles`, `role_user`, `role_permission` | RBAC |
| `sessions` | Sesi login cookie Sanctum (driver database) |
| `personal_access_tokens` | Tidak dipakai aktif (auth murni cookie); hanya sisa historis yang kedaluwarsa otomatis |

## Verifikasi Alur End-to-End (uji langsung via API)

Alur di bawah sudah diuji langsung terhadap API berjalan (`/api/v1`) dan seluruhnya berhasil. Semua endpoint memakai `auth:sanctum` + middleware `permission:*`; autentikasi murni berbasis cookie sesi Sanctum (stateful) — login **tidak** menerbitkan Bearer token dan frontend tidak mengirim header `Authorization`.

### 1. LOGIN

`POST /api/v1/login` → `{email, password}`.

- Berhasil: `200` → `{ message, user, permissions }`. Sesi disimpan sebagai cookie (`laravel-session` + XSRF); semua request berikutnya otomatis membawa cookie (`withCredentials`).
- Password salah: `422` (validasi) — login ditolak.
- Sesi kedaluwarsa: API menjawab `401` → frontend me-reload ke `/login?expired=1`. Halaman non-`/login` tanpa cookie sesi di-redirect ke `/login` oleh `onezentra-web/src/proxy.ts`.

`POST /api/v1/logout` → `200` mengakhiri sesi server + membersihkan sisa token.

Contoh user resmi (password `password` untuk akun bawaan; password baru/baru diubah wajib min 8 karakter): `admin@onezentra.com` (admin_master, user level admin dengan akses penuh **44 permission**), lalu `stafflogistic`, `rlh`, `rfah`, `rh`, `blc`, `bac`, `admindistribusi`, `adminplanner`, `cheker` (semua berdomain `@onezentra.com`, di-seed oleh `UserSeeder`). Selain itu ada 10 akun depo Singkawang berdomain `.singkawang@onezentra.com` (kode depo `0127`), di-seed oleh `SingkawangDepotSeeder`.

> Jumlah permission per user mengikuti pengaturan RBAC yang dikelola dari dashboard (`roles` → `role_permission`). Jumlahnya dapat berubah saat role di-sync, jadi angka 44 di atas hanya kondisi saat dokumentasi ini ditulis.

### 2. MEMBUAT USER (sesuai level/role)

`POST /api/v1/users` → wajib `kode_depo`, `nama_depo`, `full_name`, `email` (unik), `password` (min 8 karakter), `level`.

- `level` divalidasi ketat: `admin_master, staff_logistic, rlh, rfah, rh, blc, bac, admin_distirbusi, admin_planner, cheker`. Level selain itu → `422`.
- Sistem otomatis menyambungkan user ke **role yang slug-nya sama dengan level** (`role_id` terisi + pivot `role_user`), sehingga permission user mengikuti role tsb.
- Berhasil: `201` → `{ message, data }` berisi user + relasi `roles`.

### 3. ROLES & PERMISSIONS

- `GET /api/v1/permissions` → daftar semua permission (id, slug, menu_group, dll).
- `POST /api/v1/roles` → buat role (`name`, `slug`, `description`).
- `PUT /api/v1/roles/{id}/permissions` → sync permission **dengan array `permission_ids`** ke role tsb (memanggil endpoint `GET /api/v1/roles/{id}/permissions` untuk melihat hasil assigned true/false).
- Hak akses akhir seorang user = permission dari role yang dipunyainya (RBAC murni, via `role_permission`).

### 4. RENCANA KIRIM → GATE → VALIDASI → RECEIVING s/d SELESAI

Urutan transisi status (transisi tidak sah → HTTP 422):

```text
POST /rencana-kirim                          → status DRAFT
POST /rencana-kirim/{id}/schedule            → SCHEDULED
Gate Check via POST /gate-transactions (gate_type=INBOUND) → CHECKED_IN
POST /sj-validations/start/{rencanaKirim}    → mulai validasi SJ (snapshot item)
POST /sj-validations/{id}/scan               → input qty aktual, kondisi, expired per item
POST /sj-validations/{id}/complete           → validasi COMPLETED, rencana_kirim → VERIFIED,
                                            Receiving + ReceivingItems di-create OTOMATIS (PENDING)
POST /receivings/{id}/complete  (barcode) → receiving COMPLETED, dock AVAILABLE,
                                           rencana_kirim COMPLETED, batch BATCH-XXXX di-generate,
                                           email "Proses Bongkar Selesai" (ReceivingCompleted) ke BLC + CC
```

**Catatan penting:** Setelah validasi SJ selesai (`POST /sj-validations/{id}/complete`), Receiving + ReceivingItems **di-create otomatis** dari data validasi. Cheker tidak perlu manual buat Receiving — cukup buka menu Receiving, scan barcode PO Transporter, dan klik "Selesai Bongkar".

Catatan: status `CHECKED_IN` dihasilkan dari gate in (`/gate-transactions` INBOUND), status `VERIFIED` dihasilkan saat validasi dokumen (SJ) diselesaikan dari status `CHECKED_IN` (atau via `/verify`), dan status `COMPLETED` rencana_kirim dihasilkan dari selesainya receiving — bukan dari endpoint terpisah pada rencana_kirim. Validasi SJ hanya bisa dimulai dari rencana `SCHEDULED`/`CHECKED_IN`/`VERIFIED`; scan, hapus item, dan cancel validasi hanya saat validasi `IN_PROGRESS`.

Catatan hasil uji:
- `POST /rencana-kirim` menerima header rencana + `items[]`; setiap item **wajib** berisi `item_number` (urutan mulai 1), `kode_barang`, `nama_barang`, `jumlah` (wajib lebih dari 0), `satuan` (opsional `keterangan`); `total_qty` dihitung otomatis dari jumlah item. Tanpa `item_number` → validasi `422`.
- Nama field API header rencana mengikuti kolom tabel: `rkh_number` (Nomor RKH = tanggal rencana kirim), `rkh_date` (Tanggal RKH), `no_dokumen` (No. Dokumen/SJ-PO transporter), `no_dokumen_date`, `driver_name`, `nopol`, **`jenis_kendaraan`** (opsional, tipe kendaraan: CDD/CDE/L300/FUSO/TRONTON/CONTAINER 20 FT/CONTAINER 40 FT/LAINNYA — hanya label, tanpa perhitungan kapasitas), `expedisi`, `dock_number`, `shipper_*`, `destination_*`, `kode_depo`, `nama_depo`, `notes`.
- **Penting:** `rkh_number` adalah **tanggal** rencana kirim (bukan nomor PO Transporter). Barcode yang di-scan di menu Receiving adalah `no_dokumen` (nomor PO Transporter/SJ/BA).
- `POST /sj-validations/{id}/complete` sekarang juga **auto-create Receiving + ReceivingItems** dari data validasi (actual_qty, condition, expired_date, barcode). Receiving dibuat dengan status `PENDING`. Jika sudah ada Receiving PENDING/IN_PROGRESS untuk rencana yang sama, tidak dibuat duplikat.
- Quick Scan di menu Receiving mencari berdasarkan `no_dokumen` atau `driver_name` (tanpa filter status) — sehingga Receiving PENDING yang baru di-auto-create juga bisa ditemukan.
- `POST /receivings/{id}/complete` wajib mengirim `barcode`; barcode harus cocok dengan `no_dokumen` rencana (jika tidak → `422` "Barcode tidak cocok...") — ini adalah konfirmasi bongkar selesai berbasis barcode No. PO Transporter dari printout SJ. Saat cocok: menghasilkan **batch** (`BATCH-XXXXXXXX`) berisi snapshot `items_json`, melepas dock kembali `AVAILABLE`.
- Endpoint scan per-item `POST /receivings/{id}/scan` masih tersedia di API namun **tidak dipakai** oleh UI (mengikuti alur sederhana: data sudah ada dari validasi SJ, konfirmasi barcode PO transporter untuk selesai).
- `GET /rencana-kirim/{id}` (detail) memuat relasi `items.npn`, `gateTransactions`, `receivings.items.rencanaKirimItem.npn`, `creator`.
- **Validasi state Gate** (`POST /gate-transactions`, mulai 6 Sep 2026): `INBOUND` hanya diterima saat rencana berstatus `SCHEDULED`; `OUTBOUND` hanya saat rencana berstatus `COMPLETED` (sudah lewat receiving). Setiap tipe gate hanya tercatat sekali per rencana (duplikat ditolak `422`). Selain itu ditolak `422`. Hal ini menjaga agar gate tidak bisa melewati alur validasi/receiving.
- `dock_number` pada rencana_kirim adalah **teks bebas** (kolom, diisi planner). Dock fisik dihubungkan saat Receiving lewat `dock_id` → `docks.id` (master dock memakai kolom `name` seperti `DOCK-01` dan status `AVAILABLE`/`OCCUPIED`).
- **Kubikasi muatan (derived, tidak disimpan di DB):** `kubikasi` per item dan `total_kubikasi` pada header **dilampirkan** di respons `POST /`, `GET /{id}`, `PUT /`, dan `GET /`. Rumus: `kubikasi (m³) = jumlah × npn.decVolume × npn.SAPdecUom ÷ 1.000.000`, dengan `decVolume` = volume produk per pcs (cm³, dihitung dari L×W×H ÷ pcs per satuan) dan `SAPdecUom` = jumlah pcs per satuan (mis. CRT=60). Pencarian produk `GET /npn/search-product` mengembalikan `decVolume` & `SAPdecUom` agar form dapat menghitung total kubikasi live.
- **Standarisasi Tumpukan (validasi SJ):** data standarisasi terbaru per produk dilampirkan sebagai `standarisasi` pada setiap item snapshot validasi via lookup `npn_id` → tabel `standarisasi_tumpukan` (status `pending`/`approved`/`rejected`). Saat cheker mengisi `tier` & `tinggi_tumpukan` pada scan item, sistem meng-*upsert* record `pending` (total_tier_tinggi = tier × tinggi) via `npn_id` yang sedang divalidasi — **bukan** lookup kolom BOSnet.

### 5. SETTING EMAIL (konfigurasi SMTP)

- `GET /api/v1/email-settings` → config SMTP saat ini (satu baris); default `from_system_env=true`, `is_active=false`.
- `PUT /api/v1/email-settings` → simpan `host`, `port`, `username`, `password` (disimpan ter-hash bcrypt), `encryption`, `from_address`, `from_name`, `is_active`.
- `POST /api/v1/email-settings/test` → `{to}` uji kirim; berhasil `200` `{"message":"Email test sent"}` (pengiriman riil bergantung SMTP yang tersedia).

### 6. PENERIMA EMAIL (TO/CC notifikasi per dokumen)

- `GET /api/v1/email-recipients/options` → tersedia `document_types: [rencana_kirim, sj_ba, receiving, selisih]`, `triggers: [created, validated, completed, selisih_qty]`, `fields: [TO, CC]`, daftar `users` dan `roles`.
- `POST /api/v1/email-recipients` → wajib `document_type` (`rencana_kirim`/`sj_ba`/`receiving`/`selisih`), `trigger` (`created`/`validated`/`completed`/`selisih_qty`), `recipient_type` (`email`/`user`/`role`), `field` (`TO`/`CC`) + isi sesuai jenis (mis. `email`, `user_id`, atau `role_slug`). Field yang tidak valid → `422`.
- Contoh teruji: `rencana_kirim / created / email / TO → blc@onezentra.com`, dan `sj_ba / validated / role / CC → role cheker`, serta `receiving / completed / role / TO → blc` + `/CC → admin_distirbusi`. Email "Proses Bongkar Selesai" dikirim saat `POST /receivings/{id}/complete`. Penerima dengan `document_type=selisih`, `trigger=selisih_qty` menerima **email notifikasi selisih qty** yang dikirim otomatis saat Cheker menyelesaikan validasi SJ (`POST /sj-validations/{id}/complete`) bila ada item dengan `selisih_qty != 0`.
- `GET /api/v1/email-recipients` → daftar penerima.

## FLOW DETAIL ADMIN PLANNER: RENCANA KIRIM

Bagian ini menjadi panduan kerja Admin Planner saat membuat dan meneruskan rencana pengiriman sampai siap diproses oleh Security dan Cheker.

### 1. TANGGUNG JAWAB ADMIN PLANNER

Admin Planner bertanggung jawab untuk:

- Menentukan tanggal rencana pengiriman melalui kalender.
- Mengisi identitas dokumen: No. Dokumen (SJ/BA = nomor PO transporter), nomor RKH, dan tanggal RKH.
- Mengisi data kendaraan, driver, ekspedisi, dan dock bila sudah ditentukan.
- Menentukan pengirim dan tujuan pengiriman.
- Memilih produk dari database NPN.
- Memastikan kode barang terisi dari `BOSnetszProductId` NPN.
- Memasukkan jumlah, satuan, dan keterangan setiap produk.
- Meninjau total barang dan catatan sebelum menyimpan.
- Menjadwalkan rencana yang sudah lengkap.
- Memantau status sampai rencana diteruskan ke proses Gate dan Receiving.

Admin Planner tidak melakukan scan gate, pemeriksaan fisik kendaraan, atau penerimaan fisik barang. Tahap tersebut dilakukan oleh Security dan Cheker.

### 2. PRAKONDISI SEBELUM MEMBUAT RENCANA

Sebelum membuka form, planner menyiapkan:

| Data | Keterangan | Wajib secara operasional |
|------|------------|--------------------------|
| No. Dokumen (SJ/BA = PO transporter) | Nomor dokumen pengiriman | Ya |
| Nomor RKH | Identitas rencana harian dan sumber barcode dokumen | Ya |
| Tanggal RKH | Tanggal rencana pengiriman | Ya |
| Nama driver | Nama pengemudi kendaraan | Ya sebelum dijadwalkan |
| Ekspedisi | Nama ekspedisi atau identitas transporter | Ya sebelum dijadwalkan |
| Nopol | Nomor kendaraan | Ya sebelum dijadwalkan |
| Pengirim | Nama dan alamat asal barang | Ya |
| Tujuan | BU, DC, atau depo penerima | Ya |
| Produk | Produk yang dikirim dan jumlahnya | Minimal satu item |

### 3. MEMBUKA FORM MELALUI KALENDER

```text
Planner membuka menu Rencana Kirim
    ↓
Planner memilih bulan yang sesuai
    ↓
Planner memilih tanggal pengiriman pada kalender
    ↓
Sistem membuka form Create Rencana Kirim
    ↓
Tanggal RKH otomatis mengikuti tanggal kalender
```

Kalender adalah pintu utama pembuatan rencana. Tombol tambah rencana di header tidak digunakan agar tanggal rencana selalu berasal dari pilihan kalender.

### 4. PENGISIAN FORM SECARA BERURUTAN

#### Langkah 1: Informasi Dokumen

Isi:

1. No. Dokumen (SJ/BA = nomor PO transporter).
2. Nomor RKH.
3. Tanggal RKH.

*(Mapping ke field API — lihat "Catatan hasil uji" §4: `no_dokumen`, `rkh_number`, `rkh_date`, `no_dokumen_date`.)*

Aturan:

- Nomor RKH harus unik dan mudah dibaca.
- Nomor RKH digunakan sebagai teks dan barcode pada PDF Surat Jalan.
- Tanggal RKH harus sesuai dengan tanggal yang dipilih pada kalender.
- Jika tanggal diubah manual, planner harus memastikan tanggal tersebut tetap sesuai jadwal operasional.

#### Langkah 2: Kendaraan dan Driver

Isi:

1. Nama driver.
2. Nama ekspedisi atau transporter.
3. Plat nomor kendaraan.
4. **Jenis kendaraan (tipe pengiriman)** — CDD/CDE/L300/FUSO/TRONTON/CONTAINER 20 FT/CONTAINER 40 FT/LAINNYA (hanya label, tidak dicocokkan dengan kapasitas).
5. Nomor dock jika sudah ditentukan.

Aturan:

- Plat nomor ditulis konsisten, misalnya `B 1234 BG`.
- Data ini akan dibaca Security saat validasi kendaraan di Gate.
- Jika dock belum ditentukan, field dapat dikosongkan sesuai kebijakan operasional.

#### Langkah 3: Pengirim dan Tujuan

Isi bagian Pengirim:

- Nama pengirim.
- Alamat lengkap pengirim.
- Nomor HP pengirim.

Isi bagian Tujuan:

- Nama tujuan pada field Kepada Yth.
- Kode depo tujuan jika ada.
- Nama depo tujuan untuk label penerima dan tanda tangan.

Aturan penulisan alamat:

- Satu informasi alamat ditulis dalam urutan yang logis: nama, jalan, kelurahan/kecamatan, kota, dan telepon.
- Gunakan textarea untuk alamat panjang.
- Hindari memasukkan nama perusahaan berulang di dalam alamat.
- PDF akan membungkus alamat panjang ke baris berikutnya secara otomatis.

#### Langkah 4: Daftar Barang

Untuk setiap baris barang:

```text
Klik atau fokus pada Nama Barang
    ↓
Ketik nama produk
    ↓
Sistem mencari pada NPN.szNickName atau NPN.szNickNameNew
    ↓
Planner memilih hasil yang benar
    ↓
Sistem mengisi npn_id, nama barang, dan Kode Barang
    ↓
Kode Barang diambil dari NPN.BOSnetszProductId
    ↓
Planner mengisi jumlah, satuan, dan keterangan
```

Aturan penting:

- Jangan mengetik atau mengubah Kode Barang secara manual.
- Kode Barang harus berasal dari produk NPN yang dipilih.
- Jika nama produk tidak ditemukan, periksa ejaan atau data NPN terlebih dahulu.
- Jangan menyimpan baris produk yang belum memiliki produk NPN.
- Jumlah wajib lebih dari 0 (baris dengan jumlah 0 ditolak saat simpan).
- Tambahkan baris baru hanya untuk produk yang berbeda.
- Hapus baris kosong atau baris yang tidak digunakan.
- **Kubikasi:** form menampilkan total kubikasi muatan (m³) yang dihitung live dari `jumlah × decVolume × pcs-per-satuan ÷ 1.000.000` per produk NPN yang dipilih (nilai `decVolume`/`SAPdecUom` diambil dari hasil pencarian NPN). Hanya angka total yang ditampilkan.
- Periksa total jumlah sebelum menyimpan.

**Import Barang** (alternatif input manual, tombol "Import Barang" di header Daftar Barang):

```text
Klik "Import Barang" → unduh template bila perlu (5 kolom:
Kode Barang, Nama Barang, Jumlah, Satuan, Keterangan)
    ↓
Upload file Excel → POST /rencana-kirim/import-items
    ↓
Backend mencocokkan tiap baris ke NPN (via Kode Barang dulu,
lalu Nama Barang); baris yang tidak cocok dilewati (skip)
    ↓
Barang yang cocok otomatis masuk ke tabel Daftar Barang,
planner tetap bisa mengedit jumlah/satuan sebelum Simpan Rencana
```

#### Langkah 5: Catatan

Catatan dipakai untuk informasi operasional tambahan, misalnya:

- Instruksi khusus bongkar muat.
- Kondisi pengiriman.
- Informasi dokumen pendukung.
- Keterangan untuk Security atau Cheker.

Catatan tidak menggantikan data utama seperti nomor dokumen, tujuan, produk, atau jumlah.

### 5. PEMERIKSAAN SEBELUM SIMPAN

Sebelum menekan **Simpan Rencana**, planner melakukan checklist berikut:

- No. Dokumen (SJ/BA) sudah benar.
- Nomor RKH sudah benar dan tidak tertukar dengan tanggal.
- Tanggal RKH sesuai kalender.
- Nama driver dan Nopol sesuai dokumen.
- Pengirim dan tujuan lengkap.
- Setiap produk berasal dari hasil pencarian NPN.
- Setiap produk memiliki Kode Barang.
- Jumlah setiap produk sudah benar dan lebih dari 0 (nol ditolak sistem).
- Satuan sudah sesuai.
- Total jumlah sudah sesuai dokumen.
- Catatan sudah diisi jika ada instruksi khusus.

Jika checklist belum terpenuhi, rencana tetap dianggap belum siap untuk dijadwalkan.

### 6. STATUS RENCANA KIRIM

```text
DRAFT
  ↓ planner menyimpan data rencana
SCHEDULED
  ↓ Security melakukan check-in kendaraan
CHECKED_IN
  ↓ Cheker memulai & menyelesaikan validasi SJ (produk, qty, kondisi)
  ↓ Receiving + ReceivingItems di-create OTOMATIS dari data validasi (PENDING)
VERIFIED
  ↓ Cheker buka menu Receiving → scan barcode → konfirmasi bongkar selesai
IN_PROGRESS
  ↓ Semua item selesai diterima
COMPLETED
```

Status tambahan:

- `CANCELLED`: rencana dibatalkan dan tidak boleh diteruskan ke proses berikutnya.

Makna status bagi Admin Planner:

| Status | Arti | Tindakan Planner |
|--------|------|------------------|
| DRAFT | Data sudah tersimpan tetapi belum dijadwalkan | Periksa ulang lalu jadwalkan |
| SCHEDULED | Rencana siap ditunggu kedatangan kendaraan | Informasikan ke Security/Cheker |
| CHECKED_IN | Kendaraan sudah masuk Gate | Pantau proses validasi SJ |
| VERIFIED | Validasi SJ selesai, siap diproses Receiving | Pantau proses receiving |
| IN_PROGRESS | Barang sedang diterima | Tindak lanjuti selisih jika ada |
| COMPLETED | Receiving selesai | Arsipkan atau lanjutkan pelaporan |
| CANCELLED | Rencana tidak berlaku | Jangan diproses kembali |

Status tidak dapat diubah secara bebas. Pindah status hanya boleh lewat transisi yang sah (`DRAFT→SCHEDULED→CHECKED_IN→VERIFIED→IN_PROGRESS→COMPLETED`, atau `→CANCELLED` dari status yang belum selesai). Endpoint `PUT /{rencana_kirim}` tidak menerima field `status`; perubahan status harus melalui endpoint `schedule`, `verify`, atau `cancel`. Jika transisi tidak sah, sistem menolak dengan HTTP 422.

### 7. AKSI YANG TERSEDIA DI DAFTAR

Pada kolom Aksi, planner dapat:

- Melihat detail rencana.
- Menjadwalkan rencana berstatus `DRAFT`.
- Membatalkan rencana yang belum selesai.
- Menghapus rencana sesuai hak akses dan konfirmasi.
- Membuka Preview Surat Jalan.
- Mengunduh Surat Jalan PDF.

Preview & unduhan Surat Jalan dilakukan **di browser** (client-side `jsPDF`, lihat §8) — tidak ada request ke endpoint backend untuk membuat PDF.

Penghapusan harus dilakukan hati-hati karena detail item rencana_kirim ikut terhapus. Untuk rencana yang sudah masuk proses receiving, pembatalan atau penghapusan harus mengikuti kebijakan supervisor.

### 8. SURAT JALAN DAN BARCODE RKH

> **Lokasi implementasi:** Surat Jalan PDF **tidak** dibuat oleh endpoint backend. Seluruh preview & unduhan PDF dirender **client-side di frontend** via `jsPDF` (berkas `onezentra-web/src/lib/suratJalanPdf.ts`, fungsi `previewSuratJalan` / `downloadSuratJalan`), memakai data rencana dari `GET /api/v1/rencana-kirim/{id}`. Karena itu tidak ada route `surat-jalan`/`download` di API.

Setelah data tersedia, Surat Jalan menampilkan:

- Nomor RKH.
- Barcode yang dibuat dari nomor RKH yang sama (digambar sebagai **Code 39** di `suratJalanPdf.ts`).
- Nama driver.
- No. Dokumen (SJ/BA = nomor PO transporter).
- Pengirim, alamat, dan telepon.
- Tujuan dan kendaraan.
- Detail produk: No, Kode Barang, Nama Barang, Jumlah, Satuan, dan Keterangan.
- Total jumlah barang.
- Catatan.
- Area tanda tangan Pengirim, Mengetahui, Supir, dan Penerima.

Jumlah baris produk pada PDF mengikuti jumlah item yang benar-benar diinput. Alamat panjang dibungkus ke baris baru dan tidak boleh keluar dari kotak alamat.

### 9. SERAH TERIMA KE SECURITY DAN CHEKER

```text
Planner menyimpan rencana (status DRAFT) → email notifikasi ke BLC/CC terkirim
    ↓
Planner menjadwalkan rencana → status SCHEDULED
    ↓
Security/login Gate mencari berdasarkan SJ/RKH/plat atau barcode dokumen
    ↓
Security melakukan Gate In → status CHECKED_IN (gate_transactions INBOUND)
    ↓
Cheker memulai Validasi SJ → scan dokumen, snapshot item
    ↓
Cheker memvalidasi setiap item → input qty aktual, kondisi, expired date
    ↓
Cheker menyelesaikan Validasi → status VERIFIED, email notifikasi terkirim,
    Receiving + ReceivingItems di-create OTOMATIS dari data validasi (PENDING)
    ↓
Cheker buka menu Receiving → scan barcode PO Transporter → temukan Receiving
    ↓
Cheker klik "Selesai Bongkar" → Receiving COMPLETED, dock AVAILABLE, batch di-generate
    ↓
Planner memantau status akhir COMPLETED
```

### 10. PENANGANAN KONDISI KHUSUS

**Produk tidak ditemukan di NPN**

- Jangan membuat kode barang sendiri.
- Cari menggunakan nama alternatif pada `szNickNameNew`.
- Minta Admin NPN memperbaiki master data jika tetap tidak ditemukan.

**Kode Barang kosong setelah memilih produk**

- Hapus pilihan barang.
- Cari dan pilih ulang produk NPN.
- Pastikan `BOSnetszProductId` tersedia pada data NPN.

**Alamat terlalu panjang**

- Pecah alamat menggunakan baris baru pada input.
- Gunakan urutan alamat yang jelas.
- PDF akan melanjutkan teks ke baris berikutnya.

**Kendaraan atau driver berubah**

- Perbarui data sebelum status `CHECKED_IN`.
- Informasikan perubahan kepada Security.
- Jangan membuat rencana baru jika hanya terjadi perubahan administratif dan rencana lama masih valid.

**Jumlah barang berbeda dengan fisik**

- Planner tidak mengubah jumlah secara sepihak setelah receiving dimulai.
- Cheker mencatat jumlah aktual.
- Selisih ditindaklanjuti sesuai prosedur approval dan audit.

### 11. ENDPOINT YANG DIGUNAKAN MODUL RENCANA KIRIM

Semua endpoint berada di bawah prefix `/api/v1/rencana-kirim`, memerlukan autentikasi (`auth:sanctum`) serta permission yang sesuai (`permission:...`):

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/` | Daftar rencana kirim, pencarian, filter status, dan tanggal | `rencana_kirim.view` |
| POST | `/` | Membuat rencana kirim beserta item | `rencana_kirim.create` |
| GET | `/{rencana_kirim}` | Melihat detail rencana dan relasinya | `rencana_kirim.view` |
| PUT | `/{rencana_kirim}` | Memperbarui data rencana & item (tidak mengubah `status`) | `rencana_kirim.edit` |
| DELETE | `/{rencana_kirim}` | Menghapus rencana dan item terkait | `rencana_kirim.delete` |
| POST | `/{rencana_kirim}/schedule` | Status → `SCHEDULED` (wajib dari `DRAFT`) | `rencana_kirim.edit` |
| POST | `/{rencana_kirim}/verify` | Status → `VERIFIED` (wajib dari `CHECKED_IN`) | `rencana_kirim.edit` |
| POST | `/{rencana_kirim}/cancel` | Status → `CANCELLED` | `rencana_kirim.edit` |
| GET | `/template` | Unduh template Excel import rencana kirim lengkap | `rencana_kirim.view` |
| POST | `/import` | Import banyak rencana kirim dari Excel (kelompok per No. PO Transporter) | `rencana_kirim.import` |
| GET | `/item-template` | Unduh template Excel import daftar barang (5 kolom) | `rencana_kirim.view` |
| POST | `/import-items` | Resolve daftar barang Excel ke NPN, hasilnya dimasukkan ke form Daftar Barang | `rencana_kirim.import` |

> Catatan: status `CHECKED_IN` ditetapkan lewat Gate Check (`POST /gate-transactions`, `gate_type=INBOUND`); status `VERIFIED` ditetapkan lewat `POST /{rencana_kirim}/verify`, saat Cheker menyelesaikan validasi dokumen SJ (`POST /sj-validations/{id}/complete`), atau saat Receiving dibatalkan (kembali ke `VERIFIED`); status `COMPLETED` hanya ditetapkan saat Receiving selesai (`POST /receivings/{id}/complete`). Endpoint rencana_kirim tidak menyediakan `check-in`/`complete` karena sudah ditangani modul terkait.

Admin Planner memiliki `rencana_kirim.view`, `rencana_kirim.create`, `rencana_kirim.edit`, dan `rencana_kirim.delete`, sehingga mampu membuat, mengedit, menjadwalkan, dan menghapus rencana. Aksi operasional di Gate (check-in) dan Receiving dikerjakan oleh peran Security/Cheker, bukan Planner.

### 12. HASIL AKHIR YANG DIHARAPKAN

Admin Planner dianggap berhasil menyelesaikan tugas apabila:

1. Rencana dibuat pada tanggal kalender yang benar.
2. Dokumen, kendaraan, pengirim, dan tujuan lengkap.
3. Semua produk terhubung ke NPN.
4. Kode Barang berasal dari `BOSnetszProductId`.
5. Total jumlah sesuai dokumen.
6. Surat Jalan dapat dipreview dan diunduh.
7. Status rencana berubah menjadi `SCHEDULED`.
8. Security dan Cheker dapat melanjutkan proses tanpa klarifikasi data dasar.

## ALUR MODUL OPNAME EXPIRED

### 1. Konsep

Modul ini memantau batch produk yang mendekati kedaluwarsa. Sistem secara otomatis mengklasifikasikan setiap batch berdasarkan **sisa hari** hingga expired date ke dalam 4 status:

| Status | Sisa Hari | Keterangan |
|--------|-----------|------------|
| **AMAN** | ≥ `threshold_aman` (default 90) | Stok aman, jalankan FIFO normal |
| **PERHATIAN** | ≥ `threshold_perhatian` (default 30) | Mulai prioritaskan produk |
| **KRITIS** | < `threshold_perhatian` (≥ 0) | Waspada / SEGERA kirim/retur |
| **EXPIRED** | < 0 | Batch kedaluwarsa, wajib ditarik/diretur |

Threshold dapat dikonfigurasi dari menu **Threshold** di halaman Opname Expired.

### 2. Generate Mingguan

```text
Klik tombol "Generate" di halaman Opname Expired
    ↓
Sistem menghitung week_start (Senin) s.d. week_end (Minggu) dari tanggal saat ini
    ↓
Sistem mengambil data ReceivingItem minggu ini (berdasarkan tanggal_penerimaan / scan_time / created_at)
    ↓
Data di-aggregate per (kode_depo, kode_barang, expired_date)
    ↓
Batch minggu lalu di-roll-forward jika masih valid (belum EXPIRED)
    ↓
Setiap batch mendapat: sisa_hari, status_ini, perubahan, rekomendasi
    ↓
Data disimpan ke opname_expired_waves (upsert per week_start + kode_depo + kode_barang + expired_date)
```

**Roll-forward:** Batch minggu lalu yang statusnya bukan EXPIRED akan dibawa ke minggu ini walaupun tidak ada penerimaan baru. Qty lama menjadi baseline.

**Perubahan:** Sistem mencatat perubahan dari minggu lalu ke minggu ini:
- `BARU` — batch baru minggu ini
- `TETAP` — qty tidak berubah
- `NAIK +X` — qty naik X CRT
- `TURUN -X` — qty turun X CRT
- `status X → Y` — status berubah

### 3. Halaman Operasional (`/opname-expired`)

Fitur:
- **KPI strip:** Total Batch,Expired, Kritis, Perhatian, Aman, CRT Berisiko (dengan perbandingan minggu lalu)
- **Filter:** Dropdown minggu (format "14 Sep - 20 Sep 2026"), search kode/nama barang
- **Tab:** Perlu Ditindak (EXPIRED+KRITIS+PERHATIAN), per status, Semua
- **Tabel:** Status badge, Produk, Depo, Qty (CRT/PCS + koreksi), Expired date, Sisa hari (dengan progress bar), Detail
- **Drawer detail:** Ringkasan qty, expired date, depo, sumber material, rekomendasi, perbandingan mingguan (qty, expired, status, selisih, perubahan), info validasi (jika ada)
- **Export Excel:** Filter sesuai tab/minggu aktif
- **Threshold:** Pengaturan threshold_aman, threshold_perhatian, threshold_kritis

### 4. Halaman Laporan (`/reports/opname-expired`)

Fitur:
- **KPI cards:** Total Batch, Batch Berisiko, % Berisiko, Total CRT
- **Rekap per Depo:** Tabel ringkasan jumlah batch & CRT per depo per status
- **Filter:** Minggu, Depo, Status
- **Detail Batch:** Tabel detail dengan badge status, qty, expired, sisa hari, perubahan
- **Export Excel**

### 5. API Endpoints

| Method | Endpoint | Fungsi | Permission |
|--------|----------|--------|------------|
| GET | `/opname-expired` | Daftar batch, filter minggu/status/search, pagination | `opname.view` |
| POST | `/opname-expired/generate` | Generate/update batch mingguan | `opname.create` |
| GET | `/opname-expired/{wave}` | Detail satu batch | `opname.view` |
| PUT | `/opname-expired/{wave}` | Update koreksi qty (qty_koreksi_crt/pcs) | `opname.edit` |
| GET | `/opname-expired/settings` | Lihat threshold saat ini | `opname.view` |
| PUT | `/opname-expired/settings` | Update threshold | `opname.edit` |
| GET | `/opname-expired/export` | Export Excel (.xlsx) | `opname.view` |

**Update koreksi** hanya menerima `qty_koreksi_crt` dan `qty_koreksi_pcs`. Field di-update secara independen (mengirim hanya `qty_koreksi_crt` tidak akan mereset `qty_koreksi_pcs`). Access control: user depot-scoped hanya bisa update data depot sendiri.

### 6. Auto-Classification

Status diklasifikasikan otomatis oleh `OpnameExpiredService::status()` berdasarkan `sisa_hari` dan threshold. Tidak ada validasi manual — klasifikasi bersifat **monitoring-only**.

Rekomendasi teks berbeda dalam band KRITIS:
- `sisa_hari ≤ threshold_kritis` (7): "SEGERA kirim/retur"
- `sisa_hari > threshold_kritis`: "Waspada"

### 7. Database

**`opname_expired_waves`:**
- Unique: `(week_start, kode_depo, kode_barang, expired_date_ini)`
- Qty: `qty_ini_crt/pcs` (minggu ini), `qty_lalu_crt/pcs` (minggu lalu), `qty_koreksi_crt/pcs` (koreksi manual)
- Status: `status_ini`, `status_lalu`, `perubahan`, `rekomendasi`, `sisa_hari`
- Relasi: `validated_by` → users (validator), `koreksi_by` → users (korektor)

**`opname_settings`:**
- Key-value: `threshold_aman`, `threshold_perhatian`, `threshold_kritis`
