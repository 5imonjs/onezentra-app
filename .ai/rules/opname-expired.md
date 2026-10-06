---
paths:
  - 'onezentra-web/src/app/opname-expired/**'
  - 'onezentra-web/src/app/opname-sessions/**'
  - 'onezentra-web/src/components/ManualBatchManager.tsx'
  - 'app/Services/OpnameExpiredService.php'
  - 'app/Http/Controllers/Api/V1/OpnameExpiredController.php'
  - 'app/Http/Controllers/Api/V1/OpnameExpiredSessionController.php'
---

# Opname Expired

## Opname Expired = worklist, bukan spreadsheet 16 kolom
Halaman Opname Expired adalah queue kerja, bukan tabel Excel. Default tab "Perlu Ditindak" (statuses EXPIRED,KRITIS,PERHATIAN); KPI memakai meta.status_summary (count + qty_crt per status, dari index backend); tabel utama hanya kolom keputusan (Status, Produk, Depo, Principal 1, Principal 2, CRT/Ball, PCS, Expired, Sisa-days progress bar, Tindakan) — CRT dan PCS kolom terpisah, satuan hanya di header, tidak ada suffix di angka; semua header kecuali Tindakan bisa diklik untuk sortir A-Z/Z-A server-side (`sort_by` allowlist + `sort_dir` di index, ganti halaman ke 1 tiap ganti sortir); Principal 1 & 2 di-join dari master cluster_principal berlapis (BOSnet stabil terdedup MIN(id) → nickname lama/baru via NPN → product_sku langsung, semua LEFT — `bosnetsz_product_id` TIDAK unik di master sehingga join langsung menggandakan baris wave + merusak paginasi; konflik isi master wajib dibersihkan di data) dan ikut tercari via search; perbandingan mingguan (qty_lalu, status_lalu, selisih ED, perubahan) tampil di drawer saat baris diklik, bukan kolom tabel. Jangan gunakan class excel-header/excel-cell, jangan sertakan 16 kolom mentah.

## Alur baku: ledger → pending → generate → wave → koreksi → export
`receiving_items` adalah satu-satunya buku besar (ledger), dibedakan kolom `source` (`VALIDASI_SJ` dari scan SJ, `IMPORT_MANUAL` dari file/tambah manual — `source` dipaksa di `ReceivingItemController::store`, tidak diambil dari request). `opname_expired_waves` adalah snapshot hasil generate, bukan tempat input. Urutan wajib: **Import → cek pending → Generate → koreksi → Export.** Data import "parkir" di ledger dan tidak terlihat di tabel wave sampai Generate diklik — ini disengaja, dan UI wajib menunjukkannya (pill "N baris belum di-generate" di toolbar + pratinjau "X baris SJ + Y baris import" di banner sukses import), bukan membiarkan operator menebak.

## Satu pintu import: hanya Batch Expired
`ManualBatchManager` (modal Template/Import/Tambah manual) hanya dipasang di `/opname-expired`. JANGAN memasangnya lagi di `/penerimaan` (Inbound): tabel Inbound menyaring `VALIDASI_SJ` saja sehingga import dari sana terlihat "berhasil" di banner tapi tak pernah muncul di tabel halaman — sumber kebingungan operator. Tombol di Inbound adalah pengarah `router.push('/opname-expired')` (gated `opname.view`), bukan modal import.

## Hapus massal batch manual: seleksi + semua, SJ kebal
Daftar "Batch Manual Tersimpan" punya checkbox per baris + "Hapus terpilih (N)" + "Hapus semua" (gated `penerimaan.delete`, konfirmasi dialog). Backend `DELETE /receiving-items/bulk` (`{ids}` atau `{all}`) mengunci query `source=IMPORT_MANUAL` — ID milik SJ yang ikut dikirim diabaikan, bukan error. `all` menghormati depot-scope. "Hapus semua" mencakup seluruh data, bukan hanya 100 yang tampil — teksnya wajib menyatakan itu.

