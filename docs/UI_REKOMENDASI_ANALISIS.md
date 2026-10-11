# Catatan & Rekomendasi UI — Biaya Retribusi

## Perubahan yang Dilakukan

### 1. Sticky Stepper "Alur Persetujuan"
**Lokasi**: `onezentra-web/src/app/biaya-retribusi/page.tsx` (baris 316)

**Perubahan**: Menambahkan `sticky top-0 z-10` pada container stepper agar tetap terlihat di atas saat konten modal di-scroll.

**Alasan**: User perlu melihat progres approval tanpa harus scroll ke atas.

### 2. Stampel Bulat & Merah
**Lokasi**: `onezentra-web/src/lib/biayaPdf.ts` (fungsi `drawStamp()`)

**Perubahan**:
- Bentuk stampel diubah dari `roundedRect` (kotak) menjadi `circle` (bulat)
- Warna stampel untuk semua tahap approval (Diajukan, Diperiksa, Disetujui) diubah menjadi merah (`STAMP_RED`)
- Ukuran font disesuaikan agar proporsional dengan bentuk bulat

**Alasan**: User menginginkan stampel yang lebih sederhana (bulat) dan konsisten (semua merah) untuk semua tahap approval.

### 3. Teks Stampel Lebih Jelas
**Lokasi**: `onezentra-web/src/lib/biayaPdf.ts` (fungsi `stampFor()`)

**Perubahan**:
- Stampel "Mengajukan": teks diubah dari `PENGAJUAN` menjadi `DIAJUKAN`
- Stampel "Mengetahui": teks tetap `DIPERIKSA` (sudah jelas)
- Stampel "Menyetujui": teks tetap `DISETUJUI` / `DISETUJUI RLH` (sudah jelas)
- Stampel "RFAH*": teks tetap `DISETUJUI RFAH` (sudah jelas)

**Alasan**: User menginginkan penulisan status yang lebih jelas dan konsisten dengan konteks approval.

---

## Rekomendasi Peningkatan UI

### 1. Stepper "Alur Persetujuan"

**Kondisi Saat Ini**:
- Menampilkan 3 langkah: Diajukan → Diperiksa → Disetujui
- RFAH tidak muncul kecuali `is_rfah_required`
- Status ditampilkan dengan badge di kanan atas

**Rekomendasi**:
1. **Tambahkan langkah RFAH** jika `is_rfah_required` — saat ini RFAH hanya muncul di badge, tidak di stepper
2. **Tampilkan durasi** setiap langkah (misal "2 hari") — user bisa berapa lama setiap tahap dilakukan
3. **Tampilkan alasan penolakan/revisi** langsung di stepper — user tidak perlu scroll ke bawah untuk melihat alasan
4. **Bedakan warna status** — saat ini semua langkah done berwarna hijau; bisa bedakan antara "Disetujui RLH" (hijau) vs "Disetujui RFAH" (ungu/biru)

### 2. Stampel PDF

**Kondisi Saat Ini**:
- Stampel bulat dengan warna merah untuk semua tahap approval
- Teks stampel: DIAJUKAN, DIPERIKSA, DISETUJUI, DISETUJUI RLH, DISETUJUI RFAH

**Rekomendasi**:
1. **Warna berbeda untuk status negatif** — DITOLAK dan REVISI tetap menggunakan warna yang berbeda (misal oranye/merah tua) agar user langsung bisa membedakan
2. **Ukuran stampel konsisten** — pastikan semua stampel memiliki ukuran yang sama untuk tampilan yang rapi
3. **Tanggal stampel** — pastikan format tanggal konsisten (misal "15 Jan 2026")

### 3. Tampilan Status

**Kondisi Saat Ini**:
- Badge status di kanan atas stepper
- Warna badge berbeda untuk setiap status (draft, pending, checked, rlh_approved, approved, rejected, revisi)

**Rekomendasi**:
1. **Konsistensi penulisan** — pastikan semua penulisan status menggunakan istilah yang sama (misal "Disetujui" bukan "Approved")
2. **Warna yang lebih kontras** — pastikan warna badge cukup kontras dengan background untuk mudah dibaca
3. **Ikon yang jelas** — tambahkan ikon yang relevan untuk setiap status (misal centang untuk disetujui, silang untuk ditolak)

---

## Catatan Teknis

### 1. Penanganan Error 404
**Perbaikan sebelumnya**:
- `readPdfBytes()` mengembalikan `null` alih-alih melempar exception
- `mergePdfAttachments()` menangani `null` dan menambahkan pesan warning
- `readPhoto()` menambahkan try-catch untuk menangani error 404

**Hasil**: Preview PDF tetap berfungsi meskipun ada lampiran atau foto yang hilang/404.

### 2. Data Tidak Konsisten
**Masalah**: Dokumen ID 5 dan foto-foto THL tidak ditemukan di database produksi.

**Rekomendasi**:
- Periksa integritas data di database produksi
- Pastikan semua file lampiran tersimpan dengan benar di storage
- Tambahkan validasi saat upload untuk memastikan file tersimpan dengan benar

---

## Ringkasan

Perubahan yang dilakukan fokus pada:
1. **Sticky stepper** — UX improvement
2. **Stampel bulat & merah** — visual consistency
3. **Teks stampel lebih jelas** — readability improvement

Rekomendasi peningkatan fokus pada:
1. **Stepper** — tambah RFAH, durasi, alasan
2. **Stampel** — warna berbeda untuk status negatif, ukuran konsisten
3. **Tampilan status** — konsistensi penulisan, kontras warna, ikon yang jelas
