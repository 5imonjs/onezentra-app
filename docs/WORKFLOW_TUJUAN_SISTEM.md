# ONEZENTRA Warehouse System — Tujuan, Fungsi & Workflow Aplikasi

Dokumen ringkas "apa gunanya, apa isinya, bagaimana alurnya" untuk presentasi & onboarding.
Rujukan teknis lengkap: [`project_flow.md`](project_flow.md), [`THL_RETRIBUSI_SYSTEM_FLOW.md`](THL_RETRIBUSI_SYSTEM_FLOW.md), [`QA_REPORT.md`](QA_REPORT.md).

Presentasi: **`docs/ONEZENTRA_WORKFLOW.pptx`**

---

## 1. Tujuan Aplikasi

**Masalah yang dipecahkan**

| Masalah manual | Solusi sistem |
|---|---|
| Rencana kirim & Surat Jalan berbasis kertas, mudah hilang/telat | Rencana kirim digital + PDF Surat Jalan (barcode) |
| Barang dibongkar tanpa verifikasi dokumen | Gate In → Validasi SJ wajib sebelum bongkar |
| Selisih qty baru ketahuan setelah stok opname | Selisih dicatat saat validasi → laporan Selisih Qty |
| Batch & expired date tidak terpantau | Batch otomatis + monitoring expired mingguan |
| Biaya THL/retribusi lewat approval via chat/wa | Pipeline approval berjenjang + PDF & audit trail |
| Siapa boleh lihat/ubah data tidak jelas | RBAC (role + permission) per menu & aksi |

**Tujuan utama**

1. **Kontrol alur barang** — satu jalur wajib: Replenishment → Gate In → Validasi → Check Out.
2. **Ketepatan data** — produk di-scan **hanya sekali** (saat Validasi SJ), hasilnya diteruskan otomatis ke Receiving.
3. **Ketertelusuran (traceability)** — setiap perpindahan status, batch, dan aktivitas user dicatat.
4. **Kepatuhan finansial** — biaya THL & retribusi melewati approval RLH/RFAH/BLC/BAC sebelum final.
5. **Keamanan akses** — otorisasi per permission, sesi berbasis cookie, tanpa token di localStorage.

---

## 2. Arsitektur & Fungsi Tiap Lapisan

```
[Browser]  Next.js 16 (App Router, React 19, TS, Tailwind 4, Zustand)
    │  proxy.ts : auth guard + teruskan /api/* dan /sanctum/* ke backend
    ▼
[Laravel 11 API]  /api/v1  ·  Sanctum cookie (stateful)  ·  middleware permission:*  ·  TrackUserActivity
    │
    ▼
[Database]  SQLite (dev) / PostgreSQL (prod)
```

| Lapisan | Fungsi |
|---|---|
| `onezentra-web/` (Next.js) | UI, form, PDF client-side (Surat Jalan, Biaya), cetak label Bluetooth, guard auth |
| `app/Http/Controllers/Api/V1/` (32 controller) | Endpoint REST + validasi + transisi status + otorisasi |
| `app/Services/` | Logika lintas-modul: `BiayaApprovalService`, `EmailNotificationService`, `OpnameExpiredService`, `ApprovalSectionResolver` |
| `app/Models/` (37 model) | Relasi data & state |
| `app/Exports/` | Ekspor Excel (20+) + template import |
| `onezentra_mobile/` (Flutter) | Aplikasi mobile (login via Bearer token) terhadap API yang sama |

---

## 3. Peta Modul (Menu)

| Grup | Menu | Fungsi |
|---|---|---|
| **Operasional** | Replenishment | Buat & jadwalkan rencana kirim |
| | Check In Point | Gate-in kendaraan (scan barcode) |
| | Validasi Dokumen | Cek SJ/BA vs fisik, input qty & expired → batch |
| | Check Out Point | Selesaikan bongkar (receiving) |
| | Inbound (SJ) | Master data penerimaan produk per depo |
| **Opname** | Batch Expired | Monitoring batch tiap minggu |
| | Sesi Opname | Verifikasi lapangan per sesi |
| **Master Data** | NPN | Katalog produk |
| | Cluster Principal | Pengelompokan principal |
| | Standar Umur | Umur simpan/expired standar |
| | Standarisasi | Standar tinggi/tier tumpukan |
| **Biaya** | Biaya THL | Biaya tenaga harian lepas + approval |
| | Biaya Retribusi | Biaya retribusi + approval |
| | Tarif Retribusi | Tarif per depo |
| **Laporan** | 7 halaman laporan | Filter tanggal + depo, ekspor Excel |
| **Sistem** | Users / Roles / Approval / Email / Reset Data | RBAC, SMTP, penerima notifikasi |