## Kunci produk = BOSnetszProductId, bukan nama
Semua JOIN baca WAJIB berjangkar `BOSnetszProductId` (stabil — `szNickName`/`szNickNameNew`/penamaan lain bisa berubah gramatiknya). Nama hanya dipakai untuk RESOLUSI SAAT TULIS: import(`/receiving-items/import`) mencocokkan kolom PRODUK ke `BOSnetszProductId`/`SAPszProductId`/`szBarcode`/`szNickName`/`szNickNameNew`, lalu menyimpan kode stabil hasil resolusi (`test_import_resolves_both_old_and_new_product_names_to_stable_code`). Fallback nickname/product_sku di COALESCE adalah jaring transisi untuk baris yang ID stabilnya belum terisi — bukan kunci utama. Baris yang tidak cocok di SEMUA lapis berarti master NPN belum punya produk itu: solusinya lengkapi master NPN lalu `php artisan cluster-principal:backfill-stable-ids`, bukan menambah join nama baru.

## Kode batch: kunci utama, tiap baris ledger tepat satu
`batches.batch_number` adalah identitas utama penerimaan + monitoring expired. Diterbitkan (a) saat validasi SJ (`Batch::create` di `scanItem`, terikat `sj_validation_item_id`), (b) saat import/tambah manual (`Batch::issueForReceivingItem`, prefix `IMP-`, terikat `receiving_item_id` — idempoten), (c) susulan saat verifikasi sesi pertama untuk baris warisan. Tiap batch WAJIB ber-`barcode_label` UNIK (unique constraint DB + `generateLabel` anti-collision; guard `test_every_batch_has_a_unique_barcode`). Relasi baca: `ReceivingItem::batch()` (SJ) dan `verifiedBatch()` (import/sesi). JANGAN membuat batch tanpa tautan baris ledger. Daftar Batch Manual menampilkan kolom Kode Batch (eager load keduanya); wave adalah agregat namun MENCATAT `batch_numbers` penyusunnya (diisi Generate, tampil di drawer) sehingga jejak batch tidak hilang.
`batches.batch_number` adalah identitas label fisik yang lahir (a) saat validasi SJ (relasi `ReceivingItem::batch()` via `sj_validation_item_id`), (b) saat import/tambah manual (`Batch::issueForReceivingItem`, prefix `IMP-`, relasi `verifiedBatch()` via `batches.receiving_item_id` — idempoten), atau (c) susulan saat verifikasi sesi pertama untuk baris warisan. `-` hanya untuk data lama pra-migrasi. JANGAN membuat batch tanpa tautan baris ledger. Daftar Batch Manual menampilkan kolom Kode Batch (eager load keduanya di `ReceivingItemController::index`); wave MENCATAT `batch_numbers` penyusunnya (diisi Generate, tampil di drawer).

## Tindak = verifikasi sesi, tanpa modul retur/pengeluaran terpisah
Keputusan pemilik: tidak dibangun modul penindakan (retur/pengeluaran FEFO). Satu-satunya tindak adalah verifikasi sesi lapangan — petugas mengurangi qty lewat hitung fisik (koreksi negatif) dan baris bernilai 0 tetap tercatat di wave sebagai riwayat, bukan dihapus. Rekomendasi "kirim/retur" tetap teks informatif. JANGAN membangun endpoint/route outbound/retur/picking tanpa keputusan eksplisit baru.

