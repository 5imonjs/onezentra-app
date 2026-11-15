# Audit ONEZENTRA Mobile (Flutter) — UI/UX, Layout, Tema, Pewarnaan

Tanggal: 30 Okt 2026  
Project: `onezentra_mobile/`  
Flutter: 3.41.2 (Dart 3.11.0)  
Status: `flutter analyze` = 0 issue; 247 test lulus.

---

## Ringkasan Eksekutif

Aplikasi mobile dirancang **dark-first** (ThemeMode.dark). Tema, warna, dan layout konsisten dengan web design system (`globals.css` → `app_theme.dart`). Tidak ada bug kritis ditemukan.

---

## Tema & Pewarnaan

### ✅ Yang Sudah Baik
- **Dark-first design**: `surface` = `#0F172A`, `foreground` = `#F1F5F9` — kontras baik
- **Gray scale terbalik** (inverted): `gray50` = paling gelap, `gray900` = paling terang — sesuai web ramp
- **Status colors**: `successText`, `warningText`, `dangerText`, `infoText` — readable di dark wells
- **Ink scale**: `ink900` = `#0F172A` (selalu gelap) — digunakan untuk background panel (hero header, modal header), bukan text
- **ColorScheme dark**: `primary400`, `onSurface: foreground` — konsisten
- **Text theme**: menggunakan `gray700` (light) untuk body text — visible di dark background

### ⚠️ Catatan
- `AppTheme.ink900` digunakan sebagai background (bukan text) — sudah benar
- `AppTheme.gray700` = `#E2E8F0` (light) — digunakan sebagai text color, visible di dark
- Tidak ada `ThemeMode.light` yang aktif (`themeMode: ThemeMode.dark`) — app selalu dark

### ❌ Tidak Ada Masalah Kritis

---

## Layout & UI

### ✅ Yang Sudah Baik
- **Portrait only**: `SystemChrome.setPreferredOrientations([portraitUp])` — sesuai use case handheld
- **Responsive**: `MediaQuery`, `Expanded`, `Flexible` digunakan
- **Spacing system**: `AppTheme.space1`–`space16` konsisten
- **Border radius**: `radiusSm`–`radiusFull` konsisten
- **Typography**: GoogleFonts.roboto dengan scale yang konsisten
- **Bottom sheets**: `isScrollControlled: true` untuk form panjang
- **Loading states**: `CircularProgressIndicator` di button dan list
- **Empty states**: pesan "Tidak ada data" dengan icon

### ⚠️ Saran Perbaikan (Opsional)
1. **Font size minimum**: Beberapa text menggunakan `fontSize: 9` (mobile card qty label) — terlalu kecil untuk aksesibilitas. Minimum 11px.
2. **Touch target**: Beberapa button menggunakan `minimumSize: Size(0, 44)` — OK (44px minimum touch target).
3. **Overflow**: `maxLines` + `overflow: TextOverflow.ellipsis` sudah digunakan di banyak tempat — baik.
4. **Safe area**: Pastikan `SafeArea` digunakan di halaman dengan notch/status bar.

---

## Komponen & Konsistensi

### ✅ Yang Sudah Baik
- **AppTheme** sebagai single source of truth untuk warna, spacing, radius
- **AppPrimaryButton**, **AppSecondaryButton**, **AppTextField** — reusable components
- **ConditionChipRow** → diganti DropdownButtonFormField (perbaikan terbaru)
- **Validation item tile**: menampilkan nama, qty, kondisi, status, action buttons
- **Extra item tile**: menampilkan nama, qty, kode, status, print/approve/reject

### ⚠️ Catatan
- Beberapa hardcoded `Colors.white` dan `Colors.white70` — sebaiknya gunakan `AppTheme.foreground` atau `AppTheme.gray700` untuk konsistensi
- `Colors.white.withValues(alpha: 0.1)` digunakan di banyak tempat — bisa diekstrak ke token

---

## Kesimpulan

Aplikasi mobile Flutter **sudah cukup baik** dari sisi UI/UX, layout, tema, dan pewarnaan. Tidak ada bug kritis. Saran perbaikan bersifat opsional (aksesibilitas, konsistensi token).

**Status:** ✅ Lulus audit visual. Tidak ada perubahan kode diperlukan.