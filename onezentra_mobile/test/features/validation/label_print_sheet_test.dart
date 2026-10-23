import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/printer/label_print_provider.dart';
import 'package:onezentra_mobile/core/printer/label_printer.dart';
import 'package:onezentra_mobile/core/printer/thermal_label.dart';
import 'package:onezentra_mobile/features/validation/widgets/label_print_sheet.dart';

class _FakeLabelPrinter implements LabelPrinter {
  _FakeLabelPrinter({this.printError});

  final PrinterException? printError;
  static const _printer = DiscoveredPrinter(
    address: 'AA:BB:CC:DD:EE:01',
    name: 'Xprinter',
  );

  @override
  Future<List<DiscoveredPrinter>> scan() async => [_printer];

  @override
  Stream<DiscoveredPrinter> discover() => const Stream.empty();

  @override
  Future<bool> bond(DiscoveredPrinter printer, {String? pin}) async => true;

  @override
  Future<void> cancelDiscovery() async {}

  @override
  Future<void> printLabel(DiscoveredPrinter printer, List<int> bytes) async {
    if (printError != null) {
      throw printError!;
    }
  }
}

const _label = BatchLabelData(
  batchNumber: 'BATCH-1',
  barcodeLabel: 'LBL-1',
  kodeBarang: '000123',
  namaBarang: 'Indomie Goreng 85g',
  actualQty: 10,
  satuan: 'PCS',
  expiredDate: '2027-01-31',
);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  Future<Future<bool?> Function()> openSheet(
    WidgetTester tester,
    LabelPrintProvider provider,
  ) async {
    late Future<bool?> result;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () {
                result = LabelPrintSheet.show(
                  context,
                  label: _label,
                  printer: provider,
                );
              },
              child: const Text('Buka cetak'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Buka cetak'));
    await tester.pumpAndSettle();
    return () => result;
  }

  testWidgets('menutup panel otomatis setelah label berhasil dicetak', (
    tester,
  ) async {
    var provider = LabelPrintProvider(
      printer: _FakeLabelPrinter(),
      requestPermissions: () async => true,
    );
    var result = await openSheet(tester, provider);

    await tester.tap(find.widgetWithText(FilledButton, 'Cetak Label'));
    await tester.pumpAndSettle();

    expect(find.byType(LabelPrintSheet), findsNothing);
    expect(await result(), isTrue);
    provider.dispose();
  });

  testWidgets('membiarkan panel terbuka dan menampilkan error cetak', (
    tester,
  ) async {
    var provider = LabelPrintProvider(
      printer: _FakeLabelPrinter(
        printError: const PrinterException('Printer tidak merespons.'),
      ),
      requestPermissions: () async => true,
    );
    await openSheet(tester, provider);

    await tester.tap(find.widgetWithText(FilledButton, 'Cetak Label'));
    await tester.pumpAndSettle();

    expect(find.byType(LabelPrintSheet), findsOneWidget);
    expect(find.text('Printer tidak merespons.'), findsOneWidget);
    provider.dispose();
  });
}
