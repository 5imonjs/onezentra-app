import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/printer/escpos.dart';
import 'package:onezentra_mobile/core/printer/escpos_label.dart';
import 'package:onezentra_mobile/core/printer/thermal_label.dart';

const sample = BatchLabelData(
  batchNumber: 'BATCH-ABC12345',
  barcodeLabel: 'LBL-XYZ98765',
  kodeBarang: '000123',
  namaBarang: 'Indomie Goreng 85g',
  actualQty: 120,
  satuan: 'PCS',
  expiredDate: '2027-01-31',
  condition: 'FISIK_BAGUS',
  namaDepo: 'Singkawang',
  poTransporter: 'PO-042',
);

void main() {
  group('LabelWidth', () {
    test('lebar dipetakan ke jumlah karakter per baris', () {
      // Printer thermal membungkus teks per karakter, bukan per milimeter.
      // Angka karakter inilah yang sama antar merek printer.
      expect(LabelWidth.w58.charsPerLine, 32);
      expect(LabelWidth.w80.charsPerLine, 48);
      expect(LabelWidth.w110.charsPerLine, 64);
    });

    test('semua preset punya label yang bisa ditampilkan', () {
      for (final w in LabelWidth.values) {
        expect(w.label, isNotEmpty);
        expect(w.charsPerLine, greaterThan(0));
      }
    });
  });

  group('buildLabelText', () {
    test('tidak pernah membuat baris lebih lebar dari printer', () {
      // Baris yang melebihi lebar printer akan otomatis di-wrap oleh printer
      // dengan cara yang tidak kita kendalikan, sehingga layout label rusak.
      const longName =
          'Indomie Goreng Special Extra Pedas Sambal Matah Kemasan Besar Isi 85 Gram';
      for (final width in LabelWidth.values) {
        final text = buildLabelText(
          const BatchLabelData(
            batchNumber: 'BATCH-1',
            barcodeLabel: 'LBL-1',
            namaBarang: longName,
            kodeBarang: '000123',
            actualQty: 5,
            satuan: 'PCS',
            expiredDate: '2027-01-31',
            condition: 'FISIK_RUSAK',
            namaDepo: 'Singkawang',
          ),
          width,
        );
        for (final line in text.split('\n')) {
          expect(
            line.length,
            lessThanOrEqualTo(width.charsPerLine),
            reason: 'baris melebihi ${width.label}: "$line"',
          );
        }
      }
    });

    test('memakai kata utuh, tidak memotong di tengah kata', () {
      final text = buildLabelText(sample, LabelWidth.w58);
      final lines = text.split('\n');
      expect(lines.any((l) => l.contains('Indomie Goreng 85g')), isTrue);
    });

    test('memotong kata tunggal yang lebih panjang dari label', () {
      // Satu kode barang yang sangat panjang tidak boleh membuat baris yang
      // melebihi lebar printer dan merusak seluruh layout.
      final text = buildLabelText(
        const BatchLabelData(
          batchNumber: 'BATCH-1',
          barcodeLabel: 'LBL-1',
          kodeBarang: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ),
        LabelWidth.w58,
      );
      for (final line in text.split('\n')) {
        expect(line.length, lessThanOrEqualTo(32));
      }
    });

    test('menampilkan barcode_label apa adanya sebagai teks', () {
      // Pada jalur ESC/POS barcode jadi gambar yang bisa discan; teks ini adalah
      // catatan baca-manual untuk operator ketika scanner gagal.
      final text = buildLabelText(sample, LabelWidth.w58);
      expect(text, contains('LBL-XYZ98765'));
      expect('LBL-XYZ98765'.allMatches(text).length, 1);
    });

    test('mencetak identitas sistem pada setiap label', () {
      // Label yang lepas dari kardus harus masih bisa ditelusuri balik ke sistem.
      for (final width in LabelWidth.values) {
        expect(buildLabelText(sample, width), contains('ONEZENTRA'));
        expect(buildLabelText(sample, width), contains('LANGKAU KAMI'));
      }
    });

    test('tidak mengubah tanggal expired, memakai nilai dari server', () {
      // Kalau tanggal dihitung ulang dari objek Date, zona waktu perangkat bisa
      // menggesernya satu hari — produk lalu dilabeli tanggal yang salah.
      final text = buildLabelText(sample, LabelWidth.w58);
      expect(text, contains('2027-01-31'));
    });

    test('qty bulat tidak jadi "120.00"', () {
      final text = buildLabelText(sample, LabelWidth.w58);
      expect(text, contains('QTY 120 PCS'));
      expect(text, isNot(contains('120.00')));
    });

    test('qty pecahan tetap dua desimal', () {
      final text = buildLabelText(
        const BatchLabelData(
          batchNumber: 'BATCH-1',
          barcodeLabel: 'LBL-1',
          actualQty: 12.5,
          satuan: 'KG',
        ),
        LabelWidth.w58,
      );
      expect(text, contains('12.50'));
    });

    test('tidak melempar saat semua field kosong', () {
      // Petugas tetap butuh label tempel walau data produk belum lengkap.
      final text = buildLabelText(
        const BatchLabelData(batchNumber: null, barcodeLabel: null),
        LabelWidth.w58,
      );
      expect(text, contains('BATCH LABEL'));
      expect(text, contains('-'));
    });

    test('menerjemahkan kondisi ke bahasa yang tampil', () {
      final text = buildLabelText(
        const BatchLabelData(
          batchNumber: 'BATCH-1',
          barcodeLabel: 'LBL-1',
          condition: 'ISI_KEMASAN_KURANG',
        ),
        LabelWidth.w58,
      );
      expect(text, contains('Isi Kemasan Kurang'));
      expect(text, isNot(contains('ISI_KEMASAN_KURANG')));
    });

    test('label 58mm lebih sempit daripada 80mm untuk nama panjang', () {
      // Nama ~110 karakter supaya jelas butuh lebih dari 2 baris di 58mm tapi
      // masih muat di 80mm — nama yang cuma sedikit panjang akan menghasilkan
      // jumlah baris sama di keduanya, jadi tidak membuktikan apa pun.
      const longName =
          'Indomie Goreng Special Extra Pedas Sambal Matah Kemasan Besar Isi 85 Gram Promo Ekstra';
      final narrow = buildLabelText(
        BatchLabelData(
          batchNumber: 'B',
          barcodeLabel: 'L',
          namaBarang: longName,
        ),
        LabelWidth.w58,
      );
      final wide = buildLabelText(
        BatchLabelData(
          batchNumber: 'B',
          barcodeLabel: 'L',
          namaBarang: longName,
        ),
        LabelWidth.w80,
      );
      expect(narrow.split('\n').length, greaterThan(wide.split('\n').length));
    });
  });

  group('sanitizeCode39', () {
    test('membiarkan karakter yang didukung Code39 apa adanya', () {
      // LBL-ABC12345 hanya berisi karakter yang bisa di-encode Code39.
      expect(sanitizeCode39('LBL-ABC12345'), 'LBL-ABC12345');
    });

    test('mengubah huruf kecil menjadi huruf besar', () {
      // Code39 tidak punya huruf kecil; tanpa konversi, printer menolak data.
      expect(sanitizeCode39('lbl-abc'), 'LBL-ABC');
    });

    test('mengganti karakter di luar Code39 agar barcode tetap tercetak', () {
      // Kalau karakter tak didukung dibiarkan, printer bisa menolak seluruh
      // data dan label jadi tanpa barcode sama sekali.
      expect(sanitizeCode39('LBL#ABC'), 'LBL.ABC');
      expect(sanitizeCode39('LBL_ABC'), 'LBL.ABC');
    });

    test('menjadi titik untuk teks non-ASCII', () {
      expect(sanitizeCode39('LBL-é'), 'LBL-.');
    });
  });

  group('buildLabelBytes', () {
    // Cari perintah GS k 73 (= 1D 6B 49) yang menandai barcode Code39.
    int findBarcodeCommand(List<int> b) {
      for (var i = 0; i < b.length - 3; i++) {
        if (b[i] == 0x1D &&
            b[i + 1] == 0x6B &&
            b[i + 2] == EscPosBuilder.code39) {
          return i;
        }
      }
      return -1;
    }

    test('mengirim perintah barcode Code39 yang bisa discan mesin', () {
      // Ini inti dari fitur: label harus punya barcode yang bisa dibaca scanner,
      // bukan sekadar teks. Perintah yang salah = tidak ada barcode sama sekali.
      final b = buildLabelBytes(sample, LabelWidth.w58);
      var idx = findBarcodeCommand(b);
      expect(idx, greaterThanOrEqualTo(0), reason: 'perintah Code39 tidak ada');

      var length = b[idx + 3];
      var data = String.fromCharCodes(b.sublist(idx + 4, idx + 4 + length));
      expect(data, sample.barcodeLabel);
    });

    test('panjang data barcode sesuai isi, bukan tebakan', () {
      // Panjang byte yang salah membuat printer membaca sisa memori printer
      // sebagai karakter tambahan.
      var b = buildLabelBytes(sample, LabelWidth.w58);
      var idx = findBarcodeCommand(b);
      expect(b[idx + 3], sample.barcodeLabel!.length);
    });

    test('menyalakan huruf tebal untuk judul label', () {
      // Tanpa perintah bold, judul akan tercetak sama saja dengan isi label.
      var b = buildLabelBytes(sample, LabelWidth.w58);
      var hasBold = false;
      for (var i = 0; i < b.length - 2; i++) {
        if (b[i] == 0x1B && b[i + 1] == 0x45 && b[i + 2] == 1) {
          hasBold = true;
        }
      }
      expect(hasBold, isTrue);
    });

    test('tidak mengirim perintah potong saat potong dimatikan', () {
      // Printer tanpa pisau bisa macet atau print ulang saat diberi perintah
      // potong, jadi operator harus bisa pattedkannya.
      var b = buildLabelBytes(sample, LabelWidth.w58, enableCut: false);
      var hasCut = false;
      for (var i = 0; i < b.length - 2; i++) {
        if (b[i] == 0x1D && b[i + 1] == 0x56) {
          hasCut = true;
        }
      }
      expect(hasCut, isFalse);
    });

    test('mengirim perintah potong saat diaktifkan', () {
      var b = buildLabelBytes(sample, LabelWidth.w58, enableCut: true);
      var hasCut = false;
      for (var i = 0; i < b.length - 2; i++) {
        if (b[i] == 0x1D && b[i + 1] == 0x56) {
          hasCut = true;
        }
      }
      expect(hasCut, isTrue);
    });

    test('tidak mengirim perintah barcode saat barcode dimatikan', () {
      // Printer mode-teks akan mencetak byte kontrol sebagai karakter aneh.
      var b = buildLabelBytes(sample, LabelWidth.w58, enableBarcode: false);
      expect(findBarcodeCommand(b), -1);
    });

    test('memuat barcode_label apa adanya di dalam byte', () {
      var b = buildLabelBytes(sample, LabelWidth.w58);
      expect(String.fromCharCodes(b), contains(sample.barcodeLabel));
    });

    test('memuat identitas sistem di dalam byte', () {
      var b = buildLabelBytes(sample, LabelWidth.w58);
      expect(String.fromCharCodes(b), contains(systemIdentity));
    });

    test('tidak melempar saat semua field kosong', () {
      // Petugas tetap butuh label tempel walau data produk belum lengkap.
      expect(
        () => buildLabelBytes(
          const BatchLabelData(batchNumber: null, barcodeLabel: null),
          LabelWidth.w58,
        ),
        returnsNormally,
      );
    });
  });

  group('buildLabelBytesWithoutBarcode', () {
    test('tidak mengirim satu pun byte kontrol ESC/POS', () {
      // Jalur ini untuk printer yang hanya bisa teks polos; byte kontrol akan
      // tercetak sebagai karakter aneh dan merusak tampilan label.
      var b = buildLabelBytesWithoutBarcode(sample, LabelWidth.w58);
      expect(b.contains(0x1B), isFalse, reason: 'ada byte ESC');
      expect(b.contains(0x1D), isFalse, reason: 'ada byte GS');
    });

    test('tetap membawa isi label sebagai teks', () {
      var b = buildLabelBytesWithoutBarcode(sample, LabelWidth.w58);
      var text = String.fromCharCodes(b);
      expect(text, contains(sample.barcodeLabel));
      expect(text, contains(systemIdentity));
    });

    test('mengakhiri tiap baris dengan LF', () {
      // Tanpa LF semua baris akan tercetak menyatu jadi satu baris panjang.
      var b = buildLabelBytesWithoutBarcode(sample, LabelWidth.w58);
      expect(b.where((e) => e == 0x0A).length, greaterThan(5));
    });
  });
}
