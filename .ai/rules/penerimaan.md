---
paths:
  - 'onezentra-web/src/app/penerimaan/**'
---

# Penerimaan

## Penerimaan page = toolbar + tabel padat berkelompok (operasional)
Halaman Penerimaan = layar operasional (SJ only): satu toolbar (search + ringkasan inline dokumen/batch/CRT/PCS) di atas satu tabel padat dengan baris grup per dokumen receiving (PO/driver/nopol/depo/sumber tanggal/total CRT+PCS di baris grup; edit di tiap baris item). JANGAN pakai kartu statistik 4-blok atau kartu nested per dokumen — itu pola "dashboard", bukan data operasional. Jangan tambahkan kolom PO/Driver/Depo di tiap baris item. Paginasi default 25/halaman. Laporan/export tinggal di /reports/penerimaan (baca rule reports).

## Vocab kondisi kanonik + warna semantik
Condition memakai set kanonik: FISIK_BAGUS, FISIK_RUSAK, QTY_KURANG, ISI_KEMASAN_KURANG, EXPIRED_TIDAK_STANDAR, LAINNYA. Tampilkan badge via helper bersama onezentra-web/src/lib/condition.ts (conditionMeta: label Indonesia + tone emerald/amber/red/neutral). Jangan hardcode warna 'GOOD' hijau vs sisanya amber — FISIK_BAGUS bukan kondisi buruk. Legacy (GOOD/DAMAGED/MISSING/LESS/NOT GOOD) dibaca via mapping; normalisasi penulisan ditangani backend (ReceivingItem::normalizeCondition).