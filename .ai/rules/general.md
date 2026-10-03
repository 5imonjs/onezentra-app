---
paths:
  - '**/*'
  - '**/*Seeder.php'
---

# General

## Pembatalan validasi SJ hanya dari web, berlevel PO transporter, dan punya permission sendiri
Pembatalan berlevel **satu PO transporter beserta seluruh itemnya**, bukan per-item barang — jadi tombolnya berada di **baris tabel** halaman ValidasiSJ (kolom AKSI, sebelah kiri tombol Detail), bukan di modal Detail. Modal Detail menyimpan aksi per-item (Selesaikan Validasi). Tombol hanya muncul untuk status IN_PROGRESS. **Aksinya di-gate `sj_validation.cancel`, BUKAN `sj_validation.edit`**: `edit` itu permission generik penyuntingan, dan pembatalan bersifat terminal (tidak ada undo), jadi keduanya harus bisa dicabut terpisah di Roles & Permissions. Role mendapat `cancel` otomatis saat punya `edit` (migration `add_sj_validation_cancel_permission`), jadi tidak ada akses yang hilang — role baru cukup dicentang manual di UI. Flutter TIDAK menyediakan tombolnya walaupun provider `cancelActive()` masih ada. Backend `SjValidationController::cancel()` menolak status selain IN_PROGRESS (422) supaya sesi yang sudah COMPLETED — yang receiving-nya sudah termaterialisasi — tidak bisa dibatalkan jadi dokumen menyesatkan. cancel() juga mengubah batch label milik sesi itu jadi CANCELLED: label yang sudah tercetak jadi tidak berlaku.

## Cetak label juga tersedia di halaman Inbound
Label batch lahir di validasi SJ, tapi dicetak ulang justru paling sering dibutuhkan saat barang masuk (label ditempel di rak). Halaman `penerimaan` punya `LabelActions` (Cetak Label + Unduh PDF) yang memakai `lib/batchLabel` yang SAMA dengan validasi-sj — jangan buat generator label kedua. Backend: `ReceivingItem::batch()` adalah HasOne via `sj_validation_item_id` (PER ITEM), bukan `batches.receiving_id` (per dokumen) yang akan keliru cocok ke semua item dalam satu receiving. Endpoint `receiving-items/groups` eager-load `batch`. Item tanpa batch → tombol disembunyikan, bukan disabled. Batch `CANCELLED` → badge "Label dibatalkan", tidak bisa dicetak ulang. Kolom Aksi selalu ada (tidak bergantung `penerimaan.edit`) karena isinya bukan cuma Edit.

## Batch Expired bersumber dari receiving_items, tapi HARUS hormati status batch
`OpnameExpiredService::receivingAggregates()` mengambil data dari `receiving_items` (bukan tabel `batches`) — itu memang jalur yang benar karena roll-forward butuh `qty_pcs`/`conversion_factor` yang hanya ada di receiving_items. TAPI filter WAJIB juga membaca `batches.status`: item yang punya batch `CANCELLED` (label sudah tercetak tapi tidak berlaku karena sesi validasi di-cancel) harus dikeluarkan dari opname. Tanpa itu, operator melihat rekomendasi kirim/retur untuk label mati. Batch relating ke receiving lewat `batches.receiving_id` — itu level DOKUMEN, jadi satu batch CANCELLED mengeluarkan seluruh item pada receiving tersebut (konservatif, sesuai makna "seluruh batch label ikut dibatalkan"). Guard: `test_cancelled_batch_is_excluded_from_opname`.

## Link file bukti JANGAN pakai rel="noreferrer" — Sanctum jadi 401
Foto validasi (`validation-photos/*`), foto receiving, dokumen biaya, dan foto THL semuanya dilayani `GET api/v1/storage/{path}` yang WAJIB `auth:sanctum`. Autentikasi ini cookie-based **stateful**: `EnsureFrontendRequestsAreStateful::fromFrontend()` hanya mengaktifkan middleware session kalau header `Referer` (fallback `Origin`) ADA dan domain-nya ada di `sanctum.stateful`. Tanpa itu Sanctum menganggap request stateless → cookie `laravel-session` tidak terbaca → **401 walaupun user sudah login dan file-nya ada**.

