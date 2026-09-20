---
paths:
  - 'onezentra-web/src/app/opname-expired/**'
---

# Opname Expired

## Opname Expired = worklist, bukan spreadsheet 16 kolom
Halaman Opname Expired adalah queue kerja, bukan tabel Excel. Default tab "Perlu Ditindak" (statuses EXPIRED,KRITIS,PERHATIAN); KPI memakai meta.status_summary (count + qty_crt per status, dari index backend); tabel utama hanya kolom keputusan (Status, Produk, Depo, Qty, Expired, Sisa-days progress bar, Tindakan); perbandingan mingguan (qty_lalu, status_lalu, selisih ED, perubahan) tampil di drawer saat baris diklik, bukan kolom tabel. Jangan gunakan class excel-header/excel-cell, jangan sertakan 16 kolom mentah.
