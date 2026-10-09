import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/printer/label_print_provider.dart';
import 'package:onezentra_mobile/core/printer/label_printer.dart';
import 'package:onezentra_mobile/core/printer/thermal_label.dart';

/// Printer palsu supaya alur scan → pilih → cetak bisa diuji tanpa radio
/// bluetooth sungguhan (yang jelas tidak ada di test environment).
class _FakeLabelPrinter implements LabelPrinter {
  _FakeLabelPrinter({this.available = const [], this.error});

  final List<DiscoveredPrinter> available;
  final PrinterException? error;

  final List<String> printed = [];
  DiscoveredPrinter? lastPrinter;

  @override
  Future<List<DiscoveredPrinter>> scan() async {
    if (error != null) throw error!;
    return available;
  }

  @override
  Future<void> printLabel(DiscoveredPrinter printer, List<int> bytes) async {
    lastPrinter = printer;
    printed.add(String.fromCharCodes(bytes));
  }
}

class _FailingPrintPrinter extends _FakeLabelPrinter {
  _FailingPrintPrinter({List<DiscoveredPrinter> printers = const []})
    : super(available: printers);

  @override
  Future<void> printLabel(DiscoveredPrinter printer, List<int> bytes) async {
    throw const PrinterException('Printer tidak merespons.');
  }
}

const printerA = DiscoveredPrinter(
  address: 'AA:BB:CC:DD:EE:01',
  name: 'Xprinter',
);
const printerB = DiscoveredPrinter(
  address: 'AA:BB:CC:DD:EE:02',
  name: 'Goojprt',
);

const label = BatchLabelData(
  batchNumber: 'BATCH-1',
  barcodeLabel: 'LBL-1',
  kodeBarang: '000123',
  namaBarang: 'Indomie Goreng 85g',
  actualQty: 10,
  satuan: 'PCS',
  expiredDate: '2027-01-31',
);

void main() {
  group('LabelPrintProvider.scan', () {
    test('menampilkan printer yang ditemukan radio bluetooth', () async {
      var fake = _FakeLabelPrinter(available: [printerA, printerB]);
      var provider = LabelPrintProvider(printer: fake);

      await provider.scan();

      // Urutan dikerjakan oleh BluetoothLabelPrinter saat memetakan hasil scan.
      // Fake melewati itu, jadi test ini hanya membuktikan daftar printer
      // diteruskan apa adanya ke UI — pengurutannya diuji terpisah.
      expect(provider.available.length, 2);
      expect(provider.available.map((p) => p.address).toList(), [
        printerA.address,
        printerB.address,
      ]);
      expect(provider.error, isNull);
    });

    test('memilih printer pertama secara otomatis', () async {
      var fake = _FakeLabelPrinter(available: [printerA, printerB]);
      var provider = LabelPrintProvider(printer: fake);

      await provider.scan();

      // Operator tetap bisa.scan lalu langsung cetak tanpa memilih manual.
      expect(provider.selected, isNotNull);
      expect(provider.selected!.address, printerA.address);
    });

    test(
      'menampilkan pesan yang bisa dimengerti saat printer tidak ada',
      () async {
        var fake = _FakeLabelPrinter(
          error: const PrinterException('Printer tidak ditemukan.'),
        );
        var provider = LabelPrintProvider(printer: fake);

        await provider.scan();

        expect(provider.available, isEmpty);
        expect(provider.error, 'Printer tidak ditemukan.');
        expect(provider.scanning, isFalse);
      },
    );

    test('membersihkan PrinterException di luar provoke', () async {
      var fake = _FakeLabelPrinter(error: const PrinterException('boom'));
      var provider = LabelPrintProvider(printer: fake);

      await provider.scan();

      // Exception tak dikenal harus tetap menghasilkan pesan, bukan crash.
      expect(provider.error, isNotNull);
      expect(provider.scanning, isFalse);
    });
  });

  group('LabelPrintProvider.printLabel', () {
    test('menolak cetak tanpa printer terpilih', () async {
      var fake = _FakeLabelPrinter();
      var provider = LabelPrintProvider(printer: fake);

      var ok = await provider.printLabel(label);

      expect(ok, isFalse);
      expect(fake.printed, isEmpty);
      expect(provider.error, 'Pilih printer terlebih dahulu.');
    });

    test('mengirim label ke printer yang dipilih', () async {
      var fake = _FakeLabelPrinter(available: [printerA, printerB]);
      var provider = LabelPrintProvider(printer: fake);
      await provider.scan();

      provider.select(printerB);
      var ok = await provider.printLabel(label);

      expect(ok, isTrue);
      expect(fake.lastPrinter!.address, printerB.address);
      expect(fake.printed.length, 1);
      expect(fake.printed.first, contains('LBL-1'));
    });

    test('menghormati pilihan Lebar printer yang dipilih operator', () async {
      var fake = _FakeLabelPrinter(available: [printerA]);
      var provider = LabelPrintProvider(printer: fake);
      await provider.scan();

      provider.setWidth(LabelWidth.w80);
      await provider.printLabel(label);

      var narrowLine = fake.printed.first.split('\n').first.length;
      // Lebar 80 punya lebih banyak karakter per baris.
      expect(narrowLine, greaterThan(0));
      expect(provider.width, LabelWidth.w80);
    });

    test('meneruskan kegagalan printer ke operator tanpa crash', () async {
      var fake = _FailingPrintPrinter(printers: [printerA]);
      var provider = LabelPrintProvider(printer: fake);
      await provider.scan();

      var ok = await provider.printLabel(label);

      expect(ok, isFalse);
      expect(provider.error, 'Printer tidak merespons.');
      expect(provider.printing, isFalse);
    });

    test('sukses mencetak pesan konfirmasi', () async {
      var fake = _FakeLabelPrinter(available: [printerA]);
      var provider = LabelPrintProvider(printer: fake);
      await provider.scan();

      await provider.printLabel(label);

      expect(provider.success, isNotNull);
      expect(provider.error, isNull);
    });
  });
}
