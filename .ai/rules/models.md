---
paths:
  - 'app/Models/**'
  - app/Models/StandarisasiTumpukan.php
  - app/Models/ReceivingItem.php
---

# Models

## is_active permission & role ditegakkan di getPermissions
User::getPermissions() memfilter roles.is_active & permissions.is_active true. Toggle Aktif di tab Permissions & is_active role kini benar-benar mematikan akses. Jangan menambahkan query permission lain (mis. Permission::where) tanpa meneruskan filter is_active.

## StandarisasiTumpukan pakai npn_id FK
StandarisasiTumpukan ber-FK `npn_id` (bukan snapshot field BOSnet). Produk di-refer via npn_id dan di-load relasi `npn`. Field terbaru: npn_id, tier, tinggi_tumpukan, total_tier_tinggi, status (pending/approved/rejected), requested_by/email, approved_by/email, kode_depo, nama_depo. `total_tier_tinggi` baru dihitung saat approve.

## receiving_items source column & nullable receiving_id
receiving_items is the single source for opname-expired analysis. Column `source` = VALIDASI_SJ (from validasi SJ/scanning, has receiving_id) or IMPORT_MANUAL (Excel upload, receiving_id is NULL — it was altered to nullable). Never require receiving_id for IMPORT_MANUAL rows. OpnameExpiredService only aggregates rows with expired_date + tanggal_penerimaan (via COALESCE tanggal_penerimaan/scan_time/created_at) in the target week.

## receiving_items = single source of truth GR ledger
Laporan Penerimaan dan Opname Expired WAJIB membaca dari receiving_items (ledger GR), bukan tabel snapshot `penerimaan` (legacy: DO_QTY/sisa/szStatus, sumber Excel — jangan dipakai sebagai data laporan). Untuk tanggal: pakai COALESCE(tanggal_penerimaan, DATE(scan_time), DATE(created_at)) — dijaga konsisten di ReportController::penerimaanQuery dan OpnameExpiredService::receivingAggregates.