---

## 4. Workflow Utama (Step by Step)

### Flow besar

```text
[1] REPLENISHMENT      [2] CHECK IN        [3] VALIDASI SJ       [4] CHECK OUT
 Admin Planner      →   Security        →   Cheker            →   Cheker
 DRAFT → SCHEDULED      CHECKED_IN           VERIFIED              IN_PROGRESS → COMPLETED
                                                              + batch/label + email selesai
```

Status hanya boleh berpindah lewat transisi sah — transisi ilegal ditolak `HTTP 422`.

```text
DRAFT → SCHEDULED → CHECKED_IN → VERIFIED → IN_PROGRESS → COMPLETED
   └────────┴────────┴───────────┴──────────┴──→ CANCELLED
```

### Step 1 — Replenishment (Admin Planner)

1. Buka kalender → pilih bulan → pilih tanggal → form Rencana Kirim.
2. **Informasi Dokumen**: No. Dokumen (SJ/BA) + Tanggal RKH. `po_transporter` unik per depo.
3. **Kendaraan & Driver**: driver, ekspedisi, nopol, jenis kendaraan.
4. **Pengirim & Tujuan**: pengirim, alamat, HP, tujuan, kode/nama depo.
5. **Daftar Barang**: pilih produk NPN (atau import Excel) → jumlah, satuan, keterangan → kubikasi terhitung live.
6. **Catatan** → Simpan (DRAFT) → email notifikasi terkirim (TO BLC, CC Cheker).
7. Klik **Jadwalkan** → status **SCHEDULED**.

*Setelah CHECKED_IN, item tidak boleh diubah — menjadi acuan validasi.*

### Step 2 — Check In Point (Security)

1. Scan barcode PO Transporter / cari dokumen.
2. Sistem hanya menerima `INBOUND` saat status `SCHEDULED`; duplikat ditolak 422.
3. Transaksi gate tersimpan (`gate_transactions`) → status **CHECKED_IN**.
4. Dock ditandai terpakai bila terhubung ke receiving.

### Step 3 — Validasi Dokumen (Cheker)

1. Scan dokumen/RKH → `GET /sj-validations/lookup?scan_code=...`.
2. Mulai validasi → sistem **snapshot seluruh item** rencana (`POST /sj-validations/start/{id}`).
3. Per item (scan): isi `actual_qty`, `expired_date`, `condition (GOOD|DAMAGED|MISSING)`, `barcode`, `tier/tinggi_tumpukan`.
4. Simpan → **batch dibuat otomatis** per produk: `batch_number` (BATCH-XXXXXXXX) + `barcode_label` (LBL-XXXXXXXX). Idempoten — scan ulang tidak menggandakan batch.
5. Standarisasi tumpukan di-upsert `pending` per `npn_id`.
6. Selesai → status **VERIFIED**, dan **Receiving + ReceivingItems dibuat otomatis** (status PENDING).
7. Cetak label: QR `batch_number` + teks barang/qty (ESC/POS via Web Bluetooth, fallback dialog print).
8. Email notifikasi validasi terkirim.

> Ini **satu-satunya titik scan produk**. Data hasil validasi diteruskan ke Receiving — tidak ada scan ulang.

### Step 4 — Check Out / Receiving (Cheker)

1. Buka menu Check Out → scan barcode PO Transporter → temukan Receiving (Quick Scan: `po_transporter`/`driver_name`).
2. Status PENDING → klik mulai → **IN_PROGRESS** (bongkar berjalan).
3. Klik **Selesai Bongkar** → **COMPLETED**, dock kembali AVAILABLE, batch siap, email "Proses Bongkar Selesai" terkirim (TO BLC, CC Admin Distribusi).
4. Data hasil menjadi dasar laporan Selisih Qty & Batch Expired.

---

## 5. Workflow Pendukung

### 5a. Opname Expired & Sesi Opname

| Status | Sisa hari (default) | Aksi |
|---|---|---|
| AMAN | ≥ 90 | FIFO normal |
| PERHATIAN | ≥ 30 | Prioritaskan keluar |
| KRITIS | 0–29 | Segera kirim/retur |
| EXPIRED | < 0 | Wajib ditarik |

- **Generate mingguan** (Senin–Minggu): agregat ReceivingItem per (depo, barang, expired) + roll-forward batch lama → `opname_expired_waves`.
- **Sesi Opname**: buat sesi → start → verifikasi item lapangan → complete/cancel (wave terkunci saat sesi berjalan).
- Threshold dikonfigurasi di `opname_settings`.

### 5b. Biaya THL & Retribusi

