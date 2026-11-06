import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_item_fields.dart';

/// Pola tanggal expired (widget bersama sheet validasi).
///
/// Kontrak penting: roda pemilih harus berurutan tanggal-bulan-tahun
/// (format Indonesia) agar konsisten dengan hasil yang ditampilkan di
/// field (dd/MM/yyyy). Tanpa pin locale `id`, CupertinoDatePicker
/// mengikuti locale perangkat dan bisa tampil MM/DD/YYYY — ambigu bagi
/// user lapangan.
void main() {
  test('locale id memakai urutan roda tanggal-bulan-tahun', () async {
    var localizations = await GlobalCupertinoLocalizations.delegate.load(
      const Locale('id'),
    );

    expect(localizations.datePickerDateOrder, DatePickerDateOrder.dmy);
  });

  test('formatDateId menampilkan dd/MM/yyyy', () {
    expect(formatDateId(DateTime(2027, 1, 5)), '05/01/2027');
    expect(formatDateId(null), '');
  });

  testWidgets('pickExpiredDate mengembalikan tanggal yang dipilih', (
    tester,
  ) async {
    DateTime? picked;

    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('id'),
        supportedLocales: const [Locale('id'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: FilledButton(
                onPressed: () async {
                  picked = await pickExpiredDate(
                    context,
                    initial: DateTime(2027, 3, 15),
                  );
                },
                child: const Text('Buka'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Buka'));
    await tester.pumpAndSettle();

    // Konfirmasi tanpa mengubah roda = nilai initial yang dipakai.
    await tester.tap(find.text('Pilih'));
    await tester.pumpAndSettle();

    expect(picked, DateTime(2027, 3, 15));
  });

  test('UmurCalculator menghitung sisa umur dan status pemeriksaan', () {
    var today = DateTime(2026, 11, 4);

    var kadaluarsa = UmurCalculator.hitung(DateTime(2026, 11, 4), today: today);
    expect(kadaluarsa.totalDays, 0);
    expect(kadaluarsa.totalMonths, 0);
    expect(
      UmurCalculator.status(standarUmur: 12, sisa: kadaluarsa),
      UmurCalculator.statusKadaluarsa,
    );

    var aman = UmurCalculator.hitung(DateTime(2027, 11, 4), today: today);
    expect(aman.totalDays, greaterThan(0));
    expect(aman.totalMonths, greaterThan(0));
    expect(
      UmurCalculator.status(standarUmur: 12, sisa: aman),
      UmurCalculator.statusAman,
    );

    expect(
      UmurCalculator.status(standarUmur: 0, sisa: aman),
      UmurCalculator.statusStandardTidakTersedia,
    );
  });

  testWidgets(
    'UmurStandarPanel menampilkan status KADALUARSA untuk expired hari ini',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: UmurStandarPanel(
              expiredDate: DateTime(2026, 11, 4),
              standarUmur: 12,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('KADALUARSA'), findsOneWidget);
      expect(
        find.text('Produk sudah kadaluarsa dan perlu penanganan segera.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'UmurStandarPanel menampilkan status AMAN saat sisa memenuhi standar',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            // Tanggal margin jauh: selalu tersisa > standar simpan
            // (12 bulan) regarapun tanggal ujinya, test tidak time-bomb.
            body: UmurStandarPanel(
              expiredDate: DateTime(2030, 11, 5),
              standarUmur: 12,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('AMAN'), findsOneWidget);
      expect(find.text('Sisa simpan memenuhi standar.'), findsOneWidget);
    },
  );
}
