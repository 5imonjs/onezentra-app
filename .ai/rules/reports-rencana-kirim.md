---
paths:
  - 'onezentra-web/src/app/reports/rencana-kirim/**'
  - app/Exports/RencanaKirimReportExport.php
---

# Reports Rencana Kirim

## Satu sumber filter untuk index & export
Filter laporan rencana kirim (date_from/date_to rkh_date, status whitelist in:DRAFT..CANCELLED, kode_depo, search PO/driver/nopol/tujuan) HIDUP di satu tempat: `RencanaKirimReportExport::applyFilters()` — dipakai bersama oleh `ReportController::rencanaKirim()` dan `rencanaKirimExport()`. Jangan duplikasi filter; tambah filter baru hanya di method itu (export WAJIB selalu identik dengan layar).

## Konvensi laporan
- Akses pakai `permission:reports.view` (bukan rencana_kirim.view) — sama dengan laporan Penerimaan/Selisih Qty/Opname.
- Kubikasi TIDAK disimpan DB: derived per request via `attachKubikasiToItems` (jumlah × npn.decVolume × npn.SAPdecUom ÷ 1.000.000 m³) — rumus sama dengan RencanaKirimController.
- Urutan baris: `rkh_date desc, id desc`. Summary memuat total, total_qty, total_kubikasi, completed/cancelled count, dan status_counts berlabel ID.
- Halaman frontend wajib punya kartu mobile (`lg:hidden`) — tabel desktop `hidden lg:block`; pola UI mengikuti /reports/selisih-qty (header bento gelap + filter card + summary cards + table-header/table-cell classes).