```text
DRAFT → SUBMIT → CHECKED → RLH_APPROVED → APPROVED
                     ↘ REJECTED (kapan pun)   ↘ REVISI (kembali ke pengisi)
```

1. Isi data biaya (+ detail, foto dokumen maks 2 MB JPEG).
2. Submit → Supervisor CHECKED → RLH approve → RFAH/BLC/BAC approve sesuai `approval_assignments`.
3. `BiayaApprovalService` + `ApprovalSectionResolver` menentukan siapa berikutnya.
4. Unduh PDF persetujuan (setting section di `settings/biaya-thl-pdf`), ekspor Excel.
5. Laporan biaya per periode + depo.

### 5c. Laporan (7 halaman)

Replenishment · Inbound · Penerimaan & Expired (Semua) · Selisih Qty · Biaya THL · Biaya Retribusi · Batch Expired.
Semua: filter tanggal + depo → ekspor Excel (Laravel Excel), gate `reports.view`.

### 5d. Notifikasi Email

`EmailNotificationService` → SMTP dari `email_settings` (password ter-bcrypt), penerima dari `email_recipients` (TO/CC per dokumen/trigger):

| Trigger | Penerima |
|---|---|
| `rencana_kirim / created` | TO BLC, CC Cheker |
| `sj_ba / validated` | CC role cheker |
| `receiving / completed` | TO BLC, CC admin_distribusi |
| `selisih_qty` | penerima khusus selisih |

---

## 6. Keamanan & Otorisasi

| Aspek | Implementasi |
|---|---|
| Autentikasi web | Sanctum **stateful cookie** — tidak ada Bearer token di browser |
| CSRF | `withCredentials` + `withXSRFToken`, exchange `/sanctum/csrf-cookie` |
| Proxy | `onezentra-web/src/proxy.ts` meneruskan `/api/*` & `/sanctum/*` agar cookie terikat domain `:3000` |
| Otorisasi | Middleware `permission:*` → `CheckPermission` (403 + daftar permission yang dibutuhkan) |
| Audit | `TrackUserActivity` + queue `LogUserActivity` → `user_activity_logs` |
| Rate limit | `POST /login` throttle 10/menit |
| State machine | Transisi status dikunci backend; `PUT /rencana-kirim/{id}` tidak bisa mengubah status |
| Reset data | `database.purge` hanya `admin_master` (di-gate ulang di backend) |

**Role (14):** `admin_master`, `staff_logistic`, `rlh`, `rfah`, `rh`, `blc`, `bac`, `admin_distirbusi`, `admin_planner`, `cheker`, `sac`, `operator`, `ga`, `bh`.

---

## 7. Peran & Tanggung Jawab

| Peran | Tanggung jawab pada workflow |
|---|---|
| **Admin Planner** | Buat & jadwalkan rencana kirim, dokumen, kendaraan, daftar barang |
| **Security** | Gate In kendaraan (Check In Point) |
| **Cheker** | Validasi SJ/BA + scan item + cetak label, lalu selesaikan bongkar |
| **Admin Distribusi** | Monitoring receiving, terima notifikasi selesai |
| **RLH / RFAH / BLC / BAC** | Approval biaya THL & retribusi |
| **RH / GA** | Viewer |
| **Admin Master** | Users, roles, approval settings, email, reset data |

---

## 8. Manfaat yang Diharapkan

- **Akurasi stok**: qty aktual tercatat sekali saat validasi → selisih terdeteksi dini.
- **Barang tidak salah terima**: dokumen wajib divalidasi sebelum bongkar.
- **Risiko expired turun**: peringatan AMAN/PERHATIAN/KRITIS/EXPIRED + sesi opname lapangan.
- **Biaya terkendali**: tidak ada biaya THL/retribusi yang cair tanpa persetujuan berjenjang.
- **Jejak audit penuh**: status, batch, aktivitas user, dan riwayat approval tersimpan.
- **Kerja kertas minim**: Surat Jalan, label batch, dan laporan dihasilkan sistem.

---

## 9. Batasan (Modul yang Tidak Ada)

Appointment, ASN, Yard, Gates Master, Receiving Schedule, Put Away, Opname non-expired, FEFO — **tidak tersedia** saat ini.

---

## 10. Referensi

| File | Isi |
|---|---|
| `docs/project_flow.md` | Struktur sistem & alur lengkap |
| `docs/THL_RETRIBUSI_SYSTEM_FLOW.md` | Detail biaya THL & retribusi |
| `docs/QA_REPORT.md` | Cakupan & hasil pengujian |
| `docs/ONEZENTRA_WORKFLOW.pptx` | Presentasi workflow (deck ini) |
