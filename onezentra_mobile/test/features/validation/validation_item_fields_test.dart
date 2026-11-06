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

  test(
    'parseDateOnlyLocal memikir tanggal date-only sebagai tanggal lokal',
    () {
      // DateTime.tryParse keliru membacanya sebagai UTC 00:00 sehingga di
      // zona waktu di belakang UTC tanggal tampil mundur sehari dan tiap
      // buka-edit terasa memaksa nilai berubah — regresi untuk bug itu.
      var parsed = parseDateOnlyLocal('2027-06-06')!;
      expect(parsed.year, 2027);
      expect(parsed.month, 6);
      expect(parsed.day, 6);
      expect(parsed.isUtc, isFalse);
      // Round-trip tampil: simpan → muat lagi harus tetap 06/06/2027.
      expect(formatDateId(parseDateOnlyLocal('2027-06-06')), '06/06/2027');
      // Timestamp UTC dari server — dinormalisasi ke kalender lokal
      // (di WIB berarti 06/06; di UTC berarti 05/06) — bukan komponen UTC,
      // jangan asumsikan suffix offset dari mesin penguji.
      var ts = '2027-06-05T17:00:00.000Z';
      var local = DateTime.parse(ts).toLocal();
      var normalized = parseDateOnlyLocal(ts)!;
      expect(
        [normalized.year, normalized.month, normalized.day],
        [local.year, local.month, local.day],
      );
      expect(parseDateOnlyLocal(''), isNull);
      expect(parseDateOnlyLocal(null), isNull);
    },
  );

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
