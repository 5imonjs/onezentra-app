---
paths:
  - 'onezentra-web/**'
---

# Onezentra Web

## Brand logo = public/LOGO.png (white, transparent bg)
Brand logo asset is onezentra-web/public/LOGO.png (645KB, 8451x2048, WHITE on transparent — only visible on dark backgrounds). Used in Sidebar header (expanded: w-full max-h-14 object-left; collapsed: w-8 in a chip) and login page (left panel + mobile chip). Favicon set via metadata icons "/LOGO.png".

## Surat Jalan PDF: client-side & wajib paginasi
PDF di-render client-side di `onezentra-web/src/lib/suratJalanPdf.ts` memakai `jsPDF` + `jspdf-autotable` (bukan endpoint backend). Tabel item HARUS lewat autoTable agar satu RKH dengan banyak item tidak kehilangan baris di luar A4 (autoTable mengulang header tiap halaman + wrap teks sel). Catatan & area tanda tangan diletakkan setelah tabel dengan cek page-break. Barcode yang di-render adalah `po_transporter` (= no_dokumen, nilai yang di-scan di Receiving). Tabel `CODE39_CHARS` disimpan sebagai modul ber-run-length (12 modul, elemen wide = 2 modul) — render lewat run-length (`encodeCode39`), JANGAN memakai paritas index per-bit karena menghasilkan barcode tidak valid. Teks human-readable barcode wajib sama dengan nilai ter-sanitasi (`sanitizeCode39Value`). `normalizeRkhDate` HARUS parse tanggal secara tekstual (regex `^(\d{4})-(\d{2})-(\d{2})`), BUKAN `new Date()` — tanggal ISO tanpa offset diparse sebagai UTC sehingga di timezone negatif tanggal PDF bergeser satu hari.
