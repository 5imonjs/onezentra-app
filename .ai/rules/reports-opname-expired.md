---
paths:
  - 'onezentra-web/src/app/reports/opname-expired/**'
---

# Reports Opname Expired

## Laporan Opname Expired = read-only bukti (reports.view)
Laporan Opname Expired adalah pasangan READ-ONLY dari halaman kerja /opname-expired (yang punya drawer validasi/koreksi). Di sini boleh memuat kolom detail lengkap (qty lalu, perubahan, validasi) yang sengaja TIDAK ada di tabel worklist. Akses pakai permission reports.view, bukan opname.view. Rekap per depo diisi dari meta.depot_summary (backend mengembalikannya di index opname-expired); export memakai opnameExpired.export dengan filter week_start/kode_depo/status.