`rel="noreferrer"` justru memerintahkan browser MENGHAPUS header `Referer` saat navigasi, jadi itu penyebab langsung "klik Lihat → tab terbuka tapi isinya JSON error". Navigasi `<a>` juga tidak mengirim `Origin`, jadi `noreferrer` = pasti 401. Gunakan konstanta `AUTHENTICATED_FILE_REL` (`onezentra-web/src/lib/storageFile.ts`, nilainya `'noopener'`) untuk SEMUA `<a>` ke endpoint storage, plus helper `storageFileUrl()`. `noopener` tetap aman (proteksi tabnabbing) dan TIDAK menghapus Referer. Kalau butuh privacy referrer, set `Referrer-Policy` di `next.config` — jangan `noreferrer` per-link. Guard: `test_sanctum_considers_referer_header_when_deciding_stateful_request` + `storageFile.test.ts`.

## Label batch: satu batch per item, barcode machine-readable
`barcode_label` adalah identitas FISIK label, nilainya harus sama persis dengan yang dicetak. Flutter mencetak lewat ESC/POS Code39 (`core/printer/escpos.dart` + `escpos_label.dart`), bukan teks polos: printer mode-teks akan mencetak byte `1B`/`1D` sebagai karakter aneh, dan label jadi tanpa barcode sama sekali. Karena itu ada toggle "Cetak barcode" untuk printer yang cuma bisa teks polos (`buildLabelBytesWithoutBarcode`). Setiap label mencetak identitas `ONEZENTRA by LANGKAU KAMI` (`systemIdentity`) di footer supaya label yang lepas dari kardus masih bisa ditelusuri.

## Nomor batch ditampilkan di Detail Validasi Dokumen
Tabel item pada modal Detail (`validasi-sj/page.tsx`) punya kolom **No. Batch** — satu batch per item, dibuat server saat item divalidasi, jadi sudah ada di `SjValidationController::show()` lewat eager load `items.batch`. Logikanya di `lib/validationTable.ts::batchCell` (pure, diuji di `validationTable.test.ts`), bukan inline di JSX: tiga state — `none` (item belum divalidasi), `active` (nomor + barcode), `cancelled` (nomor dicoret + badge "Dibatalkan"). Nomor batch `CANCELLED` SENGAJA tetap ditampilkan: label fisik masih menempel di rak dan petugas perlu tahu nomor mana yang harus dibuang — badge yang membedakan, bukan nomor yang disembunyikan. Kolom ini read-only, bukan tempat trigger cetak label; cetak tetap milik Inbound (`penerimaan`).

## Printer Bluetooth: jangan ganti ke BLE
Printer thermal murah (Xprinter/Goojprt/Zjiang) = Bluetooth **Classic/SPP**, jadi `flutter_bluetooth_serial` (MIT). Jangan ganti ke `flutter_blue_plus` — (1) versi 2.x mewajibkan commercial license, (2) paket itu BLE-only sehingga printer tersebut tidak akan pernah muncul di scan. Paket ini hanya mengekspos singleton lewat `FlutterBluetoothSerial.instance`. Service masih memakai `getBondedDevices()`, jadi printer harus sudah di-*pair* lewat Pengaturan Android.

## JANGAN pernah hapus data database yang sudah ada
Jangan jalankan `db:seed`, `migrate:fresh`, `db:wipe`, atau truncate kecuali user secara eksplisit minta. Jangan pakai `--force` pada seeder tanpa konfirmasi user. Data yang sudah ada di database dianggap fix dan tidak boleh dihapus/di-overwrite oleh agent.

## JANGAN jalankan seeder tanpa konfirmasi user
Seeder seperti RoleSeeder, PermissionSeeder, SingkawangDepotSeeder menggunakan truncate/delete yang menghapus data existing. JANGAN jalankan `php artisan db:seed` kecuali user secara eksplisit minta. Gunakan `updateOrCreate` via tinker jika perlu tambah data.

## JANGAN jalankan migrate:fresh atau db:wipe
Perintah `php artisan migrate:fresh` dan `php artisan db:wipe` akan menghapus SEMUA data di database. JANGAN jalankan perintah ini kecuali user secara eksplisit minta. Gunakan `php artisan migrate` untuk menjalankan migration baru tanpa menghapus data yang sudah ada.
