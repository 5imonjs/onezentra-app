---
paths:
  - 'onezentra-mobile-flutter/**'
---

# Mobile (Flutter)

## Web adalah sumber kebenaran tampilan
`onezentra-web` tidak boleh diubah untuk accommodate mobile. Saat membuat atau mengubah layar mobile, bandingkan dulu dengan `onezentra-web/src/app/<modul>/page.tsx`: judul, urutan bagian, angka, dan warna harus sama. Yang boleh berbeda hanya yang memang tidak ada di mobile (grafik) atau karena keterbatasan layar.

## Backend tidak boleh diubah hanya demi mobile
Pakai endpoint yang sudah ada (mis. `GET /api/v1/dashboard/summary`) dan parse ulang payload-nya di sisi mobile. Kalau angka atau label web perlu ditambah, ekstrak di Dart — jangan menambah endpoint atau mengubah kontrak.

## Data yang tidak dikirim backend jangan dikarang jadi 0
`DashboardSummary.totalOf(key)` mengembalikan `null` bila modul tidak ada di payload. `null` = belum sinkron atau kontrak berubah, bukan "angka nol". Menampilkan 0 membuat operator salah mengambil keputusan. Pola yang sama dipakai untuk statistik header: gagal dimuat -> `—` + alasan, bukan `0`.

## Header gelap wajib lewat `PageHeader`
Keempat tab (Beranda, Check In, Validasi, Saya) memakai `lib/widgets/page_header.dart`. Jangan menambah `AppBar` dengan warna sendiri di tab mana pun, dan jangan menaruh baris statistik gelap terpisah di bawah header (stats itu milik `PageHeader.stats`). Test `setiap tab memakai pita header yang sama` di `test/validation_test.dart` menjaga ini.

## Jangan pakai `GridView` + `childAspectRatio` untuk kartu berisi teks
Rasio tetap memaksa tinggi kartu; begitu skala font sistem 1.3x atau label lebih panjang, angka di dalam kartu terpotong. Pakai `TileGrid` (`lib/widgets/tile_grid.dart`) yang tinggi kartunya mengikuti isi. Test layout-overflow di `test/dashboard_test.dart` (320/360/414/768 x skala 1.0/1.3) harus tetap hijau — itu yang menangkap kelas bug ini.

## Jaring pengaman `flutter_test`
- `tester.view.physicalSize` itu **fisik**. Dengan `devicePixelRatio = 2`, set 780 untuk lebar logika 390.
- Default test surface 800x600 membuat kartu penting ada di bawah lipatan; perkecil atau perbesar viewport eksplisit, selalu dengan `addTearDown(tester.view.reset)`.
- Font test membesar-kecil metrik teks (semua glyph selebar `fontSize`). Layout yang meluber di test belum tentu meluber di perangkat, dan sebaliknya — tetap periksaui di perangkat sungguhan sebelum menyatakan bug.
- `flutter_test` memblokir HTTP asli. Injeksi service palsu; jaringan sungguhan butuh `HttpOverrides.global = null` **di dalam** `tester.runAsync`.
- Anak `IndexedStack` tetap hidup walau tidak terlihat, jadi `find.text` bisa menemukan teks dari tab lain. Pakai `find.text(...).last` atau `skipOffstage: false` dengan hati-hati.
- `pumpAndSettle` tidak bisa dipakai saat ada `Future` yang ditahan fake; pakai `Completer` sebagai gerbang dan `pump()` manual.
- `tester.drag`/`fling` untuk `RefreshIndicator` tidak andal (gesture besar terbaca ballistic). Uji `onRefresh`-nya langsung, atau pakai `startGesture` + `moveBy` berulang.

## Getaran hanya untuk aksi yang sudah terkonfirmasi server
Aksi permanen (Gate IN/OUT/Verify, simpan hasil pemeriksaan, setujui/tolak standarisasi, hapus item, batalkan validasi) memanggil `hapticCommit` / `hapticDestructive` dari `lib/widgets/haptics.dart` — **setelah** server mengonfirmasi. Getar di dalam `catch` membuat kegagalan terdengar seperti persetujuan, jadi jangan pernah. File unit test yang tidak punya `testWidgets` harus memanggil `TestWidgetsFlutterBinding.ensureInitialized()` di `main()`, karena `HapticFeedback` butuh binding.

## Aturan simpan mengikuti UI web, bukan hanya kontrak backend
`expired_date` nullable di `SjValidationController::scanItem`, tapi web menonaktifkan tombol simpan selama tanggal belum diisi. Mobile menuntut isian yang sama lewat `itemDraftError(hasExpiredDate:)` — perbandingan sisa umur adalah inti pekerjaan validasi, jadi item tanpa tanggal berarti operator tidak pernah melihat kartu standar umur. Umumnya: kalau web memblokir aksi dengan `disabled` + `title`, mobile menolak lebih awal (tidak membuka form) **dan** menuliskan alasannya sebagai teks, karena layar sentuh tidak punya `title` untuk dibaca.

## Label semantics menggantikan isi, bukan menambahkannya
`Pressable`/`SectionCard` dengan `semanticLabel` memakai `excludeSemantics: true`, jadi ringkasan yang ditulis menggantikan seluruh teks anak. Tanpa itu screen reader membaca ringkasan lalu mengulang isi kartu dalam satu perubahan fokus. Kartu tanpa `semanticLabel` tetap membaca semua isinya. Kartu-Kartu besar (mis. baris item validasi) wajib punya satu label gabungan berisi kode, nama, hasil hitung, dan status — bukan lima node yang harus di-swipe satu per satu. Kartu pesan (`MessageCard`, termasuk `ErrorCard`) selalu `liveRegion`, karena muncul tanpa memindahkan fokus.

## Verifikasi harus dua lapis
`flutter analyze` + `flutter test` belum cukup: Setiap perubahan UI baru diverifikasi juga di perangkat sungguhan lewat `integration_test/app_smoke_test.dart` (butuh server dev `php artisan serve --host=0.0.0.0 --port=8000` dan `--dart-define=SMOKE_EMAIL/SMOKE_PASSWORD`). Test itu dilewati dengan rapi kalau kredensial tidak diberikan, jadi aman di CI.

## Jebakan khusus mesin ini
- `flutter test` tidak punya `--compact`; pakai `--reporter=failures-only`.
- Hati-hati mengetik komentar: karakter CJK sering ikut masuk tanpa sengaja. Cek dengan `grep -rInP '[\x{3000}-\x{9FFF}]' lib test integration_test` sebelum finalize, lalu `dart format lib test integration_test`.
- Jangan buat berkas dokumentasi. Rilis dan catatan arsitektur ditulis di `.ai/rules`, bukan README baru.
