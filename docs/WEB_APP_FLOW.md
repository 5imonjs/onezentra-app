# Flow & Penjelasan Aplikasi Web OneZentra

Gambar: `docs/WEB_APP_FLOW.png`

## Tujuan
Aplikasi web OneZentra adalah pusat pengelolaan gudang: perencanaan pengiriman,
penerimaan barang, opname stok, biaya, laporan, dan administrasi sistem. Semua modul
terintegrasi dalam satu backend Laravel.

## Alur Utama: Alur Inbound (penerimaan barang)
1. **Replenishment** — Admin Planner membuat rencana kirim (dokumen, kendaraan, daftar barang).
2. **Check In Point** — Security mencatat Gate IN kendaraan (scan PO/Nopol).
3. **Validasi Dokumen** — Cheker memvalidasi SJ vs fisik: qty aktual, expired, kondisi; batch & label tercetak otomatis.
4. **Check Out Point** — Cheker menyelesaikan bongkar (receiving) → status COMPLETED.
5. **Inbound (SJ)** — Master data penerimaan per depo.

## Modul Pendukung

### Stok & Opname
- **Monitoring Kedaluwarsa**: pantau batch mendekati/melewati expired (AMAN/PERHATIAN/KRITIS/EXPIRED).
- **Stock Opname**: tugas hitung fisik & disposisi barang kadaluarsa (sesi dibuat dari web).

### Data Master
- **NPN**: katalog produk.
- **Cluster Principal**: pengelompokan principal.
- **Standar Umur**: umur simpan/expired standar.
- **Standarisasi**: standar tinggi/tier tumpukan.

### Keuangan
- **Biaya THL** & **Biaya Retribusi**: input biaya + dokumen.
- **Tarif Retribusi**: tarif per depo.
- Approval berjenjang: Supervisor → RLH → RFAH/BLC/BAC (sesuai assignment).

### Laporan
- 7 laporan: Replenishment, Inbound, Batch Kedaluwarsa, Monitoring Kedaluwarsa, Selisih Qty, Biaya THL, Biaya Retribusi. Filter tanggal + depo, ekspor Excel.

### Sistem
- **Users**, **Roles & Permissions**, **Pengaturan Approval**, **Setting Email & Penerima Email**, **Reset Data** (khusus admin_master).

## Manfaat
- Alur barang terkontrol dan tercatat end-to-end.
- Selisih qty terdeteksi dini.
- Biaya tidak cair tanpa persetujuan berjenjang.
- Jejak audit penuh untuk status, batch, dan aktivitas user.