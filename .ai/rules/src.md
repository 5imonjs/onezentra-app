---
paths:
  - 'onezentra-web/src/**'
---

# Src

## Penerimaan hanya VALIDASI_SJ; batch manual lewat Opname
Halaman /penerimaan hanya menampilkan receiving_items dengan source=VALIDASI_SJ (pakai receivingItems.list { source }); tanpa input/import/hapus. Input manual (tambah/import/template/delete) dikelola di modul Opname Expired lewat komponen ManualBatchManager (wrapper opnameExpired.manual* ke endpoint receiving-items yang sama, gerbang permission penerimaan.create/delete). Backend receiving_items tetap satu ledger; opname membaca semua source.
