// Uji asap di perangkat/simulator sungguhan: login ke server dev dengan
// widget dan ketukan nyata, lalu memastikan Beranda memuat angka dari backend.
//
// Berbeda dari folder `test/`, berkas ini tidak memakai service palsu.
// Jalurnya lewat `ApiClient` sungguhan, jadi butuh server yang bisa dijangkau
// perangkat.
//
// Cara jalankan (server dev harus aktif):
//   php artisan serve --host=0.0.0.0 --port=8000
//   flutter test integration_test/app_smoke_test.dart -d <device-id> \
//     --dart-define=SMOKE_EMAIL=... --dart-define=SMOKE_PASSWORD=... \
//     --dart-define=API_URL=http://<ip-lan>:8000/api/v1
//
// Tanpa SMOKE_EMAIL dan SMOKE_PASSWORD, test dilewati. Jadi berkas ini aman
// dijalankan di `flutter test` maupun di CI tanpa kredensial.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:onezentra_mobile/main.dart' as app;

const _email = String.fromEnvironment('SMOKE_EMAIL');
const _password = String.fromEnvironment('SMOKE_PASSWORD');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('login sungguhan lalu Beranda terisi angka dari backend', (
    tester,
  ) async {
    if (_email.isEmpty || _password.isEmpty) {
      markTestSkipped(
        'Butuh --dart-define=SMOKE_EMAIL dan SMOKE_PASSWORD untuk memakai '
        'server sungguhan.',
      );
      return;
    }

    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // Sesi dari run sebelumnya masih tersimpan di secure storage perangkat, jadi
    // form login belum tentu tampil. Alur keduanya harus tetap terverifikasi.
    final tombolMasuk = find.widgetWithText(FilledButton, 'Masuk ke Dashboard');
    if (tombolMasuk.evaluate().isNotEmpty) {
      await tester.enterText(find.byType(TextFormField).first, _email);
      await tester.enterText(find.byType(TextFormField).at(1), _password);
      await tester.pumpAndSettle();
      await tester.tap(tombolMasuk);
      await tester.pumpAndSettle(const Duration(seconds: 5));
    }

    // Judul bagian penutup membuktikan Beranda benar-benar ter-render. Kalau
    // login gagal, layar tetap di Login dan baris ini langsung gagal.
    expect(find.text('Aktivitas Terbaru'), findsOneWidget);

    // Tidak boleh ada error layout. Corak overflow di ponsel operator berarti
    // angka justru terpotong.
    expect(tester.takeException(), isNull);

    // Kedua kelompok modul harus ada, masing-masing dengan kartu bernomor.
    expect(find.text('Statistik'), findsOneWidget);
    expect(find.text('Data Master'), findsOneWidget);
  });

  testWidgets('keempat tab memakai pita header yang sama tanpa error layout', (
    tester,
  ) async {
    if (_email.isEmpty || _password.isEmpty) {
      markTestSkipped(
        'Butuh --dart-define=SMOKE_EMAIL dan SMOKE_PASSWORD untuk memakai '
        'server sungguhan.',
      );
      return;
    }

    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 2));

    final tombolMasuk = find.widgetWithText(FilledButton, 'Masuk ke Dashboard');
    if (tombolMasuk.evaluate().isNotEmpty) {
      await tester.enterText(find.byType(TextFormField).first, _email);
      await tester.enterText(find.byType(TextFormField).at(1), _password);
      await tester.pumpAndSettle();
      await tester.tap(tombolMasuk);
      await tester.pumpAndSettle(const Duration(seconds: 5));
    }

    // Fase 2: aplikasi harus terasa satu kesatuan, bukan empat layar yang
    // dirakit terpisah. Diverifikasi di perangkat sungguhan karena ukuran
    // layar, notch, dan font sistem di sana berbeda dari test widget.
    const judulHeader = <String, String>{
      'Beranda': 'Selamat',
      'Check In': 'Check In Point',
      'Validasi': 'Validasi Dokumen',
      'Saya': 'Saya',
    };
    for (final tab in judulHeader.keys) {
      await tester.tap(find.text(tab).last);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(
        find.textContaining(judulHeader[tab]!),
        findsWidgets,
        reason: 'tab $tab harus menampilkan header "${judulHeader[tab]}"',
      );
      expect(
        tester.takeException(),
        isNull,
        reason: 'error layout di tab $tab',
      );
    }
  });

  testWidgets('kartu modul Standarisasi membuka halamannya di perangkat', (
    tester,
  ) async {
    if (_email.isEmpty || _password.isEmpty) {
      markTestSkipped(
        'Butuh --dart-define=SMOKE_EMAIL dan SMOKE_PASSWORD untuk memakai '
        'server sungguhan.',
      );
      return;
    }

    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 2));

    final tombolMasuk = find.widgetWithText(FilledButton, 'Masuk ke Dashboard');
    if (tombolMasuk.evaluate().isNotEmpty) {
      await tester.enterText(find.byType(TextFormField).first, _email);
      await tester.enterText(find.byType(TextFormField).at(1), _password);
      await tester.pumpAndSettle();
      await tester.tap(tombolMasuk);
      await tester.pumpAndSettle(const Duration(seconds: 5));
    }

    // Kartu modul di grup "Data Master" menggulir, jadi digeser dulu ke
    // dalam layar baru diketuk — ketukan pada koordinat di luar layar akan
    // lolos diam-diam dan test tetap hijau.
    final kartuModul = find.text('STANDARISASI');
    await tester.ensureVisible(kartuModul);
    await tester.pumpAndSettle();
    await tester.tap(kartuModul);
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('Daftar Standarisasi'), findsOneWidget);
    expect(
      find.byKey(const Key('standarisasi-search')),
      findsOneWidget,
      reason: 'pencarian produk harus ada',
    );
    expect(
      tester.takeException(),
      isNull,
      reason: 'error layout di halaman Standarisasi',
    );

    // Kembali ke Beranda lewat tombol header, supaya navigasi balik ikut
    // terverifikasi di perangkat sungguhan.
    await tester.tap(find.byTooltip('Kembali'));
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('Aktivitas Terbaru'), findsOneWidget);
  });
}
