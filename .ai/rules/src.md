---
paths:
  - 'onezentra-web/src/**'
---

# Src

## PendingActions hanya tampil bila permission & status benar-benar ada
Empat dari lima grup "Perlu Tindakan" (dashboard) sempat mati total karena memakai nilai yang tidak pernah ada: slug `biaya_thl.check`, `retribusi.view`, `retribusi.check`, `rencana_kirim.verify` (tak terdaftar di PermissionSeeder), status `submitted` (biaya — hasil submit = `pending`), dan `PENDING` pada `sj_validations` (hanya IN_PROGRESS/COMPLETED/CANCELLED; `PENDING` milik sj_validation_items). Nilai yang benar: pemeriksaan biaya = `approval.check`, verify RK = `rencana_kirim.edit` (route `/verify`), SJ terbuka = `IN_PROGRESS`, gate/RK terparkir = `CHECKED_IN`. Perubahan status/slug di seeder wajib dicek ulang di sini — grup yang dead tidak menimbulkan error, hanya hilang.

## PendingActions: badge pakai `total`, filter depo wajib didukung backend
Badge "N item" dan "+N lainnya" memakai `total` dari respons paginate (bukan `items.length`, sebab `per_page=4` membuat moreCount dulu selalu 0). Filter depo dikirim sebagai `kode_depo` — index() tiap endpoint harus benar-benar memakainya (gate-transactions, receivings, sj-validations, biaya-thl, biaya-retribusi sudah; `npn`/`standar-umur` sengaja global agar angka fallback identik dengan `dashboard/summary`).

## Penerimaan hanya VALIDASI_SJ; batch manual lewat Opname
Halaman /penerimaan hanya menampilkan receiving_items dengan source=VALIDASI_SJ (pakai receivingItems.list { source }); tanpa input/import/hapus. Input manual (tambah/import/template/delete) dikelola di modul Opname Expired lewat komponen ManualBatchManager (wrapper opnameExpired.manual* ke endpoint receiving-items yang sama, gerbang permission penerimaan.create/delete). Backend receiving_items tetap satu ledger; opname membaca semua source.
