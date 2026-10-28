import 'package:flutter/material.dart';

import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

void main() {
  testWidgets(
    'autovalidateMode onUserInteraction menghapus error saat isian sah',
    (tester) async {
      // Laporan lapangan: kolom Jumlah sudah diisi tetapi tetap merah —
      // validator bawaan hanya berjalan saat Simpan ditekan, sehingga error
      // "menempel" walau isian sudah sah. Dengan onUserInteraction, merah
      // hilang begitu angka diketik.
      var controller = TextEditingController();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AppTextField(
              controller: controller,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              validator: (value) {
                var qty = double.tryParse((value ?? '').replaceAll(',', '.'));
                if (qty == null || qty <= 0) {
                  return 'Isi jumlah dengan angka > 0';
                }
                return null;
              },
            ),
          ),
        ),
      );

      // Isian tidak sah → error tampil saat diketik.
      await tester.enterText(find.byType(TextFormField), '0');
      await tester.pump();
      expect(find.text('Isi jumlah dengan angka > 0'), findsOneWidget);

      // Isian menjadi sah → error hilang tanpa perlu menekan Simpan.
      await tester.enterText(find.byType(TextFormField), '10');
      await tester.pump();
      expect(find.text('Isi jumlah dengan angka > 0'), findsNothing);

      // Koma desimal juga sah (10,5 → 10.5).
      await tester.enterText(find.byType(TextFormField), '10,5');
      await tester.pump();
      expect(find.text('Isi jumlah dengan angka > 0'), findsNothing);

      controller.dispose();
    },
  );
}