## Sesi opname: verifikasi per batch (aturan A2 selesai)
Sesi = satu minggu + satu depo + satu petugas (`opname_expired_sessions` + `opname_expired_session_items` berbutir per batch via `batch_id`, status OPEN → IN_PROGRESS → COMPLETED/CANCELLED). Endpoint `POST /v1/opname-sessions` (buat+assign dari wave_ids lalu diekspansi ke batch, `opname.create`), `/{session}/start`, `/{session}/items/{item}` (verifikasi fisik + foto bila rusak, `opname.edit`), `/{session}/complete` (wajib semua baris terverifikasi), `/{session}/cancel`. Verifikasi menulis koreksi wave sebagai SELISIH per batch (fisik − qty ledger batch itu) + `validated_by/at`; label untuk baris warisan diterbitkan susulan (satu-satunya penerbitan selain import/SJ). Guard: `OpnameExpiredSessionTest` (lifecycle, no-reissue, cancel-menulis-nol, ekspansi multi-batch).
## UI sesi: /opname-sessions (kerja + lapangan satu halaman)
Halaman `Sesi Opname` (sidebar, `opname.view`): filter minggu/status + tab "Tugas saya" (`?mine=1`), tabel sesi, modal buat (minggu+depo+petugas — dropdown bila `users.view` else ID manual — + checklist wave, default semua tercentang), drawer detail (progres x/y, tombol Mulai/Selesaikan/Batalkan gated `opname.edit` + status, form verifikasi per baris: fisik CRT/PCS, kondisi `CONDITIONS`, foto, POST multipart). Selesai/batal lewat ConfirmDialog.

## EXPIRED terbawa tiap minggu, tidak boleh hilang
Batch berstatus EXPIRED WAJIB di-roll-forward ke wave minggu depan dengan qty + statusnya (`generate()` + `rollForwardCarried()` tidak mengenal pengecualian EXPIRED), sampai ada tindak (koreksi/retur). Alasannya: baseline opname manual mencakup barang yang memang sudah expired — mengeluarkannya dari wave = menghilangkan dari monitoring. Guard: `test_generate_rolls_forward_expired_batch_until_acted_upon`.

## Jangkar minggu monitoring beda per sumber (aturan baku)
- IMPORT_MANUAL (baseline): minggu IMPORT (`scan_time`/`created_at`). Tanggal di file adalah info historis dan TIDAK menentukan minggu — baseline yang diimport minggu ini dipantau minggu ini. Prinsipnya: data import masuk saja ke Batch Expired, tanpa pembatasan tanggal.
- VALIDASI_SJ: tanggal penerimaan aktual (`tanggal_penerimaan` → `scan_time` → `created_at`).
- Filter minggu/tanggal di UI adalah ALAT CEK (melihat minggu ini vs sebelumnya), BUKAN gerbang: tidak ada baris valid yang ditolak masuk wave karena tanggalnya. Satu-satunya penolakan entry adalah validitas data (kode_barang + expired_date wajib terisi) dan eksklusi label CANCELLED.
- `GET /pending` dan `generate()` memakai query eligible yang sama (`eligibleItems`, CASE per source di atas) sehingga angka "belum di-generate" tidak ambigu.
- Import mengembalikan distribusi `weeks` (selalu satu minggu: minggu berjalan).

## Batasan yang dijaga test
- Import baseline WAJIB `qty_crt > 0` + `expired_date` terisi; baris gagal dilaporkan per baris (422), bukan digugurkan diam-diam.
- Import ulang data yang sama TIDAK menggandakan: kunci batch (kode hasil resolusi NPN + depo final + expired) yang sudah ada di ledger dilewati sebagai `duplicates` (satu query preload, bukan N+1) dan dilaporkan di respons + banner. Stok tambahan untuk batch yang sama masuk lewat koreksi, bukan baris ganda — roll-forward sudah membawa qty lama.
- Baris IMPORT bertanggal file lama TETAP eligible di minggu import (guard: `test_import_rows_anchor_to_import_week_regardless_of_file_date`); baris SJ bertanggal lama tidak ikut.
- Data `VALIDASI_SJ` tidak bisa dihapus dari jalur manual (`ReceivingItemController::destroy` 422 untuk non-IMPORT).
- `PUT /opname-expired/{wave}` hanya boleh ubah `qty_koreksi_*` (+ `koreksi_by/at`); qty asli/expired/status/rekomendasi tidak bisa diubah dari API ini.
- Guard: `OpnameExpiredTest::test_pending_reports_eligible_split_by_source_before_generate` + `test_pending_is_zero_after_generate_and_tracks_new_import` — perubahan definisi eligible/pending yang memecahkan keduanya adalah bug, bukan refaktor.
