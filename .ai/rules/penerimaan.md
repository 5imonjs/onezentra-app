---
paths:
  - 'onezentra-web/src/components/DashboardStatCards.tsx'
  - 'app/Http/Controllers/Api/V1/DashboardController.php'
  - 'app/Models/Penerimaan.php'
  - 'app/Http/Controllers/Api/V1/PenerimaanController.php'
---

# Penerimaan

## Kartu dashboard menghitung receiving_items VALIDASI_SJ, bukan tabel penerimaans
Kartu "Penerimaan" di dashboard (dan endpoint `dashboard/summary`) menghitung `receiving_items` bersumber `VALIDASI_SJ` — sumber yang sama dengan halaman `/penerimaan` tujuannya. JANGAN arahkan kembali ke `penerimaan.list` / tabel `penerimaans`: tabel itu kosong dan tidak punya UI, kartu akan mati (dim) walau data ada.

## Tabel penerimaans + PenerimaanController adalah jalur yatim
Tidak ada halaman frontend yang memakai CRUD `/penerimaan` (model `Penerimaan`). Jangan bangun fitur baru di atasnya. Bila butuh data penerimaan, pakai `receiving_items` (lihat aturan source di `src.md`). Penghapusan endpoint yatim butuh keputusan eksplisit user — jangan hapus diam-diam.
